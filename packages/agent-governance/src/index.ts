export type RiskLevel = "low" | "medium" | "high" | "critical";
export type PolicyEffect = "allow" | "deny" | "approval_required";
export type DataClass = "public" | "internal" | "confidential" | "pii" | "restricted";

export interface ToolDefinition {
  id:string; name:string; connector:string; action:string; description:string;
  isWrite:boolean; reversible:boolean; risk:RiskLevel; scopes:string[];
  dataClasses:DataClass[]; costUnits:number; enabled:boolean;
}
export interface InvocationIdentity {
  workspaceId:string; userId:string; agentId?:string|null; sessionId:string;
  delegatedScopes:string[]; role:string;
}
export interface PolicyRule {
  id:string; workspaceId:string; name:string; priority:number; effect:PolicyEffect; enabled:boolean;
  match:{ tools?:string[]; connectors?:string[]; actions?:string[]; roles?:string[]; risks?:RiskLevel[]; dataClasses?:DataClass[]; write?:boolean };
  conditions?:{maxCostUnits?:number};
}
export interface PolicyContext { tool:ToolDefinition; identity:InvocationIdentity; dataClasses:DataClass[]; estimatedCostUnits:number; }
export interface PolicyDecision { effect:PolicyEffect; matchedRuleIds:string[]; reasons:string[]; }

const rank:Record<PolicyEffect,number>={allow:1,approval_required:2,deny:3};
function intersects<T>(a:T[]|undefined,b:T[]){return !a?.length||a.some(x=>b.includes(x));}
function matches(rule:PolicyRule,context:PolicyContext){
  const m=rule.match??{};
  if(m.tools?.length&&!m.tools.includes(context.tool.name))return false;
  if(m.connectors?.length&&!m.connectors.includes(context.tool.connector))return false;
  if(m.actions?.length&&!m.actions.includes(context.tool.action))return false;
  if(m.roles?.length&&!m.roles.includes(context.identity.role))return false;
  if(m.risks?.length&&!m.risks.includes(context.tool.risk))return false;
  if(m.write!==undefined&&m.write!==context.tool.isWrite)return false;
  if(!intersects(m.dataClasses,context.dataClasses))return false;
  if(rule.conditions?.maxCostUnits!==undefined&&context.estimatedCostUnits>rule.conditions.maxCostUnits)return false;
  return true;
}
export function evaluatePolicies(rules:PolicyRule[],context:PolicyContext):PolicyDecision{
  const matched=rules.filter(r=>r.enabled&&matches(r,context)).sort((a,b)=>b.priority-a.priority||a.name.localeCompare(b.name));
  if(!matched.length)return {effect:context.tool.isWrite?"approval_required":"deny",matchedRuleIds:[],reasons:[context.tool.isWrite?"default-write-approval":"default-deny"]};
  let selected=matched[0];
  for(const rule of matched)if(rank[rule.effect]>rank[selected.effect])selected=rule;
  return {effect:selected.effect,matchedRuleIds:matched.map(r=>r.id),reasons:matched.map(r=>`${r.name}:${r.effect}`)};
}
export function validateDelegation(context:PolicyContext){return context.tool.scopes.filter(scope=>!context.identity.delegatedScopes.includes("*")&&!context.identity.delegatedScopes.includes(scope));}

export interface GovernedActionRequest { id:string; tool:ToolDefinition; identity:InvocationIdentity; dataClasses:DataClass[]; estimatedCostUnits:number; }
export interface GovernedActionResult { requestId:string; decision:PolicyDecision; missingScopes:string[]; executable:boolean; approvalRequired:boolean; }
export function authorizeAgentAction(rules:PolicyRule[],request:GovernedActionRequest):GovernedActionResult{
  const context:PolicyContext={tool:request.tool,identity:request.identity,dataClasses:request.dataClasses,estimatedCostUnits:request.estimatedCostUnits};
  const missingScopes=validateDelegation(context);
  if(missingScopes.length)return {requestId:request.id,decision:{effect:"deny",matchedRuleIds:[],reasons:[`missing-scopes:${missingScopes.join(",")}`]},missingScopes,executable:false,approvalRequired:false};
  const decision=evaluatePolicies(rules,context);
  return {requestId:request.id,decision,missingScopes,executable:decision.effect==="allow",approvalRequired:decision.effect==="approval_required"};
}
