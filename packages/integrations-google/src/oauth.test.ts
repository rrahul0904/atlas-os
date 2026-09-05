import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {db,closeDb} from "../../db/src/index.js";
import {UserRepository,IntegrationConnectionRepository,provisionWorkspace} from "../../repositories/src/index.js";
import {MemorySecretStore} from "../../secrets/src/index.js";
import type {TenantPrincipal} from "../../tenancy/src/index.js";
import {GoogleOAuthService} from "./oauth.js";
import {GoogleTokenManager,GOOGLE_SCOPES} from "./tokens.js";
import type {GoogleHttpRequest,GoogleHttpResponse,GoogleHttpTransport} from "./transport.js";

class QueueTransport implements GoogleHttpTransport{
  requests:GoogleHttpRequest[]=[];
  constructor(private readonly responses:GoogleHttpResponse[]){}
  async request(input:GoogleHttpRequest){
    this.requests.push(input);
    const next=this.responses.shift();
    if(!next)throw new Error("unexpected-google-request");
    return next;
  }
}
const response=(status:number,body:unknown):GoogleHttpResponse=>({status,body:JSON.stringify(body),headers:{"content-type":"application/json"}});

test("Google OAuth binds PKCE state to user tenant workspace and consumes it once",async()=>{
  if(!process.env.DATABASE_URL)return;
  const sql=db();
  try{
    const user=await new UserRepository(sql).create({email:`oauth-${randomUUID()}@example.test`,passwordHash:"test"});
    const first=await provisionWorkspace(sql,{userId:user.id,workspaceName:`OAuth A ${randomUUID().slice(0,8)}`,verticalId:"founder",moduleIds:["today"]});
    const second=await provisionWorkspace(sql,{userId:user.id,workspaceName:`OAuth B ${randomUUID().slice(0,8)}`,verticalId:"founder",moduleIds:["today"]});
    const principal:TenantPrincipal={userId:user.id,tenantId:first.tenantId,workspaceId:first.workspaceId,role:"owner",scopes:["*"]};
    const wrong:TenantPrincipal={...principal,tenantId:second.tenantId,workspaceId:second.workspaceId};
    const secrets=new MemorySecretStore();
    const transport=new QueueTransport([
      response(200,{access_token:"access-secret",refresh_token:"refresh-secret",expires_in:3600,token_type:"Bearer",scope:GOOGLE_SCOPES.join(" ")}),
      response(200,{emailAddress:"owner@example.test"})
    ]);
    const config={clientId:"client-id",clientSecret:"client-secret",redirectUri:"https://atlas.example.test/app/integrations/google/callback"};
    const tokens=new GoogleTokenManager(sql,secrets,transport,config);
    const service=new GoogleOAuthService(sql,secrets,transport,config,tokens);

    const started=await service.begin(principal);
    const auth=new URL(started.authorizationUrl);
    const state=auth.searchParams.get("state")??"";
    assert.ok(state.length>20);
    assert.equal(auth.searchParams.get("code_challenge_method"),"S256");
    assert.ok((auth.searchParams.get("code_challenge")??"").length>20);
    assert.equal(auth.searchParams.has("code_verifier"),false);
    assert.equal(auth.searchParams.get("scope"),GOOGLE_SCOPES.join(" "));

    let wrongScope=false;
    try{await service.complete(wrong,state,"auth-code")}catch(error){wrongScope=error instanceof Error&&error.message==="google-oauth-state-invalid-or-expired"}
    assert.equal(wrongScope,true);

    const completed=await service.complete(principal,state,"auth-code");
    assert.equal(completed.accountEmail,"owner@example.test");
    const connection=await new IntegrationConnectionRepository(sql).findByIntegration({tenantId:principal.tenantId,workspaceId:principal.workspaceId},"google-workspace");
    assert.equal(connection?.status,"connected");
    assert.equal(connection?.externalAccountRef,"owner@example.test");
    assert.equal(JSON.stringify(connection?.config??{}).includes("access-secret"),false);
    assert.equal(JSON.stringify(connection?.config??{}).includes("refresh-secret"),false);
    assert.ok(Boolean(connection?.secretReference));

    let replay=false;
    try{await service.complete(principal,state,"auth-code")}catch(error){replay=error instanceof Error&&error.message==="google-oauth-state-invalid-or-expired"}
    assert.equal(replay,true);
  }finally{await closeDb()}
});

test("expired and tampered Google OAuth state are rejected before provider exchange",async()=>{
  if(!process.env.DATABASE_URL)return;
  const sql=db();
  try{
    const user=await new UserRepository(sql).create({email:`oauth-expire-${randomUUID()}@example.test`,passwordHash:"test"});
    const workspace=await provisionWorkspace(sql,{userId:user.id,workspaceName:`OAuth Expire ${randomUUID().slice(0,8)}`,verticalId:"founder",moduleIds:["today"]});
    const principal:TenantPrincipal={userId:user.id,tenantId:workspace.tenantId,workspaceId:workspace.workspaceId,role:"owner",scopes:["*"]};
    const secrets=new MemorySecretStore();
    const transport=new QueueTransport([]);
    const config={clientId:"client-id",clientSecret:"client-secret",redirectUri:"https://atlas.example.test/app/integrations/google/callback"};
    const service=new GoogleOAuthService(sql,secrets,transport,config,new GoogleTokenManager(sql,secrets,transport,config));
    const started=await service.begin(principal);
    const state=new URL(started.authorizationUrl).searchParams.get("state")??"";

    let tampered=false;
    try{await service.complete(principal,state+"x","valid-code")}catch(error){tampered=error instanceof Error&&error.message==="google-oauth-state-invalid-or-expired"}
    assert.equal(tampered,true);

    await sql`UPDATE atlas_oauth_transactions SET expires_at=now()-interval '1 minute' WHERE tenant_id=${principal.tenantId} AND workspace_id=${principal.workspaceId}`;
    let expired=false;
    try{await service.complete(principal,state,"valid-code")}catch(error){expired=error instanceof Error&&error.message==="google-oauth-state-invalid-or-expired"}
    assert.equal(expired,true);
    assert.equal(transport.requests.length,0);
  }finally{await closeDb()}
});
