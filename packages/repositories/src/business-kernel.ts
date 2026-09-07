import {randomUUID} from "node:crypto";
import type {AtlasSql} from "../../db/src/index.js";
import type {BusinessScope,SourceMetadata} from "./business.js";

const limitValue=(value=100)=>Math.max(1,Math.min(500,Math.floor(value)));
const iso=(value:unknown)=>value?new Date(value as string|number|Date).toISOString():null;

function source(input:SourceMetadata){
  return{
    source:input.source??"native",
    sourceIntegrationId:input.sourceIntegrationId??null,
    externalId:input.externalId??null,
    lastSyncedAt:input.lastSyncedAt??null,
    syncVersion:input.syncVersion??1
  };
}

export interface StoredLocation{
  id:string;tenantId:string;workspaceId:string;name:string;status:string;timezone:string;address:Record<string,unknown>;
  source:string;sourceIntegrationId:string|null;externalId:string|null;lastSyncedAt:string|null;syncVersion:number;createdAt:string;updatedAt:string;
}
const mapLocation=(r:any):StoredLocation=>({
  id:r.id,tenantId:r.tenant_id,workspaceId:r.workspace_id,name:r.name,status:r.status,timezone:r.timezone,
  address:r.address&&typeof r.address==="object"?r.address:{},source:r.source,sourceIntegrationId:r.source_integration_id??null,
  externalId:r.external_id??null,lastSyncedAt:iso(r.last_synced_at),syncVersion:Number(r.sync_version),
  createdAt:iso(r.created_at)!,updatedAt:iso(r.updated_at)!
});

export class LocationRepository{
  constructor(private readonly sql:AtlasSql){}
  async create(scope:BusinessScope,input:{name:string;timezone:string;status?:"active"|"inactive"|"archived";address?:Record<string,unknown>}&SourceMetadata){
    const id=randomUUID(),m=source(input);
    const rows=await this.sql`INSERT INTO atlas_locations(id,tenant_id,workspace_id,name,status,timezone,address,source,source_integration_id,external_id,last_synced_at,sync_version)
      VALUES(${id},${scope.tenantId},${scope.workspaceId},${input.name},${input.status??"active"},${input.timezone},${JSON.stringify(input.address??{})}::jsonb,${m.source},${m.sourceIntegrationId},${m.externalId},${m.lastSyncedAt},${m.syncVersion}) RETURNING *`;
    return mapLocation(rows[0]);
  }
  async findScoped(scope:BusinessScope,id:string){const rows=await this.sql`SELECT * FROM atlas_locations WHERE tenant_id=${scope.tenantId} AND workspace_id=${scope.workspaceId} AND id=${id} LIMIT 1`;return rows[0]?mapLocation(rows[0]):null}
  async list(scope:BusinessScope,limit=100){const n=limitValue(limit);const rows=await this.sql`SELECT * FROM atlas_locations WHERE tenant_id=${scope.tenantId} AND workspace_id=${scope.workspaceId} AND status<>'archived' ORDER BY name LIMIT ${n}`;return rows.map(mapLocation)}
  async setStatus(scope:BusinessScope,id:string,status:StoredLocation["status"]){const rows=await this.sql`UPDATE atlas_locations SET status=${status},updated_at=now() WHERE tenant_id=${scope.tenantId} AND workspace_id=${scope.workspaceId} AND id=${id} RETURNING *`;return rows[0]?mapLocation(rows[0]):null}
}

export interface StoredResource{
  id:string;tenantId:string;workspaceId:string;locationId:string|null;name:string;resourceType:string;status:string;capacity:number;unit:string;
  source:string;sourceIntegrationId:string|null;externalId:string|null;lastSyncedAt:string|null;syncVersion:number;createdAt:string;updatedAt:string;
}
const mapResource=(r:any):StoredResource=>({
  id:r.id,tenantId:r.tenant_id,workspaceId:r.workspace_id,locationId:r.location_id??null,name:r.name,resourceType:r.resource_type,
  status:r.status,capacity:Number(r.capacity),unit:r.unit,source:r.source,sourceIntegrationId:r.source_integration_id??null,
  externalId:r.external_id??null,lastSyncedAt:iso(r.last_synced_at),syncVersion:Number(r.sync_version),createdAt:iso(r.created_at)!,updatedAt:iso(r.updated_at)!
});

export class ResourceRepository{
  constructor(private readonly sql:AtlasSql){}
  async create(scope:BusinessScope,input:{locationId?:string|null;name:string;resourceType:string;status?:"active"|"inactive"|"maintenance"|"archived";capacity?:number;unit?:string}&SourceMetadata){
    if(!Number.isFinite(input.capacity??1)||(input.capacity??1)<=0)throw new Error("resource-capacity-invalid");
    const id=randomUUID(),m=source(input);
    const rows=await this.sql`INSERT INTO atlas_resources(id,tenant_id,workspace_id,location_id,name,resource_type,status,capacity,unit,source,source_integration_id,external_id,last_synced_at,sync_version)
      VALUES(${id},${scope.tenantId},${scope.workspaceId},${input.locationId??null},${input.name},${input.resourceType},${input.status??"active"},${input.capacity??1},${input.unit??"unit"},${m.source},${m.sourceIntegrationId},${m.externalId},${m.lastSyncedAt},${m.syncVersion}) RETURNING *`;
    return mapResource(rows[0]);
  }
  async findScoped(scope:BusinessScope,id:string){const rows=await this.sql`SELECT * FROM atlas_resources WHERE tenant_id=${scope.tenantId} AND workspace_id=${scope.workspaceId} AND id=${id} LIMIT 1`;return rows[0]?mapResource(rows[0]):null}
  async list(scope:BusinessScope,limit=100){const n=limitValue(limit);const rows=await this.sql`SELECT * FROM atlas_resources WHERE tenant_id=${scope.tenantId} AND workspace_id=${scope.workspaceId} AND status<>'archived' ORDER BY name LIMIT ${n}`;return rows.map(mapResource)}
  async setStatus(scope:BusinessScope,id:string,status:StoredResource["status"]){const rows=await this.sql`UPDATE atlas_resources SET status=${status},updated_at=now() WHERE tenant_id=${scope.tenantId} AND workspace_id=${scope.workspaceId} AND id=${id} RETURNING *`;return rows[0]?mapResource(rows[0]):null}
}

export interface StoredCatalogItem{
  id:string;tenantId:string;workspaceId:string;kind:"product"|"service"|"package";name:string;description:string|null;status:string;sku:string|null;
  durationMinutes:number|null;priceAmount:number;currency:string;source:string;sourceIntegrationId:string|null;externalId:string|null;lastSyncedAt:string|null;syncVersion:number;createdAt:string;updatedAt:string;
}
const mapCatalog=(r:any):StoredCatalogItem=>({
  id:r.id,tenantId:r.tenant_id,workspaceId:r.workspace_id,kind:r.kind,name:r.name,description:r.description??null,status:r.status,sku:r.sku??null,
  durationMinutes:r.duration_minutes==null?null:Number(r.duration_minutes),priceAmount:Number(r.price_amount),currency:r.currency,source:r.source,
  sourceIntegrationId:r.source_integration_id??null,externalId:r.external_id??null,lastSyncedAt:iso(r.last_synced_at),syncVersion:Number(r.sync_version),
  createdAt:iso(r.created_at)!,updatedAt:iso(r.updated_at)!
});

export class CatalogRepository{
  constructor(private readonly sql:AtlasSql){}
  async create(scope:BusinessScope,input:{kind:"product"|"service"|"package";name:string;description?:string|null;status?:"active"|"inactive"|"archived";sku?:string|null;durationMinutes?:number|null;priceAmount?:number;currency?:string}&SourceMetadata){
    if(!Number.isFinite(input.priceAmount??0)||(input.priceAmount??0)<0)throw new Error("catalog-price-invalid");
    if(input.durationMinutes!=null&&(!Number.isInteger(input.durationMinutes)||input.durationMinutes<=0))throw new Error("catalog-duration-invalid");
    const id=randomUUID(),m=source(input);
    const rows=await this.sql`INSERT INTO atlas_catalog_items(id,tenant_id,workspace_id,kind,name,description,status,sku,duration_minutes,price_amount,currency,source,source_integration_id,external_id,last_synced_at,sync_version)
      VALUES(${id},${scope.tenantId},${scope.workspaceId},${input.kind},${input.name},${input.description??null},${input.status??"active"},${input.sku??null},${input.durationMinutes??null},${input.priceAmount??0},${input.currency??"USD"},${m.source},${m.sourceIntegrationId},${m.externalId},${m.lastSyncedAt},${m.syncVersion}) RETURNING *`;
    return mapCatalog(rows[0]);
  }
  async findScoped(scope:BusinessScope,id:string){const rows=await this.sql`SELECT * FROM atlas_catalog_items WHERE tenant_id=${scope.tenantId} AND workspace_id=${scope.workspaceId} AND id=${id} LIMIT 1`;return rows[0]?mapCatalog(rows[0]):null}
  async list(scope:BusinessScope,limit=100){const n=limitValue(limit);const rows=await this.sql`SELECT * FROM atlas_catalog_items WHERE tenant_id=${scope.tenantId} AND workspace_id=${scope.workspaceId} AND status<>'archived' ORDER BY name LIMIT ${n}`;return rows.map(mapCatalog)}
  async setStatus(scope:BusinessScope,id:string,status:StoredCatalogItem["status"]){const rows=await this.sql`UPDATE atlas_catalog_items SET status=${status},updated_at=now() WHERE tenant_id=${scope.tenantId} AND workspace_id=${scope.workspaceId} AND id=${id} RETURNING *`;return rows[0]?mapCatalog(rows[0]):null}
}

export interface BookingResourceAssignment{resourceId:string;quantity:number}
export interface StoredBooking{
  id:string;tenantId:string;workspaceId:string;locationId:string|null;contactId:string|null;catalogItemId:string|null;legacyAppointmentId:string|null;
  title:string;bookingType:string;status:"tentative"|"scheduled"|"confirmed"|"completed"|"canceled"|"no_show";confirmationState:"pending"|"confirmed"|"not_required";
  startsAt:string;endsAt:string;timezone:string;demandQuantity:number;source:string;sourceIntegrationId:string|null;externalId:string|null;lastSyncedAt:string|null;
  syncVersion:number;createdAt:string;updatedAt:string;resources:BookingResourceAssignment[];
}
const mapBookingBase=(r:any):Omit<StoredBooking,"resources">=>({
  id:r.id,tenantId:r.tenant_id,workspaceId:r.workspace_id,locationId:r.location_id??null,contactId:r.contact_id??null,catalogItemId:r.catalog_item_id??null,
  legacyAppointmentId:r.legacy_appointment_id??null,title:r.title,bookingType:r.booking_type,status:r.status,confirmationState:r.confirmation_state,
  startsAt:iso(r.starts_at)!,endsAt:iso(r.ends_at)!,timezone:r.timezone,demandQuantity:Number(r.demand_quantity),source:r.source,
  sourceIntegrationId:r.source_integration_id??null,externalId:r.external_id??null,lastSyncedAt:iso(r.last_synced_at),syncVersion:Number(r.sync_version),
  createdAt:iso(r.created_at)!,updatedAt:iso(r.updated_at)!
});

const activeBookingStatuses=["tentative","scheduled","confirmed"];

export class BookingRepository{
  constructor(private readonly sql:AtlasSql){}

  private async resourcesFor(scope:BusinessScope,bookingId:string):Promise<BookingResourceAssignment[]>{
    const rows=await this.sql`SELECT resource_id,quantity FROM atlas_booking_resources WHERE tenant_id=${scope.tenantId} AND workspace_id=${scope.workspaceId} AND booking_id=${bookingId} ORDER BY resource_id`;
    return rows.map((r:any)=>({resourceId:r.resource_id,quantity:Number(r.quantity)}));
  }

  async findScoped(scope:BusinessScope,id:string):Promise<StoredBooking|null>{
    const rows=await this.sql`SELECT * FROM atlas_bookings WHERE tenant_id=${scope.tenantId} AND workspace_id=${scope.workspaceId} AND id=${id} LIMIT 1`;
    if(!rows[0])return null;
    return{...mapBookingBase(rows[0]),resources:await this.resourcesFor(scope,id)};
  }

  async list(scope:BusinessScope,limit=100):Promise<StoredBooking[]>{
    const n=limitValue(limit);
    const rows=await this.sql`SELECT * FROM atlas_bookings WHERE tenant_id=${scope.tenantId} AND workspace_id=${scope.workspaceId} ORDER BY starts_at DESC LIMIT ${n}`;
    const out:StoredBooking[]=[];
    for(const row of rows)out.push({...mapBookingBase(row),resources:await this.resourcesFor(scope,row.id)});
    return out;
  }

  async availabilityFor(scope:BusinessScope,resourceId:string,startsAt:string,endsAt:string){
    if(new Date(endsAt).getTime()<=new Date(startsAt).getTime())throw new Error("booking-time-range-invalid");
    const resources=await this.sql`SELECT * FROM atlas_resources WHERE tenant_id=${scope.tenantId} AND workspace_id=${scope.workspaceId} AND id=${resourceId} LIMIT 1`;
    if(!resources[0])return null;
    const usedRows=await this.sql`SELECT COALESCE(SUM(br.quantity),0)::float8 AS used
      FROM atlas_booking_resources br
      JOIN atlas_bookings b ON b.id=br.booking_id AND b.tenant_id=br.tenant_id AND b.workspace_id=br.workspace_id
      WHERE br.tenant_id=${scope.tenantId} AND br.workspace_id=${scope.workspaceId} AND br.resource_id=${resourceId}
        AND b.status = ANY(${activeBookingStatuses})
        AND b.starts_at < ${endsAt} AND b.ends_at > ${startsAt}`;
    const capacity=Number(resources[0].capacity),used=Number(usedRows[0]?.used??0);
    return{resourceId,status:String(resources[0].status),capacity,used,available:Math.max(0,capacity-used)};
  }

  async canReserve(scope:BusinessScope,input:{resourceId:string;startsAt:string;endsAt:string;quantity:number}){
    if(!Number.isFinite(input.quantity)||input.quantity<=0)return false;
    const availability=await this.availabilityFor(scope,input.resourceId,input.startsAt,input.endsAt);
    return Boolean(availability&&availability.status==="active"&&availability.available>=input.quantity);
  }

  async create(scope:BusinessScope,input:{
    locationId?:string|null;contactId?:string|null;catalogItemId?:string|null;title:string;bookingType?:string;
    status?:"tentative"|"scheduled"|"confirmed";confirmationState?:"pending"|"confirmed"|"not_required";
    startsAt:string;endsAt:string;timezone:string;demandQuantity?:number;resources?:Array<{resourceId:string;quantity?:number}>;
  }&SourceMetadata):Promise<StoredBooking>{
    const startMs=new Date(input.startsAt).getTime(),endMs=new Date(input.endsAt).getTime();
    if(!Number.isFinite(startMs)||!Number.isFinite(endMs)||endMs<=startMs)throw new Error("booking-time-range-invalid");
    if(!Number.isFinite(input.demandQuantity??1)||(input.demandQuantity??1)<=0)throw new Error("booking-demand-invalid");
    const id=randomUUID(),m=source(input);
    return this.sql.begin(async tx=>{
      const assignments=(input.resources??[]).map(row=>({resourceId:row.resourceId,quantity:row.quantity??input.demandQuantity??1}));
      const seen=new Set<string>();
      for(const assignment of assignments){
        if(seen.has(assignment.resourceId))throw new Error("booking-resource-duplicate");
        seen.add(assignment.resourceId);
        if(!Number.isFinite(assignment.quantity)||assignment.quantity<=0)throw new Error("booking-resource-quantity-invalid");
        const resourceRows=await tx`SELECT * FROM atlas_resources WHERE tenant_id=${scope.tenantId} AND workspace_id=${scope.workspaceId} AND id=${assignment.resourceId} FOR UPDATE`;
        const resource=resourceRows[0];if(!resource)throw new Error("booking-resource-not-found");
        if(resource.status!=="active")throw new Error("booking-resource-unavailable");
        if(input.locationId&&resource.location_id&&resource.location_id!==input.locationId)throw new Error("booking-resource-location-mismatch");
        const usedRows=await tx`SELECT COALESCE(SUM(br.quantity),0)::float8 AS used
          FROM atlas_booking_resources br
          JOIN atlas_bookings b ON b.id=br.booking_id AND b.tenant_id=br.tenant_id AND b.workspace_id=br.workspace_id
          WHERE br.tenant_id=${scope.tenantId} AND br.workspace_id=${scope.workspaceId} AND br.resource_id=${assignment.resourceId}
            AND b.status = ANY(${activeBookingStatuses})
            AND b.starts_at < ${input.endsAt} AND b.ends_at > ${input.startsAt}`;
        const used=Number(usedRows[0]?.used??0),capacity=Number(resource.capacity);
        if(used+assignment.quantity>capacity)throw new Error("booking-capacity-exceeded");
      }
      const rows=await tx`INSERT INTO atlas_bookings(id,tenant_id,workspace_id,location_id,contact_id,catalog_item_id,title,booking_type,status,confirmation_state,starts_at,ends_at,timezone,demand_quantity,source,source_integration_id,external_id,last_synced_at,sync_version)
        VALUES(${id},${scope.tenantId},${scope.workspaceId},${input.locationId??null},${input.contactId??null},${input.catalogItemId??null},${input.title},${input.bookingType??"booking"},${input.status??"scheduled"},${input.confirmationState??(input.status==="confirmed"?"confirmed":"pending")},${input.startsAt},${input.endsAt},${input.timezone},${input.demandQuantity??1},${m.source},${m.sourceIntegrationId},${m.externalId},${m.lastSyncedAt},${m.syncVersion}) RETURNING *`;
      for(const assignment of assignments)await tx`INSERT INTO atlas_booking_resources(booking_id,resource_id,tenant_id,workspace_id,quantity) VALUES(${id},${assignment.resourceId},${scope.tenantId},${scope.workspaceId},${assignment.quantity})`;
      return{...mapBookingBase(rows[0]),resources:assignments};
    });
  }

  async setStatus(scope:BusinessScope,id:string,status:StoredBooking["status"]):Promise<StoredBooking|null>{
    return this.sql.begin(async tx=>{
      const rows=await tx`UPDATE atlas_bookings SET status=${status},confirmation_state=CASE WHEN ${status}='confirmed' THEN 'confirmed' ELSE confirmation_state END,updated_at=now()
        WHERE tenant_id=${scope.tenantId} AND workspace_id=${scope.workspaceId} AND id=${id} RETURNING *`;
      if(!rows[0])return null;
      const legacyId=rows[0].legacy_appointment_id as string|null;
      if(legacyId){
        const appointmentStatus=status==="tentative"?"scheduled":status;
        await tx`UPDATE atlas_appointments SET status=${appointmentStatus},updated_at=now() WHERE tenant_id=${scope.tenantId} AND workspace_id=${scope.workspaceId} AND id=${legacyId}`;
      }
      const assignmentRows=await tx`SELECT resource_id,quantity FROM atlas_booking_resources WHERE tenant_id=${scope.tenantId} AND workspace_id=${scope.workspaceId} AND booking_id=${id} ORDER BY resource_id`;
      return{...mapBookingBase(rows[0]),resources:assignmentRows.map((r:any)=>({resourceId:r.resource_id,quantity:Number(r.quantity)}))};
    });
  }
}

export interface StoredOrderLine{id:string;orderId:string;catalogItemId:string|null;descriptionSnapshot:string;quantity:number;unitAmount:number;totalAmount:number}
const mapLine=(r:any):StoredOrderLine=>({id:r.id,orderId:r.order_id,catalogItemId:r.catalog_item_id??null,descriptionSnapshot:r.description_snapshot,quantity:Number(r.quantity),unitAmount:Number(r.unit_amount),totalAmount:Number(r.total_amount)});

export interface StoredOrder{
  id:string;tenantId:string;workspaceId:string;contactId:string|null;locationId:string|null;bookingId:string|null;status:string;fulfillmentStatus:string;
  currency:string;subtotal:number;total:number;source:string;externalId:string|null;createdAt:string;updatedAt:string;lines:StoredOrderLine[];
}
const mapOrderBase=(r:any):Omit<StoredOrder,"lines">=>({
  id:r.id,tenantId:r.tenant_id,workspaceId:r.workspace_id,contactId:r.contact_id??null,locationId:r.location_id??null,bookingId:r.booking_id??null,
  status:r.status,fulfillmentStatus:r.fulfillment_status,currency:r.currency,subtotal:Number(r.subtotal),total:Number(r.total),source:r.source,
  externalId:r.external_id??null,createdAt:iso(r.created_at)!,updatedAt:iso(r.updated_at)!
});

export class OrderRepository{
  constructor(private readonly sql:AtlasSql){}
  private async linesFor(scope:BusinessScope,orderId:string,executor:AtlasSql=this.sql){
    const rows=await executor`SELECT * FROM atlas_order_lines WHERE tenant_id=${scope.tenantId} AND workspace_id=${scope.workspaceId} AND order_id=${orderId} ORDER BY created_at,id`;
    return rows.map(mapLine);
  }
  async create(scope:BusinessScope,input:{
    contactId?:string|null;locationId?:string|null;bookingId?:string|null;status?:"draft"|"pending"|"confirmed"|"completed"|"canceled";
    fulfillmentStatus?:"pending"|"preparing"|"ready"|"fulfilled"|"canceled"|"failed";currency?:string;
    lines:Array<{catalogItemId:string;quantity:number}>;
  }&SourceMetadata):Promise<StoredOrder>{
    if(!input.lines.length)throw new Error("order-lines-required");
    const id=randomUUID(),m=source(input),currency=input.currency??"USD";
    return this.sql.begin(async tx=>{
      const snapshots:Array<{id:string;catalogItemId:string;description:string;quantity:number;unitAmount:number;totalAmount:number}>=[];
      for(const line of input.lines){
        if(!Number.isFinite(line.quantity)||line.quantity<=0)throw new Error("order-line-quantity-invalid");
        const items=await tx`SELECT * FROM atlas_catalog_items WHERE tenant_id=${scope.tenantId} AND workspace_id=${scope.workspaceId} AND id=${line.catalogItemId} AND status='active' LIMIT 1`;
        const item=items[0];if(!item)throw new Error("order-catalog-item-not-found");
        if(item.currency!==currency)throw new Error("order-currency-mismatch");
        const unitAmount=Number(item.price_amount),totalAmount=Math.round(unitAmount*line.quantity*100)/100;
        snapshots.push({id:randomUUID(),catalogItemId:item.id,description:item.name,quantity:line.quantity,unitAmount,totalAmount});
      }
      const subtotal=Math.round(snapshots.reduce((sum,line)=>sum+line.totalAmount,0)*100)/100;
      const rows=await tx`INSERT INTO atlas_orders(id,tenant_id,workspace_id,contact_id,location_id,booking_id,status,fulfillment_status,currency,subtotal,total,source,source_integration_id,external_id,last_synced_at,sync_version)
        VALUES(${id},${scope.tenantId},${scope.workspaceId},${input.contactId??null},${input.locationId??null},${input.bookingId??null},${input.status??"pending"},${input.fulfillmentStatus??"pending"},${currency},${subtotal},${subtotal},${m.source},${m.sourceIntegrationId},${m.externalId},${m.lastSyncedAt},${m.syncVersion}) RETURNING *`;
      for(const line of snapshots)await tx`INSERT INTO atlas_order_lines(id,tenant_id,workspace_id,order_id,catalog_item_id,description_snapshot,quantity,unit_amount,total_amount)
        VALUES(${line.id},${scope.tenantId},${scope.workspaceId},${id},${line.catalogItemId},${line.description},${line.quantity},${line.unitAmount},${line.totalAmount})`;
      return{...mapOrderBase(rows[0]),lines:snapshots.map(line=>({id:line.id,orderId:id,catalogItemId:line.catalogItemId,descriptionSnapshot:line.description,quantity:line.quantity,unitAmount:line.unitAmount,totalAmount:line.totalAmount}))};
    });
  }
  async findScoped(scope:BusinessScope,id:string):Promise<StoredOrder|null>{const rows=await this.sql`SELECT * FROM atlas_orders WHERE tenant_id=${scope.tenantId} AND workspace_id=${scope.workspaceId} AND id=${id} LIMIT 1`;return rows[0]?{...mapOrderBase(rows[0]),lines:await this.linesFor(scope,id)}:null}
  async list(scope:BusinessScope,limit=100):Promise<StoredOrder[]>{const n=limitValue(limit);const rows=await this.sql`SELECT * FROM atlas_orders WHERE tenant_id=${scope.tenantId} AND workspace_id=${scope.workspaceId} ORDER BY created_at DESC LIMIT ${n}`;const out:StoredOrder[]=[];for(const row of rows)out.push({...mapOrderBase(row),lines:await this.linesFor(scope,row.id)});return out}
  async setStatus(scope:BusinessScope,id:string,status:StoredOrder["status"]){const rows=await this.sql`UPDATE atlas_orders SET status=${status},updated_at=now() WHERE tenant_id=${scope.tenantId} AND workspace_id=${scope.workspaceId} AND id=${id} RETURNING *`;return rows[0]?{...mapOrderBase(rows[0]),lines:await this.linesFor(scope,id)}:null}
}

export interface StoredFulfillment{
  id:string;tenantId:string;workspaceId:string;orderId:string;fulfillmentType:string;status:"pending"|"preparing"|"ready"|"fulfilled"|"canceled"|"failed";
  dueAt:string|null;completedAt:string|null;source:string;externalId:string|null;createdAt:string;updatedAt:string;
}
const mapFulfillment=(r:any):StoredFulfillment=>({
  id:r.id,tenantId:r.tenant_id,workspaceId:r.workspace_id,orderId:r.order_id,fulfillmentType:r.fulfillment_type,status:r.status,
  dueAt:iso(r.due_at),completedAt:iso(r.completed_at),source:r.source,externalId:r.external_id??null,createdAt:iso(r.created_at)!,updatedAt:iso(r.updated_at)!
});

export class FulfillmentRepository{
  constructor(private readonly sql:AtlasSql){}
  async create(scope:BusinessScope,input:{orderId:string;fulfillmentType?:string;status?:StoredFulfillment["status"];dueAt?:string|null}&SourceMetadata){
    const id=randomUUID(),m=source(input),status=input.status??"pending";
    return this.sql.begin(async tx=>{
      const rows=await tx`INSERT INTO atlas_fulfillments(id,tenant_id,workspace_id,order_id,fulfillment_type,status,due_at,completed_at,source,source_integration_id,external_id)
        VALUES(${id},${scope.tenantId},${scope.workspaceId},${input.orderId},${input.fulfillmentType??"service"},${status},${input.dueAt??null},${status==="fulfilled"?new Date().toISOString():null},${m.source},${m.sourceIntegrationId},${m.externalId}) RETURNING *`;
      await tx`UPDATE atlas_orders SET fulfillment_status=${status},updated_at=now() WHERE tenant_id=${scope.tenantId} AND workspace_id=${scope.workspaceId} AND id=${input.orderId}`;
      return mapFulfillment(rows[0]);
    });
  }
  async list(scope:BusinessScope,limit=100){const n=limitValue(limit);const rows=await this.sql`SELECT * FROM atlas_fulfillments WHERE tenant_id=${scope.tenantId} AND workspace_id=${scope.workspaceId} ORDER BY created_at DESC LIMIT ${n}`;return rows.map(mapFulfillment)}
  async setStatus(scope:BusinessScope,id:string,status:StoredFulfillment["status"]){
    return this.sql.begin(async tx=>{
      const rows=await tx`UPDATE atlas_fulfillments SET status=${status},completed_at=CASE WHEN ${status}='fulfilled' THEN now() ELSE completed_at END,updated_at=now()
        WHERE tenant_id=${scope.tenantId} AND workspace_id=${scope.workspaceId} AND id=${id} RETURNING *`;
      if(!rows[0])return null;
      await tx`UPDATE atlas_orders SET fulfillment_status=${status},updated_at=now() WHERE tenant_id=${scope.tenantId} AND workspace_id=${scope.workspaceId} AND id=${rows[0].order_id}`;
      return mapFulfillment(rows[0]);
    });
  }
}

export class CatalogInventoryLinkRepository{
  constructor(private readonly sql:AtlasSql){}
  async link(scope:BusinessScope,input:{catalogItemId:string;inventoryItemId:string;quantityPerUnit?:number}){
    if(!Number.isFinite(input.quantityPerUnit??1)||(input.quantityPerUnit??1)<=0)throw new Error("catalog-inventory-quantity-invalid");
    await this.sql`INSERT INTO atlas_catalog_inventory_links(tenant_id,workspace_id,catalog_item_id,inventory_item_id,quantity_per_unit)
      VALUES(${scope.tenantId},${scope.workspaceId},${input.catalogItemId},${input.inventoryItemId},${input.quantityPerUnit??1})
      ON CONFLICT(catalog_item_id,inventory_item_id) DO UPDATE SET quantity_per_unit=excluded.quantity_per_unit
      WHERE atlas_catalog_inventory_links.tenant_id=excluded.tenant_id AND atlas_catalog_inventory_links.workspace_id=excluded.workspace_id`;
  }
  async listForCatalogItem(scope:BusinessScope,catalogItemId:string){
    const rows=await this.sql`SELECT catalog_item_id,inventory_item_id,quantity_per_unit FROM atlas_catalog_inventory_links
      WHERE tenant_id=${scope.tenantId} AND workspace_id=${scope.workspaceId} AND catalog_item_id=${catalogItemId} ORDER BY inventory_item_id`;
    return rows.map((r:any)=>({catalogItemId:r.catalog_item_id,inventoryItemId:r.inventory_item_id,quantityPerUnit:Number(r.quantity_per_unit)}));
  }
}
