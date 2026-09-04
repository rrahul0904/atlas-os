import {roleAtLeast,type AtlasRole} from "../../packages/tenancy/src/index.js";

export function canViewIntegrations(role:AtlasRole){
  return roleAtLeast(role,"operator");
}

export function canManageIntegrations(role:AtlasRole){
  return roleAtLeast(role,"admin");
}
