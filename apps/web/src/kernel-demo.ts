import {terminologyFor} from "../../../packages/business-kernel/src/index.js";

const esc=(value:string)=>value.replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]??char));

const rows=[
  {canonical:"Contact",key:"contact" as const},
  {canonical:"Booking",key:"booking" as const},
  {canonical:"Resource",key:"resource" as const},
  {canonical:"Catalog item",key:"catalogItem" as const},
  {canonical:"Order",key:"order" as const},
  {canonical:"Fulfillment",key:"fulfillment" as const}
];

export function renderKernelDemo(){
  const verticals=[
    {id:"dental",label:"Dental"},
    {id:"restaurant",label:"Reservation"},
    {id:"bakery",label:"Bakery"},
    {id:"founder",label:"Founder / SaaS"}
  ];
  const header=verticals.map(v=>`<th>${esc(v.label)}</th>`).join("");
  const body=rows.map(row=>{
    const cells=verticals.map(v=>{
      const terms=terminologyFor(v.id);
      return `<td>${esc(String(terms[row.key]))}</td>`;
    }).join("");
    return `<tr><th>${esc(row.canonical)}</th>${cells}</tr>`;
  }).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AtlasOS · Horizontal Kernel</title><link rel="stylesheet" href="/assets/atlas.css"><style>
  .kernel{max-width:1180px;margin:0 auto;padding:56px 24px}.kernel h1{max-width:900px}.kernel-note{max-width:850px;margin:0 0 32px}.kernel-table{overflow:auto;margin:28px 0}.kernel-table table{width:100%;border-collapse:collapse;background:var(--panel,#fff);border-radius:16px;overflow:hidden}.kernel-table th,.kernel-table td{padding:16px;text-align:left;border-bottom:1px solid rgba(127,127,127,.18)}.kernel-table thead th{font-size:12px;text-transform:uppercase;letter-spacing:.08em}.kernel-flow{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px;margin:28px 0}.kernel-step{padding:18px;border:1px solid rgba(127,127,127,.22);border-radius:14px}.kernel-step b{display:block;margin-bottom:7px}.kernel-badge{display:inline-block;padding:6px 10px;border-radius:999px;border:1px solid rgba(127,127,127,.3);font-size:12px}.kernel-back{display:inline-block;margin-top:28px}@media(max-width:800px){.kernel-flow{grid-template-columns:1fr}}
  </style></head><body><main class="kernel"><small class="eyebrow">ATLASOS / ARCHITECTURE DEMO</small><h1>Different businesses. One operating kernel.</h1><p class="kernel-note">This is a static architecture preview, not connected customer data. The production kernel stores canonical records; each business type changes terminology, defaults, workflows, and views rather than creating a new infrastructure silo.</p><span class="kernel-badge">Canonical: Location + Resource + Booking + Catalog + Order + Fulfillment</span>
  <div class="kernel-table"><table><thead><tr><th>Canonical entity</th>${header}</tr></thead><tbody>${body}</tbody></table></div>
  <h2>One reusable operating loop</h2><div class="kernel-flow">
    <div class="kernel-step"><b>1. Demand</b><span>Customer, guest, patient, or prospect creates demand.</span></div>
    <div class="kernel-step"><b>2. Capacity</b><span>Atlas checks a scoped resource and location.</span></div>
    <div class="kernel-step"><b>3. Commitment</b><span>A Booking reserves time/capacity; an Order snapshots commercial value.</span></div>
    <div class="kernel-step"><b>4. Operations</b><span>Tasks, inventory, approvals, and fulfillment represent work to do.</span></div>
    <div class="kernel-step"><b>5. Intelligence</b><span>Today and Ask Atlas read the same persisted business state.</span></div>
  </div>
  <p><b>Examples:</b> a dental appointment, a dinner reservation, and a bakery pickup slot are all Bookings. A chair, table, and pickup counter are all Resources. Vertical names stay familiar to the operator while the underlying model stays reusable.</p>
  <a class="kernel-back" href="/">← All AtlasOS demos</a></main></body></html>`;
}
