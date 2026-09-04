import test from"node:test";import assert from"node:assert/strict";import{renderDemo,renderIndex}from"./render.js";
test("index exposes all five vertical demos",()=>{const html=renderIndex();for(const id of["founder","ceo","dental","contractor","agency"])assert.ok(html.includes(`/demo/${id}`))});
test("dental demo uses vertical terminology and action center",()=>{const html=renderDemo("dental");assert.ok(html.includes("Dental OS"));assert.ok(html.includes("Appointments"));assert.ok(html.includes("Needs your attention"))});
test("founder demo exposes governed agent state",()=>{const html=renderDemo("founder");assert.ok(html.includes("Agents governed"));assert.ok(html.includes("Checkout conversion dropped"))});
