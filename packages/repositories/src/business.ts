import {randomUUID} from "node:crypto";
import type {AtlasSql} from "../../db/src/index.js";

export interface BusinessScope{tenantId:string;workspaceId:string}
export interface SourceMetadata{
  source?:string;
  sourceIntegrationId?:string|null;
  externalId?:string|null;
  lastSyncedAt?:string|null;
  syncVersion?:number;
}
const limitValue=(value=100)=>Math.max(1,Math.min(500,Math.floor(value)));

function source(input:SourceMetadata){
  return{
    source:input.source??"native",
    sourceIntegrationId:input.sourceIntegrationId??null,
    externalId:input.externalId??null,
    lastSyncedAt:input.lastSyncedAt??null,
    syncVersion:input.syncVersion??1
  };
}
const iso=(value:unknown)=>value?new Date(value as string|number|Date).toISOString():null;

export interface StoredContact{
  id:string;tenantId:string;workspaceId:string;relationship:string;displayName:string;email:string|null;phone:string|null;status:string;
  source:string;sourceIntegrationId:string|null;externalId:string|null;lastSyncedAt:string|null;syncVersion:number;createdAt:string;updatedAt:string;
}
const mapContact=(r:any):StoredContact=>({id:r.id,tenantId:r.tenant_id,workspaceId:r.workspace_id,relationship:r.relationship,displayName:r.display_name,email:r.email??null,phone:r.phone??null,status:r.status,source:r.source,sourceIntegrationId:r.source_integration_id??null,externalId:r.external_id??null,lastSyncedAt:iso(r.last_synced_at),syncVersion:Number(r.sync_version),createdAt:iso(r.created_at)!,updatedAt:iso(r.updated_at)!});

export class ContactRepository{
  constructor(private readonly sql:AtlasSql){}
  async create(scope:BusinessScope,input:{relationship?:"contact"|"prospect"|"customer"|"patient_reference"|"vendor"|"other";displayName:string;email?:string|null;phone?:string|null}&SourceMetadata){
    const id=randomUUID(),m=source(input);
    const rows=await this.sql`INSERT INTO atlas_contacts(id,tenant_id,workspace_id,relationship,display_name,email,phone,source,source_integration_id,external_id,last_synced_at,sync_version)
      VALUES(${id},${scope.tenantId},${scope.workspaceId},${input.relationship??"contact"},${input.displayName},${input.email??null},${input.phone??null},${m.source},${m.sourceIntegrationId},${m.externalId},${m.lastSyncedAt},${m.syncVersion}) RETURNING *`;
    return mapContact(rows[0]);
  }
  async findScoped(scope:BusinessScope,id:string){const rows=await this.sql`SELECT * FROM atlas_contacts WHERE tenant_id=${scope.tenantId} AND workspace_id=${scope.workspaceId} AND id=${id} LIMIT 1`;return rows[0]?mapContact(rows[0]):null}
  async list(scope:BusinessScope,limit=100){const n=limitValue(limit);const rows=await this.sql`SELECT * FROM atlas_contacts WHERE tenant_id=${scope.tenantId} AND workspace_id=${scope.workspaceId} AND status<>'archived' ORDER BY updated_at DESC LIMIT ${n}`;return rows.map(mapContact)}
  async setRelationship(scope:BusinessScope,id:string,relationship:StoredContact["relationship"]){const rows=await this.sql`UPDATE atlas_contacts SET relationship=${relationship},updated_at=now() WHERE tenant_id=${scope.tenantId} AND workspace_id=${scope.workspaceId} AND id=${id} RETURNING *`;return rows[0]?mapContact(rows[0]):null}
  async archive(scope:BusinessScope,id:string){const rows=await this.sql`UPDATE atlas_contacts SET status='archived',updated_at=now() WHERE tenant_id=${scope.tenantId} AND workspace_id=${scope.workspaceId} AND id=${id} RETURNING *`;return rows[0]?mapContact(rows[0]):null}
}

export interface StoredLead{
  id:string;tenantId:string;workspaceId:string;contactId:string|null;title:string;status:string;score:number|null;source:string;externalId:string|null;createdAt:string;updatedAt:string;
}
const mapLead=(r:any):StoredLead=>({id:r.id,tenantId:r.tenant_id,workspaceId:r.workspace_id,contactId:r.contact_id??null,title:r.title,status:r.status,score:r.score==null?null:Number(r.score),source:r.source,externalId:r.external_id??null,createdAt:iso(r.created_at)!,updatedAt:iso(r.updated_at)!});
export class LeadRepository{
  constructor(private readonly sql:AtlasSql){}
  async create(scope:BusinessScope,input:{contactId?:string|null;title:string;status?:"new"|"qualified"|"working"|"converted"|"lost"|"archived";score?:number|null}&SourceMetadata){
    const id=randomUUID(),m=source(input);const rows=await this.sql`INSERT INTO atlas_leads(id,tenant_id,workspace_id,contact_id,title,status,score,source,source_integration_id,external_id,last_synced_at,sync_version)
      VALUES(${id},${scope.tenantId},${scope.workspaceId},${input.contactId??null},${input.title},${input.status??"new"},${input.score??null},${m.source},${m.sourceIntegrationId},${m.externalId},${m.lastSyncedAt},${m.syncVersion}) RETURNING *`;return mapLead(rows[0])
  }
  async findScoped(scope:BusinessScope,id:string){const rows=await this.sql`SELECT * FROM atlas_leads WHERE tenant_id=${scope.tenantId} AND workspace_id=${scope.workspaceId} AND id=${id} LIMIT 1`;return rows[0]?mapLead(rows[0]):null}
  async list(scope:BusinessScope,limit=100){const n=limitValue(limit);const rows=await this.sql`SELECT * FROM atlas_leads WHERE tenant_id=${scope.tenantId} AND workspace_id=${scope.workspaceId} AND status<>'archived' ORDER BY updated_at DESC LIMIT ${n}`;return rows.map(mapLead)}
  async updateState(scope:BusinessScope,id:string,input:{status:string;score?:number|null}){const rows=await this.sql`UPDATE atlas_leads SET status=${input.status},score=COALESCE(${input.score??null},score),updated_at=now() WHERE tenant_id=${scope.tenantId} AND workspace_id=${scope.workspaceId} AND id=${id} RETURNING *`;return rows[0]?mapLead(rows[0]):null}
}

export interface StoredOpportunity{id:string;tenantId:string;workspaceId:string;contactId:string|null;leadId:string|null;name:string;status:string;stage:string;amount:number|null;currency:string;expectedCloseAt:string|null;createdAt:string;updatedAt:string}
const mapOpportunity=(r:any):StoredOpportunity=>({id:r.id,tenantId:r.tenant_id,workspaceId:r.workspace_id,contactId:r.contact_id??null,leadId:r.lead_id??null,name:r.name,status:r.status,stage:r.stage,amount:r.amount==null?null:Number(r.amount),currency:r.currency,expectedCloseAt:iso(r.expected_close_at),createdAt:iso(r.created_at)!,updatedAt:iso(r.updated_at)!});
export class OpportunityRepository{
  constructor(private readonly sql:AtlasSql){}
  async create(scope:BusinessScope,input:{contactId?:string|null;leadId?:string|null;name:string;status?:"open"|"won"|"lost"|"archived";stage?:string;amount?:number|null;currency?:string;expectedCloseAt?:string|null}&SourceMetadata){
    const id=randomUUID(),m=source(input);const rows=await this.sql`INSERT INTO atlas_opportunities(id,tenant_id,workspace_id,contact_id,lead_id,name,status,stage,amount,currency,expected_close_at,source,source_integration_id,external_id,last_synced_at,sync_version)
      VALUES(${id},${scope.tenantId},${scope.workspaceId},${input.contactId??null},${input.leadId??null},${input.name},${input.status??"open"},${input.stage??"discovery"},${input.amount??null},${input.currency??"USD"},${input.expectedCloseAt??null},${m.source},${m.sourceIntegrationId},${m.externalId},${m.lastSyncedAt},${m.syncVersion}) RETURNING *`;return mapOpportunity(rows[0])
  }
  async findScoped(scope:BusinessScope,id:string){const rows=await this.sql`SELECT * FROM atlas_opportunities WHERE tenant_id=${scope.tenantId} AND workspace_id=${scope.workspaceId} AND id=${id} LIMIT 1`;return rows[0]?mapOpportunity(rows[0]):null}
  async list(scope:BusinessScope,limit=100){const n=limitValue(limit);const rows=await this.sql`SELECT * FROM atlas_opportunities WHERE tenant_id=${scope.tenantId} AND workspace_id=${scope.workspaceId} AND status<>'archived' ORDER BY updated_at DESC LIMIT ${n}`;return rows.map(mapOpportunity)}
  async updateState(scope:BusinessScope,id:string,input:{status:string;stage:string}){const rows=await this.sql`UPDATE atlas_opportunities SET status=${input.status},stage=${input.stage},updated_at=now() WHERE tenant_id=${scope.tenantId} AND workspace_id=${scope.workspaceId} AND id=${id} RETURNING *`;return rows[0]?mapOpportunity(rows[0]):null}
}

export interface StoredAppointment{id:string;tenantId:string;workspaceId:string;contactId:string|null;title:string;status:string;startsAt:string;endsAt:string;timezone:string;serviceCategory:string|null;source:string;externalId:string|null;createdAt:string;updatedAt:string}
const mapAppointment=(r:any):StoredAppointment=>({id:r.id,tenantId:r.tenant_id,workspaceId:r.workspace_id,contactId:r.contact_id??null,title:r.title,status:r.status,startsAt:iso(r.starts_at)!,endsAt:iso(r.ends_at)!,timezone:r.timezone,serviceCategory:r.service_category??null,source:r.source,externalId:r.external_id??null,createdAt:iso(r.created_at)!,updatedAt:iso(r.updated_at)!});
export class AppointmentRepository{
  constructor(private readonly sql:AtlasSql){}
  async create(scope:BusinessScope,input:{contactId?:string|null;title:string;status?:"scheduled"|"confirmed"|"completed"|"canceled"|"no_show";startsAt:string;endsAt:string;timezone:string;serviceCategory?:string|null}&SourceMetadata){
    const id=randomUUID(),m=source(input);const rows=await this.sql`INSERT INTO atlas_appointments(id,tenant_id,workspace_id,contact_id,title,status,starts_at,ends_at,timezone,service_category,source,source_integration_id,external_id,last_synced_at,sync_version)
      VALUES(${id},${scope.tenantId},${scope.workspaceId},${input.contactId??null},${input.title},${input.status??"scheduled"},${input.startsAt},${input.endsAt},${input.timezone},${input.serviceCategory??null},${m.source},${m.sourceIntegrationId},${m.externalId},${m.lastSyncedAt},${m.syncVersion}) RETURNING *`;return mapAppointment(rows[0])
  }
  async findScoped(scope:BusinessScope,id:string){const rows=await this.sql`SELECT * FROM atlas_appointments WHERE tenant_id=${scope.tenantId} AND workspace_id=${scope.workspaceId} AND id=${id} LIMIT 1`;return rows[0]?mapAppointment(rows[0]):null}
  async list(scope:BusinessScope,limit=100){const n=limitValue(limit);const rows=await this.sql`SELECT * FROM atlas_appointments WHERE tenant_id=${scope.tenantId} AND workspace_id=${scope.workspaceId} ORDER BY starts_at DESC LIMIT ${n}`;return rows.map(mapAppointment)}
  async setStatus(scope:BusinessScope,id:string,status:StoredAppointment["status"]){const rows=await this.sql`UPDATE atlas_appointments SET status=${status},updated_at=now() WHERE tenant_id=${scope.tenantId} AND workspace_id=${scope.workspaceId} AND id=${id} RETURNING *`;return rows[0]?mapAppointment(rows[0]):null}
}

export interface StoredCommunication{id:string;tenantId:string;workspaceId:string;contactId:string|null;channel:string;direction:string;status:string;subject:string|null;bodyPreview:string|null;occurredAt:string;source:string;externalId:string|null;createdAt:string}
const mapCommunication=(r:any):StoredCommunication=>({id:r.id,tenantId:r.tenant_id,workspaceId:r.workspace_id,contactId:r.contact_id??null,channel:r.channel,direction:r.direction,status:r.status,subject:r.subject??null,bodyPreview:r.body_preview??null,occurredAt:iso(r.occurred_at)!,source:r.source,externalId:r.external_id??null,createdAt:iso(r.created_at)!});
export class CommunicationRepository{
  constructor(private readonly sql:AtlasSql){}
  async create(scope:BusinessScope,input:{contactId?:string|null;channel:"email"|"sms"|"phone"|"chat"|"other";direction:"inbound"|"outbound"|"internal";status?:string;subject?:string|null;bodyPreview?:string|null;occurredAt?:string}&SourceMetadata){
    const id=randomUUID(),m=source(input);const preview=input.bodyPreview?.slice(0,2000)??null;const rows=await this.sql`INSERT INTO atlas_communications(id,tenant_id,workspace_id,contact_id,channel,direction,status,subject,body_preview,occurred_at,source,source_integration_id,external_id,last_synced_at,sync_version)
      VALUES(${id},${scope.tenantId},${scope.workspaceId},${input.contactId??null},${input.channel},${input.direction},${input.status??"recorded"},${input.subject??null},${preview},${input.occurredAt??new Date().toISOString()},${m.source},${m.sourceIntegrationId},${m.externalId},${m.lastSyncedAt},${m.syncVersion}) RETURNING *`;return mapCommunication(rows[0])
  }
  async list(scope:BusinessScope,limit=100){const n=limitValue(limit);const rows=await this.sql`SELECT * FROM atlas_communications WHERE tenant_id=${scope.tenantId} AND workspace_id=${scope.workspaceId} ORDER BY occurred_at DESC LIMIT ${n}`;return rows.map(mapCommunication)}
}

export interface StoredInvoice{id:string;tenantId:string;workspaceId:string;contactId:string|null;invoiceNumber:string|null;status:string;currency:string;totalAmount:number;dueAt:string|null;source:string;externalId:string|null;createdAt:string;updatedAt:string}
const mapInvoice=(r:any):StoredInvoice=>({id:r.id,tenantId:r.tenant_id,workspaceId:r.workspace_id,contactId:r.contact_id??null,invoiceNumber:r.invoice_number??null,status:r.status,currency:r.currency,totalAmount:Number(r.total_amount),dueAt:iso(r.due_at),source:r.source,externalId:r.external_id??null,createdAt:iso(r.created_at)!,updatedAt:iso(r.updated_at)!});
export class InvoiceRepository{
  constructor(private readonly sql:AtlasSql){}
  async create(scope:BusinessScope,input:{contactId?:string|null;invoiceNumber?:string|null;status?:"draft"|"open"|"paid"|"past_due"|"void"|"uncollectible";currency?:string;totalAmount:number;dueAt?:string|null}&SourceMetadata){
    const id=randomUUID(),m=source(input);const rows=await this.sql`INSERT INTO atlas_invoices(id,tenant_id,workspace_id,contact_id,invoice_number,status,currency,total_amount,due_at,source,source_integration_id,external_id,last_synced_at,sync_version)
      VALUES(${id},${scope.tenantId},${scope.workspaceId},${input.contactId??null},${input.invoiceNumber??null},${input.status??"draft"},${input.currency??"USD"},${input.totalAmount},${input.dueAt??null},${m.source},${m.sourceIntegrationId},${m.externalId},${m.lastSyncedAt},${m.syncVersion}) RETURNING *`;return mapInvoice(rows[0])
  }
  async findScoped(scope:BusinessScope,id:string){const rows=await this.sql`SELECT * FROM atlas_invoices WHERE tenant_id=${scope.tenantId} AND workspace_id=${scope.workspaceId} AND id=${id} LIMIT 1`;return rows[0]?mapInvoice(rows[0]):null}
  async list(scope:BusinessScope,limit=100){const n=limitValue(limit);const rows=await this.sql`SELECT * FROM atlas_invoices WHERE tenant_id=${scope.tenantId} AND workspace_id=${scope.workspaceId} ORDER BY created_at DESC LIMIT ${n}`;return rows.map(mapInvoice)}
  async setStatus(scope:BusinessScope,id:string,status:StoredInvoice["status"]){const rows=await this.sql`UPDATE atlas_invoices SET status=${status},updated_at=now() WHERE tenant_id=${scope.tenantId} AND workspace_id=${scope.workspaceId} AND id=${id} RETURNING *`;return rows[0]?mapInvoice(rows[0]):null}
}

export interface StoredPayment{id:string;tenantId:string;workspaceId:string;invoiceId:string|null;contactId:string|null;status:string;currency:string;amount:number;paidAt:string|null;source:string;externalId:string|null;createdAt:string}
const mapPayment=(r:any):StoredPayment=>({id:r.id,tenantId:r.tenant_id,workspaceId:r.workspace_id,invoiceId:r.invoice_id??null,contactId:r.contact_id??null,status:r.status,currency:r.currency,amount:Number(r.amount),paidAt:iso(r.paid_at),source:r.source,externalId:r.external_id??null,createdAt:iso(r.created_at)!});
export class PaymentRepository{
  constructor(private readonly sql:AtlasSql){}
  async create(scope:BusinessScope,input:{invoiceId?:string|null;contactId?:string|null;status?:"pending"|"succeeded"|"failed"|"refunded"|"void";currency?:string;amount:number;paidAt?:string|null}&SourceMetadata){
    const id=randomUUID(),m=source(input);const rows=await this.sql`INSERT INTO atlas_payments(id,tenant_id,workspace_id,invoice_id,contact_id,status,currency,amount,paid_at,source,source_integration_id,external_id,last_synced_at,sync_version)
      VALUES(${id},${scope.tenantId},${scope.workspaceId},${input.invoiceId??null},${input.contactId??null},${input.status??"pending"},${input.currency??"USD"},${input.amount},${input.paidAt??null},${m.source},${m.sourceIntegrationId},${m.externalId},${m.lastSyncedAt},${m.syncVersion}) RETURNING *`;return mapPayment(rows[0])
  }
  async list(scope:BusinessScope,limit=100){const n=limitValue(limit);const rows=await this.sql`SELECT * FROM atlas_payments WHERE tenant_id=${scope.tenantId} AND workspace_id=${scope.workspaceId} ORDER BY created_at DESC LIMIT ${n}`;return rows.map(mapPayment)}
}

export interface StoredInventoryItem{id:string;tenantId:string;workspaceId:string;sku:string|null;name:string;status:string;quantityOnHand:number;reorderPoint:number|null;unitCost:number|null;currency:string;source:string;externalId:string|null;createdAt:string;updatedAt:string}
const mapInventory=(r:any):StoredInventoryItem=>({id:r.id,tenantId:r.tenant_id,workspaceId:r.workspace_id,sku:r.sku??null,name:r.name,status:r.status,quantityOnHand:Number(r.quantity_on_hand),reorderPoint:r.reorder_point==null?null:Number(r.reorder_point),unitCost:r.unit_cost==null?null:Number(r.unit_cost),currency:r.currency,source:r.source,externalId:r.external_id??null,createdAt:iso(r.created_at)!,updatedAt:iso(r.updated_at)!});
export class InventoryItemRepository{
  constructor(private readonly sql:AtlasSql){}
  async create(scope:BusinessScope,input:{sku?:string|null;name:string;quantityOnHand?:number;reorderPoint?:number|null;unitCost?:number|null;currency?:string}&SourceMetadata){
    const id=randomUUID(),m=source(input);const rows=await this.sql`INSERT INTO atlas_inventory_items(id,tenant_id,workspace_id,sku,name,quantity_on_hand,reorder_point,unit_cost,currency,source,source_integration_id,external_id,last_synced_at,sync_version)
      VALUES(${id},${scope.tenantId},${scope.workspaceId},${input.sku??null},${input.name},${input.quantityOnHand??0},${input.reorderPoint??null},${input.unitCost??null},${input.currency??"USD"},${m.source},${m.sourceIntegrationId},${m.externalId},${m.lastSyncedAt},${m.syncVersion}) RETURNING *`;return mapInventory(rows[0])
  }
  async findScoped(scope:BusinessScope,id:string){const rows=await this.sql`SELECT * FROM atlas_inventory_items WHERE tenant_id=${scope.tenantId} AND workspace_id=${scope.workspaceId} AND id=${id} LIMIT 1`;return rows[0]?mapInventory(rows[0]):null}
  async list(scope:BusinessScope,limit=100){const n=limitValue(limit);const rows=await this.sql`SELECT * FROM atlas_inventory_items WHERE tenant_id=${scope.tenantId} AND workspace_id=${scope.workspaceId} AND status='active' ORDER BY updated_at DESC LIMIT ${n}`;return rows.map(mapInventory)}
  async transact(scope:BusinessScope,id:string,input:{type:"receipt"|"usage"|"adjustment"|"return"|"reorder";quantity:number;reason?:string|null;occurredAt?:string}&SourceMetadata){
    if(!Number.isFinite(input.quantity)||input.quantity===0)throw new Error("inventory-quantity-invalid");
    const m=source(input),transactionId=randomUUID();
    return this.sql.begin(async tx=>{
      const current=await tx`SELECT quantity_on_hand FROM atlas_inventory_items WHERE tenant_id=${scope.tenantId} AND workspace_id=${scope.workspaceId} AND id=${id} FOR UPDATE`;
      if(!current[0])return null;
      const delta=input.type==="usage"?-Math.abs(input.quantity):input.type==="adjustment"?input.quantity:Math.abs(input.quantity);
      const rows=await tx`UPDATE atlas_inventory_items SET quantity_on_hand=quantity_on_hand+${delta},updated_at=now() WHERE tenant_id=${scope.tenantId} AND workspace_id=${scope.workspaceId} AND id=${id} RETURNING *`;
      await tx`INSERT INTO atlas_inventory_transactions(id,tenant_id,workspace_id,inventory_item_id,transaction_type,quantity,reason,occurred_at,source,source_integration_id,external_id)
        VALUES(${transactionId},${scope.tenantId},${scope.workspaceId},${id},${input.type},${delta},${input.reason??null},${input.occurredAt??new Date().toISOString()},${m.source},${m.sourceIntegrationId},${m.externalId})`;
      return mapInventory(rows[0]);
    });
  }
}

export interface StoredCampaign{id:string;tenantId:string;workspaceId:string;name:string;status:string;channel:string|null;startsAt:string|null;endsAt:string|null;createdAt:string;updatedAt:string}
const mapCampaign=(r:any):StoredCampaign=>({id:r.id,tenantId:r.tenant_id,workspaceId:r.workspace_id,name:r.name,status:r.status,channel:r.channel??null,startsAt:iso(r.starts_at),endsAt:iso(r.ends_at),createdAt:iso(r.created_at)!,updatedAt:iso(r.updated_at)!});
export class CampaignRepository{
  constructor(private readonly sql:AtlasSql){}
  async create(scope:BusinessScope,input:{name:string;status?:"draft"|"planned"|"active"|"paused"|"completed"|"archived";channel?:string|null;startsAt?:string|null;endsAt?:string|null}&SourceMetadata){
    const id=randomUUID(),m=source(input);const rows=await this.sql`INSERT INTO atlas_campaigns(id,tenant_id,workspace_id,name,status,channel,starts_at,ends_at,source,source_integration_id,external_id,last_synced_at,sync_version)
      VALUES(${id},${scope.tenantId},${scope.workspaceId},${input.name},${input.status??"draft"},${input.channel??null},${input.startsAt??null},${input.endsAt??null},${m.source},${m.sourceIntegrationId},${m.externalId},${m.lastSyncedAt},${m.syncVersion}) RETURNING *`;return mapCampaign(rows[0])
  }
  async list(scope:BusinessScope,limit=100){const n=limitValue(limit);const rows=await this.sql`SELECT * FROM atlas_campaigns WHERE tenant_id=${scope.tenantId} AND workspace_id=${scope.workspaceId} AND status<>'archived' ORDER BY updated_at DESC LIMIT ${n}`;return rows.map(mapCampaign)}
  async setStatus(scope:BusinessScope,id:string,status:StoredCampaign["status"]){const rows=await this.sql`UPDATE atlas_campaigns SET status=${status},updated_at=now() WHERE tenant_id=${scope.tenantId} AND workspace_id=${scope.workspaceId} AND id=${id} RETURNING *`;return rows[0]?mapCampaign(rows[0]):null}
}

export interface StoredProject{id:string;tenantId:string;workspaceId:string;name:string;status:string;description:string|null;startsAt:string|null;dueAt:string|null;createdAt:string;updatedAt:string}
const mapProject=(r:any):StoredProject=>({id:r.id,tenantId:r.tenant_id,workspaceId:r.workspace_id,name:r.name,status:r.status,description:r.description??null,startsAt:iso(r.starts_at),dueAt:iso(r.due_at),createdAt:iso(r.created_at)!,updatedAt:iso(r.updated_at)!});
export class ProjectRepository{
  constructor(private readonly sql:AtlasSql){}
  async create(scope:BusinessScope,input:{name:string;status?:"planned"|"active"|"blocked"|"completed"|"archived";description?:string|null;startsAt?:string|null;dueAt?:string|null}&SourceMetadata){
    const id=randomUUID(),m=source(input);const rows=await this.sql`INSERT INTO atlas_projects(id,tenant_id,workspace_id,name,status,description,starts_at,due_at,source,source_integration_id,external_id,last_synced_at,sync_version)
      VALUES(${id},${scope.tenantId},${scope.workspaceId},${input.name},${input.status??"planned"},${input.description??null},${input.startsAt??null},${input.dueAt??null},${m.source},${m.sourceIntegrationId},${m.externalId},${m.lastSyncedAt},${m.syncVersion}) RETURNING *`;return mapProject(rows[0])
  }
  async list(scope:BusinessScope,limit=100){const n=limitValue(limit);const rows=await this.sql`SELECT * FROM atlas_projects WHERE tenant_id=${scope.tenantId} AND workspace_id=${scope.workspaceId} AND status<>'archived' ORDER BY updated_at DESC LIMIT ${n}`;return rows.map(mapProject)}
  async setStatus(scope:BusinessScope,id:string,status:StoredProject["status"]){const rows=await this.sql`UPDATE atlas_projects SET status=${status},updated_at=now() WHERE tenant_id=${scope.tenantId} AND workspace_id=${scope.workspaceId} AND id=${id} RETURNING *`;return rows[0]?mapProject(rows[0]):null}
}
