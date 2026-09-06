import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {db,closeDb} from "../../db/src/index.js";
import {
  UserRepository,WorkspaceRepository,provisionWorkspace,
  ContactRepository,LeadRepository,OpportunityRepository,AppointmentRepository,CommunicationRepository,
  InvoiceRepository,PaymentRepository,InventoryItemRepository,CampaignRepository,ProjectRepository
} from "./index.js";

test("native business records persist with strict tenant and workspace scope",async()=>{
  if(!process.env.DATABASE_URL)return;
  const sql=db();const users=new UserRepository(sql);
  const user=await users.create({email:`business-${randomUUID()}@example.test`,passwordHash:"test-hash"});
  const provisioned=await provisionWorkspace(sql,{userId:user.id,workspaceName:`Business ${randomUUID().slice(0,8)}`,verticalId:"founder",moduleIds:["today","business-ops"],planId:"business"});
  const scope={tenantId:provisioned.tenantId,workspaceId:provisioned.workspaceId};
  const otherWorkspace=await new WorkspaceRepository(sql).create({tenantId:scope.tenantId,name:`Other ${randomUUID().slice(0,8)}`,verticalId:"dental",planId:"business"});
  const otherScope={tenantId:scope.tenantId,workspaceId:otherWorkspace.id};

  const contacts=new ContactRepository(sql);
  const contact=await contacts.create(scope,{relationship:"customer",displayName:"Ada Customer",email:"ada@example.test"});
  assert.equal((await contacts.findScoped(scope,contact.id))?.displayName,"Ada Customer");
  assert.equal(await contacts.findScoped(otherScope,contact.id),null);
  assert.equal(await contacts.findScoped({tenantId:"wrong-tenant",workspaceId:scope.workspaceId},contact.id),null);

  const leads=new LeadRepository(sql);
  const lead=await leads.create(scope,{contactId:contact.id,title:"Website lead",score:92});
  assert.equal((await leads.updateState(scope,lead.id,{status:"qualified",score:96}))?.status,"qualified");

  let crossWorkspaceLinkRejected=false;
  try{await leads.create(otherScope,{contactId:contact.id,title:"Illegal cross-workspace link"})}catch{crossWorkspaceLinkRejected=true}
  assert.equal(crossWorkspaceLinkRejected,true);

  const opportunities=new OpportunityRepository(sql);
  const opportunity=await opportunities.create(scope,{contactId:contact.id,leadId:lead.id,name:"Annual plan",amount:12000,currency:"USD"});
  assert.equal((await opportunities.updateState(scope,opportunity.id,{status:"open",stage:"proposal"}))?.stage,"proposal");

  const appointments=new AppointmentRepository(sql);
  const start=new Date(Date.now()+86400000).toISOString();const end=new Date(Date.now()+90000000).toISOString();
  const appointment=await appointments.create(scope,{contactId:contact.id,title:"Discovery call",startsAt:start,endsAt:end,timezone:"America/New_York"});
  assert.equal((await appointments.setStatus(scope,appointment.id,"confirmed"))?.status,"confirmed");

  const communications=new CommunicationRepository(sql);
  const communication=await communications.create(scope,{contactId:contact.id,channel:"email",direction:"outbound",subject:"Follow-up",bodyPreview:"Safe preview"});
  assert.equal((await communications.list(scope))[0].id,communication.id);

  const invoices=new InvoiceRepository(sql);
  const invoice=await invoices.create(scope,{contactId:contact.id,invoiceNumber:"INV-001",status:"open",totalAmount:12000,currency:"USD",dueAt:new Date(Date.now()+7*86400000).toISOString()});
  const payments=new PaymentRepository(sql);
  const payment=await payments.create(scope,{invoiceId:invoice.id,contactId:contact.id,status:"succeeded",amount:12000,currency:"USD",paidAt:new Date().toISOString()});
  assert.equal((await payments.list(scope))[0].id,payment.id);
  assert.equal((await invoices.setStatus(scope,invoice.id,"paid"))?.status,"paid");

  const inventory=new InventoryItemRepository(sql);
  const item=await inventory.create(scope,{sku:"ATLAS-001",name:"Starter stock",quantityOnHand:10,reorderPoint:3});
  assert.equal((await inventory.transact(scope,item.id,{type:"usage",quantity:2,reason:"Customer delivery"}))?.quantityOnHand,8);

  const campaign=await new CampaignRepository(sql).create(scope,{name:"Founder launch",status:"planned",channel:"email"});
  const project=await new ProjectRepository(sql).create(scope,{name:"V1 rollout",status:"active"});
  assert.equal((await new CampaignRepository(sql).list(scope))[0].id,campaign.id);
  assert.equal((await new ProjectRepository(sql).list(scope))[0].id,project.id);

  const reloadedContact=await new ContactRepository(sql).findScoped(scope,contact.id);
  const reloadedOpportunity=await new OpportunityRepository(sql).findScoped(scope,opportunity.id);
  assert.equal(reloadedContact?.id,contact.id);
  assert.equal(reloadedOpportunity?.leadId,lead.id);

  assert.equal((await leads.list(otherScope)).length,0);
  assert.equal((await appointments.list(otherScope)).length,0);
  assert.equal((await invoices.list(otherScope)).length,0);
  assert.equal((await inventory.list(otherScope)).length,0);
  await closeDb();
});
