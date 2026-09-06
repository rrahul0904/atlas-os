import test from "node:test";
import assert from "node:assert/strict";
import {canManageBilling,canViewBilling} from "./billing-permissions.js";

test("billing is restricted to workspace admins and owners",()=>{
  assert.equal(canViewBilling("owner"),true);
  assert.equal(canManageBilling("admin"),true);
  assert.equal(canViewBilling("operator"),false);
  assert.equal(canManageBilling("viewer"),false);
});
