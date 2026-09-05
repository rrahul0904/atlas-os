import {randomUUID} from "node:crypto";
import type {AtlasRole} from "../../tenancy/src/index.js";
import type {AtlasSql} from "../../db/src/index.js";
import type {EvidenceRecord,EvidenceSourceType} from "../../evidence/src/index.js";
import type {BusinessActionItem,ActionSeverity,ActionMode,ActionStatus} from "../../action-center/src/index.js";
import type {WorkflowDefinition,WorkflowStepKind} from "../../workflows/src/index.js";
import type {IntegrationHealth,IntegrationState} from "../../integrations-sdk/src/index.js";

export interface StoredUser{id:string;email:string;displayName:string|null;passwordHash:string|null;createdAt:string}
export interface StoredWorkspace{id:string;tenantId:string;name:string;verticalId:string;planId:string;billingStatus:string;approvalMode:"SAFE_AUTOPILOT"|"BALANCED"|"APPROVAL_FIRST"|"MANUAL";trialEndsAt:string|null;createdAt:string}
export interface StoredMembership{workspaceId:string;tenantId:string;userId:string;role:AtlasRole;status:string}

export class UserRepository{
  constructor(private readonly sql:AtlasSql){}
  async create(input:{email:string;displayName?:string|null;passwordHash:string}):Promise<StoredUser>{
    const id=randomUUID();
    const rows=await this.sql`
      INSERT INTO atlas_users(id,email,display_name,password_hash)
      VALUES(${id},${input.email.toLowerCase()},${input.displayName??null},${input.passwordHash})
      RETURNING id,email,display_name,password_hash,created_at
    `;
    const row=rows[0];
    return{id:row.id,email:row.email,displayName:row.display_name,passwordHash:row.password_hash,createdAt:new Date(row.created_at).toISOString()};
  }
  async findByEmail(email:string):Promise<StoredUser|null>{
    const rows=await this.sql`SELECT id,email,display_name,password_hash,created_at FROM atlas_users WHERE email=${email.toLowerCase()} LIMIT 1`;
    const row=rows[0];if(!row)return null;
    return{id:row.id,email:row.email,displayName:row.display_name,passwordHash:row.password_hash,createdAt:new Date(row.created_at).toISOString()};
  }
  async findById(id:string):Promise<StoredUser|null>{
    const rows=await this.sql`SELECT id,email,display_name,password_hash,created_at FROM atlas_users WHERE id=${id} LIMIT 1`;
    const row=rows[0];if(!row)return null;
    return{id:row.id,email:row.email,displayName:row.display_name,passwordHash:row.password_hash,createdAt:new Date(row.created_at).toISOString()};
  }
}

export class TenantRepository{
  constructor(private readonly sql:AtlasSql){}
  async create(name:string){const id=randomUUID();await this.sql`INSERT INTO atlas_tenants(id,name) VALUES(${id},${name})`;return{id,name};}
}

export class WorkspaceRepository{
  constructor(private readonly sql:AtlasSql){}
  async create(input:{tenantId:string;name:string;verticalId:string;planId?:string;trialDays?:number}):Promise<StoredWorkspace>{
    const id=randomUUID();const planId=input.planId??"business";const trialDays=input.trialDays??14;
    const rows=await this.sql`
      INSERT INTO atlas_workspaces(id,tenant_id,name,vertical_id,plan_id,billing_status,trial_ends_at)
      VALUES(${id},${input.tenantId},${input.name},${input.verticalId},${planId},'trialing',now()+${trialDays}*interval '1 day')
      RETURNING id,tenant_id,name,vertical_id,plan_id,billing_status,approval_mode,trial_ends_at,created_at
    `;
    const r=rows[0];
    return{id:r.id,tenantId:r.tenant_id,name:r.name,verticalId:r.vertical_id,planId:r.plan_id,billingStatus:r.billing_status,approvalMode:r.approval_mode,trialEndsAt:r.trial_ends_at?new Date(r.trial_ends_at).toISOString():null,createdAt:new Date(r.created_at).toISOString()};
  }
  async findScoped(tenantId:string,workspaceId:string):Promise<StoredWorkspace|null>{
    const rows=await this.sql`SELECT id,tenant_id,name,vertical_id,plan_id,billing_status,approval_mode,trial_ends_at,created_at FROM atlas_workspaces WHERE tenant_id=${tenantId} AND id=${workspaceId} LIMIT 1`;
    const r=rows[0];if(!r)return null;
    return{id:r.id,tenantId:r.tenant_id,name:r.name,verticalId:r.vertical_id,planId:r.plan_id,billingStatus:r.billing_status,approvalMode:r.approval_mode,trialEndsAt:r.trial_ends_at?new Date(r.trial_ends_at).toISOString():null,createdAt:new Date(r.created_at).toISOString()};
  }
  async setApprovalMode(tenantId:string,workspaceId:string,approvalMode:StoredWorkspace["approvalMode"]){
    const rows=await this.sql`UPDATE atlas_workspaces SET approval_mode=${approvalMode} WHERE tenant_id=${tenantId} AND id=${workspaceId} RETURNING id`;
    return Boolean(rows[0]);
  }
}

export class MembershipRepository{
  constructor(private readonly sql:AtlasSql){}
  async create(input:{tenantId:string;workspaceId:string;userId:string;role:AtlasRole}):Promise<void>{
    await this.sql`INSERT INTO atlas_memberships(workspace_id,tenant_id,user_id,role,status) VALUES(${input.workspaceId},${input.tenantId},${input.userId},${input.role},'active')`;
  }
  async firstActiveForUser(userId:string):Promise<StoredMembership|null>{
    const rows=await this.sql`SELECT workspace_id,tenant_id,user_id,role,status FROM atlas_memberships WHERE user_id=${userId} AND status='active' ORDER BY created_at LIMIT 1`;
    const r=rows[0];if(!r)return null;
    return{workspaceId:r.workspace_id,tenantId:r.tenant_id,userId:r.user_id,role:r.role as AtlasRole,status:r.status};
  }
}

export class ModuleConfigurationRepository{
  constructor(private readonly sql:AtlasSql){}
  async replace(tenantId:string,workspaceId:string,moduleIds:string[]):Promise<void>{
    await this.sql.begin(async tx=>{
      await tx`DELETE FROM atlas_workspace_modules WHERE tenant_id=${tenantId} AND workspace_id=${workspaceId}`;
      for(const moduleId of moduleIds)await tx`INSERT INTO atlas_workspace_modules(workspace_id,tenant_id,module_id,enabled) VALUES(${workspaceId},${tenantId},${moduleId},true)`;
    });
  }
  async enabled(tenantId:string,workspaceId:string):Promise<string[]>{
    const rows=await this.sql`SELECT module_id FROM atlas_workspace_modules WHERE tenant_id=${tenantId} AND workspace_id=${workspaceId} AND enabled=true ORDER BY module_id`;
    return rows.map(r=>r.module_id);
  }
}

export class TaskRepository{
  constructor(private readonly sql:AtlasSql){}
  async create(scope:{tenantId:string;workspaceId:string},input:{title:string;priority?:string;dueAt?:string|null}){
    const id=randomUUID();
    await this.sql`INSERT INTO atlas_tasks(id,tenant_id,workspace_id,title,priority,due_at) VALUES(${id},${scope.tenantId},${scope.workspaceId},${input.title},${input.priority??"medium"},${input.dueAt??null})`;
    return{id,...scope,...input};
  }
  async list(scope:{tenantId:string;workspaceId:string}){
    return this.sql`SELECT id,title,status,priority,due_at FROM atlas_tasks WHERE tenant_id=${scope.tenantId} AND workspace_id=${scope.workspaceId} ORDER BY created_at DESC`;
  }
}

export class ApprovalRepository{
  constructor(private readonly sql:AtlasSql){}
  async create(scope:{tenantId:string;workspaceId:string},input:{agentId?:string|null;toolId:string;action:string;risk:string;evidence?:unknown[];businessReason?:string;externalSystem?:string;target?:string;estimatedCost?:number;requestedBy?:string;workflowRunId?:string;workflowStepId?:string}){
    const id=randomUUID();
    const rows=await this.sql`INSERT INTO atlas_approvals(id,tenant_id,workspace_id,agent_id,tool_id,action,risk,status,evidence,business_reason,external_system,target,estimated_cost,requested_by,workflow_run_id,workflow_step_id)
      VALUES(${id},${scope.tenantId},${scope.workspaceId},${input.agentId??null},${input.toolId},${input.action},${input.risk},'pending',${JSON.stringify(input.evidence??[])}::jsonb,${input.businessReason??null},${input.externalSystem??null},${input.target??null},${input.estimatedCost??null},${input.requestedBy??null},${input.workflowRunId??null},${input.workflowStepId??null})
      RETURNING *`;
    return rows[0];
  }
  async listPending(scope:{tenantId:string;workspaceId:string}){
    return this.sql`SELECT id,agent_id,tool_id,action,risk,status,evidence,business_reason,external_system,target,estimated_cost,requested_by,workflow_run_id,workflow_step_id,requested_at FROM atlas_approvals WHERE tenant_id=${scope.tenantId} AND workspace_id=${scope.workspaceId} AND status='pending' ORDER BY requested_at`;
  }
  async findScoped(scope:{tenantId:string;workspaceId:string},id:string){
    const rows=await this.sql`SELECT * FROM atlas_approvals WHERE tenant_id=${scope.tenantId} AND workspace_id=${scope.workspaceId} AND id=${id} LIMIT 1`;
    return rows[0]??null;
  }
  async findForRunStep(scope:{tenantId:string;workspaceId:string},runId:string,stepId:string){
    const rows=await this.sql`SELECT * FROM atlas_approvals WHERE tenant_id=${scope.tenantId} AND workspace_id=${scope.workspaceId} AND workflow_run_id=${runId} AND workflow_step_id=${stepId} ORDER BY requested_at DESC LIMIT 1`;
    return rows[0]??null;
  }
  async resolve(scope:{tenantId:string;workspaceId:string},id:string,input:{decision:"approved"|"rejected";resolvedBy:string;note?:string}){
    const rows=await this.sql`UPDATE atlas_approvals SET status=${input.decision},resolved_by=${input.resolvedBy},resolution_note=${input.note??null},resolved_at=now()
      WHERE tenant_id=${scope.tenantId} AND workspace_id=${scope.workspaceId} AND id=${id} AND status='pending' RETURNING *`;
    return rows[0]??null;
  }
}

export class AuditRepository{
  constructor(private readonly sql:AtlasSql){}
  async record(scope:{tenantId:string;workspaceId:string},input:{actorId?:string;action:string;targetType?:string;targetId?:string;metadata?:Record<string,unknown>}){
    const id=randomUUID();
    await this.sql`INSERT INTO atlas_audit_events(id,tenant_id,workspace_id,actor_id,action,target_type,target_id,metadata) VALUES(${id},${scope.tenantId},${scope.workspaceId},${input.actorId??null},${input.action},${input.targetType??null},${input.targetId??null},${JSON.stringify(input.metadata??{})}::jsonb)`;
    return id;
  }
  async listRecent(scope:{tenantId:string;workspaceId:string},limit=100){
    const safeLimit=Math.max(1,Math.min(500,Math.floor(limit)));
    return this.sql`SELECT id,actor_id,action,target_type,target_id,metadata,occurred_at FROM atlas_audit_events WHERE tenant_id=${scope.tenantId} AND workspace_id=${scope.workspaceId} ORDER BY occurred_at DESC LIMIT ${safeLimit}`;
  }
}

export class EventRepository{
  constructor(private readonly sql:AtlasSql){}
  async record(scope:{tenantId:string;workspaceId:string},input:{module:string;type:string;entityType?:string;entityId?:string;properties?:Record<string,unknown>;occurredAt?:string}){
    const id=randomUUID();
    await this.sql`INSERT INTO atlas_events(id,tenant_id,workspace_id,module,type,entity_type,entity_id,properties,occurred_at) VALUES(${id},${scope.tenantId},${scope.workspaceId},${input.module},${input.type},${input.entityType??null},${input.entityId??null},${JSON.stringify(input.properties??{})}::jsonb,${input.occurredAt??new Date().toISOString()})`;
    return id;
  }
  async recent(scope:{tenantId:string;workspaceId:string},limit=50){
    const safeLimit=Math.max(1,Math.min(200,Math.floor(limit)));
    return this.sql`SELECT id,module,type,entity_type,entity_id,properties,occurred_at FROM atlas_events
      WHERE tenant_id=${scope.tenantId} AND workspace_id=${scope.workspaceId}
      ORDER BY occurred_at DESC LIMIT ${safeLimit}`;
  }
}

export class EvidenceRepository{
  constructor(private readonly sql:AtlasSql){}
  async record(scope:{tenantId:string;workspaceId:string},input:{sourceType:EvidenceSourceType;sourceId:string;claim:string;confidence:number;metadata?:Record<string,string|number|boolean|null>;observedAt?:string}):Promise<EvidenceRecord>{
    const id=randomUUID();const observedAt=input.observedAt??new Date().toISOString();
    const rows=await this.sql`INSERT INTO atlas_evidence(id,tenant_id,workspace_id,source_type,source_id,claim,confidence,metadata,observed_at)
      VALUES(${id},${scope.tenantId},${scope.workspaceId},${input.sourceType},${input.sourceId},${input.claim},${input.confidence},${JSON.stringify(input.metadata??{})}::jsonb,${observedAt})
      RETURNING created_at`;
    return{id,...scope,sourceType:input.sourceType,sourceId:input.sourceId,claim:input.claim,confidence:input.confidence,metadata:input.metadata??{},observedAt,createdAt:new Date(rows[0].created_at).toISOString()};
  }
  async listRecent(scope:{tenantId:string;workspaceId:string},limit=50):Promise<EvidenceRecord[]>{
    const safeLimit=Math.max(1,Math.min(200,Math.floor(limit)));
    const rows=await this.sql`SELECT id,tenant_id,workspace_id,source_type,source_id,claim,confidence,metadata,observed_at,created_at
      FROM atlas_evidence WHERE tenant_id=${scope.tenantId} AND workspace_id=${scope.workspaceId}
      ORDER BY observed_at DESC LIMIT ${safeLimit}`;
    return rows.map(r=>({id:r.id,tenantId:r.tenant_id,workspaceId:r.workspace_id,sourceType:r.source_type as EvidenceSourceType,sourceId:r.source_id,claim:r.claim,confidence:Number(r.confidence),metadata:r.metadata??{},observedAt:new Date(r.observed_at).toISOString(),createdAt:new Date(r.created_at).toISOString()}));
  }
  async findByIds(scope:{tenantId:string;workspaceId:string},ids:string[]):Promise<EvidenceRecord[]>{
    if(!ids.length)return[];
    const recent=await this.listRecent(scope,200);
    const wanted=new Set(ids);return recent.filter(row=>wanted.has(row.id));
  }
}

export class ActionItemRepository{
  constructor(private readonly sql:AtlasSql){}
  async create(scope:{tenantId:string;workspaceId:string},input:{sourceModule:string;entity?:{type:string;id:string};title:string;description:string;severity:ActionSeverity;businessImpact:string;evidenceIds:string[];recommendedAction:string;risk:string;approvalPolicy:ActionMode;status?:ActionStatus}):Promise<BusinessActionItem>{
    const id=randomUUID();const status=input.status??"open";
    const rows=await this.sql`INSERT INTO atlas_action_items(id,tenant_id,workspace_id,source_module,entity_type,entity_id,title,description,severity,business_impact,evidence_ids,recommended_action,risk,approval_policy,status)
      VALUES(${id},${scope.tenantId},${scope.workspaceId},${input.sourceModule},${input.entity?.type??null},${input.entity?.id??null},${input.title},${input.description},${input.severity},${input.businessImpact},${input.evidenceIds},${input.recommendedAction},${input.risk},${input.approvalPolicy},${status})
      RETURNING created_at`;
    return{id,...scope,sourceModule:input.sourceModule,entity:input.entity,title:input.title,description:input.description,severity:input.severity,businessImpact:input.businessImpact,evidenceIds:input.evidenceIds,recommendedAction:input.recommendedAction,risk:input.risk,approvalPolicy:input.approvalPolicy,status,createdAt:new Date(rows[0].created_at).toISOString()};
  }
  async listOpen(scope:{tenantId:string;workspaceId:string},limit=50):Promise<BusinessActionItem[]>{
    const safeLimit=Math.max(1,Math.min(200,Math.floor(limit)));
    const rows=await this.sql`SELECT id,tenant_id,workspace_id,source_module,entity_type,entity_id,title,description,severity,business_impact,evidence_ids,recommended_action,risk,approval_policy,status,created_at
      FROM atlas_action_items WHERE tenant_id=${scope.tenantId} AND workspace_id=${scope.workspaceId} AND status IN ('open','in_progress','waiting_approval')
      ORDER BY CASE severity WHEN 'critical' THEN 3 WHEN 'warning' THEN 2 ELSE 1 END DESC, created_at ASC LIMIT ${safeLimit}`;
    return rows.map(r=>({id:r.id,tenantId:r.tenant_id,workspaceId:r.workspace_id,sourceModule:r.source_module,entity:r.entity_type&&r.entity_id?{type:r.entity_type,id:r.entity_id}:undefined,title:r.title,description:r.description,severity:r.severity as ActionSeverity,businessImpact:r.business_impact,evidenceIds:r.evidence_ids??[],recommendedAction:r.recommended_action,risk:r.risk,approvalPolicy:r.approval_policy as ActionMode,status:r.status as ActionStatus,createdAt:new Date(r.created_at).toISOString()}));
  }
}

export interface StoredBillingAccount{
  tenantId:string;workspaceId:string;provider:string;customerRef:string|null;subscriptionRef:string|null;
  status:string;planId:string;priceRef:string|null;currentPeriodEnd:string|null;cancelAtPeriodEnd:boolean;
  trialEndsAt:string|null;lastInvoiceRef:string|null;lastPaymentAt:string|null;lastWebhookAt:string|null;updatedAt:string;
}

function mapBilling(row:any):StoredBillingAccount{
  return{
    tenantId:row.tenant_id,workspaceId:row.workspace_id,provider:row.provider,
    customerRef:row.customer_ref??null,subscriptionRef:row.subscription_ref??null,status:row.status,planId:row.plan_id,
    priceRef:row.price_ref??null,currentPeriodEnd:row.current_period_end?new Date(row.current_period_end).toISOString():null,
    cancelAtPeriodEnd:Boolean(row.cancel_at_period_end),trialEndsAt:row.trial_ends_at?new Date(row.trial_ends_at).toISOString():null,
    lastInvoiceRef:row.last_invoice_ref??null,lastPaymentAt:row.last_payment_at?new Date(row.last_payment_at).toISOString():null,
    lastWebhookAt:row.last_webhook_at?new Date(row.last_webhook_at).toISOString():null,updatedAt:new Date(row.updated_at).toISOString()
  };
}

export class BillingRepository{
  constructor(private readonly sql:AtlasSql){}
  async findScoped(scope:{tenantId:string;workspaceId:string}):Promise<StoredBillingAccount|null>{
    const rows=await this.sql`SELECT * FROM atlas_billing_accounts WHERE tenant_id=${scope.tenantId} AND workspace_id=${scope.workspaceId} LIMIT 1`;
    return rows[0]?mapBilling(rows[0]):null;
  }
  async ensure(scope:{tenantId:string;workspaceId:string},planId:string,status="trialing"){
    const rows=await this.sql`INSERT INTO atlas_billing_accounts(workspace_id,tenant_id,status,plan_id)
      VALUES(${scope.workspaceId},${scope.tenantId},${status},${planId})
      ON CONFLICT(workspace_id) DO UPDATE SET updated_at=now()
      WHERE atlas_billing_accounts.tenant_id=excluded.tenant_id RETURNING *`;
    if(!rows[0])throw new Error("billing-scope-conflict");
    return mapBilling(rows[0]);
  }
  async setCustomer(scope:{tenantId:string;workspaceId:string},customerRef:string){
    const rows=await this.sql`UPDATE atlas_billing_accounts SET customer_ref=${customerRef},updated_at=now()
      WHERE tenant_id=${scope.tenantId} AND workspace_id=${scope.workspaceId} RETURNING *`;
    return rows[0]?mapBilling(rows[0]):null;
  }
  async applySubscription(scope:{tenantId:string;workspaceId:string},input:{
    customerRef?:string|null;subscriptionRef:string;status:string;planId:string;priceRef:string;
    currentPeriodEnd?:string|null;cancelAtPeriodEnd?:boolean;trialEndsAt?:string|null;
  }){
    const rows=await this.sql`UPDATE atlas_billing_accounts SET
      customer_ref=COALESCE(${input.customerRef??null},customer_ref),subscription_ref=${input.subscriptionRef},
      status=${input.status},plan_id=${input.planId},price_ref=${input.priceRef},
      current_period_end=${input.currentPeriodEnd??null},cancel_at_period_end=${input.cancelAtPeriodEnd??false},
      trial_ends_at=${input.trialEndsAt??null},last_webhook_at=now(),updated_at=now()
      WHERE tenant_id=${scope.tenantId} AND workspace_id=${scope.workspaceId} RETURNING *`;
    return rows[0]?mapBilling(rows[0]):null;
  }
  async markCanceled(scope:{tenantId:string;workspaceId:string},subscriptionRef:string){
    const rows=await this.sql`UPDATE atlas_billing_accounts SET status='canceled',subscription_ref=${subscriptionRef},
      cancel_at_period_end=false,last_webhook_at=now(),updated_at=now()
      WHERE tenant_id=${scope.tenantId} AND workspace_id=${scope.workspaceId} RETURNING *`;
    return rows[0]?mapBilling(rows[0]):null;
  }
  async markInvoice(scope:{tenantId:string;workspaceId:string},input:{invoiceRef:string;paid:boolean;status:string}){
    const rows=await this.sql`UPDATE atlas_billing_accounts SET
      last_invoice_ref=${input.invoiceRef},last_payment_at=CASE WHEN ${input.paid} THEN now() ELSE last_payment_at END,
      status=CASE WHEN ${input.paid} AND status='past_due' THEN 'active' WHEN NOT ${input.paid} THEN ${input.status} ELSE status END,
      last_webhook_at=now(),updated_at=now()
      WHERE tenant_id=${scope.tenantId} AND workspace_id=${scope.workspaceId} RETURNING *`;
    return rows[0]?mapBilling(rows[0]):null;
  }
  async findByCustomerRef(customerRef:string):Promise<StoredBillingAccount|null>{
    const rows=await this.sql`SELECT * FROM atlas_billing_accounts WHERE provider='stripe' AND customer_ref=${customerRef} LIMIT 1`;
    return rows[0]?mapBilling(rows[0]):null;
  }
}

export class CheckoutSessionRepository{
  constructor(private readonly sql:AtlasSql){}
  async create(scope:{tenantId:string;workspaceId:string},input:{planId:string;sessionRef:string;createdBy:string}){
    const id=randomUUID();
    await this.sql`INSERT INTO atlas_checkout_sessions(id,tenant_id,workspace_id,requested_plan_id,stripe_session_ref,created_by)
      VALUES(${id},${scope.tenantId},${scope.workspaceId},${input.planId},${input.sessionRef},${input.createdBy})`;
    return id;
  }
  async complete(scope:{tenantId:string;workspaceId:string},sessionRef:string){
    const rows=await this.sql`UPDATE atlas_checkout_sessions SET status='completed',completed_at=now()
      WHERE tenant_id=${scope.tenantId} AND workspace_id=${scope.workspaceId} AND stripe_session_ref=${sessionRef} RETURNING id`;
    return Boolean(rows[0]);
  }
}

export class BillingEventRepository{
  constructor(private readonly sql:AtlasSql){}
  async receive(input:{stripeEventId:string;eventType:string;livemode:boolean}){
    const id=randomUUID();
    const rows=await this.sql`INSERT INTO atlas_billing_events(id,stripe_event_id,event_type,livemode,status)
      VALUES(${id},${input.stripeEventId},${input.eventType},${input.livemode},'received')
      ON CONFLICT(stripe_event_id) DO NOTHING RETURNING id`;
    return rows[0]?.id as string|undefined;
  }
  async processed(id:string,scope:{tenantId:string;workspaceId:string}|null,input:{objectRef?:string|null;metadata?:Record<string,unknown>;ignored?:boolean}={}){
    await this.sql`UPDATE atlas_billing_events SET
      tenant_id=${scope?.tenantId??null},workspace_id=${scope?.workspaceId??null},
      status=${input.ignored?"ignored":"processed"},object_ref=${input.objectRef??null},
      safe_metadata=${JSON.stringify(input.metadata??{})}::jsonb,processed_at=now(),error=NULL
      WHERE id=${id}`;
  }
  async failed(id:string,message:string){await this.sql`UPDATE atlas_billing_events SET status='failed',error=${message.slice(0,500)},processed_at=now() WHERE id=${id}`;}
}

export class UsageRepository{
  constructor(private readonly sql:AtlasSql){}
  async record(scope:{tenantId:string;workspaceId:string},input:{
    metric:string;quantity:number;moduleId?:string|null;agentId?:string|null;workflowId?:string|null;provider?:string|null;
    idempotencyKey?:string|null;occurredAt?:string;
  }){
    if(!Number.isFinite(input.quantity)||input.quantity<0)throw new Error("usage-quantity-invalid");
    const id=randomUUID();
    const rows=await this.sql`INSERT INTO atlas_usage_events(id,tenant_id,workspace_id,metric,quantity,module_id,agent_id,workflow_id,provider,idempotency_key,occurred_at)
      VALUES(${id},${scope.tenantId},${scope.workspaceId},${input.metric},${input.quantity},${input.moduleId??null},${input.agentId??null},${input.workflowId??null},${input.provider??null},${input.idempotencyKey??null},${input.occurredAt??new Date().toISOString()})
      ON CONFLICT(workspace_id,metric,idempotency_key) DO NOTHING RETURNING id`;
    return rows[0]?.id as string|undefined;
  }
  async summary(scope:{tenantId:string;workspaceId:string},days=30){
    const safeDays=Math.max(1,Math.min(365,Math.floor(days)));
    return this.sql`SELECT metric,SUM(quantity)::float8 AS quantity FROM atlas_usage_events
      WHERE tenant_id=${scope.tenantId} AND workspace_id=${scope.workspaceId} AND occurred_at>=now()-${safeDays}*interval '1 day'
      GROUP BY metric ORDER BY metric`;
  }
}

export interface StoredIntegrationConnection{
  id:string;
  tenantId:string;
  workspaceId:string;
  integrationId:string;
  status:IntegrationState;
  externalAccountRef:string|null;
  secretReference:string|null;
  config:Record<string,unknown>;
  lastHealthAt:string|null;
  lastSuccessAt:string|null;
  lastError:string|null;
  lastErrorAt:string|null;
  healthDetails:Record<string,unknown>;
}

function validIntegrationState(value:string):value is IntegrationState{
  return ["connected","degraded","not_configured","error","needs_reauthentication"].includes(value);
}

function jsonObject(value:unknown):Record<string,unknown>{
  if(value&&typeof value==="object"&&!Array.isArray(value))return value as Record<string,unknown>;
  if(typeof value==="string"){
    try{
      const parsed=JSON.parse(value);
      if(parsed&&typeof parsed==="object"&&!Array.isArray(parsed))return parsed as Record<string,unknown>;
    }catch{}
  }
  return{};
}

function mapIntegration(row:any):StoredIntegrationConnection{
  const state=String(row.status);
  return{
    id:row.id,
    tenantId:row.tenant_id,
    workspaceId:row.workspace_id,
    integrationId:row.integration_id,
    status:validIntegrationState(state)?state:"error",
    externalAccountRef:row.external_account_ref??null,
    secretReference:row.secret_reference??null,
    config:jsonObject(row.config),
    lastHealthAt:row.last_health_at?new Date(row.last_health_at).toISOString():null,
    lastSuccessAt:row.last_success_at?new Date(row.last_success_at).toISOString():null,
    lastError:row.last_error??null,
    lastErrorAt:row.last_error_at?new Date(row.last_error_at).toISOString():null,
    healthDetails:jsonObject(row.health_details)
  };
}

export class IntegrationConnectionRepository{
  constructor(private readonly sql:AtlasSql){}

  async upsert(scope:{tenantId:string;workspaceId:string},input:{
    integrationId:string;
    status?:IntegrationState;
    externalAccountRef?:string|null;
    secretReference?:string|null;
    config?:Record<string,unknown>;
  }):Promise<StoredIntegrationConnection>{
    const id=randomUUID();
    const status=input.status??"not_configured";
    if(!validIntegrationState(status))throw new Error("invalid-integration-state");
    const rows=await this.sql`INSERT INTO atlas_integration_connections(
      id,tenant_id,workspace_id,integration_id,status,external_account_ref,secret_reference,config
    ) VALUES(
      ${id},${scope.tenantId},${scope.workspaceId},${input.integrationId},${status},
      ${input.externalAccountRef??null},${input.secretReference??null},${JSON.stringify(input.config??{})}::jsonb
    )
    ON CONFLICT(workspace_id,integration_id) DO UPDATE SET
      status=excluded.status,
      external_account_ref=excluded.external_account_ref,
      secret_reference=excluded.secret_reference,
      config=excluded.config,
      updated_at=now()
    WHERE atlas_integration_connections.tenant_id=excluded.tenant_id
    RETURNING *`;
    if(!rows[0])throw new Error("integration-scope-conflict");
    return mapIntegration(rows[0]);
  }

  async list(scope:{tenantId:string;workspaceId:string}):Promise<StoredIntegrationConnection[]>{
    const rows=await this.sql`SELECT * FROM atlas_integration_connections
      WHERE tenant_id=${scope.tenantId} AND workspace_id=${scope.workspaceId}
      ORDER BY integration_id`;
    return rows.map(mapIntegration);
  }

  async findScoped(scope:{tenantId:string;workspaceId:string},id:string):Promise<StoredIntegrationConnection|null>{
    const rows=await this.sql`SELECT * FROM atlas_integration_connections
      WHERE tenant_id=${scope.tenantId} AND workspace_id=${scope.workspaceId} AND id=${id} LIMIT 1`;
    return rows[0]?mapIntegration(rows[0]):null;
  }

  async findByIntegration(scope:{tenantId:string;workspaceId:string},integrationId:string):Promise<StoredIntegrationConnection|null>{
    const rows=await this.sql`SELECT * FROM atlas_integration_connections
      WHERE tenant_id=${scope.tenantId} AND workspace_id=${scope.workspaceId} AND integration_id=${integrationId} LIMIT 1`;
    return rows[0]?mapIntegration(rows[0]):null;
  }

  async updateHealth(scope:{tenantId:string;workspaceId:string},id:string,health:IntegrationHealth):Promise<StoredIntegrationConnection|null>{
    if(!validIntegrationState(health.state))throw new Error("invalid-integration-state");
    const success=health.state==="connected";
    const hasError=health.state==="error"||health.state==="degraded"||health.state==="needs_reauthentication";
    const rows=await this.sql`UPDATE atlas_integration_connections SET
      status=${health.state},
      last_health_at=${health.checkedAt},
      last_success_at=CASE WHEN ${success} THEN ${health.checkedAt} ELSE last_success_at END,
      last_error=CASE WHEN ${hasError} THEN ${health.message??health.state} ELSE NULL END,
      last_error_at=CASE WHEN ${hasError} THEN ${health.checkedAt} ELSE last_error_at END,
      health_details=${JSON.stringify(health.details??{})}::jsonb,
      updated_at=now()
      WHERE tenant_id=${scope.tenantId} AND workspace_id=${scope.workspaceId} AND id=${id}
      RETURNING *`;
    return rows[0]?mapIntegration(rows[0]):null;
  }
}

export interface StoredAgent{
  id:string;tenantId:string;workspaceId:string;name:string;moduleId:string;description:string;tools:string[];scopes:string[];
  riskPolicy:Record<string,unknown>;costBudgetDaily:number;modelPreference:string|null;memoryScope:string;enabled:boolean;
}

export class AgentRepository{
  constructor(private readonly sql:AtlasSql){}
  async create(scope:{tenantId:string;workspaceId:string},input:{name:string;moduleId:string;description:string;tools:string[];scopes:string[];riskPolicy?:Record<string,unknown>;costBudgetDaily?:number;modelPreference?:string|null;memoryScope?:string;enabled?:boolean}):Promise<StoredAgent>{
    const id=randomUUID();
    const rows=await this.sql`INSERT INTO atlas_agents(id,tenant_id,workspace_id,name,module_id,description,tools,scopes,risk_policy,cost_budget_daily,model_preference,memory_scope,enabled)
      VALUES(${id},${scope.tenantId},${scope.workspaceId},${input.name},${input.moduleId},${input.description},${input.tools},${input.scopes},${JSON.stringify(input.riskPolicy??{})}::jsonb,${input.costBudgetDaily??0},${input.modelPreference??null},${input.memoryScope??"workspace"},${input.enabled??true})
      RETURNING *`;
    return mapAgent(rows[0]);
  }
  async list(scope:{tenantId:string;workspaceId:string}):Promise<StoredAgent[]>{
    const rows=await this.sql`SELECT * FROM atlas_agents WHERE tenant_id=${scope.tenantId} AND workspace_id=${scope.workspaceId} ORDER BY name`;
    return rows.map(mapAgent);
  }
  async setEnabled(scope:{tenantId:string;workspaceId:string},id:string,enabled:boolean):Promise<boolean>{
    const rows=await this.sql`UPDATE atlas_agents SET enabled=${enabled},updated_at=now() WHERE tenant_id=${scope.tenantId} AND workspace_id=${scope.workspaceId} AND id=${id} RETURNING id`;
    return Boolean(rows[0]);
  }
  async findScoped(scope:{tenantId:string;workspaceId:string},id:string):Promise<StoredAgent|null>{
    const rows=await this.sql`SELECT * FROM atlas_agents WHERE tenant_id=${scope.tenantId} AND workspace_id=${scope.workspaceId} AND id=${id} LIMIT 1`;
    return rows[0]?mapAgent(rows[0]):null;
  }
}

function mapAgent(row:any):StoredAgent{
  return{id:row.id,tenantId:row.tenant_id,workspaceId:row.workspace_id,name:row.name,moduleId:row.module_id,description:row.description,tools:row.tools??[],scopes:row.scopes??[],riskPolicy:row.risk_policy??{},costBudgetDaily:Number(row.cost_budget_daily),modelPreference:row.model_preference??null,memoryScope:row.memory_scope,enabled:Boolean(row.enabled)};
}

export interface StoredWorkflowRun{
  id:string;tenantId:string;workspaceId:string;workflowId:string;status:"pending"|"running"|"waiting_approval"|"completed"|"failed"|"dead_letter";
  currentStepIndex:number;input:Record<string,unknown>;state:Record<string,unknown>;attemptCount:number;nextAttemptAt:string;initiatedBy:string;startedAt:string|null;finishedAt:string|null;lastError:string|null;
}

export class WorkflowRepository{
  constructor(private readonly sql:AtlasSql){}
  async createDefinition(scope:{tenantId:string;workspaceId:string},definition:WorkflowDefinition){
    const id=definition.id||randomUUID();
    const rows=await this.sql`INSERT INTO atlas_workflow_definitions(id,tenant_id,workspace_id,name,trigger_type,enabled,definition)
      VALUES(${id},${scope.tenantId},${scope.workspaceId},${definition.name},${definition.trigger},${definition.enabled},${JSON.stringify(definition)}::jsonb)
      ON CONFLICT(id) DO UPDATE SET name=excluded.name,trigger_type=excluded.trigger_type,enabled=excluded.enabled,definition=excluded.definition,updated_at=now()
      WHERE atlas_workflow_definitions.tenant_id=excluded.tenant_id AND atlas_workflow_definitions.workspace_id=excluded.workspace_id
      RETURNING id`;
    if(!rows[0])throw new Error("workflow-id-conflict");
    return rows[0].id as string;
  }
  async findDefinition(scope:{tenantId:string;workspaceId:string},id:string):Promise<WorkflowDefinition|null>{
    const rows=await this.sql`SELECT definition FROM atlas_workflow_definitions WHERE tenant_id=${scope.tenantId} AND workspace_id=${scope.workspaceId} AND id=${id} LIMIT 1`;
    const value=rows[0]?.definition;
    if(!value)return null;
    if(typeof value==="string"){
      try{return JSON.parse(value) as WorkflowDefinition}catch{return null}
    }
    return value as WorkflowDefinition;
  }
  async listDefinitions(scope:{tenantId:string;workspaceId:string}){
    return this.sql`SELECT id,name,trigger_type,enabled,definition,created_at,updated_at FROM atlas_workflow_definitions WHERE tenant_id=${scope.tenantId} AND workspace_id=${scope.workspaceId} ORDER BY name`;
  }
  async enqueue(scope:{tenantId:string;workspaceId:string},workflowId:string,input:Record<string,unknown>,initiatedBy:string){
    const id=randomUUID();
    await this.sql`INSERT INTO atlas_workflow_runs(id,tenant_id,workspace_id,workflow_id,status,input,state,initiated_by)
      VALUES(${id},${scope.tenantId},${scope.workspaceId},${workflowId},'pending',${JSON.stringify(input)}::jsonb,'{}'::jsonb,${initiatedBy})`;
    return id;
  }
  async getRun(scope:{tenantId:string;workspaceId:string},id:string):Promise<StoredWorkflowRun|null>{
    const rows=await this.sql`SELECT * FROM atlas_workflow_runs WHERE tenant_id=${scope.tenantId} AND workspace_id=${scope.workspaceId} AND id=${id} LIMIT 1`;
    return rows[0]?mapRun(rows[0]):null;
  }
  async listRuns(scope:{tenantId:string;workspaceId:string},limit=50):Promise<StoredWorkflowRun[]>{
    const safeLimit=Math.max(1,Math.min(200,Math.floor(limit)));
    const rows=await this.sql`SELECT * FROM atlas_workflow_runs WHERE tenant_id=${scope.tenantId} AND workspace_id=${scope.workspaceId} ORDER BY created_at DESC LIMIT ${safeLimit}`;
    return rows.map(mapRun);
  }
  async claimNext():Promise<StoredWorkflowRun|null>{
    return this.sql.begin(async tx=>{
      const rows=await tx`SELECT * FROM atlas_workflow_runs WHERE status='pending' AND next_attempt_at<=now() ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1`;
      const row=rows[0];if(!row)return null;
      const updated=await tx`UPDATE atlas_workflow_runs SET status='running',started_at=COALESCE(started_at,now()),updated_at=now() WHERE id=${row.id} RETURNING *`;
      return mapRun(updated[0]);
    });
  }
  async updateRun(scope:{tenantId:string;workspaceId:string},id:string,input:{status?:StoredWorkflowRun["status"];currentStepIndex?:number;state?:Record<string,unknown>;attemptCount?:number;nextAttemptAt?:string;finished?:boolean;lastError?:string|null}){
    const run=await this.getRun(scope,id);if(!run)return null;
    const rows=await this.sql`UPDATE atlas_workflow_runs SET
      status=${input.status??run.status},
      current_step_index=${input.currentStepIndex??run.currentStepIndex},
      state=${JSON.stringify(input.state??run.state)}::jsonb,
      attempt_count=${input.attemptCount??run.attemptCount},
      next_attempt_at=${input.nextAttemptAt??run.nextAttemptAt},
      finished_at=CASE WHEN ${input.finished??false} THEN now() ELSE finished_at END,
      last_error=${input.lastError===undefined?run.lastError:input.lastError},
      updated_at=now()
      WHERE tenant_id=${scope.tenantId} AND workspace_id=${scope.workspaceId} AND id=${id} RETURNING *`;
    return rows[0]?mapRun(rows[0]):null;
  }
  async getStep(scope:{tenantId:string;workspaceId:string},runId:string,stepId:string){
    const rows=await this.sql`SELECT * FROM atlas_workflow_step_runs WHERE tenant_id=${scope.tenantId} AND workspace_id=${scope.workspaceId} AND run_id=${runId} AND step_id=${stepId} LIMIT 1`;
    return rows[0]?mapWorkflowStepRun(rows[0]):null;
  }
  async beginStep(scope:{tenantId:string;workspaceId:string},runId:string,step:{id:string;kind:WorkflowStepKind},idempotencyKey:string){
    const id=randomUUID();
    const rows=await this.sql`INSERT INTO atlas_workflow_step_runs(id,tenant_id,workspace_id,run_id,step_id,kind,status,idempotency_key)
      VALUES(${id},${scope.tenantId},${scope.workspaceId},${runId},${step.id},${step.kind},'running',${idempotencyKey})
      ON CONFLICT(run_id,step_id) DO UPDATE SET
        status=CASE WHEN atlas_workflow_step_runs.status='completed' THEN 'completed' ELSE 'running' END,
        attempt_count=CASE WHEN atlas_workflow_step_runs.status='completed' THEN atlas_workflow_step_runs.attempt_count ELSE atlas_workflow_step_runs.attempt_count+1 END,
        error=CASE WHEN atlas_workflow_step_runs.status='completed' THEN atlas_workflow_step_runs.error ELSE NULL END,
        started_at=CASE WHEN atlas_workflow_step_runs.status='completed' THEN atlas_workflow_step_runs.started_at ELSE now() END,
        finished_at=CASE WHEN atlas_workflow_step_runs.status='completed' THEN atlas_workflow_step_runs.finished_at ELSE NULL END
      RETURNING *`;
    return rows[0];
  }
  async listSteps(scope:{tenantId:string;workspaceId:string},runId:string){
    const rows=await this.sql`SELECT * FROM atlas_workflow_step_runs WHERE tenant_id=${scope.tenantId} AND workspace_id=${scope.workspaceId} AND run_id=${runId} ORDER BY started_at,step_id`;
    return rows.map(mapWorkflowStepRun);
  }
  async finishStep(scope:{tenantId:string;workspaceId:string},runId:string,stepId:string,input:{status:"waiting"|"completed"|"failed";output?:Record<string,unknown>;error?:string|null}){
    const rows=await this.sql`UPDATE atlas_workflow_step_runs SET status=${input.status},output=${JSON.stringify(input.output??{})}::jsonb,error=${input.error??null},finished_at=CASE WHEN ${input.status==="waiting"} THEN NULL ELSE now() END
      WHERE tenant_id=${scope.tenantId} AND workspace_id=${scope.workspaceId} AND run_id=${runId} AND step_id=${stepId} RETURNING *`;
    return rows[0]??null;
  }
}

function mapWorkflowStepRun(row:any){
  return{...row,output:jsonObject(row.output)};
}

function mapRun(row:any):StoredWorkflowRun{
  return{id:row.id,tenantId:row.tenant_id,workspaceId:row.workspace_id,workflowId:row.workflow_id,status:row.status,currentStepIndex:Number(row.current_step_index),input:row.input??{},state:row.state??{},attemptCount:Number(row.attempt_count),nextAttemptAt:new Date(row.next_attempt_at).toISOString(),initiatedBy:row.initiated_by,startedAt:row.started_at?new Date(row.started_at).toISOString():null,finishedAt:row.finished_at?new Date(row.finished_at).toISOString():null,lastError:row.last_error??null};
}

export async function provisionWorkspace(sql:AtlasSql,input:{userId:string;workspaceName:string;verticalId:string;moduleIds:string[];planId?:string}){
  return sql.begin(async tx=>{
    const tenantId=randomUUID();const workspaceId=randomUUID();const planId=input.planId??"business";
    await tx`INSERT INTO atlas_tenants(id,name) VALUES(${tenantId},${input.workspaceName})`;
    await tx`INSERT INTO atlas_workspaces(id,tenant_id,name,vertical_id,plan_id,billing_status,trial_ends_at) VALUES(${workspaceId},${tenantId},${input.workspaceName},${input.verticalId},${planId},'trialing',now()+interval '14 days')`;
    await tx`INSERT INTO atlas_memberships(workspace_id,tenant_id,user_id,role,status) VALUES(${workspaceId},${tenantId},${input.userId},'owner','active')`;
    for(const moduleId of input.moduleIds)await tx`INSERT INTO atlas_workspace_modules(workspace_id,tenant_id,module_id,enabled) VALUES(${workspaceId},${tenantId},${moduleId},true)`;
    return{tenantId,workspaceId,planId};
  });
}
