import test from "node:test";import assert from "node:assert/strict";import{renderConnectedTodayView}from"./connected-today.js";
test("connected Today renders real snapshot and Ask Atlas",()=>{
  const html=renderConnectedTodayView({workspaceName:"Acme",verticalId:"founder",planId:"business",billingStatus:"trialing",trialEndsAt:null,modules:["today"],today:{metrics:[{id:"m",label:"Open tasks",value:2,availability:"value",sourceModule:"tasks",evidenceIds:[]}],attention:[],decisions:[],handled:[],upcoming:[],generatedAt:"2026-01-01T00:00:00Z"}});
  assert.ok(html.includes("Open tasks"));assert.ok(html.includes("Ask a grounded question"));assert.ok(html.includes("/api/atlas/ask"));
});
