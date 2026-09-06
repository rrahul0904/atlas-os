import test from "node:test";
import assert from "node:assert/strict";
import {renderBillingPage} from "./billing-page.js";

test("billing page renders provider truth and never server secrets",()=>{
  const html=renderBillingPage({workspaceName:"Acme",canManage:true,stripeConfigured:true,usage:[{metric:"workflow_runs",quantity:7}],billing:{
    tenantId:"t",workspaceId:"w",provider:"stripe",customerRef:"cus_safe",subscriptionRef:"sub_safe",status:"active",planId:"business",priceRef:"price_safe",currentPeriodEnd:"2026-10-01T00:00:00Z",cancelAtPeriodEnd:false,trialEndsAt:null,lastInvoiceRef:null,lastPaymentAt:null,lastWebhookAt:null,subscriptionEventCreatedAt:null,createdAt:"2026-09-01T00:00:00Z",updatedAt:"2026-09-01T00:00:00Z"
  }});
  assert.ok(html.includes("Billing &amp; usage")||html.includes("Billing & usage"));
  assert.ok(html.includes("Business"));
  assert.ok(html.includes("workflow runs"));
  assert.ok(html.includes("/app/settings/billing/portal"));
  assert.equal(html.includes("whsec_"),false);
  assert.equal(html.includes("rk_test_"),false);
});

test("billing page is read only when Stripe is not configured",()=>{
  const html=renderBillingPage({workspaceName:"Acme",billing:null,usage:[],canManage:true,stripeConfigured:false});
  assert.ok(html.includes("read-only"));
  assert.equal(html.includes("Choose plan"),false);
});
