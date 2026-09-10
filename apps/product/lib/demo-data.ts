import {terminologyFor} from "@atlas/business-kernel";
import type {AtlasActivity} from "@atlas/activity";
import type {AtlasProductModel,ProductMetric,ProductRow,ProductSection} from "./types";

const NOW="2026-09-07T01:00:00.000Z";
type DemoVertical="founder"|"dental"|"restaurant"|"bakery";

const specs:Record<DemoVertical,{
  name:string;metrics:ProductMetric[];customers:ProductRow[];pipeline:ProductRow[];bookings:ProductRow[];orders:ProductRow[];money:ProductRow[];inventory:ProductRow[];work:ProductRow[];
  activity:Array<Partial<AtlasActivity>&Pick<AtlasActivity,"id"|"category"|"title"|"description"|"occurredAt">>;
}>={
  founder:{
    name:"Northstar Labs",metrics:[{label:"Open opportunities",value:8,note:"$146k weighted pipeline"},{label:"Revenue collected",value:"$42.8k",note:"Current month"},{label:"Needs attention",value:3,note:"Evidence-backed",state:"warn"},{label:"Pending approvals",value:1,note:"Governed action",state:"warn"},{label:"Active projects",value:4,note:"2 due this week"}],
    customers:[{id:"c1",primary:"Acme Design",secondary:"Founder contact",status:"Active",meta:"Last activity 14m ago"},{id:"c2",primary:"BrightOps",secondary:"Buyer",status:"Active",meta:"Opportunity open"}],
    pipeline:[{id:"p1",primary:"BrightOps platform rollout",secondary:"Proposal",status:"Open",meta:"$48,000 · Sep 18"},{id:"p2",primary:"Acme expansion",secondary:"Discovery",status:"Open",meta:"$22,000 · Sep 29"}],
    bookings:[{id:"b1",primary:"BrightOps decision meeting",secondary:"Meeting",status:"Confirmed",meta:"Tomorrow · 2:00 PM"}],
    orders:[{id:"o1",primary:"Enterprise implementation",secondary:"Service order",status:"Confirmed",meta:"$18,000 · delivery active"}],
    money:[{id:"m1",primary:"September collected",secondary:"Payments",status:"Value",meta:"$42,800"},{id:"m2",primary:"Open invoices",secondary:"Receivables",status:"2 open",meta:"$9,400"}],
    inventory:[],work:[{id:"w1",primary:"Launch enterprise onboarding",secondary:"Project",status:"Active",meta:"Due Sep 12"},{id:"w2",primary:"Founder evidence review",secondary:"Task",status:"High",meta:"Today · 4 PM"}],
    activity:[{id:"a1",category:"revenue",title:"Invoice paid · BrightOps",description:"$12,000 payment received.",occurredAt:"2026-09-07T00:47:00Z"},{id:"a2",category:"workflow",title:"Lead qualification completed",description:"Atlas classified 18 inbound leads.",occurredAt:"2026-09-07T00:32:00Z"}]
  },
  dental:{
    name:"Riverside Dental",metrics:[{label:"Appointments today",value:21,note:"18 confirmed"},{label:"Open capacity",value:"2h 30m",note:"Across 3 chairs"},{label:"Unconfirmed",value:3,note:"Needs outreach",state:"warn"},{label:"Pending approvals",value:1,note:"Waitlist outreach",state:"warn"},{label:"Collections",value:"$8.4k",note:"Today"}],
    customers:[{id:"c1",primary:"Patient A.",secondary:"Patient",status:"Active",meta:"Next appointment today"},{id:"c2",primary:"Patient B.",secondary:"Patient",status:"Active",meta:"Recall due in 18 days"}],
    pipeline:[],
    bookings:[{id:"b1",primary:"Patient A. · Cleaning",secondary:"Appointment",status:"Confirmed",meta:"9:30 AM · Chair 2"},{id:"b2",primary:"Patient C. · Consultation",secondary:"Appointment",status:"Canceled",meta:"11:00 AM · Chair 1"},{id:"b3",primary:"Patient D. · Whitening",secondary:"Appointment",status:"Scheduled",meta:"2:30 PM · confirmation pending"}],
    orders:[{id:"o1",primary:"Patient A. service order",secondary:"Service order",status:"Completed",meta:"$185"}],
    money:[{id:"m1",primary:"Collected today",secondary:"Payments",status:"Value",meta:"$8,420"},{id:"m2",primary:"Past due invoices",secondary:"Receivables",status:"2",meta:"$640"}],
    inventory:[{id:"i1",primary:"Exam gloves",secondary:"Clinical supply",status:"Low stock",meta:"2 boxes · reorder point 5"},{id:"i2",primary:"Fluoride varnish",secondary:"Supply",status:"Healthy",meta:"14 units"}],
    work:[{id:"w1",primary:"Review released 11 AM capacity",secondary:"Task",status:"High",meta:"Cancellation created 60m opening"}],
    activity:[{id:"a1",category:"booking",title:"Appointment canceled",description:"11:00 AM consultation released Chair 1.",occurredAt:"2026-09-07T00:51:00Z"},{id:"a2",category:"approval",title:"Waitlist outreach needs approval",description:"Atlas prepared two evidence-ranked candidates.",occurredAt:"2026-09-07T00:49:00Z"}]
  },
  restaurant:{
    name:"Juniper Table",metrics:[{label:"Reservations tonight",value:34,note:"112 covers"},{label:"Available capacity",value:16,note:"Prime window"},{label:"Unconfirmed",value:4,note:"Needs confirmation",state:"warn"},{label:"No-show risk",value:2,note:"Evidence-backed",state:"warn"},{label:"Prepaid revenue",value:"$3.2k",note:"Tonight"}],
    customers:[{id:"c1",primary:"Guest K.",secondary:"Guest",status:"Returning",meta:"4 visits"},{id:"c2",primary:"Guest M.",secondary:"Guest",status:"New",meta:"First reservation"}],
    pipeline:[],
    bookings:[{id:"b1",primary:"Guest K. · party of 4",secondary:"Reservation",status:"Confirmed",meta:"7:00 PM · Table 12"},{id:"b2",primary:"Guest M. · party of 2",secondary:"Reservation",status:"Scheduled",meta:"7:30 PM · confirmation pending"}],
    orders:[{id:"o1",primary:"Chef table prepayment",secondary:"Experience",status:"Paid",meta:"$240 · Guest K."}],
    money:[{id:"m1",primary:"Prepaid tonight",secondary:"Reservations",status:"Value",meta:"$3,240"},{id:"m2",primary:"Outstanding deposits",secondary:"Receivables",status:"3",meta:"$450"}],
    inventory:[],work:[{id:"w1",primary:"Confirm 7:30 PM reservations",secondary:"Task",status:"High",meta:"4 guests pending"}],
    activity:[{id:"a1",category:"booking",title:"Reservation confirmed",description:"Party of 4 confirmed Table 12.",occurredAt:"2026-09-07T00:54:00Z"},{id:"a2",category:"booking",title:"Reservation canceled",description:"Party of 2 released 7:30 PM capacity.",occurredAt:"2026-09-07T00:41:00Z"}]
  },
  bakery:{
    name:"Maple & Grain",metrics:[{label:"Orders today",value:47,note:"$2.8k booked"},{label:"Pickup slots",value:31,note:"6 remaining"},{label:"Unfulfilled",value:12,note:"4 ready"},{label:"Low stock",value:2,note:"Needs attention",state:"warn"},{label:"Pending approvals",value:0,note:"No blocked actions"}],
    customers:[{id:"c1",primary:"Customer J.",secondary:"Customer",status:"Active",meta:"Pickup at 3:30 PM"},{id:"c2",primary:"Customer P.",secondary:"Customer",status:"Active",meta:"Custom cake order"}],
    pipeline:[],
    bookings:[{id:"b1",primary:"Customer J. pickup",secondary:"Pickup / production slot",status:"Confirmed",meta:"3:30 PM · Pickup counter"},{id:"b2",primary:"Wedding cake pickup",secondary:"Pickup / production slot",status:"Confirmed",meta:"5:00 PM · 2 items"}],
    orders:[{id:"o1",primary:"Celebration cake",secondary:"Order",status:"Preparing",meta:"$70 · pickup 3:30 PM"},{id:"o2",primary:"Bread box × 2",secondary:"Order",status:"Ready",meta:"$48 · pickup 4:00 PM"}],
    money:[{id:"m1",primary:"Order revenue today",secondary:"Orders",status:"Value",meta:"$2,842"},{id:"m2",primary:"Payments captured",secondary:"Payments",status:"43",meta:"$2,596"}],
    inventory:[{id:"i1",primary:"Bread flour",secondary:"Ingredient",status:"Low stock",meta:"2 bags · reorder point 5"},{id:"i2",primary:"Cake boxes",secondary:"Packaging",status:"Low stock",meta:"8 · reorder point 12"}],
    work:[{id:"w1",primary:"Finish celebration cake",secondary:"Fulfillment",status:"Preparing",meta:"Due 3:15 PM"},{id:"w2",primary:"Restock bread flour",secondary:"Task",status:"High",meta:"Before tomorrow bake"}],
    activity:[{id:"a1",category:"order",title:"Custom cake order created",description:"Customer J. · $70 · pickup 3:30 PM.",occurredAt:"2026-09-07T00:55:00Z"},{id:"a2",category:"inventory",title:"Bread flour below reorder point",description:"2 bags on hand; reorder point is 5.",occurredAt:"2026-09-07T00:44:00Z"}]
  }
};

const emptySections:Record<ProductSection,ProductRow[]>={
  today:[],live:[],customers:[],pipeline:[],bookings:[],orders:[],money:[],inventory:[],work:[],agents:[],workflows:[],approvals:[],integrations:[],alerts:[],billing:[]
};

export function demoModel(vertical:DemoVertical):AtlasProductModel{
  const spec=specs[vertical],terms=terminologyFor(vertical);
  const activity=spec.activity.map((row,index)=>({
    tenantId:"demo",workspaceId:"demo-"+vertical,entityType:null,entityId:null,sourceModule:"demo",sourceIntegration:null,severity:"info" as const,outcome:null,locationId:null,
    latitude:index===0&&vertical==="restaurant"?40.7128:null,longitude:index===0&&vertical==="restaurant"?-74.006:null,evidenceIds:[],actionId:null,...row
  })) as AtlasActivity[];
  const rows={...emptySections,
    customers:spec.customers,pipeline:spec.pipeline,bookings:spec.bookings,orders:spec.orders,money:spec.money,inventory:spec.inventory,work:spec.work,
    agents:[{id:"ag1",primary:"Operations Agent",secondary:"Governed agent",status:"Enabled",meta:"Scoped tools · approval policy active"}],
    workflows:[{id:"wf1",primary:"Daily operating review",secondary:"Workflow",status:"Completed",meta:"8:00 AM · 6 steps"}],
    approvals:vertical==="dental"?[{id:"ap1",primary:"Offer released capacity to waitlist",secondary:"Governed external outreach",status:"Pending",meta:"Medium risk · evidence attached"}]:[],
    integrations:[{id:"in1",primary:"Google Workspace",secondary:"Gmail + Calendar",status:"Connected",meta:"Demo state only"},{id:"in2",primary:"Webhook / REST",secondary:"Generic connector",status:"Healthy",meta:"Demo state only"}],
    alerts:spec.metrics.filter(m=>m.state==="warn"||m.state==="bad").map((m,i)=>({id:"al"+i,primary:m.label,secondary:"Operational signal",status:m.state==="bad"?"Critical":"Warning",meta:m.note})),
    billing:[{id:"bill",primary:"Business",secondary:"AtlasOS plan",status:"Demo",meta:"Subscription billing is separate from business revenue"}]
  };
  return{mode:"demo",workspace:{id:"demo-"+vertical,tenantId:"demo",name:spec.name,verticalId:vertical,planId:"business",billingStatus:"demo"},principalRole:null,terminology:terms,modules:["today","business-ops","agent-governance"],
    metrics:spec.metrics,attention:rows.alerts.map(r=>({id:r.id,title:r.primary,why:r.meta,severity:"warning",entity:r.secondary,action:"Inspect",status:r.status})),
    upcoming:spec.bookings.slice(0,3).map(r=>({id:r.id,title:r.primary,when:r.meta,kind:terms.booking})),handled:[{id:"h1",title:"Workspace signals normalized",when:"Just now",kind:"Atlas"}],
    activity,rows,counts:{pendingApprovals:rows.approvals.length,alerts:rows.alerts.length}};
}

export const demoVerticals=["founder","dental","restaurant","bakery"] as const;
export function isDemoVertical(value:string):value is DemoVertical{return (demoVerticals as readonly string[]).includes(value)}
export const demoNow=NOW;
