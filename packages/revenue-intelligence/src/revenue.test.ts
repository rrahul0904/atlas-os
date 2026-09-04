import test from"node:test";import assert from"node:assert/strict";import{calculateLeadScore,scoreBand}from"./index.js";
test("intent score uses canonical weighted model",()=>{const score=calculateLeadScore({problemMatch:100,buyingIntent:100,productFit:100,switchingIntent:100,urgency:100,freshness:100});assert.equal(score,100);assert.equal(scoreBand(score),"hot");});
