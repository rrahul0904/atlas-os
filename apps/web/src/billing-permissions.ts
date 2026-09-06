import {roleAtLeast,type AtlasRole} from "../../../packages/tenancy/src/index.js";

export function canViewBilling(role:AtlasRole){return roleAtLeast(role,"admin")}
export function canManageBilling(role:AtlasRole){return roleAtLeast(role,"admin")}
