import test from "node:test";
import assert from "node:assert/strict";
import {authorizeWithApprovalMode,type ToolDefinition} from "./index.js";

const base:ToolDefinition={
  id:"message.send",name:"message.send",connector:"simulation",action:"send",description:"Send message",
  isWrite:true,reversible:false,risk:"medium",scopes:["business:write"],dataClasses:["internal"],costUnits:1,enabled:true
};
const identity={workspaceId:"w",userId:"u",agentId:"a",sessionId:"s",delegatedScopes:["business:write"],role:"agent"};

test("balanced mode requires approval for low-risk writes",()=>{
  const result=authorizeWithApprovalMode("BALANCED",[],{id:"r",tool:{...base,actionClass:"LOW_RISK_WRITE"},identity,dataClasses:["internal"],estimatedCostUnits:1});
  assert.equal(result.decision.effect,"approval_required");
});

test("safe autopilot can allow classified low-risk writes",()=>{
  const result=authorizeWithApprovalMode("SAFE_AUTOPILOT",[],{id:"r",tool:{...base,actionClass:"LOW_RISK_WRITE"},identity,dataClasses:["internal"],estimatedCostUnits:1});
  assert.equal(result.decision.effect,"allow");
});

test("high-risk writes always require approval",()=>{
  const result=authorizeWithApprovalMode("SAFE_AUTOPILOT",[],{id:"r",tool:{...base,risk:"high",actionClass:"HIGH_RISK_WRITE"},identity,dataClasses:["internal"],estimatedCostUnits:1});
  assert.equal(result.decision.effect,"approval_required");
});

test("forbidden tools are denied in every mode",()=>{
  const result=authorizeWithApprovalMode("SAFE_AUTOPILOT",[],{id:"r",tool:{...base,actionClass:"FORBIDDEN"},identity,dataClasses:["internal"],estimatedCostUnits:1});
  assert.equal(result.decision.effect,"deny");
});
