import type {AtlasSql} from "../../db/src/index.js";
import {AgentRepository,type StoredAgent} from "../../repositories/src/index.js";

export interface DefaultAgentTemplate{
  name:string;
  moduleId:string;
  description:string;
  tools:string[];
  scopes:string[];
  costBudgetDaily:number;
}

const templates:Record<string,DefaultAgentTemplate[]>={
  founder:[
    {name:"Founder Intelligence Agent",moduleId:"founder",description:"Synthesizes founder evidence and proposes evidence-backed next actions.",tools:["atlas.task.draft"],scopes:["today:read","founder:read"],costBudgetDaily:5},
    {name:"Revenue Agent",moduleId:"revenue-intelligence",description:"Monitors revenue intent and prepares governed follow-up actions.",tools:["atlas.task.draft","crm.followup"],scopes:["revenue:read","revenue:write"],costBudgetDaily:10},
    {name:"Growth Agent",moduleId:"growth",description:"Analyzes growth evidence and proposes campaign actions.",tools:["atlas.task.draft"],scopes:["growth:read","growth:write"],costBudgetDaily:10},
    {name:"Launch Agent",moduleId:"launch",description:"Coordinates launch tasks and distribution actions.",tools:["atlas.task.draft"],scopes:["launch:read","launch:write"],costBudgetDaily:10}
  ],
  ceo:[
    {name:"Executive Agent",moduleId:"executive",description:"Builds executive health and decision evidence.",tools:["atlas.task.draft"],scopes:["executive:read"],costBudgetDaily:10},
    {name:"Program Risk Agent",moduleId:"executive",description:"Detects program health conflicts and escalates risk.",tools:["atlas.task.draft"],scopes:["executive:read"],costBudgetDaily:8},
    {name:"Revenue Agent",moduleId:"revenue-intelligence",description:"Surfaces revenue opportunities and risks.",tools:["atlas.task.draft","crm.followup"],scopes:["revenue:read","revenue:write"],costBudgetDaily:10}
  ],
  dental:[
    {name:"Dental Front Desk Agent",moduleId:"business-ops",description:"Coordinates appointment and front-desk operational work.",tools:["atlas.task.draft","calendar.update","message.send"],scopes:["business:read","business:write"],costBudgetDaily:8},
    {name:"Recall Agent",moduleId:"business-ops",description:"Prepares governed recall outreach.",tools:["atlas.task.draft","message.send"],scopes:["business:read","business:write"],costBudgetDaily:5},
    {name:"Collections Agent",moduleId:"business-ops",description:"Prepares collection follow-ups without autonomous financial changes.",tools:["atlas.task.draft","message.send"],scopes:["business:read","business:write"],costBudgetDaily:5},
    {name:"Inventory Agent",moduleId:"business-ops",description:"Monitors stock and proposes reorder actions.",tools:["atlas.task.draft","vendor.notify"],scopes:["business:read","business:write"],costBudgetDaily:5},
    {name:"Review Agent",moduleId:"business-ops",description:"Drafts review responses for approval.",tools:["atlas.task.draft","review.publish"],scopes:["business:read","business:write"],costBudgetDaily:5}
  ],
  contractor:[
    {name:"Dispatch Agent",moduleId:"business-ops",description:"Coordinates dispatch and crew work.",tools:["atlas.task.draft","calendar.update"],scopes:["business:read","business:write"],costBudgetDaily:5},
    {name:"Estimate Agent",moduleId:"business-ops",description:"Prepares estimate follow-up and margin tasks.",tools:["atlas.task.draft","message.send"],scopes:["business:read","business:write"],costBudgetDaily:5},
    {name:"Collections Agent",moduleId:"business-ops",description:"Prepares governed invoice collection actions.",tools:["atlas.task.draft","message.send"],scopes:["business:read","business:write"],costBudgetDaily:5},
    {name:"Review Agent",moduleId:"business-ops",description:"Drafts customer review requests.",tools:["atlas.task.draft","message.send"],scopes:["business:read","business:write"],costBudgetDaily:5}
  ],
  agency:[
    {name:"Client Health Agent",moduleId:"business-ops",description:"Monitors client health and proposes interventions.",tools:["atlas.task.draft"],scopes:["business:read","business:write"],costBudgetDaily:8},
    {name:"Growth Agent",moduleId:"growth",description:"Analyzes growth and campaign evidence.",tools:["atlas.task.draft"],scopes:["growth:read","growth:write"],costBudgetDaily:10},
    {name:"Social Agent",moduleId:"social",description:"Prepares governed social publishing work.",tools:["atlas.task.draft","social.publish"],scopes:["social:read","social:write"],costBudgetDaily:10},
    {name:"Launch Agent",moduleId:"launch",description:"Coordinates launch distribution.",tools:["atlas.task.draft"],scopes:["launch:read","launch:write"],costBudgetDaily:10},
    {name:"Outbound Agent",moduleId:"outbound",description:"Coordinates safe outbound actions.",tools:["atlas.task.draft","message.send"],scopes:["outbound:read","outbound:write"],costBudgetDaily:10}
  ]
};

export function defaultAgentTemplates(verticalId:string,enabledModules:string[]):DefaultAgentTemplate[]{
  const enabled=new Set(enabledModules);
  return (templates[verticalId]??[]).filter(template=>enabled.has(template.moduleId)||template.moduleId==="business-ops");
}

export async function seedDefaultAgents(sql:AtlasSql,scope:{tenantId:string;workspaceId:string},verticalId:string,enabledModules:string[]):Promise<StoredAgent[]>{
  const repository=new AgentRepository(sql);
  const existing=await repository.list(scope);
  const existingNames=new Set(existing.map(agent=>agent.name));
  for(const template of defaultAgentTemplates(verticalId,enabledModules)){
    if(existingNames.has(template.name))continue;
    await repository.create(scope,{
      name:template.name,
      moduleId:template.moduleId,
      description:template.description,
      tools:template.tools,
      scopes:template.scopes,
      riskPolicy:{source:"vertical-default"},
      costBudgetDaily:template.costBudgetDaily,
      memoryScope:"workspace",
      enabled:true
    });
  }
  return repository.list(scope);
}
