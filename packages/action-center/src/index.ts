export type ActionSeverity="info"|"warning"|"critical";
export type ActionMode="auto"|"approval_required"|"human";
export interface ActionEvidence{label:string;value:string|number;source:string;}
export interface ActionItem{id:string;title:string;whyItMatters:string;severity:ActionSeverity;risk:string;recommendedAction:string;mode:ActionMode;evidence:ActionEvidence[];relatedEntityId?:string;}
export interface TodayBrief{businessHealth:number;needsAttention:ActionItem[];decisions:ActionItem[];aiHandled:string[];upcoming:string[];opportunities:ActionItem[];}
export function prioritize(items:ActionItem[]){const rank:Record<ActionSeverity,number>={critical:3,warning:2,info:1};return [...items].sort((a,b)=>rank[b.severity]-rank[a.severity]||a.title.localeCompare(b.title));}
export function buildTodayBrief(input:Omit<TodayBrief,"needsAttention"|"decisions"|"opportunities">&{items:ActionItem[]}):TodayBrief{const sorted=prioritize(input.items);return{businessHealth:input.businessHealth,needsAttention:sorted.filter(x=>x.severity!=="info"),decisions:sorted.filter(x=>x.mode==="approval_required"),aiHandled:input.aiHandled,upcoming:input.upcoming,opportunities:sorted.filter(x=>x.severity==="info")};}
