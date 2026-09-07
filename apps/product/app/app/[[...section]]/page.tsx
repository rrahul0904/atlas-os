import {redirect} from "next/navigation";
import {AppShell} from "@/components/app-shell";
import {LiveFeed,SectionView,TodayView} from "@/components/views";
import {ApprovalView} from "@/components/approval-view";
import {connectedModel} from "@/lib/connected";
import {requireAtlasPrincipal} from "@/lib/session";
import type {ProductSection} from "@/lib/types";

const valid=new Set<ProductSection>(["today","live","customers","pipeline","bookings","orders","money","inventory","work","agents","workflows","approvals","integrations","alerts","billing"]);

export default async function ConnectedAppPage({params}:{params:Promise<{section?:string[]}>}){
  const principal=await requireAtlasPrincipal(),route=await params;
  const raw=route.section?.join("/")||"today";
  const section=(raw==="settings/billing"?"billing":raw) as ProductSection;
  if(!valid.has(section))redirect("/app/today");
  const model=await connectedModel(principal);
  return <AppShell model={model} active={section}>{section==="today"?<TodayView model={model}/>:section==="live"?<LiveFeed model={model}/>:section==="approvals"?<ApprovalView model={model}/>:<SectionView model={model} section={section}/>}</AppShell>;
}
