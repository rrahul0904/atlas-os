import test from "node:test";import assert from "node:assert/strict";import{requireWorkspaceAccess,roleAtLeast,type TenantPrincipal}from"./index.js";
const principal:TenantPrincipal={userId:"u1",tenantId:"t1",workspaceId:"w1",role:"admin",scopes:["*"]};
test("tenant guard rejects cross-tenant access",()=>assert.throws(()=>requireWorkspaceAccess(principal,"t2","w1")));
test("role hierarchy is deterministic",()=>{assert.equal(roleAtLeast("admin","operator"),true);assert.equal(roleAtLeast("viewer","member"),false);});
