import {randomUUID} from "node:crypto";
import type {AtlasRole} from "../../tenancy/src/index.js";
import type {AtlasSql} from "../../db/src/index.js";

export interface StoredUser{id:string;email:string;displayName:string|null;passwordHash:string|null;createdAt:string}
export interface StoredWorkspace{id:string;tenantId:string;name:string;verticalId:string;planId:string;billingStatus:string;trialEndsAt:string|null;createdAt:string}
export interface StoredMembership{workspaceId:string;tenantId:string;userId:string;role:AtlasRole;status:string}

export class UserRepository{
  constructor(private readonly sql:AtlasSql){}
  async create(input:{email:string;displayName?:string|null;passwordHash:string}):Promise<StoredUser>{
    const id=randomUUID();
    const rows=await this.sql`
      INSERT INTO atlas_users(id,email,display_name,password_hash)
      VALUES(${id},${input.email.toLowerCase()},${input.displayName??null},${input.passwordHash})
      RETURNING id,email,display_name,password_hash,created_at
    `;
    const row=rows[0];
    return{id:row.id,email:row.email,displayName:row.display_name,passwordHash:row.password_hash,createdAt:new Date(row.created_at).toISOString()};
  }
  async findByEmail(email:string):Promise<StoredUser|null>{
    const rows=await this.sql`SELECT id,email,display_name,password_hash,created_at FROM atlas_users WHERE email=${email.toLowerCase()} LIMIT 1`;
    const row=rows[0];if(!row)return null;
    return{id:row.id,email:row.email,displayName:row.display_name,passwordHash:row.password_hash,createdAt:new Date(row.created_at).toISOString()};
  }
  async findById(id:string):Promise<StoredUser|null>{
    const rows=await this.sql`SELECT id,email,display_name,password_hash,created_at FROM atlas_users WHERE id=${id} LIMIT 1`;
    const row=rows[0];if(!row)return null;
    return{id:row.id,email:row.email,displayName:row.display_name,passwordHash:row.password_hash,createdAt:new Date(row.created_at).toISOString()};
  }
}

export class TenantRepository{
  constructor(private readonly sql:AtlasSql){}
  async create(name:string){const id=randomUUID();await this.sql`INSERT INTO atlas_tenants(id,name) VALUES(${id},${name})`;return{id,name};}
}

export class WorkspaceRepository{
  constructor(private readonly sql:AtlasSql){}
  async create(input:{tenantId:string;name:string;verticalId:string;planId?:string;trialDays?:number}):Promise<StoredWorkspace>{
    const id=randomUUID();const planId=input.planId??"business";const trialDays=input.trialDays??14;
    const rows=await this.sql`
      INSERT INTO atlas_workspaces(id,tenant_id,name,vertical_id,plan_id,billing_status,trial_ends_at)
      VALUES(${id},${input.tenantId},${input.name},${input.verticalId},${planId},'trialing',now()+${trialDays}*interval '1 day')
      RETURNING id,tenant_id,name,vertical_id,plan_id,billing_status,trial_ends_at,created_at
    `;
    const r=rows[0];
    return{id:r.id,tenantId:r.tenant_id,name:r.name,verticalId:r.vertical_id,planId:r.plan_id,billingStatus:r.billing_status,trialEndsAt:r.trial_ends_at?new Date(r.trial_ends_at).toISOString():null,createdAt:new Date(r.created_at).toISOString()};
  }
  async findScoped(tenantId:string,workspaceId:string):Promise<StoredWorkspace|null>{
    const rows=await this.sql`SELECT id,tenant_id,name,vertical_id,plan_id,billing_status,trial_ends_at,created_at FROM atlas_workspaces WHERE tenant_id=${tenantId} AND id=${workspaceId} LIMIT 1`;
    const r=rows[0];if(!r)return null;
    return{id:r.id,tenantId:r.tenant_id,name:r.name,verticalId:r.vertical_id,planId:r.plan_id,billingStatus:r.billing_status,trialEndsAt:r.trial_ends_at?new Date(r.trial_ends_at).toISOString():null,createdAt:new Date(r.created_at).toISOString()};
  }
}

export class MembershipRepository{
  constructor(private readonly sql:AtlasSql){}
  async create(input:{tenantId:string;workspaceId:string;userId:string;role:AtlasRole}):Promise<void>{
    await this.sql`INSERT INTO atlas_memberships(workspace_id,tenant_id,user_id,role,status) VALUES(${input.workspaceId},${input.tenantId},${input.userId},${input.role},'active')`;
  }
  async firstActiveForUser(userId:string):Promise<StoredMembership|null>{
    const rows=await this.sql`SELECT workspace_id,tenant_id,user_id,role,status FROM atlas_memberships WHERE user_id=${userId} AND status='active' ORDER BY created_at LIMIT 1`;
    const r=rows[0];if(!r)return null;
    return{workspaceId:r.workspace_id,tenantId:r.tenant_id,userId:r.user_id,role:r.role as AtlasRole,status:r.status};
  }
}

export class ModuleConfigurationRepository{
  constructor(private readonly sql:AtlasSql){}
  async replace(tenantId:string,workspaceId:string,moduleIds:string[]):Promise<void>{
    await this.sql.begin(async tx=>{
      await tx`DELETE FROM atlas_workspace_modules WHERE tenant_id=${tenantId} AND workspace_id=${workspaceId}`;
      for(const moduleId of moduleIds)await tx`INSERT INTO atlas_workspace_modules(workspace_id,tenant_id,module_id,enabled) VALUES(${workspaceId},${tenantId},${moduleId},true)`;
    });
  }
  async enabled(tenantId:string,workspaceId:string):Promise<string[]>{
    const rows=await this.sql`SELECT module_id FROM atlas_workspace_modules WHERE tenant_id=${tenantId} AND workspace_id=${workspaceId} AND enabled=true ORDER BY module_id`;
    return rows.map(r=>r.module_id);
  }
}

export class TaskRepository{
  constructor(private readonly sql:AtlasSql){}
  async create(scope:{tenantId:string;workspaceId:string},input:{title:string;priority?:string;dueAt?:string|null}){
    const id=randomUUID();
    await this.sql`INSERT INTO atlas_tasks(id,tenant_id,workspace_id,title,priority,due_at) VALUES(${id},${scope.tenantId},${scope.workspaceId},${input.title},${input.priority??"medium"},${input.dueAt??null})`;
    return{id,...scope,...input};
  }
  async list(scope:{tenantId:string;workspaceId:string}){
    return this.sql`SELECT id,title,status,priority,due_at FROM atlas_tasks WHERE tenant_id=${scope.tenantId} AND workspace_id=${scope.workspaceId} ORDER BY created_at DESC`;
  }
}

export class ApprovalRepository{
  constructor(private readonly sql:AtlasSql){}
  async listPending(scope:{tenantId:string;workspaceId:string}){
    return this.sql`SELECT id,agent_id,tool_id,action,risk,status,evidence,requested_at FROM atlas_approvals WHERE tenant_id=${scope.tenantId} AND workspace_id=${scope.workspaceId} AND status='pending' ORDER BY requested_at`;
  }
}

export class AuditRepository{
  constructor(private readonly sql:AtlasSql){}
  async record(scope:{tenantId:string;workspaceId:string},input:{actorId?:string;action:string;targetType?:string;targetId?:string;metadata?:Record<string,unknown>}){
    const id=randomUUID();
    await this.sql`INSERT INTO atlas_audit_events(id,tenant_id,workspace_id,actor_id,action,target_type,target_id,metadata) VALUES(${id},${scope.tenantId},${scope.workspaceId},${input.actorId??null},${input.action},${input.targetType??null},${input.targetId??null},${this.sql.json(input.metadata??{})})`;
    return id;
  }
}

export class EventRepository{
  constructor(private readonly sql:AtlasSql){}
  async record(scope:{tenantId:string;workspaceId:string},input:{module:string;type:string;entityType?:string;entityId?:string;properties?:Record<string,unknown>;occurredAt?:string}){
    const id=randomUUID();
    await this.sql`INSERT INTO atlas_events(id,tenant_id,workspace_id,module,type,entity_type,entity_id,properties,occurred_at) VALUES(${id},${scope.tenantId},${scope.workspaceId},${input.module},${input.type},${input.entityType??null},${input.entityId??null},${this.sql.json(input.properties??{})},${input.occurredAt??new Date().toISOString()})`;
    return id;
  }
}

export async function provisionWorkspace(sql:AtlasSql,input:{userId:string;workspaceName:string;verticalId:string;moduleIds:string[];planId?:string}){
  return sql.begin(async tx=>{
    const tenantId=randomUUID();const workspaceId=randomUUID();const planId=input.planId??"business";
    await tx`INSERT INTO atlas_tenants(id,name) VALUES(${tenantId},${input.workspaceName})`;
    await tx`INSERT INTO atlas_workspaces(id,tenant_id,name,vertical_id,plan_id,billing_status,trial_ends_at) VALUES(${workspaceId},${tenantId},${input.workspaceName},${input.verticalId},${planId},'trialing',now()+interval '14 days')`;
    await tx`INSERT INTO atlas_memberships(workspace_id,tenant_id,user_id,role,status) VALUES(${workspaceId},${tenantId},${input.userId},'owner','active')`;
    for(const moduleId of input.moduleIds)await tx`INSERT INTO atlas_workspace_modules(workspace_id,tenant_id,module_id,enabled) VALUES(${workspaceId},${tenantId},${moduleId},true)`;
    return{tenantId,workspaceId,planId};
  });
}
