import test from"node:test";import assert from"node:assert/strict";import{assertRecordScope,workspaceWhere}from"./index.js";
test("record scope rejects another tenant",()=>assert.throws(()=>assertRecordScope("t1","w1",{tenantId:"t2",workspaceId:"w1"})));
test("workspace query scope is mandatory",()=>assert.throws(()=>workspaceWhere("","w1")));
