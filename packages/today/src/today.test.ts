import test from "node:test";
import assert from "node:assert/strict";
import {buildToday,type TodayProvider} from "./index.js";

const provider:TodayProvider={
  moduleId:"test",
  async getMetrics(){return[{id:"m",label:"Metric",value:1,availability:"value",sourceModule:"test",evidenceIds:[]}]},
  async getAttention(ctx){return[
    {id:"low",tenantId:ctx.tenantId,workspaceId:ctx.workspaceId,sourceModule:"test",title:"Info",description:"",severity:"info",businessImpact:"",evidenceIds:[],recommendedAction:"",risk:"",approvalPolicy:"human",status:"open",createdAt:"2026-01-01T00:00:00Z"},
    {id:"high",tenantId:ctx.tenantId,workspaceId:ctx.workspaceId,sourceModule:"test",title:"Critical",description:"",severity:"critical",businessImpact:"",evidenceIds:[],recommendedAction:"",risk:"",approvalPolicy:"approval_required",status:"waiting_approval",createdAt:"2026-01-02T00:00:00Z"}
  ]},
  async getHandled(){return[]},
  async getUpcoming(){return[]}
};

test("Today aggregates providers and prioritizes critical work",async()=>{
  const today=await buildToday({tenantId:"t",workspaceId:"w"},[provider]);
  assert.equal(today.attention[0].id,"high");
  assert.equal(today.decisions.length,1);
  assert.equal(today.metrics[0].value,1);
});
