export type AtlasPlan="solo"|"professional"|"business"|"platform";
export type AtlasBillingStatus="trialing"|"active"|"past_due"|"unpaid"|"canceled"|"incomplete"|"incomplete_expired"|"paused";
export interface PlanDefinition{
  id:AtlasPlan;maxUsers:number;maxAgents:number;maxWorkflowRunsMonthly:number;maxAiRequestsMonthly:number;maxIntegrations:number;retentionDays:number;modules:string[];
}
const all=["today","business-ops","agent-governance","revenue-intelligence","growth","social","launch","outbound","observability","executive","founder","browser-runtime"];
export const plans:Record<AtlasPlan,PlanDefinition>={
  solo:{id:"solo",maxUsers:1,maxAgents:3,maxWorkflowRunsMonthly:250,maxAiRequestsMonthly:500,maxIntegrations:2,retentionDays:30,modules:["today","business-ops","agent-governance"]},
  professional:{id:"professional",maxUsers:5,maxAgents:10,maxWorkflowRunsMonthly:2500,maxAiRequestsMonthly:5000,maxIntegrations:6,retentionDays:90,modules:["today","business-ops","agent-governance","revenue-intelligence","growth"]},
  business:{id:"business",maxUsers:25,maxAgents:50,maxWorkflowRunsMonthly:20000,maxAiRequestsMonthly:50000,maxIntegrations:25,retentionDays:365,modules:all.filter(m=>m!=="browser-runtime")},
  platform:{id:"platform",maxUsers:10000,maxAgents:10000,maxWorkflowRunsMonthly:1000000,maxAiRequestsMonthly:1000000,maxIntegrations:10000,retentionDays:3650,modules:all}
};
export function isAtlasPlan(value:string):value is AtlasPlan{return value==="solo"||value==="professional"||value==="business"||value==="platform"}
export function billingStatusAllowsAccess(status:string){return status==="trialing"||status==="active"||status==="past_due"}
export function moduleEntitled(plan:AtlasPlan,moduleId:string){return plans[plan].modules.includes(moduleId)}
export function moduleEntitledForBilling(plan:AtlasPlan,status:string,moduleId:string){return billingStatusAllowsAccess(status)&&moduleEntitled(plan,moduleId)}
export function intersectEnabledModules(plan:AtlasPlan,requested:string[]){return requested.filter(id=>moduleEntitled(plan,id))}
export function intersectBillingEnabledModules(plan:AtlasPlan,status:string,requested:string[]){return requested.filter(id=>moduleEntitledForBilling(plan,status,id))}
export function resolveBillingEntitlements(plan:AtlasPlan,status:string){
  const definition=plans[plan];
  return{plan,status,access:billingStatusAllowsAccess(status),maxUsers:definition.maxUsers,maxAgents:definition.maxAgents,maxWorkflowRunsMonthly:definition.maxWorkflowRunsMonthly,maxAiRequestsMonthly:definition.maxAiRequestsMonthly,maxIntegrations:definition.maxIntegrations,retentionDays:definition.retentionDays,modules:[...definition.modules]};
}
