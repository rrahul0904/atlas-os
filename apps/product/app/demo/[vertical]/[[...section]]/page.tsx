import {notFound} from "next/navigation";
import {AppShell} from "@/components/app-shell";
import {LiveFeed,SectionView,TodayView} from "@/components/views";
import {ApprovalView} from "@/components/approval-view";
import {demoModel,isDemoVertical} from "@/lib/demo-data";
import type {ProductSection} from "@/lib/types";

const valid=new Set<ProductSection>(["today","live","customers","pipeline","bookings","orders","money","inventory","work","agents","workflows","approvals","integrations","alerts","billing"]);

export default async function DemoProductPage({params}:{params:Promise<{vertical:string;section?:string[]}>}){
  const route=await params;if(!isDemoVertical(route.vertical))notFound();
  const raw=route.section?.join("/")||"today",section=(raw==="settings/billing"?"billing":raw) as ProductSection;if(!valid.has(section))notFound();
  const model=demoModel(route.vertical);
  return <AppShell model={model} active={section} demoVertical={route.vertical}>{section==="today"?<TodayView model={model}/>:section==="live"?<LiveFeed model={model}/>:section==="approvals"?<ApprovalView model={model}/>:<SectionView model={model} section={section}/>}</AppShell>;
}
