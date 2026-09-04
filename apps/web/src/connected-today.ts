import type {TodaySnapshot} from "../../../packages/today/src/index.js";

const esc=(value:string)=>value.replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]??char));

export function renderConnectedTodayView(input:{
  workspaceName:string;
  verticalId:string;
  planId:string;
  billingStatus:string;
  trialEndsAt:string|null;
  modules:string[];
  today:TodaySnapshot;
}){
  const metrics=input.today.metrics.map(metric=>`<article class="metric"><span>${esc(metric.label)}</span><strong>${metric.availability==="value"?esc(String(metric.value??0)):"—"}</strong><small>${esc(metric.sourceModule)}</small></article>`).join("");
  const attention=input.today.attention.length
    ?input.today.attention.slice(0,12).map(item=>`<article class="attention ${item.severity}"><div><b>${esc(item.title)}</b><p>${esc(item.businessImpact)} · ${esc(item.description)}</p></div><button data-action-id="${esc(item.id)}">${esc(item.recommendedAction)}</button></article>`).join("")
    :'<div class="empty-connected"><h3>No open evidence-backed actions</h3><p>Connect a source or create operational work. AtlasOS will not substitute demo issues in a connected workspace.</p></div>';
  const upcoming=input.today.upcoming.length
    ?input.today.upcoming.slice(0,8).map(item=>`<li><b>${esc(item.title)}</b><span>${esc(new Date(item.dueAt).toLocaleString())}</span></li>`).join("")
    :"<li>No scheduled work yet.</li>";
  const modules=input.modules.map(id=>`<li><b>${esc(id)}</b><span>Enabled</span></li>`).join("");
  const trial=input.trialEndsAt?" · Trial ends "+esc(new Date(input.trialEndsAt).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})):"";
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AtlasOS · Today</title><link rel="stylesheet" href="/assets/atlas.css"></head><body><div class="shell"><aside><div class="brand"><span>A</span><div><b>AtlasOS</b><small>${esc(input.workspaceName)}</small></div></div><nav><a class="nav-item active" href="/app/today">Today</a><a class="nav-item" href="/app/tasks">Tasks</a><a class="nav-item" href="/app/approvals">Approvals</a><a class="nav-item" href="/app/integrations">Integrations</a><a class="nav-item" href="/app/settings">Settings</a></nav><form method="post" action="/logout" class="logout"><button>Log out</button></form></aside><main><header><div><small class="eyebrow">CONNECTED / ${esc(input.verticalId.toUpperCase())}</small><h1>Good morning.</h1><p>${esc(input.workspaceName)} · ${esc(input.planId)} · ${esc(input.billingStatus)}${trial}</p></div><div class="top-actions"><button type="button" onclick="document.getElementById('ask-input').focus()">⌘ Ask Atlas</button></div></header><section class="metrics">${metrics}</section><section class="grid"><div class="panel"><div class="panel-head"><h2>Needs your attention</h2><span>${input.today.attention.length} items</span></div>${attention}</div><div class="panel"><div class="panel-head"><h2>Upcoming</h2><span>${input.today.upcoming.length}</span></div><ul class="module-list">${upcoming}</ul></div></section><section class="grid lower"><div class="panel"><div class="panel-head"><h2>Enabled modules</h2><span>${input.modules.length}</span></div><ul class="module-list">${modules}</ul></div><div class="panel command"><small class="eyebrow">ASK YOUR BUSINESS</small><h2>Ask a grounded question.</h2><form id="ask-form" class="ask"><input id="ask-input" maxlength="2000" placeholder="What should I work on next?" autocomplete="off"><button>Ask Atlas</button></form><div id="ask-result" class="ask-result">Answers use only this workspace's connected evidence and permissions.</div></div></section></main></div><script>
  const form=document.getElementById("ask-form");const input=document.getElementById("ask-input");const result=document.getElementById("ask-result");
  form.addEventListener("submit",async event=>{event.preventDefault();const question=input.value.trim();if(!question)return;result.textContent="Checking workspace evidence…";try{const response=await fetch("/api/atlas/ask",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({question})});const data=await response.json();if(!response.ok)throw new Error(data.message||"Request failed");result.textContent=data.answer;const evidence=(data.evidence||[]);if(evidence.length){const list=document.createElement("ul");for(const item of evidence){const li=document.createElement("li");li.textContent=item.claim+" ("+Math.round(item.confidence*100)+"% confidence)";list.appendChild(li)}result.appendChild(list)}}catch(error){result.textContent=error instanceof Error?error.message:"Ask Atlas failed safely."}});
</script></body></html>`;
}
