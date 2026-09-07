import {NextResponse} from "next/server";
import {db} from "@atlas/db";
import {UserRepository,MembershipRepository} from "@atlas/repositories";
import {verifyPassword,createSession} from "@atlas/auth";
import {atlasSessionCookieName} from "@/lib/session";

export const runtime="nodejs";
function scopes(role:string){if(role==="owner")return["*"];if(role==="admin")return["today:read","business:read","business:write","agents:read","approvals:manage","integrations:read","integrations:write"];if(role==="operator")return["today:read","business:read","business:write","agents:read","integrations:read"];if(role==="member")return["today:read","business:read","business:write"];return["today:read","business:read"]}

export async function POST(request:Request){
  const secret=process.env.ATLAS_AUTH_SECRET;if(!process.env.DATABASE_URL||!secret||secret.length<32)return NextResponse.json({message:"Connected runtime is not configured."},{status:503});
  const form=await request.formData(),email=String(form.get("email")||"").trim().toLowerCase(),password=String(form.get("password")||"");
  const user=await new UserRepository(db()).findByEmail(email);
  if(!user?.passwordHash||!verifyPassword(password,user.passwordHash))return NextResponse.redirect(new URL("/login?error=1",request.url),303);
  const membership=await new MembershipRepository(db()).firstActiveForUser(user.id);if(!membership)return NextResponse.redirect(new URL("/login?error=1",request.url),303);
  const token=createSession({userId:user.id,tenantId:membership.tenantId,workspaceId:membership.workspaceId,role:membership.role,scopes:scopes(membership.role)},secret);
  const response=NextResponse.redirect(new URL("/app/today",request.url),303);
  response.cookies.set(atlasSessionCookieName,token,{httpOnly:true,sameSite:"lax",secure:process.env.NODE_ENV==="production",path:"/",maxAge:43200});
  return response;
}
