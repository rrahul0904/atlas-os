import type {AtlasSql} from "../../db/src/index.js";
import {AuditRepository,IntegrationConnectionRepository} from "../../repositories/src/index.js";
import type {ToolDefinition} from "../../agent-governance/src/index.js";
import type {ToolExecutionContext,ToolExecutor} from "../../workflow-runtime/src/index.js";
import {WorkflowRuntimeError} from "../../workflow-runtime/src/index.js";
import {
  IntegrationAdapterRegistry,
  assertActionAllowed,
  type IntegrationExecutionResult,
  type IntegrationHealth
} from "../../integrations-sdk/src/index.js";

const sensitiveKey=/(secret|token|password|authorization|cookie|api[-_]?key|credential|refresh)/i;

function safePrimitive(value:unknown):string|number|boolean|null{
  if(value===null||typeof value==="string"||typeof value==="number"||typeof value==="boolean")return value;
  return String(value);
}

export function sanitizeIntegrationData(value:unknown,depth=0):unknown{
  if(depth>4)return "[truncated]";
  if(Array.isArray(value))return value.slice(0,50).map(item=>sanitizeIntegrationData(item,depth+1));
  if(value&&typeof value==="object"){
    const result:Record<string,unknown>={};
    for(const [key,item] of Object.entries(value as Record<string,unknown>).slice(0,100)){
      if(sensitiveKey.test(key))continue;
      result[key]=sanitizeIntegrationData(item,depth+1);
    }
    return result;
  }
  if(typeof value==="string")return value.length>4096?value.slice(0,4096)+"…":value;
  return safePrimitive(value);
}

function safeErrorMessage(error:unknown){
  const message=error instanceof Error?error.message:"integration-execution-failed";
  return message
    .replace(/Bearer\s+[^\s]+/gi,"Bearer [redacted]")
    .replace(/(?:token|secret|password|api[-_]?key)=([^\s&]+)/gi,match=>match.split("=")[0]+"=[redacted]")
    .slice(0,500);
}

function classifyFailure(message:string){
  if(/timeout|aborted|econnreset|eai_again|enotfound|webhook-http-(429|502|503|504)/i.test(message))return "retryable" as const;
  return "non_retryable" as const;
}

function healthForFailure(message:string):IntegrationHealth{
  return{
    state:"error",
    message:message.slice(0,500),
    checkedAt:new Date().toISOString(),
    details:{category:classifyFailure(message)}
  };
}

export class IntegrationToolExecutor implements ToolExecutor{
  readonly connector:string;
  private readonly connections:IntegrationConnectionRepository;
  private readonly audit:AuditRepository;

  constructor(
    private readonly sql:AtlasSql,
    private readonly adapters:IntegrationAdapterRegistry,
    integrationId:string
  ){
    this.connector=integrationId;
    this.connections=new IntegrationConnectionRepository(sql);
    this.audit=new AuditRepository(sql);
  }

  async execute(tool:ToolDefinition,input:Record<string,unknown>,context:ToolExecutionContext):Promise<Record<string,unknown>>{
    const scope={tenantId:context.tenantId,workspaceId:context.workspaceId};
    const connection=await this.connections.findByIntegration(scope,this.connector);
    if(!connection)throw new WorkflowRuntimeError("non_retryable","integration-not-configured");
    if(connection.status==="not_configured")throw new WorkflowRuntimeError("non_retryable","integration-not-configured");
    if(connection.status==="needs_reauthentication")throw new WorkflowRuntimeError("non_retryable","integration-needs-reauthentication");
    if(connection.status==="error"&&connection.healthDetails.category!=="retryable")throw new WorkflowRuntimeError("non_retryable","integration-unhealthy");

    const adapter=this.adapters.get(this.connector);
    if(!adapter)throw new WorkflowRuntimeError("non_retryable","integration-adapter-not-registered");

    const actionId=tool.action;
    let capability;
    try{capability=assertActionAllowed(adapter,actionId)}
    catch{throw new WorkflowRuntimeError("non_retryable","integration-action-unsupported")}

    const missingCapabilityScopes=capability.requiredScopes.filter(scopeName=>!tool.scopes.includes(scopeName));
    if(missingCapabilityScopes.length){
      throw new WorkflowRuntimeError("non_retryable",`integration-capability-scopes-missing:${missingCapabilityScopes.join(",")}`);
    }

    const startedAt=Date.now();
    await this.audit.record(scope,{
      actorId:context.initiatedBy,
      action:"integration.execution_started",
      targetType:"integration_connection",
      targetId:connection.id,
      metadata:{integrationId:this.connector,workflowRunId:context.runId,workflowStepId:context.stepId,agentId:context.agentId,toolId:tool.id}
    });

    const config={...connection.config,secretReference:connection.secretReference};
    try{
      const result=await adapter.execute(
        actionId,
        input,
        {
          ...scope,
          connectionId:connection.id,
          actionId,
          idempotencyKey:context.idempotencyKey,
          initiatedBy:context.initiatedBy,
          agentId:context.agentId
        },
        config
      ) as IntegrationExecutionResult;

      const safeData=sanitizeIntegrationData(result.data) as Record<string,unknown>;
      await this.connections.updateHealth(scope,connection.id,{
        state:"connected",
        message:"Integration action completed successfully.",
        checkedAt:new Date().toISOString(),
        details:{status:result.status,actionId}
      });
      await this.audit.record(scope,{
        actorId:context.initiatedBy,
        action:"integration.execution_succeeded",
        targetType:"integration_connection",
        targetId:connection.id,
        metadata:{
          integrationId:this.connector,
          workflowRunId:context.runId,
          workflowStepId:context.stepId,
          agentId:context.agentId,
          toolId:tool.id,
          providerStatus:result.status,
          externalId:result.externalId??null,
          durationMs:Date.now()-startedAt
        }
      });
      return{
        ok:result.ok,
        status:result.status,
        data:safeData,
        externalId:result.externalId??null,
        idempotencyKey:result.idempotencyKey,
        completedAt:result.completedAt
      };
    }catch(error){
      const message=safeErrorMessage(error);
      await this.connections.updateHealth(scope,connection.id,healthForFailure(message));
      await this.audit.record(scope,{
        actorId:context.initiatedBy,
        action:"integration.execution_failed",
        targetType:"integration_connection",
        targetId:connection.id,
        metadata:{
          integrationId:this.connector,
          workflowRunId:context.runId,
          workflowStepId:context.stepId,
          agentId:context.agentId,
          toolId:tool.id,
          category:classifyFailure(message),
          durationMs:Date.now()-startedAt
        }
      });
      throw new WorkflowRuntimeError(classifyFailure(message),message);
    }
  }
}
