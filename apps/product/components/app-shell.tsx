import Link from "next/link";
import type {ReactNode} from "react";
import {productNavigation} from "@/lib/navigation";
import type {AtlasProductModel,ProductSection} from "@/lib/types";
import {AskAtlasCommand} from "./ask-atlas";

const titleCopy:Record<ProductSection,{eyebrow:string;title:string;copy:string}>={
  today:{eyebrow:"OPERATING BRIEF",title:"What needs attention now.",copy:"Evidence-backed priorities, commitments and governed decisions across this workspace."},
  live:{eyebrow:"LIVE / BUSINESS",title:"What is happening right now.",copy:"A PulseAtlas-style observatory over canonical Atlas activity. Geographic signals render spatially; everything else stays visible in the feed."},
  customers:{eyebrow:"RELATIONSHIPS",title:"Customers and relationships.",copy:"Canonical workspace-scoped contacts with vertical terminology applied at the presentation layer."},
  pipeline:{eyebrow:"PIPELINE",title:"Demand moving toward revenue.",copy:"Leads and opportunities from persisted business state."},
  bookings:{eyebrow:"CAPACITY / COMMITMENTS",title:"Time-bound commitments.",copy:"Canonical Bookings over locations, resources and capacity."},
  orders:{eyebrow:"COMMERCE",title:"Orders and fulfillment.",copy:"Commercial snapshots and operational fulfillment state."},
  money:{eyebrow:"MONEY",title:"Business money, not Atlas billing.",copy:"Payments, invoices and business revenue remain separate from the AtlasOS subscription."},
  inventory:{eyebrow:"INVENTORY",title:"Operational stock state.",copy:"On-hand quantities, reorder points and low-stock conditions without pretending to be a full ERP."},
  work:{eyebrow:"WORK",title:"Tasks, projects and campaigns.",copy:"The durable operating work created by people, workflows and agents."},
  agents:{eyebrow:"GOVERNED AI",title:"Agents working inside policy.",copy:"Enabled tools, scopes, budgets and operating boundaries."},
  workflows:{eyebrow:"AUTOMATION",title:"Workflow execution history.",copy:"Durable runs, retries, approval waits and completion."},
  approvals:{eyebrow:"HUMAN CONTROL",title:"Decisions that need you.",copy:"Risky actions stay paused until an authorized human approves or rejects them."},
  integrations:{eyebrow:"CONNECTIONS",title:"Integration health.",copy:"Real connected providers only. Missing providers remain explicitly not connected."},
  alerts:{eyebrow:"ALERTS",title:"High-signal operating anomalies.",copy:"Evidence-backed action items and deterministic operational warnings."},
  billing:{eyebrow:"SETTINGS / BILLING",title:"AtlasOS billing and usage.",copy:"Subscription state is separate from the money your business earns."}
};

export function AppShell({model,active,children,demoVertical}:{model:AtlasProductModel;active:ProductSection;children:ReactNode;demoVertical?:string}){
  const nav=productNavigation({mode:model.mode,verticalId:model.workspace.verticalId,terms:model.terminology,demoVertical,role:model.principalRole});
  const info=titleCopy[active],base=model.mode==="demo"?"/demo/"+encodeURIComponent(demoVertical||model.workspace.verticalId):"/app";
  const summary=model.metrics.slice(0,3).map(m=>m.label+" "+String(m.value)).join(", ");
  return <div className="app-shell"><aside className="sidebar"><Link className="brand-lockup" href={base+"/today"}><span className="brand-mark">A</span><div><strong>AtlasOS</strong><small>BUSINESS OBSERVATORY</small></div><span className={"mode-badge "+(model.mode==="demo"?"demo":"")}>{model.mode}</span></Link><nav className="primary-nav" aria-label="Primary navigation">{nav.map(item=><Link key={item.section} className={"nav-link "+(item.section===active?"selected":"")} href={item.href}><span className="nav-glyph">{item.glyph}</span><span>{item.label}</span>{item.section==="approvals"&&model.counts.pendingApprovals?<span className="nav-count">{model.counts.pendingApprovals}</span>:item.section==="alerts"&&model.counts.alerts?<span className="nav-count">{model.counts.alerts}</span>:null}</Link>)}</nav><div className="sidebar-bottom"><div className="workspace-card"><span className="workspace-avatar">{model.workspace.name.slice(0,1).toUpperCase()}</span><div className="workspace-meta"><strong>{model.workspace.name}</strong><small>{model.workspace.verticalId} · {model.workspace.planId}</small></div></div>{model.mode==="connected"?<Link className="logout-link" href="/api/auth/logout">Log out</Link>:<Link className="logout-link" href="/login">Open Connected mode</Link>}</div></aside><main className="workspace"><header className="topbar"><div><div className="eyebrow"><span className="status-dot"/>{info.eyebrow} / {model.mode.toUpperCase()}</div><h1>{info.title}</h1><p>{info.copy}</p></div><div className="topbar-actions"><span className="status-pill"><span className="status-dot"/>{model.mode==="connected"?"CONNECTED":"DEMO DATA"}</span>{model.mode==="connected"?<Link className="status-pill responsive-logout" href="/api/auth/logout">Log out</Link>:null}</div></header><AskAtlasCommand mode={model.mode} demoSummary={summary}/>{children}</main><nav className="mobile-nav" aria-label="Mobile navigation">{nav.map(item=><Link key={item.section} href={item.href} className={item.section===active?"selected":""}><b>{item.glyph}</b><span>{item.label}</span></Link>)}</nav></div>;
}
