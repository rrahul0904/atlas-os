import test from "node:test";
import assert from "node:assert/strict";
import {deriveAtlasActivity} from "./index.js";
import type {WorkspaceContext} from "../../context/src/index.js";

const base:WorkspaceContext={
  principal:{userId:"u",tenantId:"t",workspaceId:"w",role:"owner",scopes:["*"]},
  workspace:{id:"w",tenantId:"t",name:"Bakery",verticalId:"bakery",planId:"business",billingStatus:"active",trialEndsAt:null},
  modules:["today"],evidence:[],actions:[],tasks:[],approvals:[],events:[],
  business:{contacts:[],leads:[],opportunities:[],appointments:[],locations:[],resources:[],bookings:[],catalogItems:[],orders:[],fulfillments:[],invoices:[],inventory:[]},
  resolvedAt:"2026-09-07T00:00:00Z"
};

test("activity projection keeps non-geographic business activity visible",()=>{
  const context={...base,business:{...base.business,inventory:[{id:"flour",name:"Flour",quantityOnHand:2,reorderPoint:5,updatedAt:"2026-09-07T00:00:00Z"}]}} as WorkspaceContext;
  const rows=deriveAtlasActivity(context);
  assert.equal(rows[0].category,"inventory");
  assert.equal(rows[0].latitude,null);
  assert.equal(rows[0].longitude,null);
});

test("activity uses coordinates only from known scoped locations",()=>{
  const context={...base,business:{...base.business,
    locations:[{id:"loc",address:{latitude:40.7,longitude:-74}}],
    bookings:[{id:"b",title:"Pickup",bookingType:"pickup",status:"confirmed",locationId:"loc",startsAt:"2026-09-08T00:00:00Z",updatedAt:"2026-09-07T00:00:00Z"}]
  }} as WorkspaceContext;
  const row=deriveAtlasActivity(context).find(x=>x.id==="booking:b");
  assert.equal(row?.latitude,40.7);
  assert.equal(row?.longitude,-74);
});

test("activity never changes workspace scope",()=>{
  const context={...base,events:[{id:"e",module:"workflow",type:"workflow.completed",properties:{},occurred_at:"2026-09-07T00:00:00Z"}]} as WorkspaceContext;
  const row=deriveAtlasActivity(context)[0];
  assert.equal(row.tenantId,"t");
  assert.equal(row.workspaceId,"w");
});
