import {cookies} from "next/headers";
import {redirect} from "next/navigation";
import {verifySession} from "@atlas/auth";
import type {TenantPrincipal} from "@atlas/tenancy";

export const atlasSessionCookieName="atlas_session";

export function atlasRuntimeConfigured(){
  return Boolean(process.env.DATABASE_URL&&process.env.ATLAS_AUTH_SECRET&&process.env.ATLAS_AUTH_SECRET.length>=32);
}

export function atlasSignupEnabled(){
  return atlasRuntimeConfigured()&&process.env.ATLAS_ALLOW_SIGNUP==="true";
}

export async function optionalAtlasPrincipal():Promise<TenantPrincipal|null>{
  const secret=process.env.ATLAS_AUTH_SECRET;
  if(!secret||secret.length<32)return null;
  const store=await cookies();
  const token=store.get(atlasSessionCookieName)?.value;
  if(!token)return null;
  const session=verifySession(token,secret);
  if(!session)return null;
  return{userId:session.userId,tenantId:session.tenantId,workspaceId:session.workspaceId,role:session.role,scopes:session.scopes};
}

export async function requireAtlasPrincipal(){
  const principal=await optionalAtlasPrincipal();
  if(!principal)redirect("/login");
  return principal;
}
