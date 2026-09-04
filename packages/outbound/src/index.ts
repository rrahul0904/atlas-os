export type DomainStatus="pending_ns"|"provisioning"|"dns_validation"|"warming"|"ready"|"degraded"|"blacklisted"|"paused"|"disabled";
export interface SendingDomain {
  id:string;workspaceId:string;domain:string;status:DomainStatus;healthScore:number;
  safeDailyCapacity:number;sendingEnabled:boolean;
}
export interface OutboundContact {
  id:string;workspaceId:string;email:string;verificationStatus:string;suppressed:boolean;suppressionReason?:string;
}
export interface OutboundCampaign { id:string;workspaceId:string;name:string;status:string;policyMode:string;dailyLimit:number; }
export interface DeliveryEvent {
  id:string;workspaceId:string;campaignId?:string;eventType:string;providerMessageId?:string;
  recipientHash?:string;occurredAt:string;
}
export interface DomainHealthSnapshot {
  domainId:string;healthScore:number;bounceRate:number;complaintRate:number;blacklistHits:number;recordedAt:string;
}
export function canSend(domain:SendingDomain,requested:number):{allowed:boolean;reason:string}{
  if(!domain.sendingEnabled)return {allowed:false,reason:"sending-disabled"};
  if(domain.status!=="ready")return {allowed:false,reason:`domain-${domain.status}`};
  if(domain.healthScore<70)return {allowed:false,reason:"health-below-threshold"};
  if(requested>domain.safeDailyCapacity)return {allowed:false,reason:"safe-capacity-exceeded"};
  return {allowed:true,reason:"ok"};
}
