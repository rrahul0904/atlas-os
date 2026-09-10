import Link from "next/link";
import {atlasRuntimeConfigured,atlasSignupEnabled} from "@/lib/session";

const demos=[
  {id:"founder",name:"Founder / SaaS",copy:"Pipeline, revenue, projects and governed agent work."},
  {id:"dental",name:"Dental",copy:"Patients, appointments, capacity and approvals without clinical data."},
  {id:"restaurant",name:"Reservation",copy:"Guests, reservations, resource capacity and live operations."},
  {id:"bakery",name:"Bakery",copy:"Orders, pickup slots, inventory and fulfillment."}
];

export default function Home(){const runtime=atlasRuntimeConfigured(),signup=atlasSignupEnabled();return <main className="landing"><div className="landing-inner"><span className="eyebrow">ATLASOS / BUSINESS OBSERVATORY</span><h1>Run the business from one live operating system.</h1><p>PulseAtlas-level observability, now backed by AtlasOS tenancy, business primitives, evidence, workflows, approvals, integrations and governed agents.</p><div className="landing-actions">{runtime?<Link className="primary" href="/login">Sign in</Link>:<Link className="primary" href="/login">Connected mode</Link>}{signup?<Link href="/signup">Create workspace</Link>:null}<Link href="/demo/founder/today">Explore product demo</Link><Link href="/demo/earth">Full-screen Live Earth</Link></div><div className="demo-cards">{demos.map(d=><Link key={d.id} href={"/demo/"+d.id+"/today"} className="demo-card"><strong>{d.name}</strong><span>{d.copy}</span></Link>)}</div></div></main>}
