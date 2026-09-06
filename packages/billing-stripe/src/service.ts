import {randomBytes,randomUUID} from "node:crypto";
import type {AtlasPlan} from "../../entitlements/src/index.js";
import type {StoredBillingAccount} from "../../repositories/src/index.js";
import {planFromPrice,type StripeBillingConfig} from "./config.js";
import {verifyStripeSignature} from "./signature.js";
import {parseStripeJson,stripeHttpError,type StripeHttpRequest,type StripeHttpTransport} from "./transport.js";

export interface BillingScope{tenantId:string;workspaceId:string}
export interface StoredCheckoutSession{tenantId:string;workspaceId:string;requestedPlanId:AtlasPlan;sessionRef:string}
export interface BillingStore{
  findScoped(scope:BillingScope):Promise<StoredBillingAccount|null>;
  ensure(scope:BillingScope,planId:string,status?:string,trialEndsAt?:string|null):Promise<StoredBillingAccount>;
  setCustomer(scope:BillingScope,customerRef:string):Promise<StoredBillingAccount|null>;
  applySubscription(scope:BillingScope,input:{customerRef?:string|null;subscriptionRef:string;status:string;planId:string;priceRef:string;currentPeriodEnd?:string|null;cancelAtPeriodEnd?:boolean;trialEndsAt?:string|null;providerCreatedAt:string}):Promise<StoredBillingAccount|null>;
  markCanceled(scope:BillingScope,subscriptionRef:string,providerCreatedAt:string):Promise<StoredBillingAccount|null>;
  markInvoice(scope:BillingScope,input:{invoiceRef:string;paid:boolean;status:string}):Promise<StoredBillingAccount|null>;
  findByCustomerRef(customerRef:string):Promise<StoredBillingAccount|null>;
}
export interface CheckoutStore{
  create(scope:BillingScope,input:{planId:string;sessionRef:string;createdBy:string}):Promise<string>;
  complete(scope:BillingScope,sessionRef:string):Promise<boolean>;
  findBySessionRef(sessionRef:string):Promise<StoredCheckoutSession|null>;
}
export interface BillingEventStore{
  receive(input:{stripeEventId:string;eventType:string;livemode:boolean;providerCreatedAt:string}):Promise<string|undefined>;
  processed(id:string,scope:BillingScope|null,input?:{objectRef?:string|null;metadata?:Record<string,unknown>;ignored?:boolean}):Promise<void>;
  failed(id:string,message:string):Promise<void>;
}
export interface StripeBillingDependencies{
  config:StripeBillingConfig;
  transport:StripeHttpTransport;
  billing:BillingStore;
  checkout:CheckoutStore;
  events:BillingEventStore;
}

function randomLetters(count:number){
  return Array.from(randomBytes(count),byte=>String.fromCharCode(97+(byte%26))).join("");
}
function reference(value:unknown):string|null{
  if(typeof value==="string"&&value.length)return value;
  if(value&&typeof value==="object"){
    const id=(value as Record<string,unknown>).id;
    return typeof id==="string"&&id.length?id:null;
  }
  return null;
}
function objectValue(value:unknown):Record<string,any>{
  if(!value||typeof value!=="object"||Array.isArray(value))throw new Error("stripe-event-object-invalid");
  return value as Record<string,any>;
}
function unixIso(value:unknown):string|null{
  const seconds=Number(value);
  return Number.isFinite(seconds)&&seconds>0?new Date(seconds*1000).toISOString():null;
}
function redirectUrl(value:unknown){
  if(typeof value!=="string")throw new Error("stripe-redirect-url-missing");
  let url:URL;try{url=new URL(value)}catch{throw new Error("stripe-redirect-url-invalid")}
  if(url.protocol!=="https:"||!(url.hostname==="checkout.stripe.com"||url.hostname.endsWith(".stripe.com")))throw new Error("stripe-redirect-url-invalid");
  return url.toString();
}
function safeError(error:unknown){
  const message=error instanceof Error?error.message:"stripe-processing-failed";
  return message.replace(/sk_(test|live)_[A-Za-z0-9_-]+/g,"[redacted]").replace(/rk_(test|live)_[A-Za-z0-9_-]+/g,"[redacted]").replace(/whsec_[A-Za-z0-9_-]+/g,"[redacted]").slice(0,500);
}
function subscriptionItem(subscription:Record<string,any>){
  const data=subscription.items?.data;
  return Array.isArray(data)&&data.length&&data[0]&&typeof data[0]==="object"?data[0] as Record<string,any>:null;
}

export class StripeBillingService{
  constructor(private readonly deps:StripeBillingDependencies){}

  private async call<T=Record<string,any>>(request:StripeHttpRequest):Promise<T>{
    const response=await this.deps.transport.request(request);
    if(response.status<200||response.status>=300)throw stripeHttpError(response);
    return parseStripeJson<T>(response);
  }

  private async customer(scope:BillingScope,email:string){
    const current=await this.deps.billing.findScoped(scope);
    if(!current)throw new Error("billing-account-not-initialized");
    if(current.customerRef)return current.customerRef;
    const created=await this.call<Record<string,any>>({
      path:"/v1/customers",
      form:{
        email,
        "metadata[atlas_tenant_id]":scope.tenantId,
        "metadata[atlas_workspace_id]":scope.workspaceId
      },
      idempotencyKey:"atlas-customer-"+scope.workspaceId
    });
    const customerRef=reference(created.id);
    if(!customerRef||!customerRef.startsWith("cus_"))throw new Error("stripe-customer-invalid");
    const saved=await this.deps.billing.setCustomer(scope,customerRef);
    if(!saved)throw new Error("billing-customer-conflict");
    return customerRef;
  }

  async createCheckout(scope:BillingScope,input:{plan:AtlasPlan;createdBy:string;email:string}){
    const customerRef=await this.customer(scope,input.email);
    const session=await this.call<Record<string,any>>({
      path:"/v1/checkout/sessions",
      form:{
        mode:"subscription",
        customer:customerRef,
        "line_items[0][price]":this.deps.config.prices[input.plan],
        "line_items[0][quantity]":1,
        success_url:this.deps.config.successUrl,
        cancel_url:this.deps.config.cancelUrl,
        client_reference_id:scope.workspaceId,
        "metadata[atlas_tenant_id]":scope.tenantId,
        "metadata[atlas_workspace_id]":scope.workspaceId,
        "metadata[atlas_plan]":input.plan,
        "subscription_data[metadata][atlas_tenant_id]":scope.tenantId,
        "subscription_data[metadata][atlas_workspace_id]":scope.workspaceId,
        "subscription_data[metadata][atlas_plan]":input.plan,
        integration_identifier:"atlasos_"+randomLetters(8)
      },
      idempotencyKey:"atlas-checkout-"+randomUUID()
    });
    const sessionRef=reference(session.id);
    if(!sessionRef||!sessionRef.startsWith("cs_"))throw new Error("stripe-checkout-session-invalid");
    const url=redirectUrl(session.url);
    await this.deps.checkout.create(scope,{planId:input.plan,sessionRef,createdBy:input.createdBy});
    return{sessionRef,url};
  }

  async createPortal(scope:BillingScope){
    const account=await this.deps.billing.findScoped(scope);
    if(!account?.customerRef)throw new Error("stripe-customer-not-found");
    const session=await this.call<Record<string,any>>({
      path:"/v1/billing_portal/sessions",
      form:{customer:account.customerRef,return_url:this.deps.config.portalReturnUrl},
      idempotencyKey:"atlas-portal-"+randomUUID()
    });
    return{url:redirectUrl(session.url)};
  }

  async changePlan(scope:BillingScope,plan:AtlasPlan){
    const account=await this.deps.billing.findScoped(scope);
    if(!account?.subscriptionRef)throw new Error("stripe-subscription-not-found");
    const subscription=await this.call<Record<string,any>>({path:"/v1/subscriptions/"+encodeURIComponent(account.subscriptionRef),method:"GET"});
    const item=subscriptionItem(subscription);const itemRef=reference(item?.id);
    if(!itemRef)throw new Error("stripe-subscription-item-not-found");
    await this.call({
      path:"/v1/subscriptions/"+encodeURIComponent(account.subscriptionRef),
      form:{
        "items[0][id]":itemRef,
        "items[0][price]":this.deps.config.prices[plan],
        proration_behavior:"none",
        "metadata[atlas_plan]":plan
      },
      idempotencyKey:"atlas-plan-"+scope.workspaceId+"-"+plan+"-"+randomUUID()
    });
    return{requestedPlan:plan,effectivePolicy:"immediate-no-proration" as const};
  }

  async cancelAtPeriodEnd(scope:BillingScope){
    const account=await this.deps.billing.findScoped(scope);
    if(!account?.subscriptionRef)throw new Error("stripe-subscription-not-found");
    await this.call({
      path:"/v1/subscriptions/"+encodeURIComponent(account.subscriptionRef),
      form:{cancel_at_period_end:true},
      idempotencyKey:"atlas-cancel-"+scope.workspaceId+"-"+randomUUID()
    });
  }

  async reactivate(scope:BillingScope){
    const account=await this.deps.billing.findScoped(scope);
    if(!account?.subscriptionRef)throw new Error("stripe-subscription-not-found");
    await this.call({
      path:"/v1/subscriptions/"+encodeURIComponent(account.subscriptionRef),
      form:{cancel_at_period_end:false},
      idempotencyKey:"atlas-reactivate-"+scope.workspaceId+"-"+randomUUID()
    });
  }

  async handleWebhook(rawBody:string,signatureHeader:string,nowSeconds=Math.floor(Date.now()/1000)){
    verifyStripeSignature(rawBody,signatureHeader,this.deps.config.webhookSecret,nowSeconds);
    let parsed:Record<string,any>;
    try{parsed=JSON.parse(rawBody) as Record<string,any>}catch{throw new Error("stripe-event-json-invalid")}
    const eventId=reference(parsed.id);const eventType=typeof parsed.type==="string"?parsed.type:"";
    const created=Number(parsed.created);
    if(!eventId||!eventId.startsWith("evt_")||!eventType||!Number.isInteger(created)||created<=0)throw new Error("stripe-event-invalid");
    const object=objectValue(parsed.data?.object);
    const providerCreatedAt=new Date(created*1000).toISOString();
    const receiptId=await this.deps.events.receive({stripeEventId:eventId,eventType,livemode:Boolean(parsed.livemode),providerCreatedAt});
    if(!receiptId)return{duplicate:true,eventId};
    try{
      await this.processEvent(receiptId,eventType,object,providerCreatedAt);
      return{duplicate:false,eventId};
    }catch(error){
      await this.deps.events.failed(receiptId,safeError(error));
      throw error;
    }
  }

  private async processEvent(receiptId:string,eventType:string,value:Record<string,any>,providerCreatedAt:string){
    if(eventType==="checkout.session.completed"){
      const sessionRef=reference(value.id);if(!sessionRef)throw new Error("stripe-checkout-session-invalid");
      const checkout=await this.deps.checkout.findBySessionRef(sessionRef);
      if(!checkout){await this.deps.events.processed(receiptId,null,{objectRef:sessionRef,ignored:true,metadata:{reason:"checkout-session-not-owned"}});return;}
      const scope={tenantId:checkout.tenantId,workspaceId:checkout.workspaceId};
      const customerRef=reference(value.customer);
      if(customerRef){
        const updated=await this.deps.billing.setCustomer(scope,customerRef);
        if(!updated)throw new Error("billing-customer-conflict");
      }
      await this.deps.checkout.complete(scope,sessionRef);
      await this.deps.events.processed(receiptId,scope,{objectRef:sessionRef,metadata:{requestedPlanId:checkout.requestedPlanId}});
      return;
    }

    if(eventType==="customer.subscription.created"||eventType==="customer.subscription.updated"){
      const customerRef=reference(value.customer);const subscriptionRef=reference(value.id);
      if(!customerRef||!subscriptionRef)throw new Error("stripe-subscription-reference-invalid");
      const account=await this.deps.billing.findByCustomerRef(customerRef);
      if(!account){await this.deps.events.processed(receiptId,null,{objectRef:subscriptionRef,ignored:true,metadata:{reason:"customer-not-owned"}});return;}
      const item=subscriptionItem(value);const priceRef=reference(item?.price);
      if(!priceRef)throw new Error("stripe-subscription-price-missing");
      const plan=planFromPrice(this.deps.config,priceRef);
      if(!plan)throw new Error("stripe-subscription-price-unmapped");
      const scope={tenantId:account.tenantId,workspaceId:account.workspaceId};
      const currentPeriodEnd=unixIso(value.current_period_end)??unixIso(item?.current_period_end);
      const status=typeof value.status==="string"?value.status:"incomplete";
      const applied=await this.deps.billing.applySubscription(scope,{
        customerRef,subscriptionRef,status,planId:plan,priceRef,currentPeriodEnd,
        cancelAtPeriodEnd:Boolean(value.cancel_at_period_end),trialEndsAt:unixIso(value.trial_end),providerCreatedAt
      });
      await this.deps.events.processed(receiptId,scope,{objectRef:subscriptionRef,metadata:{plan,status,applied:Boolean(applied)}});
      return;
    }

    if(eventType==="customer.subscription.deleted"){
      const customerRef=reference(value.customer);const subscriptionRef=reference(value.id);
      if(!customerRef||!subscriptionRef)throw new Error("stripe-subscription-reference-invalid");
      const account=await this.deps.billing.findByCustomerRef(customerRef);
      if(!account){await this.deps.events.processed(receiptId,null,{objectRef:subscriptionRef,ignored:true,metadata:{reason:"customer-not-owned"}});return;}
      const scope={tenantId:account.tenantId,workspaceId:account.workspaceId};
      const applied=await this.deps.billing.markCanceled(scope,subscriptionRef,providerCreatedAt);
      await this.deps.events.processed(receiptId,scope,{objectRef:subscriptionRef,metadata:{status:"canceled",applied:Boolean(applied)}});
      return;
    }

    if(eventType==="invoice.paid"||eventType==="invoice.payment_failed"){
      const customerRef=reference(value.customer);const invoiceRef=reference(value.id);
      if(!customerRef||!invoiceRef)throw new Error("stripe-invoice-reference-invalid");
      const account=await this.deps.billing.findByCustomerRef(customerRef);
      if(!account){await this.deps.events.processed(receiptId,null,{objectRef:invoiceRef,ignored:true,metadata:{reason:"customer-not-owned"}});return;}
      const scope={tenantId:account.tenantId,workspaceId:account.workspaceId};
      const paid=eventType==="invoice.paid";
      await this.deps.billing.markInvoice(scope,{invoiceRef,paid,status:paid?"active":"past_due"});
      await this.deps.events.processed(receiptId,scope,{objectRef:invoiceRef,metadata:{paid}});
      return;
    }

    await this.deps.events.processed(receiptId,null,{objectRef:reference(value.id),ignored:true,metadata:{reason:"event-not-used"}});
  }
}
