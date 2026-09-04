import type {SafeValue} from"../../domain/src/index.js";
export type Availability="value"|"no_data"|"not_connected"|"unavailable";
export type Environment="development"|"preview"|"production";
export type EventCategory="page"|"user"|"product"|"conversion"|"revenue"|"ai"|"infrastructure"|"deployment"|"health"|"custom";
export interface MetricValue{availability:Availability;value?:number;unit?:"count"|"currency"|"percent"|"milliseconds";currency?:string;}
export interface ObservabilityEvent{id:string;schemaVersion:number;tenantId:string;workspaceId:string;projectId?:string;environment:Environment;eventName:string;eventCategory:EventCategory;occurredAt:string;receivedAt:string;component?:string;geography?:{country?:string;region?:string;city?:string;latitude?:number;longitude?:number};acquisition?:{referrer?:string;source?:string;medium?:string;campaign?:string};properties?:Record<string,SafeValue>;}
export function metricUnavailable(reason:"no_data"|"not_connected"|"unavailable"):MetricValue{return{availability:reason};}
export function metricValue(value:number,unit:MetricValue["unit"],currency?:string):MetricValue{return{availability:"value",value,unit,currency};}
