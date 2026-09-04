export type IntegrationState="connected"|"degraded"|"not_configured"|"error";
export interface IntegrationContext { tenantId:string;workspaceId:string;connectionId:string; }
export interface IntegrationHealth { state:IntegrationState;message?:string;checkedAt:string; }
export interface IntegrationAction {
  id:string;name:string;write:boolean;risk:"low"|"medium"|"high"|"critical";requiredScopes:string[];
}
export interface AtlasIntegration<TConfig=Record<string,unknown>> {
  id:string;
  name:string;
  actions:IntegrationAction[];
  health(context:IntegrationContext,config:TConfig):Promise<IntegrationHealth>;
  sync?(context:IntegrationContext,config:TConfig):Promise<{cursor?:string;records:number}>;
  execute?(context:IntegrationContext,actionId:string,input:Record<string,unknown>,config:TConfig):Promise<Record<string,unknown>>;
}
export function assertActionAllowed(integration:AtlasIntegration,actionId:string){
  const action=integration.actions.find(item=>item.id===actionId);
  if(!action) throw new Error(`unknown integration action: ${actionId}`);
  return action;
}
