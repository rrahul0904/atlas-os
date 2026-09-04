import test from 'node:test'; import assert from 'node:assert/strict';
import {opportunityScore,budgetRecommendation,calculateAttribution} from './index.js';
test('growth opportunity score preserves canonical model',()=>assert.equal(opportunityScore(100,100,0),100));
test('budget guardrail requires enough conversions',()=>assert.equal(budgetRecommendation({current:100,cpa:10,targetCpa:20,conversions:2}),100));
test('last touch attribution assigns purchase revenue',()=>{const e=[{id:'c',type:'click' as const,userId:'u',campaignId:'camp',occurredAt:'2026-01-01T00:00:00Z'},{id:'p',type:'purchase' as const,userId:'u',value:50,occurredAt:'2026-01-01T01:00:00Z'}];const c=calculateAttribution(e,'last_touch');assert.equal(c[0].campaignId,'camp');assert.equal(c[0].revenue,50)});
