export type TaskStatus="pending"|"in_progress"|"done";
export type TaskPriority="low"|"medium"|"high";
export interface UserSummary { id:string;email:string;emailVerifiedAt:string|null;createdAt:string; }
export interface TaskDto {
  id:string;title:string;description:string|null;status:TaskStatus;priority:TaskPriority;
  dueDate:string|null;createdAt:string;updatedAt:string;
}
export interface AuthResponse { sessionToken:string;user:UserSummary; }

export function normalizeTask(input:Partial<TaskDto>&Pick<TaskDto,"id"|"title">):TaskDto{
  const now=new Date().toISOString();
  return {
    id:input.id,title:input.title,description:input.description??null,
    status:input.status??"pending",priority:input.priority??"medium",
    dueDate:input.dueDate??null,createdAt:input.createdAt??now,updatedAt:input.updatedAt??now
  };
}
