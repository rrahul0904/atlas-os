import type {StoredIntegrationConnection} from "../../../packages/repositories/src/index.js";

const esc=(value:string)=>value.replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]??char));

function statusLabel(status:string){return status.replaceAll("_"," ")}
function stringArray(value:unknown){return Array.isArray(value)?value.filter((item):item is string=>typeof item==="string"):[]}
function statusClass(status:string){return status==="connected"?"good":status==="degraded"||status==="needs_reauthentication"?"warn":status==="error"?"bad":"muted"}

export function renderIntegrationsPage(input:{
  workspaceName:string;
  connections:StoredIntegrationConnection[];
  canManage:boolean;
  googleConnectAvailable?:boolean;
}){
  const webhook=input.connections.find(item=>item.integrationId==="webhook");
  const config=webhook?.config??{};
  const allowedHosts=stringArray(config.allowedHosts).join("\n");
  const allowedPaths=stringArray(config.allowedPaths).join("\n");
  const allowedMethods=stringArray(config.allowedMethods);
  const status=webhook?.status??"not_configured";
  const webhookCard=`
    <section class="integration-card">
      <div class="integration-head">
        <div><small class="eyebrow">GENERIC CONNECTOR</small><h2>Webhook / REST</h2></div>
        <span class="status ${statusClass(status)}">${esc(statusLabel(status))}</span>
      </div>
      <dl class="integration-meta">
        <div><dt>Endpoint</dt><dd>${esc(typeof config.baseUrl==="string"?config.baseUrl:"Not configured")}</dd></div>
        <div><dt>Last checked</dt><dd>${webhook?.lastHealthAt?esc(new Date(webhook.lastHealthAt).toLocaleString()):"Never"}</dd></div>
        <div><dt>Last success</dt><dd>${webhook?.lastSuccessAt?esc(new Date(webhook.lastSuccessAt).toLocaleString()):"Never"}</dd></div>
        <div><dt>Last error</dt><dd>${esc(webhook?.lastError??"—")}</dd></div>
      </dl>
      <div class="integration-capabilities">POST · PUT · PATCH · governed writes · idempotency key</div>
      ${input.canManage?`
      <form method="post" action="/app/integrations/webhook/save" class="integration-form">
        <label>Base URL<input name="baseUrl" type="url" required value="${esc(typeof config.baseUrl==="string"?config.baseUrl:"")}" placeholder="https://api.example.com"></label>
        <label>Allowed hosts<textarea name="allowedHosts" required placeholder="api.example.com">${esc(allowedHosts)}</textarea></label>
        <label>Allowed paths<textarea name="allowedPaths" required placeholder="/events&#10;/jobs">${esc(allowedPaths)}</textarea></label>
        <fieldset><legend>Allowed methods</legend>
          <label><input type="checkbox" name="method" value="POST" ${allowedMethods.includes("POST")?"checked":""}> POST</label>
          <label><input type="checkbox" name="method" value="PUT" ${allowedMethods.includes("PUT")?"checked":""}> PUT</label>
          <label><input type="checkbox" name="method" value="PATCH" ${allowedMethods.includes("PATCH")?"checked":""}> PATCH</label>
        </fieldset>
        <label>Health path<input name="healthPath" value="${esc(typeof config.healthPath==="string"?config.healthPath:"")}" placeholder="/health"></label>
        <label>Secret reference<input name="secretReference" value="${esc(webhook?.secretReference??"")}" placeholder="env:MY_WEBHOOK_API_KEY"><small>Reference only. Do not paste a token or API key.</small></label>
        <label>Auth header<input name="authHeaderName" value="${esc(typeof config.authHeaderName==="string"?config.authHeaderName:"authorization")}"></label>
        <label>Auth prefix<input name="authPrefix" value="${esc(typeof config.authPrefix==="string"?config.authPrefix:"Bearer ")}"></label>
        <label>Timeout (ms)<input name="timeoutMs" type="number" min="250" max="30000" value="${esc(String(typeof config.timeoutMs==="number"?config.timeoutMs:8000))}"></label>
        <div class="integration-actions"><button>Save configuration</button>${webhook?'<button formaction="/app/integrations/webhook/check">Check health</button>':""}</div>
      </form>`:'<p class="muted-copy">Owner or admin access is required to modify integrations.</p>'}
    </section>`;

  const google=input.connections.find(item=>item.integrationId==="google-workspace");
  const googleStatus=google?.status??"not_configured";
  const scopes=stringArray(google?.config.scopes);
  const googleCard=`
    <section class="integration-card">
      <div class="integration-head">
        <div><small class="eyebrow">GOOGLE WORKSPACE</small><h2>Gmail + Calendar</h2></div>
        <span class="status ${statusClass(googleStatus)}">${esc(statusLabel(googleStatus))}</span>
      </div>
      <dl class="integration-meta">
        <div><dt>Account</dt><dd>${esc(google?.externalAccountRef??"Not connected")}</dd></div>
        <div><dt>Capabilities</dt><dd>Gmail search/read/send · Calendar list/create/update</dd></div>
        <div><dt>Last checked</dt><dd>${google?.lastHealthAt?esc(new Date(google.lastHealthAt).toLocaleString()):"Never"}</dd></div>
        <div><dt>Last success</dt><dd>${google?.lastSuccessAt?esc(new Date(google.lastSuccessAt).toLocaleString()):"Never"}</dd></div>
        <div><dt>Last error</dt><dd>${esc(google?.lastError??"—")}</dd></div>
        <div><dt>Granted scopes</dt><dd>${scopes.length?esc(scopes.map(scope=>scope.split("/").pop()??scope).join(", ")):"Not granted yet"}</dd></div>
      </dl>
      <p class="muted-copy">Google credentials are encrypted server-side. Gmail sends and Calendar writes remain governed AtlasOS actions.</p>
      ${input.canManage?`<div class="integration-actions">
        ${input.googleConnectAvailable?'<a class="integration-button" href="/app/integrations/google/connect">'+(googleStatus==="not_configured"?"Connect Google":"Reconnect Google")+'</a>':'<span class="muted-copy">Google OAuth server configuration is not available on this deployment.</span>'}
        ${google&&googleStatus!=="not_configured"?'<form method="post" action="/app/integrations/google/check"><button>Check health</button></form><form method="post" action="/app/integrations/google/disconnect"><button class="danger">Disconnect</button></form>':""}
      </div>`:'<p class="muted-copy">Owner or admin access is required to manage Google.</p>'}
    </section>`;

  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AtlasOS · Integrations</title><link rel="stylesheet" href="/assets/atlas.css"></head><body><div class="shell"><aside><div class="brand"><span>A</span><div><b>AtlasOS</b><small>${esc(input.workspaceName)}</small></div></div><nav><a class="nav-item" href="/app/today">Today</a><a class="nav-item" href="/app/tasks">Tasks</a><a class="nav-item" href="/app/approvals">Approvals</a><a class="nav-item" href="/app/agents">Agents</a><a class="nav-item" href="/app/workflows">Workflows</a><a class="nav-item active" href="/app/integrations">Integrations</a><a class="nav-item" href="/app/settings/billing">Settings</a></nav><form method="post" action="/logout" class="logout"><button>Log out</button></form></aside><main><header><div><small class="eyebrow">CONNECTED / INTEGRATIONS</small><h1>Integrations</h1><p>Real workspace connections only. AtlasOS never substitutes simulation or demo health here.</p></div></header><div class="integration-grid">${webhookCard}${googleCard}</div></main></div></body></html>`;
}
