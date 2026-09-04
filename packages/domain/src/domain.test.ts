import test from "node:test";
import assert from "node:assert/strict";
import type { AtlasEvent } from "./index.js";

test("AtlasEvent preserves tenant/workspace/module identity", () => {
  const event:AtlasEvent={id:"evt-1",tenantId:"t1",workspaceId:"w1",module:"revenue-intelligence",type:"opportunity.scored",occurredAt:new Date(0).toISOString(),properties:{score:91}};
  assert.equal(event.workspaceId,"w1");
  assert.equal(event.properties.score,91);
});
