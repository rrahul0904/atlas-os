import type {AtlasSql} from "../../db/src/index.js";
import type {BusinessActionItem,ActionSeverity} from "../../action-center/src/index.js";
import {ActionItemRepository,TaskRepository,ApprovalRepository,ContactRepository,LeadRepository,OpportunityRepository,AppointmentRepository,InvoiceRepository,InventoryItemRepository} from "../../repositories/src/index.js";

export type MetricAvailability="value"|"no_data"|"not_connected"|"unavailable";

export interface TodayMetric{
  id:string;
  label:string;
  value:number|string|null;
  unit?:string;
  availability:MetricAvailability;
  sourceModule:string;
  evidenceIds:string[];
}

export interface HandledItem{
  id:string;
  title:string;
  sourceModule:string;
  occurredAt:string;
}

export interface UpcomingItem{
  id:string;
  title:string;
  sourceModule:string;
  dueAt:string;
}

export interface TodayContribution{
  metrics:TodayMetric[];
  attention:BusinessActionItem[];
  handled:HandledItem[];
  upcoming:UpcomingItem[];
}

export interface TodayContext{
  tenantId:string;
  workspaceId:string;
}

export interface TodayProvider{
  moduleId:string;
  getMetrics(ctx:TodayContext):Promise<TodayMetric[]>;
  getAttention(ctx:TodayContext):Promise<BusinessActionItem[]>;
  getHandled(ctx:TodayContext):Promise<HandledItem[]>;
  getUpcoming(ctx:TodayContext):Promise<UpcomingItem[]>;
}

export interface TodaySnapshot extends TodayContribution{
  decisions:BusinessActionItem[];
  generatedAt:string;
}

const severityRank:Record<ActionSeverity,number>={critical:3,warning:2,info:1};

export async function buildToday(ctx:TodayContext,providers:TodayProvider[]):Promise<TodaySnapshot>{
  const contributions=await Promise.all(providers.map(async provider=>({
    metrics:await provider.getMetrics(ctx),
    attention:await provider.getAttention(ctx),
    handled:await provider.getHandled(ctx),
    upcoming:await provider.getUpcoming(ctx)
  })));
  const metrics=contributions.flatMap(x=>x.metrics);
  const attention=contributions.flatMap(x=>x.attention)
    .sort((a,b)=>severityRank[b.severity]-severityRank[a.severity]||a.createdAt.localeCompare(b.createdAt));
  const handled=contributions.flatMap(x=>x.handled).sort((a,b)=>b.occurredAt.localeCompare(a.occurredAt));
  const upcoming=contributions.flatMap(x=>x.upcoming).sort((a,b)=>a.dueAt.localeCompare(b.dueAt));
  return{
    metrics,
    attention,
    decisions:attention.filter(item=>item.approvalPolicy==="approval_required"||item.status==="waiting_approval"),
    handled,
    upcoming,
    generatedAt:new Date().toISOString()
  };
}

function derivedTaskAction(scope:TodayContext,row:any):BusinessActionItem{
  const severity:ActionSeverity=row.priority==="critical"?"critical":row.priority==="high"?"warning":"info";
  return{
    id:"task:"+row.id,
    tenantId:scope.tenantId,
    workspaceId:scope.workspaceId,
    sourceModule:"tasks",
    entity:{type:"task",id:row.id},
    title:row.title,
    description:"Open workspace task",
    severity,
    businessImpact:severity==="critical"?"A critical task is still open.":"An open task requires operator attention.",
    evidenceIds:[],
    recommendedAction:"Open task",
    risk:"Task may remain unresolved.",
    approvalPolicy:"human",
    status:"open",
    createdAt:new Date(0).toISOString()
  };
}

export function createPersistenceTodayProvider(sql:AtlasSql):TodayProvider{
  const tasks=new TaskRepository(sql);
  const approvals=new ApprovalRepository(sql);
  const actions=new ActionItemRepository(sql);
  const contacts=new ContactRepository(sql);
  const leads=new LeadRepository(sql);
  const opportunities=new OpportunityRepository(sql);
  const appointments=new AppointmentRepository(sql);
  const invoices=new InvoiceRepository(sql);
  const inventory=new InventoryItemRepository(sql);
  return{
    moduleId:"core",
    async getMetrics(ctx){
      const [taskRows,approvalRows,actionRows,contactRows,leadRows,opportunityRows,appointmentRows,invoiceRows,inventoryRows]=await Promise.all([
        tasks.list(ctx),approvals.listPending(ctx),actions.listOpen(ctx),contacts.list(ctx,500),leads.list(ctx,500),opportunities.list(ctx,500),appointments.list(ctx,500),invoices.list(ctx,500),inventory.list(ctx,500)
      ]);
      const now=Date.now();
      const customerCount=contactRows.filter(row=>row.relationship==="customer"||row.relationship==="patient_reference").length;
      const openLeadCount=leadRows.filter(row=>!["converted","lost","archived"].includes(row.status)).length;
      const openOpportunityCount=opportunityRows.filter(row=>row.status==="open").length;
      const upcomingAppointmentCount=appointmentRows.filter(row=>["scheduled","confirmed"].includes(row.status)&&new Date(row.startsAt).getTime()>=now).length;
      const openInvoiceCount=invoiceRows.filter(row=>row.status==="open"||row.status==="past_due").length;
      const lowStockCount=inventoryRows.filter(row=>row.reorderPoint!=null&&row.quantityOnHand<=row.reorderPoint).length;
      return[
        {id:"open-tasks",label:"Open tasks",value:taskRows.filter((r:any)=>r.status!=="done").length,unit:"count",availability:"value",sourceModule:"tasks",evidenceIds:[]},
        {id:"pending-approvals",label:"Pending approvals",value:approvalRows.length,unit:"count",availability:"value",sourceModule:"agent-governance",evidenceIds:[]},
        {id:"open-actions",label:"Needs attention",value:actionRows.length,unit:"count",availability:"value",sourceModule:"today",evidenceIds:[]},
        {id:"customers",label:"Customers",value:customerCount,unit:"count",availability:"value",sourceModule:"business-ops",evidenceIds:[]},
        {id:"open-leads",label:"Open leads",value:openLeadCount,unit:"count",availability:"value",sourceModule:"business-ops",evidenceIds:[]},
        {id:"open-opportunities",label:"Open opportunities",value:openOpportunityCount,unit:"count",availability:"value",sourceModule:"business-ops",evidenceIds:[]},
        {id:"upcoming-appointments",label:"Upcoming appointments",value:upcomingAppointmentCount,unit:"count",availability:"value",sourceModule:"business-ops",evidenceIds:[]},
        {id:"open-invoices",label:"Open invoices",value:openInvoiceCount,unit:"count",availability:"value",sourceModule:"business-ops",evidenceIds:[]},
        {id:"low-stock",label:"Low stock",value:lowStockCount,unit:"count",availability:"value",sourceModule:"business-ops",evidenceIds:[]}
      ];
    },
    async getAttention(ctx){
      const [taskRows,actionRows,approvalRows]=await Promise.all([tasks.list(ctx),actions.listOpen(ctx),approvals.listPending(ctx)]);
      const taskActions=taskRows.filter((row:any)=>row.status!=="done"&&(row.priority==="high"||row.priority==="critical")).map((row:any)=>derivedTaskAction(ctx,row));
      const approvalActions:BusinessActionItem[]=approvalRows.map((row:any)=>({
        id:"approval:"+row.id,
        tenantId:ctx.tenantId,
        workspaceId:ctx.workspaceId,
        sourceModule:"agent-governance",
        entity:{type:"approval",id:row.id},
        title:"Approval required: "+row.action,
        description:"A governed action is waiting for human approval.",
        severity:row.risk==="critical"||row.risk==="high"?"critical":"warning",
        businessImpact:"The action will remain paused until an authorized human decides.",
        evidenceIds:[],
        recommendedAction:"Review approval",
        risk:String(row.risk),
        approvalPolicy:"approval_required",
        status:"waiting_approval",
        createdAt:new Date(row.requested_at).toISOString()
      }));
      return[...actionRows,...taskActions,...approvalActions];
    },
    async getHandled(){return[];},
    async getUpcoming(ctx){
      const [rows,appointmentRows]=await Promise.all([tasks.list(ctx),appointments.list(ctx,100)]);const now=Date.now();
      const taskItems=rows.filter((row:any)=>row.status!=="done"&&row.due_at&&new Date(row.due_at).getTime()>=now)
        .map((row:any)=>({id:"task:"+row.id,title:row.title,sourceModule:"tasks",dueAt:new Date(row.due_at).toISOString()}));
      const appointmentItems=appointmentRows.filter(row=>["scheduled","confirmed"].includes(row.status)&&new Date(row.startsAt).getTime()>=now)
        .map(row=>({id:"appointment:"+row.id,title:row.title,sourceModule:"business-ops",dueAt:row.startsAt}));
      return[...taskItems,...appointmentItems].sort((a,b)=>a.dueAt.localeCompare(b.dueAt)).slice(0,20);
    }
  };
}
