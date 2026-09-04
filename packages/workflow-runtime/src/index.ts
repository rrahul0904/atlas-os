import type {AtlasSql} from "../../db/src/index.js";
import {
  AgentRepository,
  ApprovalRepository,
  AuditRepository,
  ActionItemRepository,
  WorkflowRepository,
  WorkspaceRepository,
  type StoredWorkflowRun
} from "../../repositories/src/index.js";
import {
  authorizeWithApprovalMode,
  type ToolDefinition,
  type PolicyRule,
  type ApprovalMode,
  type DataClass
} from "../../agent-governance/src/index.js";
import type {WorkflowDefinition,WorkflowStep} from "../../workflows/src/index.js";

export type WorkflowErrorKind="retryable"|"non_retryable"|"denied";

export class WorkflowRuntimeError extends Error{
  constructor(public readonly kind:WorkflowErrorKind,message:string){super(message);this.name="WorkflowRuntimeError";}
}

export interface ToolExecutionContext{
  tenantId:string;
  workspaceId:string;
  runId:string;
  stepId:string;
  agentId:string;
  initiatedBy:string;
  idempotencyKey:string;
}

export interface ToolExecutor{
  connector:string;
  execute(tool:ToolDefinition,input:Record<string,unknown>,context:ToolExecutionContext):Promise<Record<string,unknown>>;
}

export class ToolExecutorRegistry{
  private readonly executors=new Map<string,ToolExecutor>();
  register(executor:ToolExecutor){this.executors.set(executor.connector,executor);return this;}
  get(connector:string){return this.executors.get(connector)??null;}
}

export class SimulatedToolExecutor implements ToolExecutor{
  connector="simulation";
  private readonly results=new Map<string,Record<string,unknown>>();
  executionCount=0;
  async execute(tool:ToolDefinition,input:Record<string,unknown>,context:ToolExecutionContext){
    const existing=this.results.get(context.idempotencyKey);
    if(existing)return existing;
    this.executionCount+=1;
    const result={simulation:true,toolId:tool.id,input,idempotencyKey:context.idempotencyKey,executionNumber:this.executionCount};
    this.results.set(context.idempotencyKey,result);
    return result;
  }
}

export interface StepHandlerContext{
  run:StoredWorkflowRun;
  definition:WorkflowDefinition;
  step:WorkflowStep;
  state:Record<string,unknown>;
}

export type StepHandler=(context:StepHandlerContext)=>Promise<Record<string,unknown>>;

export interface WorkflowRuntimeOptions{
  executors:ToolExecutorRegistry;
  handlers?:Partial<Record<"read"|"condition"|"transform"|"ai"|"measure"|"trigger",StepHandler>>;
  maxAttempts?:number;
  retryDelaysMs?:number[];
  policyRules?:PolicyRule[];
}

function objectValue(value:unknown):Record<string,unknown>{
  return value&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:{};
}

function toolFromStep(step:WorkflowStep):ToolDefinition{
  const raw=objectValue(step.config?.tool);
  const risk=raw.risk;
  if(typeof raw.id!=="string"||typeof raw.name!=="string"||typeof raw.connector!=="string"||typeof raw.action!=="string"){
    throw new WorkflowRuntimeError("non_retryable",`invalid-tool-definition:${step.id}`);
  }
  if(!["low","medium","high","critical"].includes(String(risk))){
    throw new WorkflowRuntimeError("non_retryable",`invalid-tool-risk:${step.id}`);
  }
  return{
    id:raw.id,
    name:raw.name,
    connector:raw.connector,
    action:raw.action,
    description:typeof raw.description==="string"?raw.description:raw.name,
    isWrite:Boolean(raw.isWrite),
    reversible:Boolean(raw.reversible),
    risk:risk as ToolDefinition["risk"],
    scopes:Array.isArray(raw.scopes)?raw.scopes.filter((x):x is string=>typeof x==="string"):[],
    dataClasses:Array.isArray(raw.dataClasses)?raw.dataClasses.filter((x):x is DataClass=>["public","internal","confidential","pii","restricted"].includes(String(x))):[],
    costUnits:typeof raw.costUnits==="number"?raw.costUnits:0,
    enabled:raw.enabled!==false,
    actionClass:typeof raw.actionClass==="string"?raw.actionClass as ToolDefinition["actionClass"]:undefined
  };
}

function retryAt(attempt:number,delays:number[]){
  const delay=delays[Math.min(Math.max(attempt-1,0),delays.length-1)]??30_000;
  return new Date(Date.now()+delay).toISOString();
}

function idempotencyKey(run:StoredWorkflowRun,step:WorkflowStep,tool?:ToolDefinition){
  return [run.workspaceId,run.id,step.id,tool?.id??step.kind].join(":");
}

export class DurableWorkflowRuntime{
  private readonly workflows:WorkflowRepository;
  private readonly approvals:ApprovalRepository;
  private readonly agents:AgentRepository;
  private readonly audit:AuditRepository;
  private readonly actions:ActionItemRepository;
  private readonly workspaces:WorkspaceRepository;
  private readonly maxAttempts:number;
  private readonly retryDelays:number[];

  constructor(private readonly sql:AtlasSql,private readonly options:WorkflowRuntimeOptions){
    this.workflows=new WorkflowRepository(sql);
    this.approvals=new ApprovalRepository(sql);
    this.agents=new AgentRepository(sql);
    this.audit=new AuditRepository(sql);
    this.actions=new ActionItemRepository(sql);
    this.workspaces=new WorkspaceRepository(sql);
    this.maxAttempts=options.maxAttempts??5;
    this.retryDelays=options.retryDelaysMs??[0,30_000,120_000,600_000,1_800_000];
  }

  async processNext():Promise<StoredWorkflowRun|null>{
    const run=await this.workflows.claimNext();
    if(!run)return null;
    return this.processRun(run);
  }

  async processRun(run:StoredWorkflowRun):Promise<StoredWorkflowRun>{
    const scope={tenantId:run.tenantId,workspaceId:run.workspaceId};
    const definition=await this.workflows.findDefinition(scope,run.workflowId);
    if(!definition||!definition.enabled){
      return (await this.failRun(run,"workflow-definition-unavailable","non_retryable"))!;
    }

    let current=run;
    for(let index=current.currentStepIndex;index<definition.steps.length;index+=1){
      const step=definition.steps[index];
      const existing=await this.workflows.getStep(scope,current.id,step.id);
      if(existing?.status==="completed"){
        current=(await this.workflows.updateRun(scope,current.id,{currentStepIndex:index+1,status:"running"}))??current;
        continue;
      }

      try{
        const outcome=await this.executeStep(current,definition,step,index);
        if(outcome==="paused")return (await this.workflows.getRun(scope,current.id))!;
        if(outcome==="scheduled")return (await this.workflows.getRun(scope,current.id))!;
        current=(await this.workflows.getRun(scope,current.id))??current;
      }catch(error){
        const runtimeError=error instanceof WorkflowRuntimeError?error:new WorkflowRuntimeError("retryable",error instanceof Error?error.message:"workflow-step-failed");
        return (await this.failRun(current,runtimeError.message,runtimeError.kind,step))!;
      }
    }

    const completed=await this.workflows.updateRun(scope,current.id,{status:"completed",currentStepIndex:definition.steps.length,finished:true,lastError:null});
    await this.audit.record(scope,{actorId:current.initiatedBy,action:"workflow.completed",targetType:"workflow_run",targetId:current.id,metadata:{workflowId:current.workflowId}});
    return completed!;
  }

  private async executeStep(run:StoredWorkflowRun,definition:WorkflowDefinition,step:WorkflowStep,index:number):Promise<"completed"|"paused"|"scheduled">{
    const scope={tenantId:run.tenantId,workspaceId:run.workspaceId};
    const existing=await this.workflows.getStep(scope,run.id,step.id);

    if(step.kind==="delay"){
      const resumeAt=typeof existing?.output?.resumeAt==="string"?existing.output.resumeAt:null;
      if(resumeAt&&Date.parse(resumeAt)>Date.now()){
        await this.workflows.updateRun(scope,run.id,{status:"pending",currentStepIndex:index,nextAttemptAt:resumeAt});
        return "scheduled";
      }
      if(!resumeAt){
        const delayMs=Math.max(0,Number(step.config?.delayMs??0));
        const next=new Date(Date.now()+delayMs).toISOString();
        await this.workflows.beginStep(scope,run.id,step,idempotencyKey(run,step));
        await this.workflows.finishStep(scope,run.id,step.id,{status:"waiting",output:{resumeAt:next}});
        await this.workflows.updateRun(scope,run.id,{status:"pending",currentStepIndex:index,nextAttemptAt:next});
        return "scheduled";
      }
      await this.workflows.beginStep(scope,run.id,step,idempotencyKey(run,step));
      await this.workflows.finishStep(scope,run.id,step.id,{status:"completed",output:{resumeAt}});
      await this.workflows.updateRun(scope,run.id,{status:"running",currentStepIndex:index+1});
      return "completed";
    }

    if(step.kind==="approval"){
      const approval=await this.approvals.findForRunStep(scope,run.id,step.id);
      if(approval?.status==="approved"){
        await this.workflows.beginStep(scope,run.id,step,idempotencyKey(run,step));
        await this.workflows.finishStep(scope,run.id,step.id,{status:"completed",output:{approvalId:approval.id}});
        await this.workflows.updateRun(scope,run.id,{status:"running",currentStepIndex:index+1});
        return "completed";
      }
      if(approval?.status==="rejected")throw new WorkflowRuntimeError("non_retryable","approval-rejected");
      if(!approval){
        const created=await this.approvals.create(scope,{
          toolId:"workflow.approval",
          action:step.name,
          risk:String(step.config?.risk??"medium"),
          evidence:Array.isArray(step.config?.evidence)?step.config?.evidence as unknown[]:[],
          businessReason:typeof step.config?.businessReason==="string"?step.config.businessReason:"Workflow checkpoint requires human approval.",
          requestedBy:run.initiatedBy,
          workflowRunId:run.id,
          workflowStepId:step.id
        });
        await this.audit.record(scope,{actorId:run.initiatedBy,action:"approval.requested",targetType:"approval",targetId:created.id,metadata:{workflowId:run.workflowId,stepId:step.id}});
      }
      await this.workflows.beginStep(scope,run.id,step,idempotencyKey(run,step));
      await this.workflows.finishStep(scope,run.id,step.id,{status:"waiting",output:{approvalRequired:true}});
      await this.workflows.updateRun(scope,run.id,{status:"waiting_approval",currentStepIndex:index});
      return "paused";
    }

    if(step.kind==="action"){
      return this.executeAction(run,step,index);
    }

    await this.workflows.beginStep(scope,run.id,step,idempotencyKey(run,step));
    const handler=this.options.handlers?.[step.kind as keyof NonNullable<WorkflowRuntimeOptions["handlers"]>];
    if(step.kind==="ai"&&!handler)throw new WorkflowRuntimeError("non_retryable","ai-handler-not-configured");
    const output=handler?await handler({run,definition,step,state:run.state}):objectValue(step.config?.output);
    const nextState={...run.state,...output};
    await this.workflows.finishStep(scope,run.id,step.id,{status:"completed",output});
    await this.workflows.updateRun(scope,run.id,{status:"running",currentStepIndex:index+1,state:nextState,lastError:null});
    return "completed";
  }

  private async executeAction(run:StoredWorkflowRun,step:WorkflowStep,index:number):Promise<"completed"|"paused">{
    const scope={tenantId:run.tenantId,workspaceId:run.workspaceId};
    const tool=toolFromStep(step);
    const agentId=typeof step.config?.agentId==="string"?step.config.agentId:"";
    if(!agentId)throw new WorkflowRuntimeError("non_retryable","agent-required");
    const agent=await this.agents.findScoped(scope,agentId);
    if(!agent||!agent.enabled)throw new WorkflowRuntimeError("non_retryable","agent-unavailable");
    if(!agent.tools.includes(tool.id)&&!agent.tools.includes(tool.name))throw new WorkflowRuntimeError("denied","agent-tool-not-allowed");

    const workspace=await this.workspaces.findScoped(scope.tenantId,scope.workspaceId);
    if(!workspace)throw new WorkflowRuntimeError("non_retryable","workspace-unavailable");

    const governance=authorizeWithApprovalMode(
      workspace.approvalMode as ApprovalMode,
      Array.isArray(agent.riskPolicy.rules)?agent.riskPolicy.rules as PolicyRule[]:this.options.policyRules??[],
      {
        id:`${run.id}:${step.id}`,
        tool,
        identity:{workspaceId:run.workspaceId,userId:run.initiatedBy,agentId:agent.id,sessionId:run.id,delegatedScopes:agent.scopes,role:"agent"},
        dataClasses:tool.dataClasses,
        estimatedCostUnits:tool.costUnits
      }
    );

    await this.audit.record(scope,{actorId:run.initiatedBy,action:"governance.evaluated",targetType:"workflow_step",targetId:step.id,metadata:{workflowId:run.workflowId,runId:run.id,agentId:agent.id,toolId:tool.id,effect:governance.decision.effect,reasons:governance.decision.reasons}});

    if(governance.decision.effect==="deny"){
      throw new WorkflowRuntimeError("denied",`governance-denied:${governance.decision.reasons.join("|")}`);
    }

    const approval=await this.approvals.findForRunStep(scope,run.id,step.id);
    if(governance.approvalRequired&&approval?.status!=="approved"){
      if(approval?.status==="rejected")throw new WorkflowRuntimeError("non_retryable","approval-rejected");
      if(!approval){
        const created=await this.approvals.create(scope,{
          agentId:agent.id,
          toolId:tool.id,
          action:tool.action,
          risk:tool.risk,
          evidence:Array.isArray(step.config?.evidence)?step.config.evidence as unknown[]:[],
          businessReason:typeof step.config?.businessReason==="string"?step.config.businessReason:tool.description,
          externalSystem:tool.connector,
          target:typeof step.config?.target==="string"?step.config.target:undefined,
          estimatedCost:tool.costUnits,
          requestedBy:run.initiatedBy,
          workflowRunId:run.id,
          workflowStepId:step.id
        });
        await this.audit.record(scope,{actorId:run.initiatedBy,action:"approval.requested",targetType:"approval",targetId:created.id,metadata:{workflowId:run.workflowId,runId:run.id,stepId:step.id,agentId:agent.id,toolId:tool.id}});
      }
      await this.workflows.beginStep(scope,run.id,step,idempotencyKey(run,step,tool));
      await this.workflows.finishStep(scope,run.id,step.id,{status:"waiting",output:{approvalRequired:true}});
      await this.workflows.updateRun(scope,run.id,{status:"waiting_approval",currentStepIndex:index});
      return "paused";
    }

    const executor=this.options.executors.get(tool.connector);
    if(!executor)throw new WorkflowRuntimeError("non_retryable",`integration-executor-not-configured:${tool.connector}`);
    const key=idempotencyKey(run,step,tool);
    const stepRun=await this.workflows.beginStep(scope,run.id,step,key);
    if(stepRun?.status==="completed"){
      await this.workflows.updateRun(scope,run.id,{status:"running",currentStepIndex:index+1});
      return "completed";
    }

    const input=objectValue(step.config?.input);
    const result=await executor.execute(tool,input,{...scope,runId:run.id,stepId:step.id,agentId:agent.id,initiatedBy:run.initiatedBy,idempotencyKey:key});
    await this.workflows.finishStep(scope,run.id,step.id,{status:"completed",output:result});
    await this.workflows.updateRun(scope,run.id,{status:"running",currentStepIndex:index+1,state:{...run.state,[step.id]:result},lastError:null});
    await this.audit.record(scope,{actorId:run.initiatedBy,action:"tool.executed",targetType:"workflow_step",targetId:step.id,metadata:{workflowId:run.workflowId,runId:run.id,agentId:agent.id,toolId:tool.id,connector:tool.connector,idempotencyKey:key,reversible:tool.reversible}});
    return "completed";
  }

  private async failRun(run:StoredWorkflowRun,message:string,kind:WorkflowErrorKind,step?:WorkflowStep):Promise<StoredWorkflowRun|null>{
    const scope={tenantId:run.tenantId,workspaceId:run.workspaceId};
    if(step){
      const existing=await this.workflows.getStep(scope,run.id,step.id);
      if(existing?.status!=="completed"){
        await this.workflows.beginStep(scope,run.id,step,idempotencyKey(run,step));
        await this.workflows.finishStep(scope,run.id,step.id,{status:"failed",error:message});
      }
    }

    const nextAttempt=run.attemptCount+1;
    if(kind==="retryable"&&nextAttempt<this.maxAttempts){
      const nextAttemptAt=retryAt(nextAttempt,this.retryDelays);
      const pending=await this.workflows.updateRun(scope,run.id,{status:"pending",attemptCount:nextAttempt,nextAttemptAt,lastError:message});
      await this.audit.record(scope,{actorId:run.initiatedBy,action:"workflow.retry_scheduled",targetType:"workflow_run",targetId:run.id,metadata:{attempt:nextAttempt,nextAttemptAt,error:message}});
      return pending;
    }

    const status=kind==="retryable"?"dead_letter":"failed";
    const failed=await this.workflows.updateRun(scope,run.id,{status,attemptCount:nextAttempt,finished:true,lastError:message});
    await this.audit.record(scope,{actorId:run.initiatedBy,action:status==="dead_letter"?"workflow.dead_letter":"workflow.failed",targetType:"workflow_run",targetId:run.id,metadata:{attempt:nextAttempt,error:message,stepId:step?.id??null,kind}});
    if(status==="dead_letter"){
      await this.actions.create(scope,{
        sourceModule:"agent-governance",
        entity:{type:"workflow_run",id:run.id},
        title:"Automation failed and needs attention",
        description:message,
        severity:"critical",
        businessImpact:"A durable automation exhausted its retry budget.",
        evidenceIds:[],
        recommendedAction:"Review workflow failure",
        risk:"Business work may remain incomplete.",
        approvalPolicy:"human"
      });
    }
    return failed;
  }
}
