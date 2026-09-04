import {lookup} from "node:dns/promises";
import {isIP} from "node:net";
import type {
  IntegrationAdapter,
  IntegrationCapability,
  IntegrationContext,
  IntegrationExecutionContext,
  IntegrationExecutionResult,
  IntegrationHealth
} from "../../integrations-sdk/src/index.js";

export type WebhookMethod="POST"|"PUT"|"PATCH";

export interface WebhookConfig{
  baseUrl:string;
  allowedHosts:string[];
  allowedPaths:string[];
  allowedMethods:WebhookMethod[];
  healthPath?:string;
  timeoutMs?:number;
  maxRequestBytes?:number;
  maxResponseBytes?:number;
  secretReference?:string|null;
  authHeaderName?:string;
  authPrefix?:string;
  allowPrivateNetwork?:boolean;
}

export interface SecretResolver{
  resolve(reference:string):Promise<string|null>;
}

export class EnvironmentSecretResolver implements SecretResolver{
  async resolve(reference:string){
    if(!reference.startsWith("env:"))throw new Error("unsupported-secret-reference");
    const key=reference.slice(4);
    if(!/^[A-Z][A-Z0-9_]{2,127}$/.test(key))throw new Error("invalid-secret-reference");
    return process.env[key]??null;
  }
}

export interface WebhookTransportRequest{
  url:string;
  method:string;
  headers:Record<string,string>;
  body?:string;
  timeoutMs:number;
  maxResponseBytes:number;
}

export interface WebhookTransportResponse{
  status:number;
  body:string;
  contentType:string|null;
}

export interface WebhookTransport{
  send(request:WebhookTransportRequest):Promise<WebhookTransportResponse>;
}

export async function readBounded(response:Response,maxBytes:number){
  if(!response.body)return "";
  const reader=response.body.getReader();
  const chunks:Uint8Array[]=[];
  let total=0;
  try{
    while(true){
      const result=await reader.read();
      if(result.done)break;
      total+=result.value.byteLength;
      if(total>maxBytes)throw new Error("webhook-response-too-large");
      chunks.push(result.value);
    }
  }finally{
    reader.releaseLock();
  }
  const merged=new Uint8Array(total);
  let offset=0;
  for(const chunk of chunks){merged.set(chunk,offset);offset+=chunk.byteLength;}
  return new TextDecoder().decode(merged);
}

export class FetchWebhookTransport implements WebhookTransport{
  async send(request:WebhookTransportRequest):Promise<WebhookTransportResponse>{
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),request.timeoutMs);
    try{
      const response=await fetch(request.url,{
        method:request.method,
        headers:request.headers,
        body:request.body,
        redirect:"error",
        signal:controller.signal
      });
      return{
        status:response.status,
        body:await readBounded(response,request.maxResponseBytes),
        contentType:response.headers.get("content-type")
      };
    }finally{
      clearTimeout(timeout);
    }
  }
}

export type HostResolver=(hostname:string)=>Promise<string[]>;

export const defaultHostResolver:HostResolver=async hostname=>{
  if(isIP(hostname))return[hostname];
  const rows=await lookup(hostname,{all:true,verbatim:true});
  return rows.map(row=>row.address);
};

function privateIpv4(address:string){
  const octets=address.split(".").map(Number);
  if(octets.length!==4||octets.some(value=>!Number.isInteger(value)||value<0||value>255))return true;
  const [a,b]=octets;
  return a===0||a===10||a===127||
    (a===100&&b>=64&&b<=127)||
    (a===169&&b===254)||
    (a===172&&b>=16&&b<=31)||
    (a===192&&b===168)||
    (a===192&&b===0)||
    (a===198&&(b===18||b===19))||
    (a===192&&b===0&&octets[2]===2)||
    (a===198&&b===51&&octets[2]===100)||
    (a===203&&b===0&&octets[2]===113)||
    a>=224;
}

function privateIpv6(address:string){
  const value=address.toLowerCase();
  if(value==="::"||value==="::1")return true;
  if(value.startsWith("fc")||value.startsWith("fd")||/^fe[89ab]/.test(value))return true;
  if(value.startsWith("2001:db8:"))return true;
  if(value.startsWith("::ffff:")){
    const mapped=value.slice(7);
    return isIP(mapped)===4?privateIpv4(mapped):true;
  }
  return false;
}

export function isPrivateAddress(address:string){
  const kind=isIP(address);
  if(kind===4)return privateIpv4(address);
  if(kind===6)return privateIpv6(address);
  return true;
}

function normalizeHost(host:string){return host.trim().toLowerCase().replace(/\.$/,"");}

function assertHeaderName(name:string){
  if(!/^[A-Za-z0-9-]{1,64}$/.test(name))throw new Error("invalid-auth-header-name");
}

export function validateWebhookConfiguration(config:WebhookConfig){
  const timeoutMs=Math.max(250,Math.min(30_000,Math.floor(config.timeoutMs??8_000)));
  const maxRequestBytes=Math.max(256,Math.min(256*1024,Math.floor(config.maxRequestBytes??64*1024)));
  const maxResponseBytes=Math.max(256,Math.min(512*1024,Math.floor(config.maxResponseBytes??128*1024)));
  if(!Array.isArray(config.allowedHosts)||!config.allowedHosts.length)throw new Error("webhook-host-allowlist-required");
  if(!Array.isArray(config.allowedPaths)||!config.allowedPaths.length)throw new Error("webhook-path-allowlist-required");
  if(!Array.isArray(config.allowedMethods)||!config.allowedMethods.length)throw new Error("webhook-method-allowlist-required");
  for(const method of config.allowedMethods)if(!["POST","PUT","PATCH"].includes(method))throw new Error("unsupported-webhook-method");
  const base=new URL(config.baseUrl);
  if(base.username||base.password)throw new Error("webhook-url-credentials-forbidden");
  const production=process.env.NODE_ENV==="production";
  if(production&&base.protocol!=="https:")throw new Error("webhook-https-required");
  if(!production&&!["http:","https:"].includes(base.protocol))throw new Error("unsupported-webhook-protocol");
  const allowedHosts=new Set(config.allowedHosts.map(normalizeHost));
  if(!allowedHosts.has(normalizeHost(base.hostname)))throw new Error("webhook-base-host-not-allowlisted");
  if(config.authHeaderName)assertHeaderName(config.authHeaderName);
  for(const path of config.allowedPaths){
    if(!path.startsWith("/")||path.includes("..")||path.includes("\\"))throw new Error("invalid-webhook-path");
  }
  if(config.healthPath&&(!config.healthPath.startsWith("/")||config.healthPath.includes("..")||config.healthPath.includes("\\")))throw new Error("invalid-webhook-health-path");
  return{base,allowedHosts,timeoutMs,maxRequestBytes,maxResponseBytes};
}

async function validateHost(url:URL,config:WebhookConfig,resolver:HostResolver){
  const parsed=validateWebhookConfiguration(config);
  if(!parsed.allowedHosts.has(normalizeHost(url.hostname)))throw new Error("webhook-host-not-allowlisted");
  const addresses=await resolver(url.hostname);
  if(!addresses.length)throw new Error("webhook-host-unresolved");
  const privateAddresses=addresses.filter(isPrivateAddress);
  const allowPrivate=config.allowPrivateNetwork===true&&process.env.NODE_ENV!=="production";
  if(privateAddresses.length&&!allowPrivate)throw new Error("webhook-private-network-forbidden");
}

function allowedPath(path:string,configured:string[]){
  return configured.some(item=>item===path);
}

function endpoint(config:WebhookConfig,path:string){
  if(!path.startsWith("/")||path.includes("..")||path.includes("\\"))throw new Error("invalid-webhook-path");
  if(!allowedPath(path,config.allowedPaths))throw new Error("webhook-path-not-allowlisted");
  const base=new URL(config.baseUrl);
  const url=new URL(path,base);
  if(url.origin!==base.origin)throw new Error("webhook-origin-change-forbidden");
  return url;
}

function parseResponse(body:string,contentType:string|null):Record<string,unknown>{
  if(!body)return{};
  if(contentType?.includes("application/json")){
    try{
      const value=JSON.parse(body);
      return value&&typeof value==="object"&&!Array.isArray(value)?value:{value};
    }catch{
      return{raw:body};
    }
  }
  return{raw:body};
}

export class WebhookIntegrationAdapter implements IntegrationAdapter<WebhookConfig>{
  readonly id="webhook";
  readonly name="Webhook / Generic REST";

  constructor(
    private readonly secrets:SecretResolver=new EnvironmentSecretResolver(),
    private readonly transport:WebhookTransport=new FetchWebhookTransport(),
    private readonly resolver:HostResolver=defaultHostResolver
  ){}

  capabilities():IntegrationCapability[]{
    return[
      {id:"webhook.post",name:"POST webhook",write:true,risk:"medium",requiredScopes:["integrations:write"]},
      {id:"webhook.put",name:"PUT webhook",write:true,risk:"medium",requiredScopes:["integrations:write"]},
      {id:"webhook.patch",name:"PATCH webhook",write:true,risk:"medium",requiredScopes:["integrations:write"]}
    ];
  }

  async health(context:IntegrationContext,config:WebhookConfig):Promise<IntegrationHealth>{
    const checkedAt=new Date().toISOString();
    try{
      const parsed=validateWebhookConfiguration(config);
      await validateHost(parsed.base,config,this.resolver);
      if(!config.healthPath){
        return{state:"degraded",message:"Configuration is safe; no active health path is configured.",checkedAt,details:{connectionId:context.connectionId}};
      }
      const healthUrl=endpoint({...config,allowedPaths:[...config.allowedPaths,config.healthPath]},config.healthPath);
      await validateHost(healthUrl,config,this.resolver);
      const response=await this.transport.send({
        url:healthUrl.toString(),method:"GET",headers:{accept:"application/json"},
        timeoutMs:parsed.timeoutMs,maxResponseBytes:parsed.maxResponseBytes
      });
      return response.status>=200&&response.status<400
        ?{state:"connected",message:"Health endpoint responded successfully.",checkedAt,details:{status:response.status}}
        :{state:"degraded",message:`Health endpoint returned HTTP ${response.status}.`,checkedAt,details:{status:response.status}};
    }catch(error){
      return{state:"error",message:error instanceof Error?error.message:"webhook-health-failed",checkedAt};
    }
  }

  async execute(actionId:string,input:Record<string,unknown>,context:IntegrationExecutionContext,config:WebhookConfig):Promise<IntegrationExecutionResult>{
    const capability=this.capabilities().find(item=>item.id===actionId);
    if(!capability)throw new Error("unsupported-webhook-action");
    const method=actionId.split(".")[1].toUpperCase() as WebhookMethod;
    if(!config.allowedMethods.includes(method))throw new Error("webhook-method-not-allowlisted");
    const path=typeof input.path==="string"?input.path:"";
    const url=endpoint(config,path);
    await validateHost(url,config,this.resolver);
    const parsed=validateWebhookConfiguration(config);
    const bodyValue=input.body??{};
    const body=JSON.stringify(bodyValue);
    if(new TextEncoder().encode(body).byteLength>parsed.maxRequestBytes)throw new Error("webhook-request-too-large");
    const headers:Record<string,string>={
      "content-type":"application/json",
      "accept":"application/json",
      "idempotency-key":context.idempotencyKey
    };
    if(config.secretReference){
      const secret=await this.secrets.resolve(config.secretReference);
      if(!secret)throw new Error("webhook-secret-unavailable");
      const name=config.authHeaderName??"authorization";
      assertHeaderName(name);
      headers[name]=(config.authPrefix??"Bearer ")+secret;
    }
    const response=await this.transport.send({
      url:url.toString(),method,headers,body,
      timeoutMs:parsed.timeoutMs,maxResponseBytes:parsed.maxResponseBytes
    });
    if(response.status<200||response.status>=300){
      throw new Error(`webhook-http-${response.status}`);
    }
    const data=parseResponse(response.body,response.contentType);
    return{
      ok:true,status:response.status,data,
      externalId:typeof data.id==="string"?data.id:undefined,
      idempotencyKey:context.idempotencyKey,
      completedAt:new Date().toISOString()
    };
  }
}
