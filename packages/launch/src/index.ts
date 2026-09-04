export type LaunchStatus="draft"|"scheduled"|"live"|"completed";
export interface LaunchRecord {
  id:string;workspaceId:string;productId:string;status:LaunchStatus;startsAt:string;endsAt:string;
  headline:string;story:string;plan:"free"|"pro";sponsoredSlots:number;qualityScore:number;
  uniqueVotes:number;weightedVotes:number;verifiedReviews:number;impressions:number;clicks:number;
  conversions:number;createdAt:string;
}
const clamp=(value:number,min=0,max=1)=>Math.min(max,Math.max(min,value));
export function wilsonLowerBound(up:number,total:number,z=1.96):number{
  if(total<=0)return 0;
  const p=up/total,z2=z*z;
  const numerator=p+z2/(2*total)-z*Math.sqrt((p*(1-p)+z2/(4*total))/total);
  return numerator/(1+z2/total);
}
export function organicRankScore(launch:LaunchRecord,now=new Date()):number{
  const ageHours=Math.max(0,(now.getTime()-new Date(launch.startsAt).getTime())/3_600_000);
  const freshness=Math.exp(-ageHours/(24*12));
  const voteTrust=wilsonLowerBound(Math.floor(launch.weightedVotes),Math.max(launch.uniqueVotes,1));
  const ctr=launch.impressions>0?clamp(launch.clicks/launch.impressions,0,.35)/.35:0;
  const review=clamp(launch.verifiedReviews/12);
  const quality=clamp(launch.qualityScore/100);
  return Number((quality*.34+voteTrust*.24+freshness*.2+review*.12+ctr*.1).toFixed(6));
}
export function rankOrganic(launches:LaunchRecord[],now=new Date()):LaunchRecord[]{
  return [...launches].sort((a,b)=>organicRankScore(b,now)-organicRankScore(a,now)||a.id.localeCompare(b.id));
}
export function sponsoredExposure(launch:LaunchRecord){
  const eligible=launch.plan==="pro"&&launch.sponsoredSlots>0;
  return {eligible,label:eligible?"Sponsored" as const:null,slots:eligible?launch.sponsoredSlots:0};
}
