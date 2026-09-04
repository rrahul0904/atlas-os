import test from"node:test";import assert from"node:assert/strict";import{calculateEvm,assessHealth}from"./index.js";
test("EVM remains deterministic",()=>{const x=calculateEvm({bac:100,pv:50,ev:40,ac:50});assert.equal(x.cpi,.8);assert.equal(x.spi,.8);});
test("assessed health detects status conflict",()=>{const h=assessHealth({cpi:.8,spi:.8,negativeFloatDays:-5,riskExposure:90,contingency:100,p80SlipDays:20,reportedStatus:"green"});assert.equal(h.conflict,true);assert.equal(h.assessedStatus,"red");});
