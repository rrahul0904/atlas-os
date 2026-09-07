import type {TenantPrincipal} from "@atlas/tenancy";
import {roleAtLeast,scopeAllowed} from "@atlas/tenancy";
import {db} from "@atlas/db";
import {WorkspaceRepository} from "@atlas/repositories";
import {isAtlasPlan,moduleEntitledForBilling} from "@atlas/entitlements";

export function canManageIntegrations(principal:TenantPrincipal){return roleAtLeast(principal.role,"admin")||scopeAllowed(principal,"integrations:write")}
export function canManageBilling(principal:TenantPrincipal){return roleAtLeast(principal.role,"admin")}

export async function billedModuleAllowed(principal:TenantPrincipal,moduleId:string){
  const workspace=await new WorkspaceRepository(db()).findScoped(principal.tenantId,principal.workspaceId);
  return Boolean(workspace&&isAtlasPlan(workspace.planId)&&moduleEntitledForBilling(workspace.planId,workspace.billingStatus,moduleId));
}
