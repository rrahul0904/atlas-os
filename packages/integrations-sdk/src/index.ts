export type IntegrationState="connected"|"degraded"|"not_configured"|"error"|"needs_reauthentication";
export type IntegrationRisk="low"|"medium"|"high"|"critical";

export interface IntegrationContext{
  tenantId:string;
  workspaceId:string;
  connectionId:string;
}

export interface IntegrationHealth{
  state:IntegrationState;
  message?:string;
  checkedAt:string;
  details?:Record<string,string|number|boolean|null>;
}

export interface IntegrationCapability{
  id:string;
  name:string;
  write:boolean;
  risk:IntegrationRisk;
  requiredScopes:string[];
}

export interface IntegrationExecutionContext extends IntegrationContext{
  actionId:string;
  idempotencyKey:string;
  initiatedBy:string;
  agentId?:string;
}

export interface IntegrationExecutionResult{
  ok:boolean;
  status:number;
  data:Record<string,unknown>;
  externalId?:string;
  idempotencyKey:string;
  completedAt:string;
}

export interface IntegrationAdapter<TConfig=Record<string,unknown>>{
  id:string;
  name:string;
  health(context:IntegrationContext,config:TConfig):Promise<IntegrationHealth>;
  capabilities():IntegrationCapability[];
  execute(actionId:string,input:Record<string,unknown>,context:IntegrationExecutionContext,config:TConfig):Promise<IntegrationExecutionResult>;
}

export class IntegrationAdapterRegistry{
  private readonly adapters=new Map<string,IntegrationAdapter<any>>();
  register(adapter:IntegrationAdapter<any>){this.adapters.set(adapter.id,adapter);return this;}
  get(id:string){return this.adapters.get(id)??null;}
  list(){return [...this.adapters.values()];}
}

export interface AtlasIntegration<TConfig=Record<string,unknown>>{
  id:string;
  name:string;
  actions:IntegrationCapability[];
  health(context:IntegrationContext,config:TConfig):Promise<IntegrationHealth>;
  sync?(context:IntegrationContext,config:TConfig):Promise<{cursor?:string;records:number}>;
  execute?(context:IntegrationContext,actionId:string,input:Record<string,unknown>,config:TConfig):Promise<Record<string,unknown>>;
}

export function assertActionAllowed(integration:{capabilities():IntegrationCapability[]}|AtlasIntegration,actionId:string){
  const actions="capabilities" in integration?integration.capabilities():integration.actions;
  const action=actions.find(item=>item.id===actionId);
  if(!action)throw new Error(`unknown integration action: ${actionId}`);
  return action;
}
