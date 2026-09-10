import type {BusinessTerminology} from "@atlas/business-kernel";
import type {ProductSection} from "./types";

export interface NavItem{section:ProductSection;label:string;href:string;glyph:string}
const glyphs:Record<ProductSection,string>={today:"◫",live:"◎",customers:"◌",pipeline:"↗",bookings:"◷",orders:"▤",money:"$",inventory:"◒",work:"✓",agents:"◇",workflows:"⌁",approvals:"!",integrations:"⌘",alerts:"△",billing:"⚙"};
const roleRank:Record<string,number>={viewer:0,member:1,operator:2,admin:3,owner:4};

export function visibleSections(verticalId:string){
  const base:ProductSection[]=["today","live","customers"];
  if(["founder","ceo","agency","contractor"].includes(verticalId))base.push("pipeline");
  base.push("bookings");
  if(["bakery","restaurant","founder","agency","contractor"].includes(verticalId))base.push("orders");
  base.push("money");
  if(["bakery","dental","restaurant","contractor"].includes(verticalId))base.push("inventory");
  base.push("work","agents","workflows","approvals","integrations","alerts","billing");
  return base;
}

export function sectionVisibleToRole(section:ProductSection,mode:"demo"|"connected",role?:string|null){
  if(mode==="demo")return true;
  const rank=roleRank[role??""]??-1;
  if(section==="integrations")return rank>=roleRank.operator;
  if(section==="billing")return rank>=roleRank.admin;
  return rank>=roleRank.viewer;
}

export function navLabel(section:ProductSection,terms:BusinessTerminology){
  if(section==="customers")return terms.contactPlural;
  if(section==="bookings")return terms.bookingPlural;
  if(section==="orders")return terms.orderPlural;
  if(section==="billing")return"Settings";
  return section.charAt(0).toUpperCase()+section.slice(1);
}

export function productNavigation(input:{mode:"demo"|"connected";verticalId:string;terms:BusinessTerminology;demoVertical?:string;role?:string|null}):NavItem[]{
  const prefix=input.mode==="demo"?"/demo/"+encodeURIComponent(input.demoVertical??input.verticalId):"/app";
  return visibleSections(input.verticalId)
    .filter(section=>sectionVisibleToRole(section,input.mode,input.role))
    .map(section=>({section,label:navLabel(section,input.terms),href:prefix+"/"+section,glyph:glyphs[section]}));
}
