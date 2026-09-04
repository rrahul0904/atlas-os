import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {db,closeDb} from "../../db/src/index.js";
import {
  UserRepository,WorkspaceRepository,AgentRepository,WorkflowRepository,ApprovalRepository,AuditRepository,ActionItemRepository,provisionWorkspace
} from "../../repositories/src/index.js";
import {DurableWorkflowRuntime,ToolExecutorRegistry,SimulatedToolExecutor,WorkflowRuntimeError,type ToolExecutor,type ToolExecutionContext} from "./index.js";
import {resolveWorkflowApproval} from "../../approvals/src/index.js";
import type {ToolDefinition} from "../../agent-governance/src/index.js";
import type {WorkflowDefinition} from "../../workflows/src/index.js";

async function expectFailure(fn:()=>Promise<unknown>,message:string){
  let failed=false;
  try{await fn()}catch{failed=true}
  assert.equal(failed,true,message);
}

function actionStep(agentId:string,connector="simulation",actionClass:"LOW_RISK_WRITE"|"FORBIDDEN"="LOW_RISK_WRITE"){
  return{
    id:"send",
    kind:"action" as const,
    name:"Send governed message",
    config:{
      agentId,
      businessReason:"Follow up on evidence-backed business work.",
      target:"customer:test",
      tool:{
        id:"message.send",name:"message.send",connector,action:"send",description:"Send customer message",
        isWrite:true,reversible:false,risk:"medium",scopes:["business:write"],dataClasses:["internal"],costUnits:1,enabled:true,actionClass
      },
      input:{message:"Hello"}
    }
  };
}

class AmbiguousExecutor implements ToolExecutor{
  connector="ambiguous";
  private readonly stored=new Map<string,Record<string,unknown>>();
  executionCount=0;
  async execute(tool:ToolDefinition,input:Record<string,unknown>,context:ToolExecutionContext){
    const existing=this.stored.get(context.idempotencyKey);
    if(existing)return existing;
    this.executionCount+=1;
    const result={accepted:true,toolId:tool.id,input};
    this.stored.set(context.idempotencyKey,result);
    throw new WorkflowRuntimeError("retryable","timeout-after-provider-accepted");
  }
}

class AlwaysRetryExecutor implements ToolExecutor{
  connector="always-retry";
  async execute(_tool:ToolDefinition,_input:Record<string,unknown>,_context:ToolExecutionContext):Promise<Record<string,unknown>>{
    throw new WorkflowRuntimeError("retryable","temporary-provider-failure");
  }
}

test("durable workflow governance lifecycle is certified in PostgreSQL",async()=>{
  if(!process.env.DATABASE_URL)return;
  const sql=db();
  try{
    const users=new UserRepository(sql);
    const workspaces=new WorkspaceRepository(sql);
    const agents=new AgentRepository(sql);
    const workflows=new WorkflowRepository(sql);
    const approvals=new ApprovalRepository(sql);
    const audit=new AuditRepository(sql);
    const actions=new ActionItemRepository(sql);

    const user=await users.create({email:`workflow-${randomUUID()}@example.test`,passwordHash:"test-hash"});
    const provisioned=await provisionWorkspace(sql,{
      userId:user.id,workspaceName:`Workflow ${randomUUID().slice(0,8)}`,verticalId:"dental",moduleIds:["today","business-ops","agent-governance"],planId:"business"
    });
    const scope={tenantId:provisioned.tenantId,workspaceId:provisioned.workspaceId};
    await workspaces.setApprovalMode(scope.tenantId,scope.workspaceId,"BALANCED");
    const agent=await agents.create(scope,{
      name:"Dental Front Desk Agent",moduleId:"business-ops",description:"Test agent",
      tools:["message.send"],scopes:["business:write"],riskPolicy:{},costBudgetDaily:5,enabled:true
    });

    const definition:WorkflowDefinition={
      id:`wf-${randomUUID()}`,name:"Approval resume certification",trigger:"manual",enabled:true,
      steps:[
        {id:"read",kind:"read",name:"Load context",config:{output:{contextLoaded:true}}},
        actionStep(agent.id),
        {id:"measure",kind:"measure",name:"Measure",config:{output:{measured:true}}}
      ]
    };
    await workflows.createDefinition(scope,definition);
    const storedDefinition=await workflows.findDefinition(scope,definition.id);
    assert.ok(Boolean(storedDefinition),"workflow definition must round-trip in the same tenant/workspace");
    assert.equal(storedDefinition?.enabled,true);
    const runId=await workflows.enqueue(scope,definition.id,{source:"test"},user.id);
    const simulation=new SimulatedToolExecutor();
    const runtime=new DurableWorkflowRuntime(sql,{executors:new ToolExecutorRegistry().register(simulation),retryDelaysMs:[0]});

    const paused=await runtime.processNext();
    assert.equal(paused?.id,runId);
    assert.equal(paused?.status,"waiting_approval",paused?.lastError??"workflow should pause for approval");
    assert.equal(simulation.executionCount,0,"tool must not execute before approval");

    const pending=(await approvals.listPending(scope))[0];
    assert.ok(Boolean(pending),"approval must be persisted");
    assert.equal(pending.workflow_run_id,runId);
    assert.equal(pending.workflow_step_id,"send");

    await expectFailure(
      ()=>resolveWorkflowApproval(sql,{userId:"other",tenantId:"wrong",workspaceId:scope.workspaceId,role:"owner",scopes:["*"]},pending.id,"approved"),
      "wrong tenant cannot resolve approval"
    );
    await expectFailure(
      ()=>resolveWorkflowApproval(sql,{userId:"viewer",tenantId:scope.tenantId,workspaceId:scope.workspaceId,role:"viewer",scopes:[]},pending.id,"approved"),
      "viewer cannot resolve approval"
    );

    await resolveWorkflowApproval(sql,{userId:user.id,tenantId:scope.tenantId,workspaceId:scope.workspaceId,role:"owner",scopes:["*"]},pending.id,"approved");
    assert.equal((await workflows.getRun(scope,runId))?.status,"pending");

    const completed=await runtime.processNext();
    assert.equal(completed?.id,runId);
    assert.equal(completed?.status,"completed");
    assert.equal(simulation.executionCount,1,"approved tool executes exactly once");

    await runtime.processRun((await workflows.getRun(scope,runId))!);
    assert.equal(simulation.executionCount,1,"completed action cannot be replayed");
    const steps=await workflows.listSteps(scope,runId);
    assert.equal(steps.filter((row:any)=>row.status==="completed").length,3);

    const trail=await audit.listRecent(scope,100);
    assert.ok(trail.some((row:any)=>row.action==="approval.approved"));
    assert.ok(trail.some((row:any)=>row.action==="tool.executed"));
    assert.ok(trail.some((row:any)=>row.action==="workflow.completed"));

    const rejectDefinition:WorkflowDefinition={id:`wf-${randomUUID()}`,name:"Reject",trigger:"manual",enabled:true,steps:[actionStep(agent.id)]};
    await workflows.createDefinition(scope,rejectDefinition);
    const rejectRun=await workflows.enqueue(scope,rejectDefinition.id,{},user.id);
    await runtime.processNext();
    const rejectApproval=(await approvals.listPending(scope)).find((row:any)=>row.workflow_run_id===rejectRun);
    assert.ok(Boolean(rejectApproval));
    if(!rejectApproval)throw new Error("reject-approval-not-created");
    await resolveWorkflowApproval(sql,{userId:user.id,tenantId:scope.tenantId,workspaceId:scope.workspaceId,role:"owner",scopes:["*"]},rejectApproval.id,"rejected");
    assert.equal((await workflows.getRun(scope,rejectRun))?.status,"failed");

    const deniedDefinition:WorkflowDefinition={id:`wf-${randomUUID()}`,name:"Denied",trigger:"manual",enabled:true,steps:[actionStep(agent.id,"simulation","FORBIDDEN")]};
    await workflows.createDefinition(scope,deniedDefinition);
    const deniedRun=await workflows.enqueue(scope,deniedDefinition.id,{},user.id);
    const deniedResult=await runtime.processNext();
    assert.equal(deniedResult?.id,deniedRun);
    assert.equal(deniedResult?.status,"failed");
    assert.equal(simulation.executionCount,1,"denied tool never executes");

    const claimDefinition:WorkflowDefinition={id:`wf-${randomUUID()}`,name:"Claim",trigger:"manual",enabled:true,steps:[{id:"measure",kind:"measure",name:"done"}]};
    await workflows.createDefinition(scope,claimDefinition);
    const claimRun=await workflows.enqueue(scope,claimDefinition.id,{},user.id);
    const claims=await Promise.all([workflows.claimNext(),workflows.claimNext()]);
    assert.equal(claims.filter(Boolean).length,1,"SKIP LOCKED allows only one claim");
    assert.equal(claims.find(Boolean)?.id,claimRun);
    await runtime.processRun(claims.find(Boolean)!);

    const ambiguous=new AmbiguousExecutor();
    const retryAgent=await agents.create(scope,{name:`Retry Agent ${randomUUID().slice(0,6)}`,moduleId:"business-ops",description:"Retry",tools:["message.send"],scopes:["business:write"],riskPolicy:{},costBudgetDaily:5,enabled:true});
    await workspaces.setApprovalMode(scope.tenantId,scope.workspaceId,"SAFE_AUTOPILOT");
    const retryDefinition:WorkflowDefinition={id:`wf-${randomUUID()}`,name:"Idempotent retry",trigger:"manual",enabled:true,steps:[actionStep(retryAgent.id,"ambiguous")]};
    await workflows.createDefinition(scope,retryDefinition);
    const retryRun=await workflows.enqueue(scope,retryDefinition.id,{},user.id);
    const retryRuntime=new DurableWorkflowRuntime(sql,{executors:new ToolExecutorRegistry().register(ambiguous),maxAttempts:3,retryDelaysMs:[0,0,0]});
    const retryFirst=await retryRuntime.processNext();
    assert.equal(retryFirst?.id,retryRun);
    assert.equal(retryFirst?.status,"pending");
    const retryDone=await retryRuntime.processNext();
    assert.equal(retryDone?.status,"completed");
    assert.equal(ambiguous.executionCount,1,"idempotency key prevents duplicate external side effect");

    const deadAgent=await agents.create(scope,{name:`Dead Agent ${randomUUID().slice(0,6)}`,moduleId:"business-ops",description:"Dead",tools:["message.send"],scopes:["business:write"],riskPolicy:{},costBudgetDaily:5,enabled:true});
    const deadDefinition:WorkflowDefinition={id:`wf-${randomUUID()}`,name:"Dead letter",trigger:"manual",enabled:true,steps:[actionStep(deadAgent.id,"always-retry")]};
    await workflows.createDefinition(scope,deadDefinition);
    const deadRun=await workflows.enqueue(scope,deadDefinition.id,{},user.id);
    const deadRuntime=new DurableWorkflowRuntime(sql,{executors:new ToolExecutorRegistry().register(new AlwaysRetryExecutor()),maxAttempts:2,retryDelaysMs:[0,0]});
    assert.equal((await deadRuntime.processNext())?.status,"pending");
    assert.equal((await deadRuntime.processNext())?.status,"dead_letter");
    assert.equal((await workflows.getRun(scope,deadRun))?.status,"dead_letter");
    assert.ok((await actions.listOpen(scope,100)).some(item=>item.entity?.id===deadRun&&item.title==="Automation failed and needs attention"));
  }finally{
    await closeDb();
  }
});
