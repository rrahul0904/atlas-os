import {createServer,type IncomingMessage,type ServerResponse} from "node:http";
import {readFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import {dirname,resolve} from "node:path";
import {renderDemo,renderIndex,type DemoId} from "./render.js";
import {renderSignup,renderLogin,renderOnboarding,renderConnectedToday} from "./auth-pages.js";
import {db,databaseConfigured,dbHealth} from "../../../packages/db/src/index.js";
import {UserRepository,MembershipRepository,WorkspaceRepository,ModuleConfigurationRepository,AuditRepository,provisionWorkspace} from "../../../packages/repositories/src/index.js";
import {hashPassword,verifyPassword,createSetupToken,verifySetupToken,createSession,verifySession} from "../../../packages/auth/src/index.js";
import {resetRegistry,getVertical} from "../../../packages/module-registry/src/index.js";
import {registerAtlasModules,registerAtlasVerticals} from "../../../packages/module-registry/src/catalog.js";
import {intersectEnabledModules} from "../../../packages/entitlements/src/index.js";
import type {AtlasRole,TenantPrincipal} from "../../../packages/tenancy/src/index.js";

const root=resolve(dirname(fileURLToPath(import.meta.url)),"../../..");
const port=Number(process.env.PORT||3000);
const validDemo=new Set<DemoId>(["founder","ceo","dental","contractor","agency"]);
const validVertical=new Set(["founder","ceo","dental","contractor","agency"]);

function authSecret(){const value=process.env.ATLAS_AUTH_SECRET;return value&&value.length>=32?value:null;}
function secureCookie(){return process.env.NODE_ENV==="production"?"; Secure":"";}
function cookie(name:string,value:string,maxAge:number){return name+"="+value+"; Path=/; HttpOnly; SameSite=Lax; Max-Age="+String(maxAge)+secureCookie();}
function clearCookie(name:string){return cookie(name,"",0);}
function cookies(req:IncomingMessage){
  const raw=req.headers.cookie;const source=Array.isArray(raw)?raw.join(";"):raw||"";const out:Record<string,string>={};
  for(const part of source.split(";")){const index=part.indexOf("=");if(index<0)continue;out[part.slice(0,index).trim()]=part.slice(index+1).trim();}
  return out;
}
function redirect(res:ServerResponse,location:string,setCookies?:string[]){res.writeHead(303,{location,...(setCookies?.length?{"set-cookie":setCookies}:{})});res.end();}
function html(res:ServerResponse,body:string,status=200){res.writeHead(status,{"content-type":"text/html; charset=utf-8"});res.end(body);}
function json(res:ServerResponse,payload:unknown,status=200){res.writeHead(status,{"content-type":"application/json"});res.end(JSON.stringify(payload));}
function readBody(req:IncomingMessage):Promise<string>{return new Promise((resolveBody,reject)=>{const chunks:string[]=[];req.on("data",chunk=>chunks.push(typeof chunk==="string"?chunk:Buffer.from(chunk).toString("utf8")));req.on("end",()=>resolveBody(chunks.join("")));req.on("error",reject);});}
async function form(req:IncomingMessage){return new URLSearchParams(await readBody(req));}
function scopesForRole(role:AtlasRole):string[]{
  if(role==="owner")return["*"];
  if(role==="admin")return["today:read","business:read","business:write","agents:read","approvals:manage","integrations:read","integrations:write"];
  if(role==="operator")return["today:read","business:read","business:write","agents:read","integrations:read"];
  if(role==="member")return["today:read","business:read","business:write"];
  return["today:read","business:read"];
}
function register(){resetRegistry();registerAtlasModules();registerAtlasVerticals();}
function sessionFrom(req:IncomingMessage):TenantPrincipal|null{const secret=authSecret();const token=cookies(req).atlas_session;if(!secret||!token)return null;const session=verifySession(token,secret);if(!session)return null;return{userId:session.userId,tenantId:session.tenantId,workspaceId:session.workspaceId,role:session.role,scopes:session.scopes};}
function setupFrom(req:IncomingMessage){const secret=authSecret();const token=cookies(req).atlas_setup;return secret&&token?verifySetupToken(token,secret):null;}
function runtimeReady(){return Boolean(authSecret()&&databaseConfigured());}

createServer(async(req,res)=>{
  const path=(req.url||"/").split("?")[0];const method=(req.method||"GET").toUpperCase();
  try{
    if(path==="/health"){const health=databaseConfigured()?await dbHealth():{status:"not_configured" as const};json(res,{status:"ok",product:"AtlasOS",database:health.status});return;}
    if(path==="/ready"){if(!runtimeReady()){json(res,{status:"not_ready",auth:Boolean(authSecret()),database:databaseConfigured()},503);return;}const health=await dbHealth();json(res,{status:health.status},health.status==="ok"?200:503);return;}
    if(path==="/assets/atlas.css"){const css=await readFile(resolve(root,"apps/web/static/atlas.css"),"utf8");res.writeHead(200,{"content-type":"text/css; charset=utf-8"});res.end(css);return;}
    if(path==="/"&&method==="GET"){html(res,renderIndex());return;}
    const demoMatch=path.match(/^\/demo\/(founder|ceo|dental|contractor|agency)$/);
    if(demoMatch&&method==="GET"&&validDemo.has(demoMatch[1] as DemoId)){html(res,renderDemo(demoMatch[1] as DemoId));return;}

    if(path==="/signup"&&method==="GET"){html(res,renderSignup());return;}
    if(path==="/signup"&&method==="POST"){
      if(!runtimeReady()){html(res,renderSignup("Connected signup is not configured on this deployment."),503);return;}
      const data=await form(req);const email=(data.get("email")||"").trim().toLowerCase();const password=data.get("password")||"";const displayName=(data.get("displayName")||"").trim();
      if(!email.includes("@")||password.length<10){html(res,renderSignup("Enter a valid email and a password of at least 10 characters."),400);return;}
      const users=new UserRepository(db());if(await users.findByEmail(email)){html(res,renderSignup("An account with that email already exists."),409);return;}
      const user=await users.create({email,displayName:displayName||null,passwordHash:hashPassword(password)});const secret=authSecret()!;const token=createSetupToken({userId:user.id,email:user.email},secret);
      redirect(res,"/onboarding",[cookie("atlas_setup",token,1800)]);return;
    }

    if(path==="/onboarding"&&method==="GET"){const setup=setupFrom(req);if(!setup){redirect(res,"/login");return;}html(res,renderOnboarding({email:setup.email}));return;}
    if(path==="/onboarding"&&method==="POST"){
      if(!runtimeReady()){html(res,renderLogin("Connected onboarding is not configured."),503);return;}
      const setup=setupFrom(req);if(!setup){redirect(res,"/login");return;}const data=await form(req);const workspaceName=(data.get("workspaceName")||"").trim();const verticalId=(data.get("vertical")||"").trim();
      if(workspaceName.length<2||!validVertical.has(verticalId)){html(res,renderOnboarding({email:setup.email,error:"Choose a valid business type and workspace name."}),400);return;}
      register();const vertical=getVertical(verticalId);if(!vertical){html(res,renderOnboarding({email:setup.email,error:"That business type is not available."}),400);return;}
      const moduleIds=intersectEnabledModules("business",vertical.modules);const provisioned=await provisionWorkspace(db(),{userId:setup.userId,workspaceName,verticalId,moduleIds,planId:"business"});
      await new AuditRepository(db()).record({tenantId:provisioned.tenantId,workspaceId:provisioned.workspaceId},{actorId:setup.userId,action:"workspace.created",targetType:"workspace",targetId:provisioned.workspaceId,metadata:{verticalId,planId:"business"}});
      const session=createSession({userId:setup.userId,tenantId:provisioned.tenantId,workspaceId:provisioned.workspaceId,role:"owner",scopes:["*"]},authSecret()!);
      redirect(res,"/app/today",[cookie("atlas_session",session,43200),clearCookie("atlas_setup")]);return;
    }

    if(path==="/login"&&method==="GET"){html(res,renderLogin());return;}
    if(path==="/login"&&method==="POST"){
      if(!runtimeReady()){html(res,renderLogin("Connected login is not configured on this deployment."),503);return;}
      const data=await form(req);const email=(data.get("email")||"").trim().toLowerCase();const password=data.get("password")||"";const users=new UserRepository(db());const user=await users.findByEmail(email);
      if(!user?.passwordHash||!verifyPassword(password,user.passwordHash)){html(res,renderLogin("Email or password is incorrect."),401);return;}
      const membership=await new MembershipRepository(db()).firstActiveForUser(user.id);
      if(!membership){const setup=createSetupToken({userId:user.id,email:user.email},authSecret()!);redirect(res,"/onboarding",[cookie("atlas_setup",setup,1800)]);return;}
      const session=createSession({userId:user.id,tenantId:membership.tenantId,workspaceId:membership.workspaceId,role:membership.role,scopes:scopesForRole(membership.role)},authSecret()!);
      redirect(res,"/app/today",[cookie("atlas_session",session,43200)]);return;
    }

    if(path==="/logout"&&method==="POST"){redirect(res,"/login",[clearCookie("atlas_session"),clearCookie("atlas_setup")]);return;}
    if(path==="/app"&&method==="GET"){redirect(res,"/app/today");return;}
    if(path==="/app/today"&&method==="GET"){
      const principal=sessionFrom(req);if(!principal){redirect(res,"/login");return;}
      const workspace=await new WorkspaceRepository(db()).findScoped(principal.tenantId,principal.workspaceId);if(!workspace){html(res,renderLogin("Workspace access is no longer available."),403);return;}
      const modules=await new ModuleConfigurationRepository(db()).enabled(principal.tenantId,principal.workspaceId);
      html(res,renderConnectedToday({workspaceName:workspace.name,verticalId:workspace.verticalId,planId:workspace.planId,billingStatus:workspace.billingStatus,trialEndsAt:workspace.trialEndsAt,modules}));return;
    }

    res.writeHead(404,{"content-type":"text/plain"});res.end("Not found");
  }catch(error){console.error(error);json(res,{status:"error",message:"Request failed safely."},500);}
}).listen(port,()=>console.log("AtlasOS web listening on :"+String(port)));
