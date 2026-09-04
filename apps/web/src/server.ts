import {createServer,type IncomingMessage,type ServerResponse} from "node:http";
import {readFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import {dirname,resolve} from "node:path";
import {renderDemo,renderIndex,type DemoId} from "./render.js";
import {renderSignup,renderLogin,renderOnboarding} from "./auth-pages.js";
import {renderConnectedTodayView} from "./connected-today.js";
import {renderAgentsPage,renderApprovalsPage,renderWorkflowsPage} from "./operations-pages.js";
import {renderIntegrationsPage} from "./integrations-page.js";
import {db,databaseConfigured,dbHealth} from "../../../packages/db/src/index.js";
import {UserRepository,MembershipRepository,WorkspaceRepository,ModuleConfigurationRepository,AuditRepository,AgentRepository,ApprovalRepository,WorkflowRepository,IntegrationConnectionRepository,provisionWorkspace} from "../../../packages/repositories/src/index.js";
import {hashPassword,verifyPassword,createSetupToken,verifySetupToken,createSession,verifySession} from "../../../packages/auth/src/index.js";
import {resetRegistry,getVertical} from "../../../packages/module-registry/src/index.js";
import {registerAtlasModules,registerAtlasVerticals} from "../../../packages/module-registry/src/catalog.js";
import {intersectEnabledModules} from "../../../packages/entitlements/src/index.js";
import type {AtlasRole,TenantPrincipal} from "../../../packages/tenancy/src/index.js";
import {roleAtLeast} from "../../../packages/tenancy/src/index.js";
import {buildToday,createPersistenceTodayProvider} from "../../../packages/today/src/index.js";
import {resolveWorkspaceContext} from "../../../packages/context/src/index.js";
import {answerAtlas} from "../../../packages/ask-atlas/src/index.js";
import {seedDefaultAgents} from "../../../packages/agents/src/index.js";
import {resolveWorkflowApproval} from "../../../packages/approvals/src/index.js";
import {WebhookIntegrationAdapter,validateWebhookConfiguration,type WebhookConfig} from "../../../packages/integrations-webhook/src/index.js";

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
function readBody(req:IncomingMessage,maxBytes=64*1024):Promise<string>{
  return new Promise((resolveBody,reject)=>{
    const chunks:string[]=[];let size=0;let failed=false;
    req.on("data",chunk=>{
      if(failed)return;
      const text=typeof chunk==="string"?chunk:Buffer.from(chunk).toString("utf8");
      size+=text.length;
      if(size>maxBytes){failed=true;reject(new Error("request-body-too-large"));return;}
      chunks.push(text);
    });
    req.on("end",()=>{if(!failed)resolveBody(chunks.join(""))});
    req.on("error",reject);
  });
}
async function form(req:IncomingMessage){return new URLSearchParams(await readBody(req));}
async function jsonBody(req:IncomingMessage){const raw=await readBody(req);try{return JSON.parse(raw) as Record<string,unknown>}catch{throw new Error("invalid-json")}}
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
      await seedDefaultAgents(db(),{tenantId:provisioned.tenantId,workspaceId:provisioned.workspaceId},verticalId,moduleIds);
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
      const today=await buildToday({tenantId:principal.tenantId,workspaceId:principal.workspaceId},[createPersistenceTodayProvider(db())]);
      html(res,renderConnectedTodayView({workspaceName:workspace.name,verticalId:workspace.verticalId,planId:workspace.planId,billingStatus:workspace.billingStatus,trialEndsAt:workspace.trialEndsAt,modules,today}));return;
    }

    if(path==="/app/agents"&&method==="GET"){
      const principal=sessionFrom(req);if(!principal){redirect(res,"/login");return;}
      const workspace=await new WorkspaceRepository(db()).findScoped(principal.tenantId,principal.workspaceId);if(!workspace){html(res,renderLogin("Workspace access is no longer available."),403);return;}
      const modules=await new ModuleConfigurationRepository(db()).enabled(principal.tenantId,principal.workspaceId);
      const agents=await seedDefaultAgents(db(),{tenantId:principal.tenantId,workspaceId:principal.workspaceId},workspace.verticalId,modules);
      html(res,renderAgentsPage({workspaceName:workspace.name,agents,canManage:roleAtLeast(principal.role,"admin")}));return;
    }

    const agentToggle=path.match(/^\/app\/agents\/([^/]+)\/toggle$/);
    if(agentToggle&&method==="POST"){
      const principal=sessionFrom(req);if(!principal){redirect(res,"/login");return;}
      if(!roleAtLeast(principal.role,"admin")){json(res,{status:"forbidden",message:"Admin role is required to manage agents."},403);return;}
      const data=await form(req);const enabled=data.get("enabled")==="true";const id=decodeURIComponent(agentToggle[1]);
      const agentRepo=new AgentRepository(db());const agent=await agentRepo.findScoped({tenantId:principal.tenantId,workspaceId:principal.workspaceId},id);
      if(!agent){json(res,{status:"not_found"},404);return;}
      await agentRepo.setEnabled({tenantId:principal.tenantId,workspaceId:principal.workspaceId},id,enabled);
      await new AuditRepository(db()).record({tenantId:principal.tenantId,workspaceId:principal.workspaceId},{actorId:principal.userId,action:enabled?"agent.enabled":"agent.disabled",targetType:"agent",targetId:id,metadata:{moduleId:agent.moduleId}});
      redirect(res,"/app/agents");return;
    }

    if(path==="/app/approvals"&&method==="GET"){
      const principal=sessionFrom(req);if(!principal){redirect(res,"/login");return;}
      const workspace=await new WorkspaceRepository(db()).findScoped(principal.tenantId,principal.workspaceId);if(!workspace){html(res,renderLogin("Workspace access is no longer available."),403);return;}
      const approvals=await new ApprovalRepository(db()).listPending({tenantId:principal.tenantId,workspaceId:principal.workspaceId});
      html(res,renderApprovalsPage({workspaceName:workspace.name,approvals:[...approvals]}));return;
    }

    const approvalDecision=path.match(/^\/app\/approvals\/([^/]+)\/(approve|reject)$/);
    if(approvalDecision&&method==="POST"){
      const principal=sessionFrom(req);if(!principal){redirect(res,"/login");return;}
      const data=await form(req);const note=(data.get("note")||"").slice(0,500);const decision=approvalDecision[2]==="approve"?"approved":"rejected";
      try{
        await resolveWorkflowApproval(db(),principal,decodeURIComponent(approvalDecision[1]),decision,note||undefined);
      }catch(error){
        const message=error instanceof Error?error.message:"approval-failed";
        const status=message==="approval-permission-denied"?403:message==="approval-not-found"?404:409;
        json(res,{status:"error",message},status);return;
      }
      redirect(res,"/app/approvals");return;
    }

    if(path==="/app/workflows"&&method==="GET"){
      const principal=sessionFrom(req);if(!principal){redirect(res,"/login");return;}
      const workspace=await new WorkspaceRepository(db()).findScoped(principal.tenantId,principal.workspaceId);if(!workspace){html(res,renderLogin("Workspace access is no longer available."),403);return;}
      const workflowRepo=new WorkflowRepository(db());const scope={tenantId:principal.tenantId,workspaceId:principal.workspaceId};
      const [definitions,runs]=await Promise.all([workflowRepo.listDefinitions(scope),workflowRepo.listRuns(scope,100)]);
      html(res,renderWorkflowsPage({workspaceName:workspace.name,definitions:[...definitions],runs}));return;
    }

    if(path==="/app/integrations"&&method==="GET"){
      const principal=sessionFrom(req);if(!principal){redirect(res,"/login");return;}
      if(!roleAtLeast(principal.role,"operator")){json(res,{status:"forbidden",message:"Operator role or higher is required to view integrations."},403);return;}
      const workspace=await new WorkspaceRepository(db()).findScoped(principal.tenantId,principal.workspaceId);
      if(!workspace){html(res,renderLogin("Workspace access is no longer available."),403);return;}
      const connections=await new IntegrationConnectionRepository(db()).list({tenantId:principal.tenantId,workspaceId:principal.workspaceId});
      html(res,renderIntegrationsPage({workspaceName:workspace.name,connections,canManage:roleAtLeast(principal.role,"admin")}));return;
    }

    if(path==="/app/integrations/webhook/save"&&method==="POST"){
      const principal=sessionFrom(req);if(!principal){redirect(res,"/login");return;}
      if(!roleAtLeast(principal.role,"admin")){json(res,{status:"forbidden",message:"Admin role is required to configure integrations."},403);return;}
      const data=await form(req);
      const baseUrl=(data.get("baseUrl")||"").trim();
      const allowedHosts=(data.get("allowedHosts")||"").split(/\r?\n|,/).map(v=>v.trim()).filter(Boolean);
      const allowedPaths=(data.get("allowedPaths")||"").split(/\r?\n|,/).map(v=>v.trim()).filter(Boolean);
      const allowedMethods=data.getAll("method").filter(value=>["POST","PUT","PATCH"].includes(value)) as Array<"POST"|"PUT"|"PATCH">;
      const healthPath=(data.get("healthPath")||"").trim();
      const secretReference=(data.get("secretReference")||"").trim();
      const authHeaderName=(data.get("authHeaderName")||"authorization").trim();
      const authPrefix=data.get("authPrefix")??"Bearer ";
      const timeoutMs=Math.max(250,Math.min(30000,Number(data.get("timeoutMs")||8000)));
      if(secretReference&&!/^env:[A-Z][A-Z0-9_]{2,127}$/.test(secretReference)){
        json(res,{status:"invalid_request",message:"Secret reference must use env:NAME syntax; raw secrets are not accepted."},400);return;
      }
      const config:WebhookConfig={baseUrl,allowedHosts,allowedPaths,allowedMethods,timeoutMs,authHeaderName,authPrefix,...(healthPath?{healthPath}:{})};
      try{validateWebhookConfiguration(config)}catch(error){
        json(res,{status:"invalid_request",message:error instanceof Error?error.message:"invalid-webhook-configuration"},400);return;
      }
      const scope={tenantId:principal.tenantId,workspaceId:principal.workspaceId};
      const repository=new IntegrationConnectionRepository(db());
      const connection=await repository.upsert(scope,{
        integrationId:"webhook",
        status:"degraded",
        externalAccountRef:new URL(baseUrl).host,
        secretReference:secretReference||null,
        config
      });
      const health=await new WebhookIntegrationAdapter().health({ ...scope,connectionId:connection.id},config);
      await repository.updateHealth(scope,connection.id,health);
      await new AuditRepository(db()).record(scope,{
        actorId:principal.userId,
        action:"integration.configured",
        targetType:"integration_connection",
        targetId:connection.id,
        metadata:{integrationId:"webhook",host:new URL(baseUrl).host,methods:allowedMethods,pathCount:allowedPaths.length,healthState:health.state}
      });
      redirect(res,"/app/integrations");return;
    }

    if(path==="/app/integrations/webhook/check"&&method==="POST"){
      const principal=sessionFrom(req);if(!principal){redirect(res,"/login");return;}
      if(!roleAtLeast(principal.role,"admin")){json(res,{status:"forbidden",message:"Admin role is required to check integration health."},403);return;}
      const scope={tenantId:principal.tenantId,workspaceId:principal.workspaceId};
      const repository=new IntegrationConnectionRepository(db());
      const connection=await repository.findByIntegration(scope,"webhook");
      if(!connection){json(res,{status:"not_found",message:"Webhook integration is not configured."},404);return;}
      const health=await new WebhookIntegrationAdapter().health({...scope,connectionId:connection.id},connection.config as unknown as WebhookConfig);
      await repository.updateHealth(scope,connection.id,health);
      await new AuditRepository(db()).record(scope,{
        actorId:principal.userId,
        action:"integration.health_checked",
        targetType:"integration_connection",
        targetId:connection.id,
        metadata:{integrationId:"webhook",state:health.state}
      });
      redirect(res,"/app/integrations");return;
    }

    if(path==="/api/atlas/ask"&&method==="POST"){
      const principal=sessionFrom(req);if(!principal){json(res,{status:"unauthorized",message:"Log in to ask this workspace."},401);return;}
      const body=await jsonBody(req);const question=typeof body.question==="string"?body.question.trim():"";
      if(!question||question.length>2000){json(res,{status:"invalid_request",message:"Question must be between 1 and 2000 characters."},400);return;}
      const context=await resolveWorkspaceContext(db(),principal);
      const answer=answerAtlas(context,question);
      await new AuditRepository(db()).record({tenantId:principal.tenantId,workspaceId:principal.workspaceId},{actorId:principal.userId,action:"atlas.ask",targetType:"workspace",targetId:principal.workspaceId,metadata:{intent:answer.intent,evidenceCount:answer.evidence.length}});
      json(res,answer);return;
    }

    res.writeHead(404,{"content-type":"text/plain"});res.end("Not found");
  }catch(error){console.error(error);json(res,{status:"error",message:"Request failed safely."},500);}
}).listen(port,()=>console.log("AtlasOS web listening on :"+String(port)));
