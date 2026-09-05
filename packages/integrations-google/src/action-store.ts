import {createHash,randomUUID} from "node:crypto";
import type {AtlasSql} from "../../db/src/index.js";
import type {SecretScope} from "../../secrets/src/index.js";

export interface GoogleActionRecord{
  id:string;
  connectionId:string;
  integrationId:string;
  actionId:string;
  idempotencyKey:string;
  requestFingerprint:string;
  status:"pending"|"completed"|"ambiguous"|"failed";
  externalId:string|null;
  providerMetadata:Record<string,unknown>;
  lastError:string|null;
}

function jsonObject(value:unknown):Record<string,unknown>{
  if(value&&typeof value==="object"&&!Array.isArray(value))return value as Record<string,unknown>;
  if(typeof value==="string"){
    try{
      const parsed=JSON.parse(value);
      if(parsed&&typeof parsed==="object"&&!Array.isArray(parsed))return parsed as Record<string,unknown>;
    }catch{}
  }
  return{};
}

function map(row:any):GoogleActionRecord{
  return{
    id:row.id,
    connectionId:row.connection_id,
    integrationId:row.integration_id,
    actionId:row.action_id,
    idempotencyKey:row.idempotency_key,
    requestFingerprint:row.request_fingerprint,
    status:row.status,
    externalId:row.external_id??null,
    providerMetadata:jsonObject(row.provider_metadata),
    lastError:row.last_error??null
  };
}

function canonical(value:unknown):string{
  if(value===null||typeof value!=="object")return JSON.stringify(value);
  if(Array.isArray(value))return "["+value.map(canonical).join(",")+"]";
  return"{"+Object.keys(value as Record<string,unknown>).sort().map(key=>JSON.stringify(key)+":"+canonical((value as Record<string,unknown>)[key])).join(",")+"}";
}

export function requestFingerprint(input:unknown){
  return createHash("sha256").update(canonical(input)).digest().toString("hex");
}

export class GoogleIntegrationActionRepository{
  constructor(private readonly sql:AtlasSql){}

  async begin(scope:SecretScope,input:{
    connectionId:string;integrationId:string;actionId:string;idempotencyKey:string;requestFingerprint:string;
  }):Promise<GoogleActionRecord>{
    const id=randomUUID();
    const inserted=await this.sql`INSERT INTO atlas_integration_actions(
      id,tenant_id,workspace_id,connection_id,integration_id,action_id,idempotency_key,request_fingerprint,status
    ) VALUES(
      ${id},${scope.tenantId},${scope.workspaceId},${input.connectionId},${input.integrationId},${input.actionId},${input.idempotencyKey},${input.requestFingerprint},'pending'
    ) ON CONFLICT(workspace_id,idempotency_key) DO NOTHING RETURNING *`;
    if(inserted[0])return map(inserted[0]);
    const rows=await this.sql`SELECT * FROM atlas_integration_actions
      WHERE tenant_id=${scope.tenantId} AND workspace_id=${scope.workspaceId} AND idempotency_key=${input.idempotencyKey} LIMIT 1`;
    const existing=rows[0];if(!existing)throw new Error("google-action-idempotency-scope-conflict");
    const record=map(existing);
    if(record.connectionId!==input.connectionId||record.integrationId!==input.integrationId||record.actionId!==input.actionId||record.requestFingerprint!==input.requestFingerprint){
      throw new Error("google-action-idempotency-collision");
    }
    return record;
  }

  async complete(scope:SecretScope,id:string,externalId:string|null,providerMetadata:Record<string,unknown>={}){
    const rows=await this.sql`UPDATE atlas_integration_actions SET
      status='completed',external_id=${externalId},provider_metadata=${JSON.stringify(providerMetadata)}::jsonb,
      last_error=NULL,completed_at=now(),updated_at=now()
      WHERE tenant_id=${scope.tenantId} AND workspace_id=${scope.workspaceId} AND id=${id}
      RETURNING *`;
    return rows[0]?map(rows[0]):null;
  }

  async ambiguous(scope:SecretScope,id:string,message:string){
    const rows=await this.sql`UPDATE atlas_integration_actions SET
      status='ambiguous',last_error=${message.slice(0,500)},updated_at=now()
      WHERE tenant_id=${scope.tenantId} AND workspace_id=${scope.workspaceId} AND id=${id} AND status<>'completed'
      RETURNING *`;
    return rows[0]?map(rows[0]):null;
  }

  async fail(scope:SecretScope,id:string,message:string){
    const rows=await this.sql`UPDATE atlas_integration_actions SET
      status='failed',last_error=${message.slice(0,500)},updated_at=now()
      WHERE tenant_id=${scope.tenantId} AND workspace_id=${scope.workspaceId} AND id=${id} AND status<>'completed'
      RETURNING *`;
    return rows[0]?map(rows[0]):null;
  }
}
