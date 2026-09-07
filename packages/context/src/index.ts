import type {AtlasSql} from "../../db/src/index.js";
import type {TenantPrincipal} from "../../tenancy/src/index.js";
import {requireWorkspaceAccess} from "../../tenancy/src/index.js";
import type {EvidenceRecord} from "../../evidence/src/index.js";
import type {BusinessActionItem} from "../../action-center/src/index.js";
import {
  WorkspaceRepository,
  ModuleConfigurationRepository,
  EvidenceRepository,
  ActionItemRepository,
  TaskRepository,
  ApprovalRepository,
  EventRepository,
  ContactRepository,
  LeadRepository,
  OpportunityRepository,
  AppointmentRepository,
  LocationRepository,
  ResourceRepository,
  BookingRepository,
  CatalogRepository,
  OrderRepository,
  FulfillmentRepository,
  InvoiceRepository,
  InventoryItemRepository
} from "../../repositories/src/index.js";

export interface WorkspaceContext{
  principal:TenantPrincipal;
  workspace:{
    id:string;
    tenantId:string;
    name:string;
    verticalId:string;
    planId:string;
    billingStatus:string;
    trialEndsAt:string|null;
  };
  modules:string[];
  evidence:EvidenceRecord[];
  actions:BusinessActionItem[];
  tasks:any[];
  approvals:any[];
  events:any[];
  business:{
    contacts:any[];
    leads:any[];
    opportunities:any[];
    appointments:any[];
    locations:any[];
    resources:any[];
    bookings:any[];
    catalogItems:any[];
    orders:any[];
    fulfillments:any[];
    invoices:any[];
    inventory:any[];
  };
  resolvedAt:string;
}

export async function resolveWorkspaceContext(sql:AtlasSql,principal:TenantPrincipal):Promise<WorkspaceContext>{
  requireWorkspaceAccess(principal,principal.tenantId,principal.workspaceId,"viewer");
  const scope={tenantId:principal.tenantId,workspaceId:principal.workspaceId};
  const workspaceRepo=new WorkspaceRepository(sql);
  const [
    workspace,modules,evidence,actions,tasks,approvals,events,contacts,leads,opportunities,appointments,
    locations,resources,bookings,catalogItems,orders,fulfillments,invoices,inventory
  ]=await Promise.all([
    workspaceRepo.findScoped(scope.tenantId,scope.workspaceId),
    new ModuleConfigurationRepository(sql).enabled(scope.tenantId,scope.workspaceId),
    new EvidenceRepository(sql).listRecent(scope,100),
    new ActionItemRepository(sql).listOpen(scope,100),
    new TaskRepository(sql).list(scope),
    new ApprovalRepository(sql).listPending(scope),
    new EventRepository(sql).recent(scope,100),
    new ContactRepository(sql).list(scope,100),
    new LeadRepository(sql).list(scope,100),
    new OpportunityRepository(sql).list(scope,100),
    new AppointmentRepository(sql).list(scope,100),
    new LocationRepository(sql).list(scope,100),
    new ResourceRepository(sql).list(scope,100),
    new BookingRepository(sql).list(scope,100),
    new CatalogRepository(sql).list(scope,100),
    new OrderRepository(sql).list(scope,100),
    new FulfillmentRepository(sql).list(scope,100),
    new InvoiceRepository(sql).list(scope,100),
    new InventoryItemRepository(sql).list(scope,100)
  ]);
  if(!workspace)throw new Error("workspace-not-found");
  return{
    principal,
    workspace:{
      id:workspace.id,
      tenantId:workspace.tenantId,
      name:workspace.name,
      verticalId:workspace.verticalId,
      planId:workspace.planId,
      billingStatus:workspace.billingStatus,
      trialEndsAt:workspace.trialEndsAt
    },
    modules,
    evidence,
    actions,
    tasks:[...tasks],
    approvals:[...approvals],
    events:[...events],
    business:{
      contacts:[...contacts],
      leads:[...leads],
      opportunities:[...opportunities],
      appointments:[...appointments],
      locations:[...locations],
      resources:[...resources],
      bookings:[...bookings],
      catalogItems:[...catalogItems],
      orders:[...orders],
      fulfillments:[...fulfillments],
      invoices:[...invoices],
      inventory:[...inventory]
    },
    resolvedAt:new Date().toISOString()
  };
}
