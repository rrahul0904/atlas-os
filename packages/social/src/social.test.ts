import test from'node:test';import assert from'node:assert/strict';import{runSocialWorkflow}from'./index.js';
test('social publishing requires approval',async()=>assert.equal((await runSocialWorkflow('c','w')).status,'waiting_approval'));
