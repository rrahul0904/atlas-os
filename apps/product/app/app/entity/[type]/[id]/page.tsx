import {notFound} from "next/navigation";
import {AppShell} from "@/components/app-shell";
import {connectedModel} from "@/lib/connected";
import {requireAtlasPrincipal} from "@/lib/session";
import {db} from "@atlas/db";
import {resolveWorkspaceContext} from "@atlas/context";
import type {ProductSection} from "@/lib/types";

const supported=new Set(["booking","order","contact","invoice","inventory_item","opportunity","lead","fulfillment","task"]);

function sectionFor(type:string):ProductSection{
  if(type==="booking")return"bookings";
  if(type==="order"||type==="fulfillment")return"orders";
  if(type==="contact")return"customers";
  if(type==="invoice")return"money";
  if(type==="inventory_item")return"inventory";
  if(type==="opportunity"||type==="lead")return"pipeline";
  return"work";
}
function entries(record:Record<string,unknown>){
  const hidden=new Set(["tenantId","workspaceId","tenant_id","workspace_id"]);
  return Object.entries(record).filter(([key,value])=>!hidden.has(key)&&value!==undefined&&typeof value!=="object").slice(0,24);
}
function recordFor(context:any,type:string,id:string){
  const b=context.business;
  const collections:Record<string,any[]>={
    booking:b.bookings,order:b.orders,contact:b.contacts,invoice:b.invoices,inventory_item:b.inventory,
    opportunity:b.opportunities,lead:b.leads,fulfillment:b.fulfillments,task:context.tasks
  };
  return (collections[type]||[]).find((row:any)=>String(row.id)===id)||null;
}

export default async function EntityPage({params}:{params:Promise<{type:string;id:string}>}){
  const route=await params;if(!supported.has(route.type))notFound();
  const principal=await requireAtlasPrincipal();
  const [model,context]=await Promise.all([connectedModel(principal),resolveWorkspaceContext(db(),principal)]);
  const record=recordFor(context,route.type,route.id);if(!record)notFound();
  const section=sectionFor(route.type),label=route.type.replaceAll("_"," ").replace(/\b\w/g,c=>c.toUpperCase());
  return <AppShell model={model} active={section}><section className="section-hero"><article className="panel section-summary"><span className="section-kicker">CANONICAL ENTITY</span><h2>{String((record as any).title||(record as any).name||(record as any).displayName||label)}</h2><p>This record was resolved through the authenticated workspace context. Tenant and workspace identity are never accepted from the URL.</p><div className="signal-strip"><div className="signal-box"><span>Type</span><strong>{label}</strong></div><div className="signal-box"><span>ID</span><strong>{route.id.slice(0,12)}</strong></div><div className="signal-box"><span>Mode</span><strong>Connected</strong></div></div></article><article className="panel section-summary"><span className="section-kicker">OPERATING CONTEXT</span><h2>Evidence → record → governed action</h2><p>Live signals can land here without bypassing Atlas governance. Any future external write from this record must still pass through workflow, integration and approval policy.</p></article></section><section className="table-panel"><div className="table-top"><h2>Record details</h2><small>{entries(record).length} visible fields</small></div><div className="table-scroll"><table className="data-table"><thead><tr><th>FIELD</th><th>VALUE</th></tr></thead><tbody>{entries(record).map(([key,value])=><tr key={key}><td>{key.replaceAll("_"," ")}</td><td>{value==null?"—":String(value)}</td></tr>)}</tbody></table></div></section></AppShell>;
}
