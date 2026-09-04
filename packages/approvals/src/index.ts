import type {AtlasSql} from "../../db/src/index.js";
import type {TenantPrincipal} from "../../tenancy/src/index.js";
import {roleAtLeast,scopeAllowed} from "../../tenancy/src/index.js";
import {ApprovalRepository,AuditRepository,WorkflowRepository} from "../../repositories/src/index.js";

export async function resolveWorkflowApproval(
  sql:AtlasSql,
  principal:TenantPrincipal,
  approvalId:string,
  decision:"approved"|"rejected",
  note?:string
){
  const scope={tenantId:principal.tenantId,workspaceId:principal.workspaceId};
  if(!(roleAtLeast(principal.role,"admin")||scopeAllowed(principal,"approvals:manage"))){
    throw new Error("approval-permission-denied");
  }

  const approvals=new ApprovalRepository(sql);
  const workflows=new WorkflowRepository(sql);
  const audit=new AuditRepository(sql);
  const approval=await approvals.findScoped(scope,approvalId);
  if(!approval)throw new Error("approval-not-found");

  const resolved=await approvals.resolve(scope,approvalId,{decision,resolvedBy:principal.userId,note});
  if(!resolved)throw new Error("approval-already-resolved");

  const runId=approval.workflow_run_id as string|null;
  const stepId=approval.workflow_step_id as string|null;
  if(runId&&stepId){
    const run=await workflows.getRun(scope,runId);
    if(run){
      if(decision==="approved"){
        await workflows.updateRun(scope,run.id,{status:"pending",currentStepIndex:run.currentStepIndex,nextAttemptAt:new Date().toISOString(),lastError:null});
      }else{
        const definition=await workflows.findDefinition(scope,run.workflowId);
        const step=definition?.steps.find(item=>item.id===stepId);
        if(step){
          const existing=await workflows.getStep(scope,run.id,stepId);
          if(!existing)await workflows.beginStep(scope,run.id,step,`${run.workspaceId}:${run.id}:${step.id}:rejected`);
          await workflows.finishStep(scope,run.id,stepId,{status:"failed",error:"approval-rejected"});
        }
        await workflows.updateRun(scope,run.id,{status:"failed",finished:true,lastError:"approval-rejected"});
      }
    }
  }

  await audit.record(scope,{actorId:principal.userId,action:decision==="approved"?"approval.approved":"approval.rejected",targetType:"approval",targetId:approvalId,metadata:{workflowRunId:runId,workflowStepId:stepId,noteProvided:Boolean(note)}});
  return resolved;
}
