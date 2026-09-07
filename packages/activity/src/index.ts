import type {WorkspaceContext} from "../../context/src/index.js";

export type AtlasActivityCategory=
  "customer"|"revenue"|"booking"|"order"|"fulfillment"|"inventory"|"agent"|"workflow"|"approval"|"integration"|"deployment"|"error";

export interface AtlasActivity{
  id:string;
  tenantId:string;
  workspaceId:string;
  occurredAt:string;
  category:AtlasActivityCategory;
  entityType:string|null;
  entityId:string|null;
  title:string;
  description:string;
  sourceModule:string;
  sourceIntegration:string|null;
  severity:"info"|"warning"|"critical";
  outcome:string|null;
  locationId:string|null;
  latitude:number|null;
  longitude:number|null;
  evidenceIds:string[];
  actionId:string|null;
}

function text(value:unknown,fallback=""){return typeof value==="string"&&value.trim()?value.trim():fallback}
function finite(value:unknown){const n=Number(value);return Number.isFinite(n)?n:null}
function timestamp(value:unknown,fallback:string){const d=new Date(value as string|number|Date);return Number.isFinite(d.getTime())?d.toISOString():fallback}

function eventCategory(module:string,type:string):AtlasActivityCategory{
  const value=(module+" "+type).toLowerCase();
  if(value.includes("deploy")||value.includes("release"))return"deployment";
  if(value.includes("integration")||value.includes("google")||value.includes("webhook"))return"integration";
  if(value.includes("approval"))return"approval";
  if(value.includes("workflow"))return"workflow";
  if(value.includes("agent"))return"agent";
  if(value.includes("booking")||value.includes("appointment")||value.includes("reservation"))return"booking";
  if(value.includes("fulfill"))return"fulfillment";
  if(value.includes("order"))return"order";
  if(value.includes("invoice")||value.includes("payment")||value.includes("revenue"))return"revenue";
  if(value.includes("inventory")||value.includes("stock"))return"inventory";
  if(value.includes("error")||value.includes("failed"))return"error";
  return"customer";
}

function severityFor(value:string):AtlasActivity["severity"]{
  const lower=value.toLowerCase();
  if(lower.includes("critical")||lower.includes("failed")||lower.includes("past_due")||lower.includes("error"))return"critical";
  if(lower.includes("warning")||lower.includes("cancel")||lower.includes("low_stock")||lower.includes("approval"))return"warning";
  return"info";
}

function coordinates(address:unknown){
  if(!address||typeof address!=="object")return{latitude:null,longitude:null};
  const record=address as Record<string,unknown>;
  return{latitude:finite(record.latitude??record.lat),longitude:finite(record.longitude??record.lng??record.lon)};
}

export function deriveAtlasActivity(context:WorkspaceContext,limit=80):AtlasActivity[]{
  const now=new Date().toISOString();
  const scope={tenantId:context.workspace.tenantId,workspaceId:context.workspace.id};
  const locations=new Map(context.business.locations.map((row:any)=>[row.id,row] as const));
  const activities:AtlasActivity[]=[];
  const push=(activity:AtlasActivity)=>{if(activity.tenantId===scope.tenantId&&activity.workspaceId===scope.workspaceId)activities.push(activity)};

  for(const row of context.events){
    const props=row.properties&&typeof row.properties==="object"?row.properties as Record<string,unknown>:{};
    const locationId=text(props.locationId)||null;
    const location=locationId?locations.get(locationId):null;
    const geo=coordinates(location?.address);
    const module=text(row.module,"core"),type=text(row.type,"event");
    push({
      id:"event:"+row.id,...scope,occurredAt:timestamp(row.occurred_at??row.occurredAt,now),
      category:eventCategory(module,type),entityType:text(row.entity_type??row.entityType)||null,entityId:text(row.entity_id??row.entityId)||null,
      title:text(props.title,type.replaceAll("_"," ")),description:text(props.description,module+" recorded "+type.replaceAll("_"," ")+"."),
      sourceModule:module,sourceIntegration:text(props.sourceIntegration)||null,severity:severityFor(type+" "+text(props.severity)),
      outcome:text(props.outcome)||null,locationId,latitude:geo.latitude,longitude:geo.longitude,
      evidenceIds:Array.isArray(props.evidenceIds)?props.evidenceIds.filter((v):v is string=>typeof v==="string"):[],actionId:text(props.actionId)||null
    });
  }

  for(const row of context.business.bookings as any[]){
    const location=row.locationId?locations.get(row.locationId):null,geo=coordinates(location?.address);
    push({id:"booking:"+row.id,...scope,occurredAt:timestamp(row.updatedAt??row.createdAt??row.startsAt,now),category:"booking",entityType:"booking",entityId:row.id,
      title:row.title||"Booking",description:(row.bookingType||"booking")+" · "+row.status,sourceModule:"business-ops",sourceIntegration:row.sourceIntegrationId??null,
      severity:row.status==="canceled"?"warning":"info",outcome:row.status,locationId:row.locationId??null,latitude:geo.latitude,longitude:geo.longitude,evidenceIds:[],actionId:null});
  }

  for(const row of context.business.orders as any[]){
    const location=row.locationId?locations.get(row.locationId):null,geo=coordinates(location?.address);
    push({id:"order:"+row.id,...scope,occurredAt:timestamp(row.updatedAt??row.createdAt,now),category:"order",entityType:"order",entityId:row.id,
      title:"Order "+String(row.id).slice(0,8),description:row.status+" · fulfillment "+row.fulfillmentStatus,sourceModule:"business-ops",sourceIntegration:null,
      severity:row.fulfillmentStatus==="failed"?"critical":"info",outcome:row.fulfillmentStatus,locationId:row.locationId??null,latitude:geo.latitude,longitude:geo.longitude,evidenceIds:[],actionId:null});
  }

  for(const row of context.business.fulfillments as any[]){
    push({id:"fulfillment:"+row.id,...scope,occurredAt:timestamp(row.updatedAt??row.createdAt,now),category:"fulfillment",entityType:"fulfillment",entityId:row.id,
      title:text(row.fulfillmentType,"Order")+" fulfillment",description:"Fulfillment is "+row.status+".",sourceModule:"business-ops",sourceIntegration:null,
      severity:row.status==="failed"?"critical":"info",outcome:row.status,locationId:null,latitude:null,longitude:null,evidenceIds:[],actionId:null});
  }

  for(const row of context.business.inventory as any[]){
    if(row.reorderPoint==null||Number(row.quantityOnHand)>Number(row.reorderPoint))continue;
    push({id:"inventory:"+row.id,...scope,occurredAt:timestamp(row.updatedAt??row.createdAt,now),category:"inventory",entityType:"inventory_item",entityId:row.id,
      title:"Low stock: "+row.name,description:String(row.quantityOnHand)+" on hand · reorder point "+String(row.reorderPoint),sourceModule:"business-ops",sourceIntegration:null,
      severity:"warning",outcome:"low_stock",locationId:null,latitude:null,longitude:null,evidenceIds:[],actionId:null});
  }

  for(const row of context.business.invoices as any[]){
    if(!["past_due","open"].includes(row.status))continue;
    push({id:"invoice:"+row.id,...scope,occurredAt:timestamp(row.updatedAt??row.createdAt??row.dueAt,now),category:"revenue",entityType:"invoice",entityId:row.id,
      title:row.status==="past_due"?"Invoice past due":"Open invoice",description:(row.currency||"USD")+" "+Number(row.totalAmount??0).toFixed(2)+" · "+row.status,sourceModule:"business-ops",sourceIntegration:null,
      severity:row.status==="past_due"?"critical":"info",outcome:row.status,locationId:null,latitude:null,longitude:null,evidenceIds:[],actionId:null});
  }

  for(const action of context.actions){
    push({id:"action:"+action.id,...scope,occurredAt:timestamp(action.createdAt,now),category:eventCategory(action.sourceModule,action.title),entityType:action.entity?.type??null,entityId:action.entity?.id??null,
      title:action.title,description:action.businessImpact,sourceModule:action.sourceModule,sourceIntegration:null,severity:action.severity,
      outcome:action.status,locationId:null,latitude:null,longitude:null,evidenceIds:action.evidenceIds,actionId:action.id});
  }

  for(const row of context.approvals as any[]){
    push({id:"approval:"+row.id,...scope,occurredAt:timestamp(row.requested_at??row.requestedAt,now),category:"approval",entityType:"approval",entityId:row.id,
      title:text(row.action,"Approval required"),description:text(row.business_reason??row.businessReason,"A governed action is waiting for a human decision."),
      sourceModule:"agent-governance",sourceIntegration:text(row.external_system??row.externalSystem)||null,severity:severityFor(String(row.risk??"")),
      outcome:"pending",locationId:null,latitude:null,longitude:null,evidenceIds:[],actionId:null});
  }

  const seen=new Set<string>();
  return activities.sort((a,b)=>b.occurredAt.localeCompare(a.occurredAt)).filter(row=>{if(seen.has(row.id))return false;seen.add(row.id);return true}).slice(0,Math.max(1,Math.min(200,Math.floor(limit))));
}
