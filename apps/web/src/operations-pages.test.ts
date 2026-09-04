import test from "node:test";
import assert from "node:assert/strict";
import {renderAgentsPage,renderApprovalsPage,renderWorkflowsPage} from "./operations-pages.js";

test("agents page exposes persisted controls",()=>{
  const html=renderAgentsPage({workspaceName:"Acme",canManage:true,agents:[{id:"a",name:"Revenue Agent",description:"Revenue",moduleId:"revenue-intelligence",enabled:true,tools:["message.send"],scopes:["revenue:write"],costBudgetDaily:10,modelPreference:null}]});
  assert.ok(html.includes("Revenue Agent"));
  assert.ok(html.includes("/app/agents/a/toggle"));
});

test("approvals page exposes approve and reject actions",()=>{
  const html=renderApprovalsPage({workspaceName:"Acme",approvals:[{id:"p",action:"send",risk:"high",business_reason:"Customer follow-up",workflow_run_id:"r",workflow_step_id:"s"}]});
  assert.ok(html.includes("/app/approvals/p/approve"));
  assert.ok(html.includes("/app/approvals/p/reject"));
});

test("workflow page shows durable run status",()=>{
  const html=renderWorkflowsPage({workspaceName:"Acme",definitions:[{id:"w",name:"Follow up",trigger_type:"manual"}],runs:[{id:"r",workflowId:"w",status:"waiting_approval",currentStepIndex:1,initiatedBy:"u",startedAt:null,finishedAt:null,attemptCount:0,lastError:null}]});
  assert.ok(html.includes("waiting_approval"));
  assert.ok(html.includes("Follow up"));
});
