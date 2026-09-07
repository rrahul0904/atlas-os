import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {db,closeDb} from "../../db/src/index.js";
import {
  UserRepository,WorkspaceRepository,provisionWorkspace,ContactRepository,AppointmentRepository,InventoryItemRepository,
  LocationRepository,ResourceRepository,BookingRepository,CatalogRepository,OrderRepository,FulfillmentRepository,CatalogInventoryLinkRepository
} from "./index.js";

test("horizontal business kernel supports dental reservation and bakery scenarios with strict scope",async()=>{
  if(!process.env.DATABASE_URL)return;
  const sql=db();
  const user=await new UserRepository(sql).create({email:`kernel-${randomUUID()}@example.test`,passwordHash:"test-hash"});
  const provisioned=await provisionWorkspace(sql,{userId:user.id,workspaceName:`Kernel ${randomUUID().slice(0,8)}`,verticalId:"dental",moduleIds:["today","business-ops"],planId:"business"});
  const dental={tenantId:provisioned.tenantId,workspaceId:provisioned.workspaceId};
  const workspaces=new WorkspaceRepository(sql);
  const restaurantWorkspace=await workspaces.create({tenantId:dental.tenantId,name:`Restaurant ${randomUUID().slice(0,8)}`,verticalId:"restaurant",planId:"business"});
  const bakeryWorkspace=await workspaces.create({tenantId:dental.tenantId,name:`Bakery ${randomUUID().slice(0,8)}`,verticalId:"bakery",planId:"business"});
  const restaurant={tenantId:dental.tenantId,workspaceId:restaurantWorkspace.id};
  const bakery={tenantId:dental.tenantId,workspaceId:bakeryWorkspace.id};

  const locations=new LocationRepository(sql);
  const resources=new ResourceRepository(sql);
  const bookings=new BookingRepository(sql);
  const catalog=new CatalogRepository(sql);

  const dentalLocation=await locations.create(dental,{name:"Dental Office",timezone:"America/New_York"});
  const patient=await new ContactRepository(sql).create(dental,{relationship:"patient_reference",displayName:"Patient Reference"});
  const chair=await resources.create(dental,{locationId:dentalLocation.id,name:"Chair 1",resourceType:"chair",capacity:1,unit:"seat"});
  const cleaning=await catalog.create(dental,{kind:"service",name:"Cleaning",durationMinutes:60,priceAmount:150,currency:"USD"});
  const start=new Date(Date.now()+2*86400000).toISOString();
  const end=new Date(Date.now()+2*86400000+3600000).toISOString();
  const dentalBooking=await bookings.create(dental,{locationId:dentalLocation.id,contactId:patient.id,catalogItemId:cleaning.id,title:"Patient cleaning",bookingType:"appointment",startsAt:start,endsAt:end,timezone:"America/New_York",resources:[{resourceId:chair.id,quantity:1}]});
  assert.equal((await bookings.availabilityFor(dental,chair.id,start,end))?.available,0);
  await assert.rejects(()=>bookings.create(dental,{locationId:dentalLocation.id,contactId:patient.id,title:"Overbooked chair",bookingType:"appointment",startsAt:start,endsAt:end,timezone:"America/New_York",resources:[{resourceId:chair.id,quantity:1}]}),/booking-capacity-exceeded/);
  await bookings.setStatus(dental,dentalBooking.id,"canceled");
  assert.equal((await bookings.availabilityFor(dental,chair.id,start,end))?.available,1);

  const legacyAppointment=await new AppointmentRepository(sql).create(dental,{contactId:patient.id,title:"Legacy appointment",startsAt:new Date(Date.now()+3*86400000).toISOString(),endsAt:new Date(Date.now()+3*86400000+1800000).toISOString(),timezone:"America/New_York"});
  const compatibilityBooking=await bookings.findScoped(dental,legacyAppointment.id);
  assert.equal(compatibilityBooking?.legacyAppointmentId,legacyAppointment.id);
  assert.equal(compatibilityBooking?.bookingType,"appointment");
  await new AppointmentRepository(sql).setStatus(dental,legacyAppointment.id,"confirmed");
  assert.equal((await bookings.findScoped(dental,legacyAppointment.id))?.status,"confirmed");

  const restaurantLocation=await locations.create(restaurant,{name:"Restaurant",timezone:"America/New_York"});
  const guest=await new ContactRepository(sql).create(restaurant,{relationship:"customer",displayName:"Reservation Guest"});
  const table=await resources.create(restaurant,{locationId:restaurantLocation.id,name:"Table 12",resourceType:"table",capacity:4,unit:"guest"});
  const reservation=await bookings.create(restaurant,{locationId:restaurantLocation.id,contactId:guest.id,title:"Dinner reservation",bookingType:"reservation",startsAt:start,endsAt:end,timezone:"America/New_York",demandQuantity:4,resources:[{resourceId:table.id,quantity:4}]});
  assert.equal((await bookings.availabilityFor(restaurant,table.id,start,end))?.available,0);
  await assert.rejects(()=>bookings.create(restaurant,{locationId:restaurantLocation.id,contactId:guest.id,title:"Capacity overflow",bookingType:"reservation",startsAt:start,endsAt:end,timezone:"America/New_York",demandQuantity:1,resources:[{resourceId:table.id,quantity:1}]}),/booking-capacity-exceeded/);
  await bookings.setStatus(restaurant,reservation.id,"canceled");
  assert.equal((await bookings.availabilityFor(restaurant,table.id,start,end))?.available,4);

  await assert.rejects(()=>resources.create(restaurant,{locationId:dentalLocation.id,name:"Cross workspace room",resourceType:"room"}));
  await assert.rejects(()=>bookings.create(dental,{locationId:dentalLocation.id,title:"Cross workspace resource",startsAt:start,endsAt:end,timezone:"America/New_York",resources:[{resourceId:table.id,quantity:1}]}),/booking-resource-not-found/);

  const bakeryLocation=await locations.create(bakery,{name:"Bakery",timezone:"America/New_York"});
  const customer=await new ContactRepository(sql).create(bakery,{relationship:"customer",displayName:"Bakery Customer"});
  const pickupCounter=await resources.create(bakery,{locationId:bakeryLocation.id,name:"Pickup Counter",resourceType:"pickup_counter",capacity:2,unit:"order"});
  const cake=await catalog.create(bakery,{kind:"product",name:"Celebration Cake",sku:`CAKE-${randomUUID().slice(0,6)}`,priceAmount:35,currency:"USD"});
  const flour=await new InventoryItemRepository(sql).create(bakery,{name:"Flour",quantityOnHand:2,reorderPoint:5});
  await new CatalogInventoryLinkRepository(sql).link(bakery,{catalogItemId:cake.id,inventoryItemId:flour.id,quantityPerUnit:0.5});
  const pickup=await bookings.create(bakery,{locationId:bakeryLocation.id,contactId:customer.id,catalogItemId:cake.id,title:"Cake pickup",bookingType:"pickup",startsAt:start,endsAt:end,timezone:"America/New_York",resources:[{resourceId:pickupCounter.id,quantity:1}]});
  const orders=new OrderRepository(sql);
  const order=await orders.create(bakery,{contactId:customer.id,locationId:bakeryLocation.id,bookingId:pickup.id,currency:"USD",lines:[{catalogItemId:cake.id,quantity:2}]});
  assert.equal(order.total,70);
  assert.equal(order.lines[0].descriptionSnapshot,"Celebration Cake");
  assert.equal(order.lines[0].unitAmount,35);
  await sql`UPDATE atlas_catalog_items SET price_amount=40 WHERE tenant_id=${bakery.tenantId} AND workspace_id=${bakery.workspaceId} AND id=${cake.id}`;
  const reloadedOrder=await orders.findScoped(bakery,order.id);
  assert.equal(reloadedOrder?.total,70);
  assert.equal(reloadedOrder?.lines[0].unitAmount,35);

  const fulfillments=new FulfillmentRepository(sql);
  const fulfillment=await fulfillments.create(bakery,{orderId:order.id,fulfillmentType:"pickup",dueAt:start});
  await fulfillments.setStatus(bakery,fulfillment.id,"ready");
  assert.equal((await orders.findScoped(bakery,order.id))?.fulfillmentStatus,"ready");
  await fulfillments.setStatus(bakery,fulfillment.id,"fulfilled");
  assert.equal((await orders.findScoped(bakery,order.id))?.fulfillmentStatus,"fulfilled");

  await assert.rejects(()=>orders.create(bakery,{contactId:patient.id,locationId:bakeryLocation.id,currency:"USD",lines:[{catalogItemId:cake.id,quantity:1}]}));
  assert.equal(await bookings.findScoped(dental,pickup.id),null);
  assert.equal((await locations.list(dental)).some(row=>row.id===bakeryLocation.id),false);
  assert.equal((await new CatalogInventoryLinkRepository(sql).listForCatalogItem(bakery,cake.id))[0].inventoryItemId,flour.id);

  await closeDb();
});
