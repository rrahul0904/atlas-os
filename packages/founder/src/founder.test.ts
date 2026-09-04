import test from "node:test";import assert from "node:assert/strict";import{createFounderProject,advanceProject}from"./index.js";
test("founder lifecycle preserves readiness semantics",()=>{const p=createFounderProject("w1","AI operating system for solo founders");const next=advanceProject(p,"evidence","evidence");assert.equal(next.readiness,34);assert.equal(next.workspaceId,"w1");});
