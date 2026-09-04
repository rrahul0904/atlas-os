import {resetRegistry,listModules,listVerticals} from"../../../packages/module-registry/src/index.js";
import {registerAtlasModules,registerAtlasVerticals} from"../../../packages/module-registry/src/catalog.js";
import {createFounderProject,advanceProject} from"../../../packages/founder/src/index.js";
import {businessHealth} from"../../../packages/business-ops/src/index.js";
import {calculateEvm,assessHealth} from"../../../packages/executive/src/index.js";
import {calculateLeadScore,scoreBand} from"../../../packages/revenue-intelligence/src/index.js";
import {buildTodayBrief} from"../../../packages/action-center/src/index.js";
import {authorizeAgentAction,type ToolDefinition} from"../../../packages/agent-governance/src/index.js";

resetRegistry();registerAtlasModules();registerAtlasVerticals();
const founder=advanceProject(createFounderProject("workspace-founder","AI company operating system"),"evidence","10 interviews complete");
const health=businessHealth({grossMarginPct:38,closeRatePct:52,collectionRatePct:91,resourceUtilizationPct:76,rating:4.7});
const evm=calculateEvm({bac:500000,pv:220000,ev:190000,ac:205000});
const executive=assessHealth({cpi:evm.cpi,spi:evm.spi,negativeFloatDays:-4,riskExposure:68000,contingency:80000,p80SlipDays:14,reportedStatus:"green"});
const leadScore=calculateLeadScore({problemMatch:95,buyingIntent:90,productFit:88,switchingIntent:72,urgency:85,freshness:100});
const tool:ToolDefinition={id:"crm.followup",name:"crm.followup",connector:"crm",action:"send_followup",description:"Send a customer follow-up",isWrite:true,reversible:false,risk:"medium",scopes:["crm:write"],dataClasses:["internal"],costUnits:1,enabled:true};
const governed=authorizeAgentAction([],{id:"action-1",tool,identity:{workspaceId:"workspace-founder",userId:"owner",sessionId:"demo",delegatedScopes:["crm:write"],role:"owner"},dataClasses:["internal"],estimatedCostUnits:1});
const brief=buildTodayBrief({businessHealth:health,aiHandled:["Classified 47 leads","Prepared portfolio health brief"],upcoming:["Founder evidence review · 2 PM"],items:[{id:"program-risk",title:"Program health conflicts with reported green",whyItMatters:"Deterministic EVM and schedule evidence assess the program as amber/red.",severity:"critical",risk:"Delivery forecast may be understated",recommendedAction:"Review steering evidence",mode:"human",evidence:[{label:"Health score",value:executive.score,source:"executive"}]},{id:"hot-lead",title:`Hot revenue opportunity (${leadScore})`,whyItMatters:"Evidence-backed intent score is above the hot threshold.",severity:"info",risk:"Opportunity could go stale",recommendedAction:"Draft follow-up",mode:governed.approvalRequired?"approval_required":"auto",evidence:[{label:"Intent band",value:scoreBand(leadScore),source:"revenue-intelligence"}]}]});

console.log(JSON.stringify({product:"AtlasOS",loop:"Observe → Understand → Decide → Act → Automate → Learn",founder:{project:founder.name,stage:founder.stage,readiness:founder.readiness},modules:listModules().map(x=>({id:x.id,state:x.state,source:x.sourceRepository})),verticals:listVerticals().map(x=>({id:x.id,modules:x.modules})),today:brief,governance:governed},null,2));
