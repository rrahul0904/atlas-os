import test from "node:test";
import assert from "node:assert/strict";
import {WebhookIntegrationAdapter,isPrivateAddress,readBounded,type SecretResolver,type WebhookTransport} from "./index.js";

class Secrets implements SecretResolver{
  async resolve(reference:string){return reference==="env:TEST_SECRET"?"secret-value":null;}
}
class Transport implements WebhookTransport{
  requests:any[]=[];
  async send(request:any){
    this.requests.push(request);
    return{status:200,body:'{"id":"external-1","accepted":true}',contentType:"application/json"};
  }
}

const publicResolver=async()=>["93.184.216.34"];
const base={baseUrl:"https://api.example.com",allowedHosts:["api.example.com"],allowedPaths:["/events"],allowedMethods:["POST" as const],secretReference:"env:TEST_SECRET"};

test("private address classifier blocks internal and reserved ranges",()=>{
  for(const address of[
    "127.0.0.1","10.0.0.1","172.16.0.1","192.168.1.2","169.254.169.254",
    "0.0.0.1","224.0.0.1","::1","fc00::1","fd00::1","fe80::1","2001:db8::1","::ffff:127.0.0.1"
  ])assert.equal(isPrivateAddress(address),true,address);
  assert.equal(isPrivateAddress("93.184.216.34"),false);
});

test("webhook adapter enforces host path and method allowlists",async()=>{
  const transport=new Transport();
  const adapter=new WebhookIntegrationAdapter(new Secrets(),transport,publicResolver);
  const result=await adapter.execute("webhook.post",{path:"/events",body:{ok:true}},{tenantId:"t",workspaceId:"w",connectionId:"c",actionId:"webhook.post",idempotencyKey:"key-1",initiatedBy:"u"},base);
  assert.equal(result.externalId,"external-1");
  assert.equal(transport.requests[0].headers["idempotency-key"],"key-1");
  let failed=false;
  try{await adapter.execute("webhook.put",{path:"/events"},{tenantId:"t",workspaceId:"w",connectionId:"c",actionId:"webhook.put",idempotencyKey:"k",initiatedBy:"u"},base as any)}catch{failed=true}
  assert.equal(failed,true);
});

test("webhook adapter rejects paths outside configuration",async()=>{
  const adapter=new WebhookIntegrationAdapter(new Secrets(),new Transport(),publicResolver);
  let failed=false;
  try{await adapter.execute("webhook.post",{path:"/admin",body:{}},{tenantId:"t",workspaceId:"w",connectionId:"c",actionId:"webhook.post",idempotencyKey:"k",initiatedBy:"u"},base)}catch{failed=true}
  assert.equal(failed,true);
});

test("webhook adapter rejects DNS resolving to private address",async()=>{
  const adapter=new WebhookIntegrationAdapter(new Secrets(),new Transport(),async()=>["10.0.0.2"]);
  let failed=false;
  try{await adapter.execute("webhook.post",{path:"/events",body:{}},{tenantId:"t",workspaceId:"w",connectionId:"c",actionId:"webhook.post",idempotencyKey:"k",initiatedBy:"u"},base)}catch{failed=true}
  assert.equal(failed,true);
});

test("webhook adapter enforces request size limit",async()=>{
  const adapter=new WebhookIntegrationAdapter(new Secrets(),new Transport(),publicResolver);
  let failed=false;
  try{
    await adapter.execute("webhook.post",{path:"/events",body:{value:"x".repeat(1024)}},{tenantId:"t",workspaceId:"w",connectionId:"c",actionId:"webhook.post",idempotencyKey:"k",initiatedBy:"u"},{...base,maxRequestBytes:256});
  }catch(error){failed=error instanceof Error&&error.message==="webhook-request-too-large"}
  assert.equal(failed,true);
});

test("bounded response reader rejects oversized provider responses",async()=>{
  let failed=false;
  try{await readBounded(new Response("x".repeat(1024)),256)}catch(error){failed=error instanceof Error&&error.message==="webhook-response-too-large"}
  assert.equal(failed,true);
});
