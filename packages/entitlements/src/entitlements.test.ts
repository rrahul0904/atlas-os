import test from"node:test";import assert from"node:assert/strict";import{moduleEntitled,intersectEnabledModules}from"./index.js";
test("solo plan cannot silently enable executive module",()=>assert.equal(moduleEntitled("solo","executive"),false));
test("requested modules are intersected with plan",()=>assert.equal(intersectEnabledModules("solo",["today","executive"]).join(","),"today"));
