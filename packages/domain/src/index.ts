export type AtlasRole = "owner" | "admin" | "operator" | "member" | "viewer";
export type ModuleState = "native" | "adapted" | "legacy" | "deprecated";
export type SafeValue = string | number | boolean | null;

export interface Tenant { id:string; name:string; createdAt:string; }
export interface Workspace { id:string; tenantId:string; name:string; verticalId:string; enabledModules:string[]; createdAt:string; }
export interface Membership { id:string; workspaceId:string; userId:string; role:AtlasRole; }
export interface Person { id:string; workspaceId:string; displayName:string; email?:string; phone?:string; createdAt:string; }
export interface Organization { id:string; workspaceId:string; name:string; createdAt:string; }
export interface Contact { id:string; workspaceId:string; personId?:string; organizationId?:string; status:string; tags:string[]; createdAt:string; }
export interface Customer { id:string; workspaceId:string; contactId:string; status:string; createdAt:string; }
export interface Lead { id:string; workspaceId:string; contactId?:string; source:string; status:"new"|"qualified"|"quoted"|"won"|"lost"; estimatedValue:number; createdAt:string; }
export interface Opportunity { id:string; workspaceId:string; title:string; status:string; value?:number; evidenceIds:string[]; createdAt:string; }
export interface Project { id:string; workspaceId:string; name:string; status:string; createdAt:string; }
export interface Goal { id:string; workspaceId:string; metric:string; target:number; periodStart:string; periodEnd:string; }
export interface Task { id:string; workspaceId:string; title:string; status:"todo"|"doing"|"blocked"|"done"; priority:"low"|"medium"|"high"|"critical"; dueAt?:string; relatedEntityId?:string; }
export interface WorkItem { id:string; workspaceId:string; title:string; status:string; value?:number; createdAt:string; }
export interface Appointment { id:string; workspaceId:string; contactId?:string; startsAt:string; endsAt:string; status:string; }
export interface Conversation { id:string; workspaceId:string; channel:string; contactId?:string; createdAt:string; }
export interface Notification { id:string; workspaceId:string; type:string; title:string; status:"unread"|"read"|"resolved"; createdAt:string; }
export interface Invoice { id:string; workspaceId:string; workItemId?:string; amount:number; currency:string; status:string; issueDate:string; dueDate:string; }
export interface Payment { id:string; workspaceId:string; invoiceId?:string; amount:number; currency:string; paidAt:string; method:string; }
export interface Transaction { id:string; workspaceId:string; type:string; amount:number; currency:string; occurredAt:string; }
export interface RevenueFact { id:string; workspaceId:string; projectId?:string; amount:number; currency:string; kind:string; occurredAt:string; }
export interface CostFact { id:string; workspaceId:string; projectId?:string; amount:number; currency:string; basis:"actual"|"estimated"; occurredAt:string; }
export interface Evidence { id:string; workspaceId:string; kind:string; claim:string; source:string; confidence:number; createdAt:string; }
export interface Decision { id:string; workspaceId:string; title:string; status:"proposed"|"approved"|"rejected"; evidenceIds:string[]; createdAt:string; }
export interface Memory { id:string; workspaceId:string; namespace:string; key:string; value:string; updatedAt:string; }
export interface AuditEvent { id:string; workspaceId:string; actorId?:string; action:string; targetType?:string; targetId?:string; metadata:Record<string,SafeValue>; occurredAt:string; }

export interface AtlasEvent {
  id:string;
  tenantId:string;
  workspaceId:string;
  module:string;
  type:string;
  entityType?:string;
  entityId?:string;
  occurredAt:string;
  properties:Record<string,SafeValue>;
  trace?:{ actorId?:string; agentId?:string; workflowId?:string; executionId?:string };
}

export interface ModuleDescriptor {
  id:string;
  name:string;
  state:ModuleState;
  sourceRepository:string;
  description:string;
  permissions:string[];
  eventTypes:string[];
}

export interface VerticalDescriptor {
  id:string;
  name:string;
  modules:string[];
  terminology:Record<string,string>;
}
