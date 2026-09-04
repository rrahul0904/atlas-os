import type {AtlasSql} from "../../db/src/index.js";
import type {BusinessActionItem,ActionSeverity} from "../../action-center/src/index.js";
import {ActionItemRepository,TaskRepository,ApprovalRepository} from "../../repositories/src/index.js";

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
  return{
    moduleId:"core",
    async getMetrics(ctx){
      const [taskRows,approvalRows,actionRows]=await Promise.all([tasks.list(ctx),approvals.listPending(ctx),actions.listOpen(ctx)]);
      return[
        {id:"open-tasks",label:"Open tasks",value:taskRows.filter((r:any)=>r.status!=="done").length,unit:"count",availability:"value",sourceModule:"tasks",evidenceIds:[]},
        {id:"pending-approvals",label:"Pending approvals",value:approvalRows.length,unit:"count",availability:"value",sourceModule:"agent-governance",evidenceIds:[]},
        {id:"open-actions",label:"Needs attention",value:actionRows.length,unit:"count",availability:"value",sourceModule:"today",evidenceIds:[]}
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
      const rows=await tasks.list(ctx);const now=Date.now();
      return rows.filter((row:any)=>row.status!=="done"&&row.due_at&&new Date(row.due_at).getTime()>=now)
        .slice(0,20)
        .map((row:any)=>({id:"task:"+row.id,title:row.title,sourceModule:"tasks",dueAt:new Date(row.due_at).toISOString()}));
    }
  };
}
