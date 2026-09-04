export type AtlasPlan="solo"|"professional"|"business"|"platform";
export interface PlanDefinition{id:AtlasPlan;maxUsers:number;maxAgents:number;modules:string[]}
const all=["today","business-ops","agent-governance","revenue-intelligence","growth","social","launch","outbound","observability","executive","founder","browser-runtime"];
export const plans:Record<AtlasPlan,PlanDefinition>={
 solo:{id:"solo",maxUsers:1,maxAgents:3,modules:["today","business-ops","agent-governance"]},
 professional:{id:"professional",maxUsers:5,maxAgents:10,modules:["today","business-ops","agent-governance","revenue-intelligence","growth"]},
 business:{id:"business",maxUsers:25,maxAgents:50,modules:all.filter(m=>m!=="browser-runtime")},
 platform:{id:"platform",maxUsers:10000,maxAgents:10000,modules:all}
};
export function moduleEntitled(plan:AtlasPlan,moduleId:string){return plans[plan].modules.includes(moduleId)}
export function intersectEnabledModules(plan:AtlasPlan,requested:string[]){return requested.filter(id=>moduleEntitled(plan,id))}
