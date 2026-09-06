import test from "node:test";
import assert from "node:assert/strict";
import {classifyAtlasQuestion,answerAtlas} from "./index.js";
import type {WorkspaceContext} from "../../context/src/index.js";

const context:WorkspaceContext={
  principal:{userId:"u",tenantId:"t",workspaceId:"w",role:"owner",scopes:["*"]},
  workspace:{id:"w",tenantId:"t",name:"Acme",verticalId:"founder",planId:"business",billingStatus:"trialing",trialEndsAt:null},
  modules:["today"],
  evidence:[{id:"e1",tenantId:"t",workspaceId:"w",sourceType:"metric",sourceId:"conversion",claim:"Checkout conversion dropped from 4.1% to 3.2%",confidence:.99,metadata:{},observedAt:"2026-01-01T00:00:00Z"}],
  actions:[{id:"a1",tenantId:"t",workspaceId:"w",sourceModule:"revenue-intelligence",title:"Checkout conversion dropped",description:"",severity:"critical",businessImpact:"Revenue is at risk.",evidenceIds:["e1"],recommendedAction:"Inspect checkout deployment",risk:"lost revenue",approvalPolicy:"human",status:"open",createdAt:"2026-01-01T00:00:00Z"}],
  tasks:[],approvals:[],events:[],business:{contacts:[],leads:[],opportunities:[],appointments:[],invoices:[],inventory:[]},resolvedAt:"2026-01-01T00:00:00Z"
};

test("question classifier recognizes revenue questions",()=>assert.equal(classifyAtlasQuestion("Why did revenue drop?"),"revenue_change"));
test("next action answer cites stored evidence",()=>{
  const answer=answerAtlas(context,"What should I work on next?");
  assert.equal(answer.actionIds[0],"a1");
  assert.equal(answer.evidence[0].id,"e1");
});
test("unknown revenue cause fails honestly without evidence",()=>{
  const empty={...context,evidence:[],actions:[]};
  assert.ok(answerAtlas(empty,"Why did revenue fall?").answer.includes("do not have enough"));
});

test("appointment question uses native scoped appointment state",()=>{
  const withAppointment={...context,business:{...context.business,appointments:[{id:"apt1",status:"scheduled"}]}};
  const answer=answerAtlas(withAppointment as WorkspaceContext,"Which appointments are unconfirmed?");
  assert.ok(answer.answer.includes("1 scheduled appointments"));
});
