import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {db,closeDb} from "../../db/src/index.js";
import {UserRepository,IntegrationConnectionRepository,provisionWorkspace} from "../../repositories/src/index.js";
import {MemorySecretStore} from "../../secrets/src/index.js";
import {GoogleReauthenticationRequired,GoogleTokenManager} from "./tokens.js";
import type {GoogleHttpRequest,GoogleHttpResponse,GoogleHttpTransport} from "./transport.js";

class QueueTransport implements GoogleHttpTransport{
  requests:GoogleHttpRequest[]=[];
  constructor(private readonly responses:GoogleHttpResponse[]){}
  async request(input:GoogleHttpRequest){
    this.requests.push(input);
    const next=this.responses.shift();if(!next)throw new Error("unexpected-google-request");return next;
  }
}
const response=(status:number,body:unknown):GoogleHttpResponse=>({status,body:JSON.stringify(body),headers:{}});

test("Google token manager refreshes expired encrypted token in place",async()=>{
  if(!process.env.DATABASE_URL)return;
  const sql=db();
  try{
    const user=await new UserRepository(sql).create({email:`refresh-${randomUUID()}@example.test`,passwordHash:"test"});
    const workspace=await provisionWorkspace(sql,{userId:user.id,workspaceName:`Refresh ${randomUUID().slice(0,8)}`,verticalId:"founder",moduleIds:["today"]});
    const scope={tenantId:workspace.tenantId,workspaceId:workspace.workspaceId};
    const secrets=new MemorySecretStore();
    const reference=await secrets.put(scope,JSON.stringify({accessToken:"expired",refreshToken:"refresh-secret",expiresAt:Date.now()-1000,tokenType:"Bearer",scopes:["scope-a"]}));
    const connection=await new IntegrationConnectionRepository(sql).upsert(scope,{integrationId:"google-workspace",status:"connected",externalAccountRef:"owner@example.test",secretReference:reference,config:{scopes:["scope-a"]}});
    const transport=new QueueTransport([response(200,{access_token:"new-access",expires_in:3600,token_type:"Bearer",scope:"scope-a"})]);
    const manager=new GoogleTokenManager(sql,secrets,transport,{clientId:"client",clientSecret:"client-secret",redirectUri:"https://atlas.example.test/callback"});

    assert.equal(await manager.getAccessToken(scope,connection.id),"new-access");
    const saved=await secrets.get(scope,reference);
    assert.equal(saved?.includes("new-access"),true);
    assert.equal(saved?.includes("refresh-secret"),true);
    assert.equal(transport.requests.length,1);
    assert.equal(transport.requests[0].body?.includes("refresh-secret"),true);
  }finally{await closeDb()}
});

test("Google invalid_grant transitions connection to needs_reauthentication",async()=>{
  if(!process.env.DATABASE_URL)return;
  const sql=db();
  try{
    const user=await new UserRepository(sql).create({email:`invalid-grant-${randomUUID()}@example.test`,passwordHash:"test"});
    const workspace=await provisionWorkspace(sql,{userId:user.id,workspaceName:`Invalid Grant ${randomUUID().slice(0,8)}`,verticalId:"founder",moduleIds:["today"]});
    const scope={tenantId:workspace.tenantId,workspaceId:workspace.workspaceId};
    const secrets=new MemorySecretStore();
    const reference=await secrets.put(scope,JSON.stringify({accessToken:"expired",refreshToken:"revoked",expiresAt:Date.now()-1000,tokenType:"Bearer",scopes:[]}));
    const repo=new IntegrationConnectionRepository(sql);
    const connection=await repo.upsert(scope,{integrationId:"google-workspace",status:"connected",externalAccountRef:"owner@example.test",secretReference:reference,config:{}});
    const manager=new GoogleTokenManager(sql,secrets,new QueueTransport([response(400,{error:"invalid_grant"})]),{clientId:"client",clientSecret:"client-secret",redirectUri:"https://atlas.example.test/callback"});

    let reauth=false;
    try{await manager.getAccessToken(scope,connection.id)}catch(error){reauth=error instanceof GoogleReauthenticationRequired}
    assert.equal(reauth,true);
    assert.equal((await repo.findScoped(scope,connection.id))?.status,"needs_reauthentication");
  }finally{await closeDb()}
});
