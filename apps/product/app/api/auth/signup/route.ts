import {NextResponse} from "next/server";
import {db} from "@atlas/db";
import {hashPassword,createSession} from "@atlas/auth";
import {provisionOwnerWorkspace} from "@atlas/repositories";
import {atlasSessionCookieName,atlasSignupEnabled} from "@/lib/session";
import {defaultWorkspaceModules,validateSignupInput} from "@/lib/signup";

export const runtime="nodejs";

export async function POST(request:Request){
  if(!atlasSignupEnabled())return NextResponse.redirect(new URL("/signup?error=unavailable",request.url),303);
  const form=await request.formData();
  const parsed=validateSignupInput({
    displayName:form.get("displayName"),email:form.get("email"),password:form.get("password"),
    workspaceName:form.get("workspaceName"),verticalId:form.get("verticalId")
  });
  if(!parsed.ok)return NextResponse.redirect(new URL("/signup?error=invalid",request.url),303);

  const secret=process.env.ATLAS_AUTH_SECRET!;
  try{
    const created=await provisionOwnerWorkspace(db(),{
      email:parsed.value.email,
      displayName:parsed.value.displayName,
      passwordHash:hashPassword(parsed.value.password),
      workspaceName:parsed.value.workspaceName,
      verticalId:parsed.value.verticalId,
      moduleIds:[...defaultWorkspaceModules],
      planId:"business"
    });
    const token=createSession({
      userId:created.userId,tenantId:created.tenantId,workspaceId:created.workspaceId,role:"owner",scopes:["*"]
    },secret);
    const response=NextResponse.redirect(new URL("/app/today",request.url),303);
    response.cookies.set(atlasSessionCookieName,token,{
      httpOnly:true,sameSite:"lax",secure:process.env.NODE_ENV==="production",path:"/",maxAge:43200
    });
    return response;
  }catch(error){
    const code=error&&typeof error==="object"&&"code" in error?String((error as {code?:unknown}).code):"";
    return NextResponse.redirect(new URL(code==="23505"?"/signup?error=exists":"/signup?error=unavailable",request.url),303);
  }
}
