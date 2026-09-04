export type WorkflowStepKind="trigger"|"read"|"condition"|"transform"|"ai"|"approval"|"action"|"delay"|"measure";
export interface WorkflowStep {id:string;kind:WorkflowStepKind;name:string;config?:Record<string,unknown>;}
export interface WorkflowDefinition {id:string;name:string;trigger:string;enabled:boolean;steps:WorkflowStep[];}
export interface WorkflowContext {workspaceId:string;initiatedBy:string;approvedStepIds?:string[];data?:Record<string,unknown>;}
export interface WorkflowStepResult {stepId:string;status:"completed"|"waiting"|"failed";output?:Record<string,unknown>;error?:string;}
export interface WorkflowRunResult {workflowId:string;runId:string;status:"completed"|"waiting_approval"|"failed";startedAt:string;finishedAt?:string;stepResults:WorkflowStepResult[];}
export type WorkflowHandler=(step:WorkflowStep,context:WorkflowContext)=>Promise<{status:"completed"|"waiting";output?:Record<string,unknown>}>;

export async function executeWorkflow(definition:WorkflowDefinition,context:WorkflowContext,handlers:Partial<Record<WorkflowStepKind,WorkflowHandler>>={}):Promise<WorkflowRunResult>{
  const startedAt=new Date().toISOString();
  const runId=`run_${crypto.randomUUID()}`;
  const stepResults:WorkflowStepResult[]=[];
  for(const step of definition.steps){
    try{
      if(step.kind==="approval"&&!context.approvedStepIds?.includes(step.id)){
        stepResults.push({stepId:step.id,status:"waiting",output:{approvalRequired:true}});
        return{workflowId:definition.id,runId,status:"waiting_approval",startedAt,stepResults};
      }
      const handler=handlers[step.kind];
      const result=handler?await handler(step,context):{status:"completed" as const,output:{}};
      stepResults.push({stepId:step.id,status:result.status,output:result.output});
      if(result.status==="waiting")return{workflowId:definition.id,runId,status:"waiting_approval",startedAt,stepResults};
    }catch(error){
      stepResults.push({stepId:step.id,status:"failed",error:error instanceof Error?error.message:"Unknown step failure"});
      return{workflowId:definition.id,runId,status:"failed",startedAt,finishedAt:new Date().toISOString(),stepResults};
    }
  }
  return{workflowId:definition.id,runId,status:"completed",startedAt,finishedAt:new Date().toISOString(),stepResults};
}
