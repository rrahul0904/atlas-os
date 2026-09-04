import test from "node:test";
import assert from "node:assert/strict";
import {requireWorkspaceAccess,roleAtLeast,type TenantPrincipal} from "./index.js";

const principal:TenantPrincipal={userId:"u1",tenantId:"t1",workspaceId:"w1",role:"admin",scopes:["*"]};

test("tenant guard rejects cross-tenant access",()=>{
  assert.throws(()=>requireWorkspaceAccess(principal,"t2","w1"));
});

test("workspace guard rejects cross-workspace access",()=>{
  assert.throws(()=>requireWorkspaceAccess(principal,"t1","w2"));
});

test("role hierarchy is deterministic",()=>{
  assert.equal(roleAtLeast("admin","operator"),true);
  assert.equal(roleAtLeast("viewer","member"),false);
});

test("viewer cannot mutate operator-level workspace state",()=>{
  const viewer:TenantPrincipal={...principal,role:"viewer"};
  assert.throws(()=>requireWorkspaceAccess(viewer,"t1","w1","operator"));
});

test("operator cannot administer workspace",()=>{
  const operator:TenantPrincipal={...principal,role:"operator"};
  assert.throws(()=>requireWorkspaceAccess(operator,"t1","w1","admin"));
});

test("admin cannot override owner-only controls",()=>{
  const admin:TenantPrincipal={...principal,role:"admin"};
  assert.throws(()=>requireWorkspaceAccess(admin,"t1","w1","owner"));
});
