import {describe,it,expect} from "vitest";
import type {TenantPrincipal} from "@atlas/tenancy";
import {canManageBilling,canManageIntegrations,canViewBilling,canViewIntegrations} from "./permissions";

function principal(role:TenantPrincipal["role"]):TenantPrincipal{
  return{userId:"u",tenantId:"t",workspaceId:"w",role,scopes:["*"]};
}

describe("product permissions",()=>{
  it("matches established integration visibility and management roles",()=>{
    expect(canViewIntegrations(principal("viewer"))).toBe(false);
    expect(canViewIntegrations(principal("member"))).toBe(false);
    expect(canViewIntegrations(principal("operator"))).toBe(true);
    expect(canManageIntegrations(principal("operator"))).toBe(false);
    expect(canManageIntegrations(principal("admin"))).toBe(true);
  });
  it("keeps Atlas billing admin-only",()=>{
    expect(canViewBilling(principal("operator"))).toBe(false);
    expect(canViewBilling(principal("admin"))).toBe(true);
    expect(canManageBilling(principal("admin"))).toBe(true);
  });
});
