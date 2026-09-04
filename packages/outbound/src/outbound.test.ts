import test from "node:test";
import assert from "node:assert/strict";
import {canSend} from "./index.js";

test("outbound respects domain safety capacity",()=>{
  const result=canSend({
    id:"d",workspaceId:"w",domain:"example.com",status:"ready",
    healthScore:95,safeDailyCapacity:100,sendingEnabled:true
  },120);
  assert.equal(result.allowed,false);
});
