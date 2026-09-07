import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {db,closeDb} from "../../db/src/index.js";
import {
  UserRepository,WorkspaceRepository,provisionWorkspace,ContactRepository,AppointmentRepository,InventoryItemRepository,
  LocationRepository,ResourceRepository,BookingRepository,CatalogRepository,OrderRepository,FulfillmentRepository
} from "../../repositories/src/index.js";
import {buildToday,createPersistenceTodayProvider} from "./index.js";

test("Today reads the same kernel for dental restaurant and bakery workspaces",async()=>{
  if(!process.env.DATABASE_URL)return;
  const sql=db();
  const user=await new UserRepository(sql).create({email:`today-kernel-${randomUUID()}@example.test`,passwordHash:"test-hash"});
  const provisioned=await provisionWorkspace(sql,{userId:user.id,workspaceName:`Dental ${randomUUID().slice(0,8)}`,verticalId:"dental",moduleIds:["today","business-ops"],planId:"business"});
  const dental={tenantId:provisioned.tenantId,workspaceId:provisioned.workspaceId};
  const workspaceRepo=new WorkspaceRepository(sql);
  const restaurantWs=await workspaceRepo.create({tenantId:dental.tenantId,name:`Restaurant ${randomUUID().slice(0,8)}`,verticalId:"restaurant",planId:"business"});
  const bakeryWs=await workspaceRepo.create({tenantId:dental.tenantId,name:`Bakery ${randomUUID().slice(0,8)}`,verticalId:"bakery",planId:"business"});
  const restaurant={tenantId:dental.tenantId,workspaceId:restaurantWs.id};
  const bakery={tenantId:dental.tenantId,workspaceId:bakeryWs.id};
  const futureStart=new Date(Date.now()+86400000).toISOString();
  const futureEnd=new Date(Date.now()+90000000).toISOString();

  const dentalPatient=await new ContactRepository(sql).create(dental,{relationship:"patient_reference",displayName:"Patient"});
  const appointment=await new AppointmentRepository(sql).create(dental,{contactId:dentalPatient.id,title:"Dental appointment",startsAt:futureStart,endsAt:futureEnd,timezone:"America/New_York"});
  const dentalToday=await buildToday(dental,[createPersistenceTodayProvider(sql)]);
  assert.equal(dentalToday.metrics.find(row=>row.id==="upcoming-bookings")?.value,1);
  assert.equal(dentalToday.metrics.find(row=>row.id==="upcoming-appointments")?.value,1);
  assert.ok(dentalToday.upcoming.some(row=>row.id==="appointment:"+appointment.id));

  const locationRepo=new LocationRepository(sql),resourceRepo=new ResourceRepository(sql),bookingRepo=new BookingRepository(sql);
  const restaurantLocation=await locationRepo.create(restaurant,{name:"Dining Room",timezone:"America/New_York"});
  const guest=await new ContactRepository(sql).create(restaurant,{relationship:"customer",displayName:"Guest"});
  const table=await resourceRepo.create(restaurant,{locationId:restaurantLocation.id,name:"Table",resourceType:"table",capacity:4,unit:"guest"});
  const reservation=await bookingRepo.create(restaurant,{locationId:restaurantLocation.id,contactId:guest.id,title:"Dinner reservation",bookingType:"reservation",startsAt:futureStart,endsAt:futureEnd,timezone:"America/New_York",demandQuantity:2,resources:[{resourceId:table.id,quantity:2}]});
  const restaurantToday=await buildToday(restaurant,[createPersistenceTodayProvider(sql)]);
  assert.equal(restaurantToday.metrics.find(row=>row.id==="upcoming-bookings")?.value,1);
  assert.equal(restaurantToday.metrics.find(row=>row.id==="unconfirmed-bookings")?.value,1);
  assert.ok(restaurantToday.upcoming.some(row=>row.id==="booking:"+reservation.id));

  const bakeryLocation=await locationRepo.create(bakery,{name:"Bakery",timezone:"America/New_York"});
  const customer=await new ContactRepository(sql).create(bakery,{relationship:"customer",displayName:"Customer"});
  const pickupResource=await resourceRepo.create(bakery,{locationId:bakeryLocation.id,name:"Pickup",resourceType:"pickup_counter",capacity:2,unit:"order"});
  const product=await new CatalogRepository(sql).create(bakery,{kind:"product",name:"Bread Box",priceAmount:24,currency:"USD"});
  const pickup=await bookingRepo.create(bakery,{locationId:bakeryLocation.id,contactId:customer.id,title:"Pickup slot",bookingType:"pickup",startsAt:futureStart,endsAt:futureEnd,timezone:"America/New_York",resources:[{resourceId:pickupResource.id,quantity:1}]});
  const order=await new OrderRepository(sql).create(bakery,{contactId:customer.id,locationId:bakeryLocation.id,bookingId:pickup.id,lines:[{catalogItemId:product.id,quantity:1}]});
  await new FulfillmentRepository(sql).create(bakery,{orderId:order.id,fulfillmentType:"pickup",dueAt:futureStart});
  await new InventoryItemRepository(sql).create(bakery,{name:"Flour",quantityOnHand:1,reorderPoint:3});
  const bakeryToday=await buildToday(bakery,[createPersistenceTodayProvider(sql)]);
  assert.equal(bakeryToday.metrics.find(row=>row.id==="upcoming-bookings")?.value,1);
  assert.equal(bakeryToday.metrics.find(row=>row.id==="unfulfilled-orders")?.value,1);
  assert.equal(bakeryToday.metrics.find(row=>row.id==="low-stock")?.value,1);
  assert.ok(bakeryToday.upcoming.some(row=>row.id==="fulfillment:"||row.id.startsWith("fulfillment:")));

  const wrong=await buildToday({tenantId:dental.tenantId,workspaceId:"wrong-workspace"},[createPersistenceTodayProvider(sql)]);
  assert.equal(wrong.metrics.find(row=>row.id==="upcoming-bookings")?.value,0);
  assert.equal(wrong.metrics.find(row=>row.id==="unfulfilled-orders")?.value,0);
  await closeDb();
});
