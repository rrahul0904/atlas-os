import test from"node:test";import assert from"node:assert/strict";import{quotePricing,businessHealth}from"./index.js";
test("generic business operations keeps deterministic quote math",()=>{const q=quotePricing({laborHours:10,laborRate:100,materialCost:500,materialMarkupPct:20,overheadPct:10,targetMarginPct:25});assert.equal(q.quotedTotal,2346.67);});
test("business health is bounded",()=>{assert.ok(businessHealth({grossMarginPct:40,closeRatePct:60,collectionRatePct:100,resourceUtilizationPct:80,rating:4.8})<=100);});
