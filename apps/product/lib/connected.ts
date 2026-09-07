import {db} from "@atlas/db";
import {resolveWorkspaceContext} from "@atlas/context";
import {deriveAtlasActivity} from "@atlas/activity";
import {terminologyFor} from "@atlas/business-kernel";
import {buildToday,createPersistenceTodayProvider} from "@atlas/today";
import {
  AgentRepository,WorkflowRepository,IntegrationConnectionRepository,BillingRepository,UsageRepository,
  PaymentRepository,ProjectRepository,CampaignRepository
} from "@atlas/repositories";
import type {TenantPrincipal} from "@atlas/tenancy";
import type {AtlasProductModel,ProductMetric,ProductRow,ProductSection} from "./types";

function date(value:unknown){if(!value)return"—";const d=new Date(value as string|number|Date);return Number.isFinite(d.getTime())?d.toLocaleString("en-US",{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"}):"—"}
function money(value:unknown,currency="USD"){return new Intl.NumberFormat("en-US",{style:"currency",currency,maximumFractionDigits:0}).format(Number(value??0))}
const state=(value:string)=>value.replaceAll("_"," ").replace(/\b\w/g,c=>c.toUpperCase());

const emptySections=():Record<ProductSection,ProductRow[]>=>({today:[],live:[],customers:[],pipeline:[],bookings:[],orders:[],money:[],inventory:[],work:[],agents:[],workflows:[],approvals:[],integrations:[],alerts:[],billing:[]});

export async function connectedModel(principal:TenantPrincipal):Promise<AtlasProductModel>{
  const sql=db(),scope={tenantId:principal.tenantId,workspaceId:principal.workspaceId};
  const contextPromise=resolveWorkspaceContext(sql,principal);
  const todayPromise=buildToday(scope,[createPersistenceTodayProvider(sql)]);
  const extrasPromise=Promise.all([
    new AgentRepository(sql).list(scope),
    new WorkflowRepository(sql).listDefinitions(scope),
    new WorkflowRepository(sql).listRuns(scope,100),
    new IntegrationConnectionRepository(sql).list(scope),
    new BillingRepository(sql).findScoped(scope),
    new UsageRepository(sql).summary(scope),
    new PaymentRepository(sql).list(scope,100),
    new ProjectRepository(sql).list(scope,100),
    new CampaignRepository(sql).list(scope,100)
  ]);
  const [context,today,[agents,definitions,runs,integrations,billing,usage,payments,projects,campaigns]]=await Promise.all([contextPromise,todayPromise,extrasPromise]);
  const terms=terminologyFor(context.workspace.verticalId),activity=deriveAtlasActivity(context,100),rows=emptySections();

  rows.customers=context.business.contacts.map((r:any)=>({id:r.id,primary:r.displayName,secondary:state(r.relationship),status:state(r.status),meta:[r.email,r.phone].filter(Boolean).join(" · ")||"No contact details"}));
  rows.pipeline=[
    ...context.business.leads.map((r:any)=>({id:"lead:"+r.id,primary:r.title,secondary:"Lead",status:state(r.status),meta:r.score==null?"No score":"Score "+r.score})),
    ...context.business.opportunities.map((r:any)=>({id:"opp:"+r.id,primary:r.name,secondary:"Opportunity",status:state(r.status),meta:(r.amount==null?"No value":money(r.amount,r.currency))+" · "+state(r.stage)}))
  ];
  rows.bookings=context.business.bookings.map((r:any)=>({id:r.id,primary:r.title,secondary:terms.booking,status:state(r.status),meta:date(r.startsAt)+" · "+(r.resources?.length?String(r.resources.length)+" resource(s)":"No resource assignment")}));
  rows.orders=context.business.orders.map((r:any)=>({id:r.id,primary:"Order "+String(r.id).slice(0,8),secondary:terms.order,status:state(r.fulfillmentStatus),meta:money(r.total,r.currency)+" · "+state(r.status)}));
  rows.money=[
    ...payments.map((r:any)=>({id:"payment:"+r.id,primary:"Payment "+String(r.id).slice(0,8),secondary:"Payment",status:state(r.status),meta:money(r.amount,r.currency)+" · "+date(r.paidAt??r.createdAt)})),
    ...context.business.invoices.map((r:any)=>({id:"invoice:"+r.id,primary:r.invoiceNumber?"Invoice "+r.invoiceNumber:"Invoice "+String(r.id).slice(0,8),secondary:"Invoice",status:state(r.status),meta:money(r.totalAmount,r.currency)+" · due "+date(r.dueAt)}))
  ];
  rows.inventory=context.business.inventory.map((r:any)=>({id:r.id,primary:r.name,secondary:r.sku||"Inventory item",status:r.reorderPoint!=null&&r.quantityOnHand<=r.reorderPoint?"Low stock":state(r.status),meta:String(r.quantityOnHand)+" on hand"+(r.reorderPoint==null?"":" · reorder "+r.reorderPoint)}));
  rows.work=[
    ...context.tasks.map((r:any)=>({id:"task:"+r.id,primary:r.title,secondary:"Task",status:state(r.status),meta:(r.priority?state(r.priority)+" · ":"")+date(r.due_at)})),
    ...projects.map((r:any)=>({id:"project:"+r.id,primary:r.name,secondary:"Project",status:state(r.status),meta:r.dueAt?"Due "+date(r.dueAt):"No due date"})),
    ...campaigns.map((r:any)=>({id:"campaign:"+r.id,primary:r.name,secondary:"Campaign",status:state(r.status),meta:r.channel||"No channel"}))
  ];
  rows.agents=agents.map(a=>({id:a.id,primary:a.name,secondary:a.moduleId,status:a.enabled?"Enabled":"Disabled",meta:(a.tools.length?String(a.tools.length)+" tools":"No tools")+" · "+money(a.costBudgetDaily)+"/day budget"}));
  const definitionNames=new Map(definitions.map((d:any)=>[d.id,String(d.name)]));
  rows.workflows=runs.map(r=>({id:r.id,primary:definitionNames.get(r.workflowId)||r.workflowId,secondary:"Workflow run",status:state(r.status),meta:(r.startedAt?date(r.startedAt):"Not started")+" · "+r.attemptCount+" attempt(s)"}));
  rows.approvals=context.approvals.map((r:any)=>({id:r.id,primary:r.action||"Approval required",secondary:r.external_system||"Governed action",status:"Pending",meta:state(String(r.risk||"unknown"))+" risk"+(r.business_reason?" · "+r.business_reason:"")}));
  rows.integrations=integrations.map(i=>({id:i.id,primary:i.integrationId==="google-workspace"?"Google Workspace":i.integrationId==="webhook"?"Webhook / REST":i.integrationId,secondary:i.externalAccountRef||"Integration",status:state(i.status),meta:i.lastError||("Last success "+date(i.lastSuccessAt))}));
  rows.alerts=[
    ...context.actions.map(a=>({id:a.id,primary:a.title,secondary:a.sourceModule,status:state(a.severity),meta:a.businessImpact})),
    ...rows.inventory.filter(r=>r.status==="Low stock").map(r=>({...r,id:"alert:"+r.id,secondary:"Inventory alert",status:"Warning"}))
  ];
  rows.billing=billing?[{id:"billing",primary:state(billing.planId),secondary:"AtlasOS subscription",status:state(billing.status),meta:(billing.currentPeriodEnd?"Period ends "+date(billing.currentPeriodEnd):"No provider period")+" · "+usage.map((u:any)=>String(u.metric)+" "+String(u.quantity)).join(", ")}]:[];

  const preferred=["customers","open-opportunities","upcoming-bookings","unfulfilled-orders","pending-approvals","open-invoices","low-stock"];
  const metricById=new Map(today.metrics.map(m=>[m.id,m]));
  const metrics:ProductMetric[]=preferred.map(id=>metricById.get(id)).filter(Boolean).slice(0,5).map(m=>({label:m!.label,value:m!.availability==="value"?m!.value??0:"—",note:m!.availability==="value"?m!.sourceModule:state(m!.availability),state:m!.id==="low-stock"||m!.id==="pending-approvals"?"warn":undefined}));

  if(!metrics.length)metrics.push({label:"Connected workspace",value:"Ready",note:"No persisted metrics yet",state:"muted"});

  const handled=runs.filter(r=>r.status==="completed").slice(0,6).map(r=>({id:r.id,title:definitionNames.get(r.workflowId)||"Workflow completed",when:date(r.finishedAt),kind:"Workflow"}));
  return{
    mode:"connected",workspace:{id:context.workspace.id,name:context.workspace.name,verticalId:context.workspace.verticalId,planId:context.workspace.planId,billingStatus:context.workspace.billingStatus},
    terminology:terms,modules:context.modules,metrics,
    attention:today.attention.map(a=>({id:a.id,title:a.title,why:a.businessImpact,severity:a.severity,entity:a.entity?state(a.entity.type):a.sourceModule,action:a.recommendedAction,status:state(a.status)})),
    upcoming:today.upcoming.map(u=>({id:u.id,title:u.title,when:date(u.dueAt),kind:u.sourceModule})),handled,activity,rows,
    counts:{pendingApprovals:context.approvals.length,alerts:rows.alerts.length}
  };
}
