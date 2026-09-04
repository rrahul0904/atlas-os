import test from "node:test";
import assert from "node:assert/strict";
import {canViewIntegrations,canManageIntegrations} from "./integration-permissions.js";

test("integration read access is operator or higher",()=>{
  assert.equal(canViewIntegrations("owner"),true);
  assert.equal(canViewIntegrations("admin"),true);
  assert.equal(canViewIntegrations("operator"),true);
  assert.equal(canViewIntegrations("member"),false);
  assert.equal(canViewIntegrations("viewer"),false);
});

test("integration mutation access is admin or owner only",()=>{
  assert.equal(canManageIntegrations("owner"),true);
  assert.equal(canManageIntegrations("admin"),true);
  assert.equal(canManageIntegrations("operator"),false);
  assert.equal(canManageIntegrations("member"),false);
  assert.equal(canManageIntegrations("viewer"),false);
});
