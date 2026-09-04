import test from "node:test";
import assert from "node:assert/strict";
import {WebhookIntegrationAdapter,isPrivateAddress,type SecretResolver,type WebhookTransport} from "./index.js";

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

test("private address classifier blocks internal ranges",()=>{
  assert.equal(isPrivateAddress("127.0.0.1"),true);
  assert.equal(isPrivateAddress("10.0.0.1"),true);
  assert.equal(isPrivateAddress("169.254.169.254"),true);
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
