import test from 'node:test';import assert from 'node:assert/strict';import{executeWorkflow}from'./index.js';
test('workflow pauses at approval',async()=>{const r=await executeWorkflow({id:'w',name:'w',trigger:'manual',enabled:true,steps:[{id:'a',kind:'approval',name:'Approve'}]},{workspaceId:'x',initiatedBy:'u'});assert.equal(r.status,'waiting_approval')});
