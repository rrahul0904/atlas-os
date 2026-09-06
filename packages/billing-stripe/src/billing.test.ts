import test from "node:test";
import assert from "node:assert/strict";
import {createHmac} from "node:crypto";
import type {StoredBillingAccount} from "../../repositories/src/index.js";
import {StripeBillingService,type BillingScope,type BillingStore,type BillingEventStore,type CheckoutStore,type StoredCheckoutSession} from "./service.js";
import type {StripeBillingConfig} from "./config.js";
import type {StripeHttpRequest,StripeHttpResponse,StripeHttpTransport} from "./transport.js";

const config:StripeBillingConfig={
  secretKey:"rk_test_atlas",
  webhookSecret:"whsec_atlas_test",
  prices:{solo:"price_solo",professional:"price_pro",business:"price_business",platform:"price_platform"},
  successUrl:"https://app.example.test/app/settings/billing?checkout=success",
  cancelUrl:"https://app.example.test/app/settings/billing?checkout=cancel",
  portalReturnUrl:"https://app.example.test/app/settings/billing"
};

function stored(scope:BillingScope,overrides:Partial<StoredBillingAccount>={}):StoredBillingAccount{
  return{tenantId:scope.tenantId,workspaceId:scope.workspaceId,provider:"stripe",customerRef:null,subscriptionRef:null,status:"trialing",planId:"business",priceRef:null,currentPeriodEnd:null,cancelAtPeriodEnd:false,trialEndsAt:"2026-09-20T00:00:00.000Z",lastInvoiceRef:null,lastPaymentAt:null,lastWebhookAt:null,subscriptionEventCreatedAt:null,createdAt:"2026-09-06T00:00:00.000Z",updatedAt:"2026-09-06T00:00:00.000Z",...overrides};
}
class MemoryBilling implements BillingStore{
  account:StoredBillingAccount;
  constructor(scope:BillingScope,overrides:Partial<StoredBillingAccount>={}){this.account=stored(scope,overrides)}
  async findScoped(scope:BillingScope){return this.account.tenantId===scope.tenantId&&this.account.workspaceId===scope.workspaceId?this.account:null}
  async ensure(){return this.account}
  async setCustomer(scope:BillingScope,customerRef:string){if(!await this.findScoped(scope))return null;if(this.account.customerRef&&this.account.customerRef!==customerRef)return null;this.account={...this.account,customerRef};return this.account}
  async applySubscription(scope:BillingScope,input:any){if(!await this.findScoped(scope))return null;if(this.account.subscriptionEventCreatedAt&&this.account.subscriptionEventCreatedAt>input.providerCreatedAt)return null;this.account={...this.account,customerRef:input.customerRef??this.account.customerRef,subscriptionRef:input.subscriptionRef,status:input.status,planId:input.planId,priceRef:input.priceRef,currentPeriodEnd:input.currentPeriodEnd??null,cancelAtPeriodEnd:Boolean(input.cancelAtPeriodEnd),trialEndsAt:input.trialEndsAt??null,subscriptionEventCreatedAt:input.providerCreatedAt};return this.account}
  async markCanceled(scope:BillingScope,subscriptionRef:string,providerCreatedAt:string){if(!await this.findScoped(scope))return null;if(this.account.subscriptionEventCreatedAt&&this.account.subscriptionEventCreatedAt>providerCreatedAt)return null;this.account={...this.account,status:"canceled",subscriptionRef,cancelAtPeriodEnd:false,subscriptionEventCreatedAt:providerCreatedAt};return this.account}
  async markInvoice(scope:BillingScope,input:{invoiceRef:string;paid:boolean;status:string}){if(!await this.findScoped(scope))return null;this.account={...this.account,lastInvoiceRef:input.invoiceRef,status:input.paid&&this.account.status==="past_due"?"active":!input.paid&&this.account.status!=="canceled"?input.status:this.account.status};return this.account}
  async findByCustomerRef(customerRef:string){return this.account.customerRef===customerRef?this.account:null}
}
class MemoryCheckout implements CheckoutStore{
  rows=new Map<string,StoredCheckoutSession>();
  async create(scope:BillingScope,input:{planId:string;sessionRef:string;createdBy:string}){this.rows.set(input.sessionRef,{...scope,requestedPlanId:input.planId as any,sessionRef:input.sessionRef});return "local-checkout"}
  async complete(scope:BillingScope,sessionRef:string){const row=this.rows.get(sessionRef);return Boolean(row&&row.tenantId===scope.tenantId&&row.workspaceId===scope.workspaceId)}
  async findBySessionRef(sessionRef:string){return this.rows.get(sessionRef)??null}
}
class MemoryEvents implements BillingEventStore{
  states=new Map<string,{id:string;status:string}>();
  processedCount=0;
  async receive(input:{stripeEventId:string}){const existing=this.states.get(input.stripeEventId);if(existing&&existing.status!=="failed")return undefined;if(existing){existing.status="received";return existing.id}const row={id:"receipt-"+input.stripeEventId,status:"received"};this.states.set(input.stripeEventId,row);return row.id}
  async processed(id:string){for(const value of this.states.values())if(value.id===id)value.status="processed";this.processedCount++}
  async failed(id:string){for(const value of this.states.values())if(value.id===id)value.status="failed"}
}
class FakeTransport implements StripeHttpTransport{
  requests:StripeHttpRequest[]=[];responses:StripeHttpResponse[]=[];
  async request(input:StripeHttpRequest){this.requests.push(input);const next=this.responses.shift();if(!next)throw new Error("fake-response-missing");return next}
}
function signature(body:string,timestamp:number){return "t="+timestamp+",v1="+createHmac("sha256",config.webhookSecret).update(String(timestamp)+"."+body).digest("hex")}

test("checkout uses server plan mapping and dynamic payment methods",async()=>{
  const scope={tenantId:"tenant-a",workspaceId:"workspace-a"};const billing=new MemoryBilling(scope);const checkout=new MemoryCheckout();const events=new MemoryEvents();const transport=new FakeTransport();
  transport.responses.push({status:200,body:JSON.stringify({id:"cus_atlas"})},{status:200,body:JSON.stringify({id:"cs_atlas",url:"https://checkout.stripe.com/c/pay/test"})});
  const service=new StripeBillingService({config,billing,checkout,events,transport});
  const result=await service.createCheckout(scope,{plan:"professional",createdBy:"user-a",email:"owner@example.test"});
  assert.equal(result.sessionRef,"cs_atlas");
  assert.equal(transport.requests[1].form?.["line_items[0][price]"],"price_pro");
  assert.equal(Object.prototype.hasOwnProperty.call(transport.requests[1].form??{},"payment_method_types"),false);
  assert.ok(String(transport.requests[1].form?.integration_identifier).startsWith("atlasos_"));
  assert.equal((await checkout.findBySessionRef("cs_atlas"))?.requestedPlanId,"professional");
});

test("verified subscription webhook updates billing once and duplicate delivery is ignored",async()=>{
  const scope={tenantId:"tenant-a",workspaceId:"workspace-a"};const billing=new MemoryBilling(scope,{customerRef:"cus_atlas"});const checkout=new MemoryCheckout();const events=new MemoryEvents();const transport=new FakeTransport();
  const service=new StripeBillingService({config,billing,checkout,events,transport});
  const event={id:"evt_subscription",type:"customer.subscription.updated",created:1788700000,livemode:false,data:{object:{id:"sub_atlas",customer:"cus_atlas",status:"active",cancel_at_period_end:false,items:{data:[{id:"si_atlas",price:"price_business",current_period_end:1789700000}]}}}};
  const body=JSON.stringify(event);const header=signature(body,event.created);
  const first=await service.handleWebhook(body,header,event.created);
  const second=await service.handleWebhook(body,header,event.created);
  assert.equal(first.duplicate,false);assert.equal(second.duplicate,true);
  assert.equal(billing.account.subscriptionRef,"sub_atlas");assert.equal(billing.account.planId,"business");assert.equal(billing.account.status,"active");
  assert.equal(events.processedCount,1);
});

test("older subscription event cannot regress newer subscription state",async()=>{
  const scope={tenantId:"tenant-a",workspaceId:"workspace-a"};const billing=new MemoryBilling(scope,{customerRef:"cus_atlas",subscriptionEventCreatedAt:"2026-09-10T00:00:00.000Z",planId:"platform",status:"active"});const checkout=new MemoryCheckout();const events=new MemoryEvents();const transport=new FakeTransport();
  const service=new StripeBillingService({config,billing,checkout,events,transport});
  const event={id:"evt_old",type:"customer.subscription.updated",created:1788900000,livemode:false,data:{object:{id:"sub_atlas",customer:"cus_atlas",status:"active",items:{data:[{id:"si_atlas",price:"price_solo"}]}}}};
  const body=JSON.stringify(event);await service.handleWebhook(body,signature(body,event.created),event.created);
  assert.equal(billing.account.planId,"platform");
});

test("invalid Stripe signature is rejected before event persistence",async()=>{
  const scope={tenantId:"tenant-a",workspaceId:"workspace-a"};const billing=new MemoryBilling(scope);const checkout=new MemoryCheckout();const events=new MemoryEvents();const transport=new FakeTransport();
  const service=new StripeBillingService({config,billing,checkout,events,transport});let message="";
  try{await service.handleWebhook(JSON.stringify({id:"evt_x"}),"t=1,v1=deadbeef",1)}catch(error){message=error instanceof Error?error.message:"error"}
  assert.ok(message.startsWith("stripe-signature"));
  assert.equal(events.states.size,0);
});
