export type AtlasRole = "owner" | "admin" | "operator" | "member" | "viewer";
export interface TenantPrincipal { userId:string;tenantId:string;workspaceId:string;role:AtlasRole;scopes:string[]; }
export interface WorkspaceMembership { userId:string;tenantId:string;workspaceId:string;role:AtlasRole;status:"active"|"invited"|"suspended"; }
const roleRank:Record<AtlasRole,number>={viewer:1,member:2,operator:3,admin:4,owner:5};
export function roleAtLeast(actual:AtlasRole,required:AtlasRole){return roleRank[actual]>=roleRank[required];}
export function requireWorkspaceAccess(principal:TenantPrincipal,tenantId:string,workspaceId:string,requiredRole:AtlasRole="viewer"):void{
  if(principal.tenantId!==tenantId) throw new Error("cross-tenant-access-denied");
  if(principal.workspaceId!==workspaceId) throw new Error("cross-workspace-access-denied");
  if(!roleAtLeast(principal.role,requiredRole)) throw new Error("insufficient-role");
}
export function scopeAllowed(principal:TenantPrincipal,scope:string){return principal.scopes.includes("*")||principal.scopes.includes(scope);}
