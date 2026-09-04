import test from "node:test";
import assert from "node:assert/strict";
import {assertActionAllowed,type AtlasIntegration} from "./index.js";

const integration:AtlasIntegration={
  id:"x",
  name:"X",
  actions:[{id:"read",name:"Read",write:false,risk:"low",requiredScopes:[]}],
  async health(){return {state:"connected",checkedAt:new Date().toISOString()};}
};

test("integration sdk rejects unknown actions",()=>{
  assert.throws(()=>assertActionAllowed(integration,"write"));
});
