import type {BusinessTerminology} from "@atlas/business-kernel";
import type {AtlasActivity} from "@atlas/activity";

export type ProductMode="demo"|"connected";
export type ProductSection=
  "today"|"live"|"customers"|"pipeline"|"bookings"|"orders"|"money"|"inventory"|"work"|"agents"|"workflows"|"approvals"|"integrations"|"alerts"|"billing";

export interface ProductMetric{label:string;value:string|number;note:string;state?:"good"|"warn"|"bad"|"muted"}
export interface ProductRow{id:string;primary:string;secondary:string;status:string;meta:string;href?:string}
export interface ProductAttention{id:string;title:string;why:string;severity:"critical"|"warning"|"info";entity:string;action:string;status:string}
export interface ProductUpcoming{id:string;title:string;when:string;kind:string}
export interface ProductHandled{id:string;title:string;when:string;kind:string}

export interface AtlasProductModel{
  mode:ProductMode;
  workspace:{id:string;name:string;verticalId:string;planId:string;billingStatus:string};
  terminology:BusinessTerminology;
  modules:string[];
  metrics:ProductMetric[];
  attention:ProductAttention[];
  upcoming:ProductUpcoming[];
  handled:ProductHandled[];
  activity:AtlasActivity[];
  rows:Record<ProductSection,ProductRow[]>;
  counts:{pendingApprovals:number;alerts:number};
}
