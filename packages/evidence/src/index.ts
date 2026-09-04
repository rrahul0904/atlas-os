export type EvidenceSourceType="metric"|"event"|"integration"|"document"|"entity"|"agent_result"|"task"|"approval";

export interface EvidenceRecord{
  id:string;
  tenantId:string;
  workspaceId:string;
  sourceType:EvidenceSourceType;
  sourceId:string;
  claim:string;
  confidence:number;
  metadata:Record<string,string|number|boolean|null>;
  observedAt:string;
  createdAt?:string;
}

export function normalizeConfidence(value:number){
  if(!Number.isFinite(value))return 0;
  return Math.max(0,Math.min(1,value));
}

export function evidenceSummary(records:EvidenceRecord[]){
  return records
    .slice()
    .sort((a,b)=>b.confidence-a.confidence||b.observedAt.localeCompare(a.observedAt))
    .map(item=>({id:item.id,claim:item.claim,confidence:item.confidence,sourceType:item.sourceType,sourceId:item.sourceId}));
}
