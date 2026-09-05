import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {db,closeDb} from "../../db/src/index.js";
import {
  UserRepository,WorkspaceRepository,AgentRepository,WorkflowRepository,ApprovalRepository,
  IntegrationConnectionRepository,AuditRepository,provisionWorkspace
} from "../../repositories/src/index.js";
import {MemorySecretStore} from "../../secrets/src/index.js";
import {DurableWorkflowRuntime,ToolExecutorRegistry,WorkflowRuntimeError} from "../../workflow-runtime/src/index.js";
import {IntegrationAdapterRegistry} from "../../integrations-sdk/src/index.js";
import {IntegrationToolExecutor} from "../../integration-runtime/src/index.js";
import {resolveWorkflowApproval} from "../../approvals/src/index.js";
import {GoogleWorkspaceAdapter} from "./adapter.js";
import {GoogleTokenManager} from "./tokens.js";
import type {GoogleHttpRequest,GoogleHttpResponse,GoogleHttpTransport} from "./transport.js";
import type {WorkflowDefinition} from "../../workflows/src/index.js";

class Provider implements GoogleHttpTransport{
  requests:GoogleHttpRequest[]=[];
  gmailEffects=0;
  calendarCreateEffects=0;
  calendarUpdateEffects=0;
  events=new Map<string,any>();
  async request(input:GoogleHttpRequest):Promise<GoogleHttpResponse>{
    this.requests.push(input);
    const url=new URL(input.url);
    if(url.hostname==="gmail.googleapis.com"&&url.pathname.endsWith("/messages")&&input.method!=="POST"){
      return{status:200,body:JSON.stringify({messages:[],resultSizeEstimate:0}),headers:{}};
    }
    if(url.hostname==="gmail.googleapis.com"&&url.pathname.endsWith("/messages/send")&&input.method==="POST"){
      this.gmailEffects+=1;return{status:200,body:JSON.stringify({id:"gmail-e2e",threadId:"thread-e2e"}),headers:{}};
    }
    if(url.hostname==="www.googleapis.com"&&url.pathname.includes("/calendar/v3/calendars/")){
      const parts=url.pathname.split("/");const i=parts.indexOf("events");const eventId=i>=0&&parts[i+1]?decodeURIComponent(parts[i+1]):null;
      if(input.method==="POST"&&url.pathname.endsWith("/events")){
        this.calendarCreateEffects+=1;const body=JSON.parse(input.body??"{}");this.events.set(String(body.id),body);
        return{status:200,body:JSON.stringify({...body,htmlLink:"https://calendar.example/e2e"}),headers:{}};
      }
      if(input.method==="PATCH"&&eventId){
        this.calendarUpdateEffects+=1;const body=JSON.parse(input.body??"{}");const next={...(this.events.get(eventId)??{id:eventId}),...body,id:eventId};this.events.set(eventId,next);
        return{status:200,body:JSON.stringify(next),headers:{}};
      }
      if(eventId){
        const event=this.events.get(eventId);
        return event?{status:200,body:JSON.stringify(event),headers:{}}:{status:404,body:"{}",headers:{}};
      }
      return{status:200,body:JSON.stringify({items:[...this.events.values()]}),headers:{}};
    }
    throw new Error("unexpected-google-request:"+input.url);
  }
}

function tool(action:"gmail.send"|"calendar.create"|"calendar.update"){
  const gmail=action==="gmail.send";
  return{
    id:"google."+action,
    name:"google."+action,
    connector:"google-workspace",
    action,
    description:"Governed Google Workspace write.",
    isWrite:true,
    reversible:false,
    risk:"high" as const,
    scopes:[gmail?"gmail:send":"calendar:write"],
    dataClasses:["internal" as const],
    costUnits:1,
    enabled:true,
    actionClass:"HIGH_RISK_WRITE" as const
  };
}

async function approve(sql:any,scope:{tenantId:string;workspaceId:string},userId:string,runId:string){
  const approvals=new ApprovalRepository(sql);
  const approval=(await approvals.listPending(scope)).find((row:any)=>row.workflow_run_id===runId);
  assert.ok(Boolean(approval));
  if(!approval)throw new Error("approval-not-created");
  await resolveWorkflowApproval(sql,{userId,tenantId:scope.tenantId,workspaceId:scope.workspaceId,role:"owner",scopes:["*"]},approval.id,"approved");
}

test("Google writes traverse governance approval and execute exactly once",async()=>{
  if(!process.env.DATABASE_URL)return;
  const sql=db();
  try{
    const user=await new UserRepository(sql).create({email:`google-e2e-${randomUUID()}@example.test`,passwordHash:"test"});
    const workspace=await provisionWorkspace(sql,{userId:user.id,workspaceName:`Google E2E ${randomUUID().slice(0,8)}`,verticalId:"founder",moduleIds:["today","founder","agent-governance"]});
    const scope={tenantId:workspace.tenantId,workspaceId:workspace.workspaceId};
    await new WorkspaceRepository(sql).setApprovalMode(scope.tenantId,scope.workspaceId,"SAFE_AUTOPILOT");

    const agent=await new AgentRepository(sql).create(scope,{
      name:"Google E2E Agent",moduleId:"founder",description:"Certification agent",
      tools:["google.gmail.send","google.calendar.create","google.calendar.update"],
      scopes:["gmail:send","calendar:write"],riskPolicy:{},costBudgetDaily:10,enabled:true
    });
    const secrets=new MemorySecretStore();
    const ref=await secrets.put(scope,JSON.stringify({accessToken:"provider-access-secret",refreshToken:"provider-refresh-secret",expiresAt:Date.now()+3600_000,tokenType:"Bearer",scopes:[]}));
    const connection=await new IntegrationConnectionRepository(sql).upsert(scope,{integrationId:"google-workspace",status:"connected",externalAccountRef:"owner@example.test",secretReference:ref,config:{}});
    const provider=new Provider();
    const tokenManager=new GoogleTokenManager(sql,secrets,provider,{clientId:"client",clientSecret:"client-secret",redirectUri:"https://atlas.example.test/callback"});
    const adapter=new GoogleWorkspaceAdapter(sql,tokenManager,provider);
    const executor=new IntegrationToolExecutor(sql,new IntegrationAdapterRegistry().register(adapter),"google-workspace");
    const runtime=new DurableWorkflowRuntime(sql,{executors:new ToolExecutorRegistry().register(executor),retryDelaysMs:[0,0]});
    const workflows=new WorkflowRepository(sql);

    const gmailDefinition:WorkflowDefinition={
      id:`wf-google-gmail-${randomUUID()}`,name:"Governed Gmail",trigger:"manual",enabled:true,
      steps:[{id:"send",kind:"action",name:"Send approved email",config:{agentId:agent.id,businessReason:"Follow up with a qualified lead.",target:"lead:test",tool:tool("gmail.send"),input:{to:"lead@example.test",subject:"Follow up",text:"Thanks for your interest."}}}]
    };
    await workflows.createDefinition(scope,gmailDefinition);
    const gmailRun=await workflows.enqueue(scope,gmailDefinition.id,{},user.id);
    assert.equal((await runtime.processNext())?.status,"waiting_approval");
    assert.equal(provider.gmailEffects,0,"high-risk Gmail send cannot execute before approval even in safe autopilot");
    await approve(sql,scope,user.id,gmailRun);
    assert.equal((await runtime.processNext())?.status,"completed");
    assert.equal(provider.gmailEffects,1);
    await runtime.processRun((await workflows.getRun(scope,gmailRun))!);
    assert.equal(provider.gmailEffects,1);

    const createDefinition:WorkflowDefinition={
      id:`wf-google-calendar-create-${randomUUID()}`,name:"Governed Calendar Create",trigger:"manual",enabled:true,
      steps:[{id:"create",kind:"action",name:"Create approved meeting",config:{agentId:agent.id,businessReason:"Schedule qualified lead meeting.",target:"calendar:primary",tool:tool("calendar.create"),input:{calendarId:"primary",summary:"Lead meeting",start:{dateTime:"2026-09-05T10:00:00-04:00"},end:{dateTime:"2026-09-05T10:30:00-04:00"}}}}]
    };
    await workflows.createDefinition(scope,createDefinition);
    const createRun=await workflows.enqueue(scope,createDefinition.id,{},user.id);
    assert.equal((await runtime.processNext())?.status,"waiting_approval");
    assert.equal(provider.calendarCreateEffects,0);
    await approve(sql,scope,user.id,createRun);
    assert.equal((await runtime.processNext())?.status,"completed");
    assert.equal(provider.calendarCreateEffects,1);
    const createSteps=await workflows.listSteps(scope,createRun);
    const eventId=(createSteps.find((row:any)=>row.step_id==="create")?.output as any)?.externalId;
    assert.ok(Boolean(eventId));

    const updateDefinition:WorkflowDefinition={
      id:`wf-google-calendar-update-${randomUUID()}`,name:"Governed Calendar Update",trigger:"manual",enabled:true,
      steps:[{id:"update",kind:"action",name:"Update approved meeting",config:{agentId:agent.id,businessReason:"Move qualified lead meeting.",target:"calendar:primary",tool:tool("calendar.update"),input:{calendarId:"primary",eventId,summary:"Lead meeting updated",start:{dateTime:"2026-09-05T11:00:00-04:00"},end:{dateTime:"2026-09-05T11:30:00-04:00"}}}}]
    };
    await workflows.createDefinition(scope,updateDefinition);
    const updateRun=await workflows.enqueue(scope,updateDefinition.id,{},user.id);
    assert.equal((await runtime.processNext())?.status,"waiting_approval");
    assert.equal(provider.calendarUpdateEffects,0);
    await approve(sql,scope,user.id,updateRun);
    assert.equal((await runtime.processNext())?.status,"completed");
    assert.equal(provider.calendarUpdateEffects,1);

    const trail=await new AuditRepository(sql).listRecent(scope,300);
    const audit=JSON.stringify(trail);
    assert.ok(trail.some((row:any)=>row.action==="integration.execution_succeeded"));
    assert.equal(audit.includes("provider-access-secret"),false);
    assert.equal(audit.includes("provider-refresh-secret"),false);
    assert.equal((await new IntegrationConnectionRepository(sql).findScoped(scope,connection.id))?.status,"connected");

    let riskMismatch=false;
    try{
      await executor.execute({...tool("gmail.send"),risk:"low",actionClass:"LOW_RISK_WRITE"}, {to:"x@example.test",subject:"x",text:"x"}, {
        ...scope,runId:"risk",stepId:"send",agentId:agent.id,initiatedBy:user.id,idempotencyKey:"risk-mismatch"
      });
    }catch(error){riskMismatch=error instanceof WorkflowRuntimeError&&error.message==="integration-capability-risk-mismatch"}
    assert.equal(riskMismatch,true);
    assert.equal(provider.gmailEffects,1);
  }finally{await closeDb()}
});
