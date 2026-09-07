import type {WorkspaceContext} from "../../context/src/index.js";
import type {EvidenceRecord} from "../../evidence/src/index.js";

export type AtlasIntent="next_action"|"revenue_change"|"approvals"|"unconfirmed"|"bookings"|"fulfillment"|"inventory"|"risk"|"deployment"|"general";

export interface AtlasAnswer{
  intent:AtlasIntent;
  answer:string;
  evidence:Array<Pick<EvidenceRecord,"id"|"claim"|"confidence"|"sourceType"|"sourceId">>;
  actionIds:string[];
  generatedFrom:"deterministic_evidence";
}

export function classifyAtlasQuestion(question:string):AtlasIntent{
  const q=question.toLowerCase();
  if(/what.*(work|do).*next|needs? my attention|priority/.test(q))return"next_action";
  if(/revenue|mrr|conversion|sales.*(fall|drop|down)|why.*(revenue|sales)/.test(q))return"revenue_change";
  if(/approval|approve|waiting.*me/.test(q))return"approvals";
  if(/unconfirmed|not confirmed|patient.*confirm|appointment.*confirm|reservation.*confirm|booking.*confirm/.test(q))return"unconfirmed";
  if(/low stock|inventory|reorder|stock level/.test(q))return"inventory";
  if(/unfulfilled|fulfillment|fulfilment|order.*(pending|ready|complete)|which orders|open orders/.test(q))return"fulfillment";
  if(/booking|reservation|appointment|pickup slot|cancell?ed|coming up today|what.*coming up/.test(q))return"bookings";
  if(/risk|at risk|program.*slip|critical/.test(q))return"risk";
  if(/deploy|deployment|release|production/.test(q))return"deployment";
  return"general";
}

function evidenceShape(rows:EvidenceRecord[]){
  return rows.slice(0,8).map(row=>({id:row.id,claim:row.claim,confidence:row.confidence,sourceType:row.sourceType,sourceId:row.sourceId}));
}

function matchingEvidence(context:WorkspaceContext,terms:string[]){
  return context.evidence.filter(item=>{
    const text=(item.claim+" "+JSON.stringify(item.metadata)).toLowerCase();
    return terms.some(term=>text.includes(term));
  });
}

export function answerAtlas(context:WorkspaceContext,question:string):AtlasAnswer{
  const intent=classifyAtlasQuestion(question);
  if(intent==="next_action"){
    const action=context.actions[0];
    if(!action)return{intent,answer:"I do not have any open evidence-backed action items for this workspace yet. Connect a source or create operational work first.",evidence:[],actionIds:[],generatedFrom:"deterministic_evidence"};
    const evidence=context.evidence.filter(row=>action.evidenceIds.includes(row.id));
    return{intent,answer:`${action.title}. ${action.businessImpact} Recommended next action: ${action.recommendedAction}`,evidence:evidenceShape(evidence),actionIds:[action.id],generatedFrom:"deterministic_evidence"};
  }
  if(intent==="approvals"){
    if(!context.approvals.length)return{intent,answer:"There are no pending governed approvals in this workspace.",evidence:[],actionIds:[],generatedFrom:"deterministic_evidence"};
    return{intent,answer:`There are ${context.approvals.length} pending approvals. The highest-risk action should be reviewed first.`,evidence:[],actionIds:context.approvals.map((row:any)=>"approval:"+row.id),generatedFrom:"deterministic_evidence"};
  }
  if(intent==="revenue_change"){
    const evidence=matchingEvidence(context,["revenue","mrr","conversion","checkout","sales"]);
    if(!evidence.length)return{intent,answer:"I do not have enough revenue or conversion evidence in this workspace to explain a change yet.",evidence:[],actionIds:[],generatedFrom:"deterministic_evidence"};
    return{intent,answer:"The workspace has revenue-related evidence. Review the cited observations before taking action; Atlas is not inferring a cause beyond the evidence.",evidence:evidenceShape(evidence),actionIds:context.actions.filter(item=>item.sourceModule.includes("revenue")).map(item=>item.id),generatedFrom:"deterministic_evidence"};
  }
  if(intent==="unconfirmed"){
    const taskMatches=context.tasks.filter((row:any)=>String(row.title??"").toLowerCase().includes("confirm"));
    const bookingMatches=context.business.bookings.filter((row:any)=>row.status==="scheduled"&&row.confirmationState==="pending");
    const evidence=matchingEvidence(context,["unconfirmed","confirm","appointment","reservation","booking"]);
    if(!taskMatches.length&&!bookingMatches.length&&!evidence.length)return{intent,answer:"I do not have any connected confirmation or booking evidence for this workspace.",evidence:[],actionIds:[],generatedFrom:"deterministic_evidence"};
    return{intent,answer:`I found ${bookingMatches.length} scheduled bookings not yet marked confirmed, ${taskMatches.length} confirmation-related tasks, and ${evidence.length} related evidence records.`,evidence:evidenceShape(evidence),actionIds:[],generatedFrom:"deterministic_evidence"};
  }
  if(intent==="bookings"){
    const now=Date.now();
    const rows=context.business.bookings;
    const upcoming=rows.filter((row:any)=>["tentative","scheduled","confirmed"].includes(row.status)&&new Date(row.startsAt).getTime()>=now);
    const canceled=rows.filter((row:any)=>row.status==="canceled");
    const evidence=matchingEvidence(context,["booking","reservation","appointment","capacity","canceled"]);
    if(!rows.length&&!evidence.length)return{intent,answer:"I do not have connected booking records for this workspace yet.",evidence:[],actionIds:[],generatedFrom:"deterministic_evidence"};
    return{intent,answer:`There are ${upcoming.length} upcoming bookings and ${canceled.length} canceled bookings in the connected workspace.`,evidence:evidenceShape(evidence),actionIds:[],generatedFrom:"deterministic_evidence"};
  }
  if(intent==="fulfillment"){
    const orders=context.business.orders;
    const open=orders.filter((row:any)=>row.status!=="canceled"&&!["fulfilled","canceled"].includes(row.fulfillmentStatus));
    const ready=orders.filter((row:any)=>row.fulfillmentStatus==="ready");
    const evidence=matchingEvidence(context,["order","fulfillment","ready","pickup"]);
    if(!orders.length&&!evidence.length)return{intent,answer:"I do not have connected order or fulfillment records for this workspace yet.",evidence:[],actionIds:[],generatedFrom:"deterministic_evidence"};
    return{intent,answer:`There are ${open.length} unfulfilled orders, including ${ready.length} marked ready.`,evidence:evidenceShape(evidence),actionIds:[],generatedFrom:"deterministic_evidence"};
  }
  if(intent==="inventory"){
    const rows=context.business.inventory;
    const low=rows.filter((row:any)=>row.reorderPoint!=null&&row.quantityOnHand<=row.reorderPoint);
    const evidence=matchingEvidence(context,["inventory","stock","reorder"]);
    if(!rows.length&&!evidence.length)return{intent,answer:"I do not have connected inventory records for this workspace yet.",evidence:[],actionIds:[],generatedFrom:"deterministic_evidence"};
    return{intent,answer:`I found ${low.length} inventory items at or below their reorder point.`,evidence:evidenceShape(evidence),actionIds:[],generatedFrom:"deterministic_evidence"};
  }
  if(intent==="risk"){
    const actions=context.actions.filter(item=>item.severity==="critical"||item.risk.toLowerCase().includes("risk"));
    const evidence=matchingEvidence(context,["risk","slip","critical","forecast"]);
    if(!actions.length&&!evidence.length)return{intent,answer:"I do not have evidence-backed critical risks for this workspace right now.",evidence:[],actionIds:[],generatedFrom:"deterministic_evidence"};
    return{intent,answer:`I found ${actions.length} open risk actions. Review the highest-severity item first.`,evidence:evidenceShape(evidence),actionIds:actions.map(item=>item.id),generatedFrom:"deterministic_evidence"};
  }
  if(intent==="deployment"){
    const evidence=matchingEvidence(context,["deploy","release","production","commit"]);
    const events=context.events.filter((row:any)=>String(row.module).includes("deploy")||String(row.type).includes("deploy"));
    if(!evidence.length&&!events.length)return{intent,answer:"No deployment evidence is connected to this workspace yet.",evidence:[],actionIds:[],generatedFrom:"deterministic_evidence"};
    return{intent,answer:`I found ${events.length} deployment-related events and ${evidence.length} supporting evidence records.`,evidence:evidenceShape(evidence),actionIds:[],generatedFrom:"deterministic_evidence"};
  }
  return{
    intent,
    answer:`This workspace currently has ${context.actions.length} open action items, ${context.tasks.filter((row:any)=>row.status!=="done").length} open tasks, ${context.approvals.length} pending approvals, ${context.business.leads.filter((row:any)=>!["converted","lost","archived"].includes(row.status)).length} open leads, ${context.business.opportunities.filter((row:any)=>row.status==="open").length} open opportunities, ${context.business.bookings.filter((row:any)=>["tentative","scheduled","confirmed"].includes(row.status)).length} active bookings, and ${context.business.orders.filter((row:any)=>row.status!=="canceled"&&!["fulfilled","canceled"].includes(row.fulfillmentStatus)).length} unfulfilled orders. Ask about priorities, risks, approvals, revenue, bookings, fulfillment, inventory, or deployments for a grounded answer.`,
    evidence:[],
    actionIds:[],
    generatedFrom:"deterministic_evidence"
  };
}
