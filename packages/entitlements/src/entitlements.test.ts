import test from"node:test";
import assert from"node:assert/strict";
import{billingStatusAllowsAccess,intersectBillingEnabledModules,intersectEnabledModules,moduleEntitled,moduleEntitledForBilling,resolveBillingEntitlements}from"./index.js";

test("solo plan cannot silently enable executive module",()=>assert.equal(moduleEntitled("solo","executive"),false));
test("requested modules are intersected with plan",()=>assert.equal(intersectEnabledModules("solo",["today","executive"]).join(","),"today"));
test("canceled billing fails closed even for otherwise entitled modules",()=>{
  assert.equal(billingStatusAllowsAccess("canceled"),false);
  assert.equal(moduleEntitledForBilling("business","canceled","today"),false);
  assert.equal(intersectBillingEnabledModules("business","canceled",["today","growth"]).length,0);
});
test("past due keeps recovery access while plan limits remain server derived",()=>{
  const solo=resolveBillingEntitlements("solo","past_due");
  const business=resolveBillingEntitlements("business","active");
  assert.equal(solo.access,true);
  assert.ok(business.maxAgents>solo.maxAgents);
  assert.ok(business.maxIntegrations>solo.maxIntegrations);
});
