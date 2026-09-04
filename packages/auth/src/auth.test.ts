import test from "node:test";
import assert from "node:assert/strict";
import {createSession,verifySession} from "./index.js";

const secret="a".repeat(48);
const principal={userId:"u1",tenantId:"t1",workspaceId:"w1",role:"owner" as const,scopes:["*"]};

test("session round-trips tenant identity",()=>{
  const token=createSession(principal,secret,60,100);
  assert.equal(verifySession(token,secret,120)?.workspaceId,"w1");
});

test("expired sessions fail closed",()=>{
  const token=createSession(principal,secret,10,100);
  assert.equal(verifySession(token,secret,111),null);
});

test("tampered sessions fail closed",()=>{
  const token=createSession(principal,secret,60,100);
  const [payload,signature]=token.split(".");
  const tamperedPayload=payload.slice(0,-1)+(payload.endsWith("A")?"B":"A");
  assert.equal(verifySession(`${tamperedPayload}.${signature}`,secret,120),null);
});

test("session signed with another secret fails closed",()=>{
  const token=createSession(principal,secret,60,100);
  assert.equal(verifySession(token,"b".repeat(48),120),null);
});
