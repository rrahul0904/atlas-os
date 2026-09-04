export type ActionSeverity="info"|"warning"|"critical";
export type ActionMode="auto"|"approval_required"|"human";
export type ActionStatus="open"|"in_progress"|"waiting_approval"|"completed"|"dismissed";

export interface ActionEvidence{label:string;value:string|number;source:string;}

export interface ActionItem{
  id:string;
  title:string;
  whyItMatters:string;
  severity:ActionSeverity;
  risk:string;
  recommendedAction:string;
  mode:ActionMode;
  evidence:ActionEvidence[];
  relatedEntityId?:string;
}

export interface BusinessActionItem{
  id:string;
  tenantId:string;
  workspaceId:string;
  sourceModule:string;
  entity?:{type:string;id:string};
  title:string;
  description:string;
  severity:ActionSeverity;
  businessImpact:string;
  evidenceIds:string[];
  recommendedAction:string;
  risk:string;
  approvalPolicy:ActionMode;
  status:ActionStatus;
  createdAt:string;
}

export interface TodayBrief{
  businessHealth:number;
  needsAttention:ActionItem[];
  decisions:ActionItem[];
  aiHandled:string[];
  upcoming:string[];
  opportunities:ActionItem[];
}

const rank:Record<ActionSeverity,number>={critical:3,warning:2,info:1};

export function prioritize(items:ActionItem[]){
  return [...items].sort((a,b)=>rank[b.severity]-rank[a.severity]||a.title.localeCompare(b.title));
}

export function prioritizeBusinessActions(items:BusinessActionItem[]){
  return [...items].sort((a,b)=>rank[b.severity]-rank[a.severity]||a.createdAt.localeCompare(b.createdAt));
}

export function buildTodayBrief(input:Omit<TodayBrief,"needsAttention"|"decisions"|"opportunities">&{items:ActionItem[]}):TodayBrief{
  const sorted=prioritize(input.items);
  return{
    businessHealth:input.businessHealth,
    needsAttention:sorted.filter(x=>x.severity!=="info"),
    decisions:sorted.filter(x=>x.mode==="approval_required"),
    aiHandled:input.aiHandled,
    upcoming:input.upcoming,
    opportunities:sorted.filter(x=>x.severity==="info")
  };
}
