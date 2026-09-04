import test from "node:test";
import assert from "node:assert/strict";
import {authorizeAgentAction,type PolicyRule,type ToolDefinition} from "./index.js";
const tool:ToolDefinition={id:"mail.send",name:"mail.send",connector:"gmail",action:"send",description:"send",isWrite:true,reversible:false,risk:"medium",scopes:["mail:send"],dataClasses:["internal"],costUnits:1,enabled:true};
const identity={workspaceId:"w1",userId:"u1",sessionId:"s1",delegatedScopes:["mail:send"],role:"owner"};
test("write defaults to approval when no rule matches",()=>{
  const result=authorizeAgentAction([],{id:"r1",tool,identity,dataClasses:["internal"],estimatedCostUnits:1});
  assert.equal(result.approvalRequired,true);
});
test("deny outranks allow",()=>{
  const rules:PolicyRule[]=[
    {id:"a",workspaceId:"w1",name:"allow",priority:1,effect:"allow",enabled:true,match:{tools:["mail.send"]}},
    {id:"d",workspaceId:"w1",name:"deny",priority:1,effect:"deny",enabled:true,match:{risks:["medium"]}}
  ];
  const result=authorizeAgentAction(rules,{id:"r2",tool,identity,dataClasses:["internal"],estimatedCostUnits:1});
  assert.equal(result.decision.effect,"deny");
});
