export interface WorkspaceRecordKey{tenantId:string;workspaceId:string;id:string}
export function assertRecordScope(expectedTenantId:string,expectedWorkspaceId:string,record:Pick<WorkspaceRecordKey,"tenantId"|"workspaceId">):void{
 if(record.tenantId!==expectedTenantId)throw new Error("cross-tenant-record");
 if(record.workspaceId!==expectedWorkspaceId)throw new Error("cross-workspace-record");
}
export function workspaceWhere(tenantId:string,workspaceId:string){if(!tenantId||!workspaceId)throw new Error("workspace-scope-required");return{tenantId,workspaceId}as const}
