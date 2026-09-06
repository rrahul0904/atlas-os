import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {db,closeDb} from "../../db/src/index.js";
import {BillingEventRepository,BillingRepository,CheckoutSessionRepository,UsageRepository,UserRepository,provisionWorkspace} from "./index.js";

test("Stripe billing repositories enforce scope, idempotency, and failed-event retry",async()=>{
  if(!process.env.DATABASE_URL)return;
  const sql=db();const users=new UserRepository(sql);
  const user=await users.create({email:`billing-${randomUUID()}@example.test`,passwordHash:"test-hash"});
  const provisioned=await provisionWorkspace(sql,{userId:user.id,workspaceName:`Billing ${randomUUID().slice(0,8)}`,verticalId:"founder",moduleIds:["today"],planId:"business"});
  const scope={tenantId:provisioned.tenantId,workspaceId:provisioned.workspaceId};
  const billing=new BillingRepository(sql);
  const account=await billing.findScoped(scope);
  assert.equal(account?.status,"trialing");assert.equal(account?.planId,"business");assert.ok(account?.trialEndsAt);
  assert.equal(await billing.findScoped({tenantId:"wrong-tenant",workspaceId:scope.workspaceId}),null);
  assert.ok(await billing.setCustomer(scope,"cus_"+randomUUID().replaceAll("-","")));
  assert.equal(await billing.setCustomer(scope,"cus_conflict"),null);

  const checkouts=new CheckoutSessionRepository(sql);const sessionRef="cs_"+randomUUID().replaceAll("-","");
  await checkouts.create(scope,{planId:"professional",sessionRef,createdBy:user.id});
  assert.equal((await checkouts.findBySessionRef(sessionRef))?.workspaceId,scope.workspaceId);
  assert.equal(await checkouts.complete({tenantId:"wrong-tenant",workspaceId:scope.workspaceId},sessionRef),false);

  const usage=new UsageRepository(sql);const key="workflow:"+randomUUID();
  assert.ok(await usage.record(scope,{metric:"workflow_runs",quantity:1,idempotencyKey:key,provider:"atlas"}));
  assert.equal(await usage.record(scope,{metric:"workflow_runs",quantity:1,idempotencyKey:key,provider:"atlas"}),undefined);
  const summary=await usage.summary(scope);
  assert.equal(Number(summary.find(row=>row.metric==="workflow_runs")?.quantity),1);

  const events=new BillingEventRepository(sql);const stripeEventId="evt_"+randomUUID().replaceAll("-","");const providerCreatedAt=new Date().toISOString();
  const first=await events.receive({stripeEventId,eventType:"customer.subscription.updated",livemode:false,providerCreatedAt});assert.ok(first);
  assert.equal(await events.receive({stripeEventId,eventType:"customer.subscription.updated",livemode:false,providerCreatedAt}),undefined);
  await events.failed(first!,"temporary-provider-processing-failure");
  assert.equal(await events.receive({stripeEventId,eventType:"customer.subscription.updated",livemode:false,providerCreatedAt}),first);
  await closeDb();
});
