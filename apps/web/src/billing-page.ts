import type {StoredBillingAccount} from "../../../packages/repositories/src/index.js";
import {isAtlasPlan,plans,resolveBillingEntitlements,type AtlasPlan} from "../../../packages/entitlements/src/index.js";

const esc=(value:string)=>value.replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]??char));
const planName=(plan:string)=>plan.charAt(0).toUpperCase()+plan.slice(1);
const statusClass=(status:string)=>status==="active"||status==="trialing"?"good":status==="past_due"?"warn":status==="canceled"||status==="unpaid"||status==="incomplete_expired"?"bad":"muted";
const date=(value:string|null)=>value?new Date(value).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}):"—";

export function renderBillingPage(input:{
  workspaceName:string;
  billing:StoredBillingAccount|null;
  usage:Array<{metric:string;quantity:number}>;
  canManage:boolean;
  stripeConfigured:boolean;
  message?:string|null;
}){
  const account=input.billing;
  const plan:AtlasPlan=isAtlasPlan(account?.planId??"")?account!.planId as AtlasPlan:"solo";
  const entitlement=resolveBillingEntitlements(plan,account?.status??"canceled");
  const usage=input.usage.length?input.usage.map(item=>`<li><b>${esc(item.metric.replaceAll("_"," "))}</b><span>${esc(String(item.quantity))}</span></li>`).join(""):'<li><b>No metered usage yet</b><span>0</span></li>';
  const controls=input.canManage&&input.stripeConfigured;
  const planCards=(Object.keys(plans) as AtlasPlan[]).map(candidate=>{
    const definition=plans[candidate];const current=account?.planId===candidate;
    const action=account?.subscriptionRef?"/app/settings/billing/plan":"/app/settings/billing/checkout";
    return `<article class="integration-card"><div class="integration-head"><div><small class="eyebrow">${current?"CURRENT PLAN":"PLAN"}</small><h2>${esc(planName(candidate))}</h2></div>${current?'<span class="status good">Current</span>':""}</div><dl class="integration-meta"><div><dt>Users</dt><dd>${definition.maxUsers}</dd></div><div><dt>Agents</dt><dd>${definition.maxAgents}</dd></div><div><dt>Integrations</dt><dd>${definition.maxIntegrations}</dd></div><div><dt>Workflow runs / month</dt><dd>${definition.maxWorkflowRunsMonthly}</dd></div><div><dt>Retention</dt><dd>${definition.retentionDays} days</dd></div></dl>${!current&&controls?`<form method="post" action="${action}" class="integration-actions"><input type="hidden" name="plan" value="${candidate}"><button>${account?.subscriptionRef?"Change plan":"Choose plan"}</button></form>`:""}</article>`;
  }).join("");
  const providerMessage=!input.stripeConfigured?'<p class="muted-copy">Stripe server configuration is not available on this deployment. Billing state remains read-only.</p>':"";
  const message=input.message?`<div class="empty-connected"><p>${esc(input.message)}</p></div>`:"";
  const lifecycle=account?`<section class="panel ops"><div class="panel-head"><h2>Subscription</h2><span class="status ${statusClass(account.status)}">${esc(account.status.replaceAll("_"," "))}</span></div><dl class="integration-meta"><div><dt>Plan</dt><dd>${esc(planName(account.planId))}</dd></div><div><dt>Trial ends</dt><dd>${date(account.trialEndsAt)}</dd></div><div><dt>Current period ends</dt><dd>${date(account.currentPeriodEnd)}</dd></div><div><dt>Cancellation</dt><dd>${account.cancelAtPeriodEnd?"Scheduled for period end":"Not scheduled"}</dd></div><div><dt>Access</dt><dd>${entitlement.access?"Enabled":"Restricted"}</dd></div></dl>${providerMessage}${controls&&account.customerRef?`<div class="integration-actions"><form method="post" action="/app/settings/billing/portal"><button>Manage billing</button></form>${account.subscriptionRef?(account.cancelAtPeriodEnd?'<form method="post" action="/app/settings/billing/reactivate"><button>Keep subscription</button></form>':'<form method="post" action="/app/settings/billing/cancel"><button class="danger">Cancel at period end</button></form>'):""}</div>`:""}</section>`:`<section class="panel ops"><div class="empty-connected"><h3>No billing account</h3><p>This workspace has not initialized billing state yet.</p>${providerMessage}</div></section>`;
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AtlasOS · Billing</title><link rel="stylesheet" href="/assets/atlas.css"></head><body><div class="shell"><aside><div class="brand"><span>A</span><div><b>AtlasOS</b><small>${esc(input.workspaceName)}</small></div></div><nav><a class="nav-item" href="/app/today">Today</a><a class="nav-item" href="/app/approvals">Approvals</a><a class="nav-item" href="/app/agents">Agents</a><a class="nav-item" href="/app/workflows">Workflows</a><a class="nav-item" href="/app/integrations">Integrations</a><a class="nav-item active" href="/app/settings/billing">Billing</a></nav><form method="post" action="/logout" class="logout"><button>Log out</button></form></aside><main><header><div><small class="eyebrow">SETTINGS / BILLING</small><h1>Billing & usage</h1><p>Stripe is the billing authority. AtlasOS grants entitlements from verified provider state, never from browser input.</p></div></header>${message}${lifecycle}<section class="grid lower"><div class="panel"><div class="panel-head"><h2>Usage · last 30 days</h2><span>Metered</span></div><ul class="module-list">${usage}</ul></div><div class="panel"><div class="panel-head"><h2>Current limits</h2><span>${esc(planName(plan))}</span></div><ul class="module-list"><li><b>Users</b><span>${entitlement.maxUsers}</span></li><li><b>Agents</b><span>${entitlement.maxAgents}</span></li><li><b>Integrations</b><span>${entitlement.maxIntegrations}</span></li><li><b>AI requests / month</b><span>${entitlement.maxAiRequestsMonthly}</span></li><li><b>Workflow runs / month</b><span>${entitlement.maxWorkflowRunsMonthly}</span></li></ul></div></section><div class="integration-grid">${planCards}</div></main></div></body></html>`;
}
