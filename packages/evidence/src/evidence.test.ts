import test from "node:test";
import assert from "node:assert/strict";
import {normalizeConfidence,evidenceSummary,type EvidenceRecord} from "./index.js";

test("confidence is clamped to a safe range",()=>{
  assert.equal(normalizeConfidence(1.5),1);
  assert.equal(normalizeConfidence(-1),0);
});

test("evidence summary ranks stronger evidence first",()=>{
  const rows:EvidenceRecord[]=[
    {id:"a",tenantId:"t",workspaceId:"w",sourceType:"metric",sourceId:"1",claim:"weak",confidence:.4,metadata:{},observedAt:"2026-01-01T00:00:00Z"},
    {id:"b",tenantId:"t",workspaceId:"w",sourceType:"metric",sourceId:"2",claim:"strong",confidence:.9,metadata:{},observedAt:"2026-01-01T00:00:00Z"}
  ];
  assert.equal(evidenceSummary(rows)[0].id,"b");
});
