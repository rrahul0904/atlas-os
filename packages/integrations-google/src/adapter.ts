import {createHash} from "node:crypto";
import type {AtlasSql} from "../../db/src/index.js";
import type {
  IntegrationAdapter,IntegrationCapability,IntegrationContext,IntegrationExecutionContext,
  IntegrationExecutionResult,IntegrationHealth
} from "../../integrations-sdk/src/index.js";
import type {SecretScope} from "../../secrets/src/index.js";
import {GoogleIntegrationActionRepository,requestFingerprint} from "./action-store.js";
import {googleHttpError,parseGoogleJson,type GoogleHttpResponse,type GoogleHttpTransport} from "./transport.js";
import {GOOGLE_INTEGRATION_ID,GoogleReauthenticationRequired,GoogleTokenManager} from "./tokens.js";

const GMAIL="https://gmail.googleapis.com/gmail/v1/users/me";
const CALENDAR="https://www.googleapis.com/calendar/v3";

function str(value:unknown,max=4096){return typeof value==="string"?value.slice(0,max):""}
function stringList(value:unknown,max=20){return Array.isArray(value)?value.filter((x):x is string=>typeof x==="string").slice(0,max):[]}
function boundedInt(value:unknown,fallback:number,min:number,max:number){const n=Number(value);return Number.isFinite(n)?Math.max(min,Math.min(max,Math.floor(n))):fallback}
function hash(value:string){return createHash("sha256").update(value).digest().toString("hex")}
function atlasMarker(idempotencyKey:string){return hash(idempotencyKey).slice(0,48)}
function calendarEventId(idempotencyKey:string){return hash("calendar:"+idempotencyKey).slice(0,40)}
function gmailMessageId(idempotencyKey:string){return `<atlas.${hash("gmail:"+idempotencyKey).slice(0,40)}@atlasos.invalid>`}

function retryableStatus(status:number){return status===429||status===500||status===502||status===503||status===504}
function successful(response:GoogleHttpResponse){return response.status>=200&&response.status<300}

function basicResult(context:IntegrationExecutionContext,status:number,data:Record<string,unknown>,externalId?:string):IntegrationExecutionResult{
  return{ok:true,status,data,externalId,idempotencyKey:context.idempotencyKey,completedAt:new Date().toISOString()};
}

function safeHeaders(raw:any){
  const headers=Array.isArray(raw?.payload?.headers)?raw.payload.headers:[];
  const allowed=new Set(["From","To","Cc","Subject","Date","Message-ID"]);
  return headers.filter((item:any)=>item&&allowed.has(String(item.name))).slice(0,20).map((item:any)=>({name:String(item.name),value:String(item.value??"").slice(0,2000)}));
}

function encodeEmail(input:Record<string,unknown>,messageId:string){
  const to=Array.isArray(input.to)?stringList(input.to,20).join(", "):str(input.to,2000);
  const subject=str(input.subject,998);
  const text=str(input.text,50_000);
  if(!to||!subject||!text)throw new Error("google-gmail-send-fields-required");
  const cc=Array.isArray(input.cc)?stringList(input.cc,20).join(", "):str(input.cc,2000);
  const replyTo=str(input.replyTo,320);
  const lines=[
    "To: "+to,
    ...(cc?["Cc: "+cc]:[]),
    ...(replyTo?["Reply-To: "+replyTo]:[]),
    "Subject: "+subject,
    "Message-ID: "+messageId,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    text
  ];
  return Buffer.from(lines.join("\r\n"),"utf8").toString("base64url");
}

function eventBody(input:Record<string,unknown>,marker:string,includeId?:string){
  const summary=str(input.summary,1000);
  const start=input.start;
  const end=input.end;
  if(!summary||!start||typeof start!=="object"||!end||typeof end!=="object")throw new Error("google-calendar-event-fields-required");
  const body:Record<string,unknown>={
    ...(includeId?{id:includeId}:{}),
    summary,
    start,
    end,
    extendedProperties:{private:{atlasActionId:marker}}
  };
  for(const key of["description","location","colorId","visibility"]){
    const value=input[key];if(typeof value==="string"&&value)body[key]=value.slice(0,20_000);
  }
  if(Array.isArray(input.attendees))body.attendees=input.attendees.slice(0,100);
  return body;
}

export class GoogleWorkspaceAdapter implements IntegrationAdapter<Record<string,unknown>>{
  readonly id=GOOGLE_INTEGRATION_ID;
  readonly name="Google Workspace";
  private readonly actions:GoogleIntegrationActionRepository;

  constructor(
    sql:AtlasSql,
    private readonly tokens:GoogleTokenManager,
    private readonly transport:GoogleHttpTransport
  ){this.actions=new GoogleIntegrationActionRepository(sql)}

  capabilities():IntegrationCapability[]{
    return[
      {id:"gmail.search",name:"Search Gmail",write:false,risk:"low",requiredScopes:["gmail:read"]},
      {id:"gmail.read",name:"Read Gmail metadata",write:false,risk:"low",requiredScopes:["gmail:read"]},
      {id:"gmail.send",name:"Send Gmail message",write:true,risk:"high",requiredScopes:["gmail:send"]},
      {id:"calendar.list",name:"List calendar events",write:false,risk:"low",requiredScopes:["calendar:read"]},
      {id:"calendar.create",name:"Create calendar event",write:true,risk:"high",requiredScopes:["calendar:write"]},
      {id:"calendar.update",name:"Update calendar event",write:true,risk:"high",requiredScopes:["calendar:write"]}
    ];
  }

  async health(context:IntegrationContext):Promise<IntegrationHealth>{
    const checkedAt=new Date().toISOString();
    const scope={tenantId:context.tenantId,workspaceId:context.workspaceId};
    try{
      const access=await this.tokens.getAccessToken(scope,context.connectionId);
      const [gmail,calendar]=await Promise.all([
        this.transport.request({url:`${GMAIL}/profile`,headers:{authorization:`Bearer ${access}`,accept:"application/json"}}),
        this.transport.request({url:`${CALENDAR}/calendars/primary/events?maxResults=1&singleEvents=true`,headers:{authorization:`Bearer ${access}`,accept:"application/json"}})
      ]);
      if(gmail.status===401||calendar.status===401)return{state:"needs_reauthentication",message:"Google authorization must be renewed.",checkedAt};
      if(!successful(gmail)||!successful(calendar))return{state:"degraded",message:`Google health check returned Gmail ${gmail.status}, Calendar ${calendar.status}.`,checkedAt,details:{gmailStatus:gmail.status,calendarStatus:calendar.status}};
      const profile=parseGoogleJson<any>(gmail);
      return{state:"connected",message:"Gmail and Calendar are reachable.",checkedAt,details:{accountEmail:typeof profile.emailAddress==="string"?profile.emailAddress:null,gmailStatus:gmail.status,calendarStatus:calendar.status}};
    }catch(error){
      if(error instanceof GoogleReauthenticationRequired)return{state:"needs_reauthentication",message:"Google authorization must be renewed.",checkedAt};
      return{state:"error",message:error instanceof Error?error.message:"google-health-failed",checkedAt};
    }
  }

  async execute(actionId:string,input:Record<string,unknown>,context:IntegrationExecutionContext):Promise<IntegrationExecutionResult>{
    const scope:SecretScope={tenantId:context.tenantId,workspaceId:context.workspaceId};
    const access=await this.tokens.getAccessToken(scope,context.connectionId);
    switch(actionId){
      case "gmail.search":return this.gmailSearch(access,input,context);
      case "gmail.read":return this.gmailRead(access,input,context);
      case "gmail.send":return this.gmailSend(scope,access,input,context);
      case "calendar.list":return this.calendarList(access,input,context);
      case "calendar.create":return this.calendarCreate(scope,access,input,context);
      case "calendar.update":return this.calendarUpdate(scope,access,input,context);
      default:throw new Error("google-action-unsupported");
    }
  }

  private async gmailSearch(access:string,input:Record<string,unknown>,context:IntegrationExecutionContext){
    const q=str(input.query,2000);
    const maxResults=boundedInt(input.maxResults,20,1,100);
    const url=new URL(`${GMAIL}/messages`);if(q)url.searchParams.set("q",q);url.searchParams.set("maxResults",String(maxResults));
    const response=await this.transport.request({url:url.toString(),headers:{authorization:`Bearer ${access}`,accept:"application/json"}});
    if(!successful(response))throw googleHttpError(response);
    const body=parseGoogleJson<any>(response);
    const messages=Array.isArray(body.messages)?body.messages.slice(0,maxResults).map((m:any)=>({id:String(m.id??""),threadId:String(m.threadId??"")})):[];
    return basicResult(context,response.status,{messages,resultSizeEstimate:Number(body.resultSizeEstimate??messages.length)});
  }

  private async gmailRead(access:string,input:Record<string,unknown>,context:IntegrationExecutionContext){
    const id=str(input.messageId,512);if(!id)throw new Error("google-gmail-message-id-required");
    const url=new URL(`${GMAIL}/messages/${encodeURIComponent(id)}`);
    url.searchParams.set("format","metadata");
    for(const header of["From","To","Cc","Subject","Date","Message-ID"])url.searchParams.append("metadataHeaders",header);
    const response=await this.transport.request({url:url.toString(),headers:{authorization:`Bearer ${access}`,accept:"application/json"}});
    if(!successful(response))throw googleHttpError(response);
    const body=parseGoogleJson<any>(response);
    return basicResult(context,response.status,{id:String(body.id??id),threadId:String(body.threadId??""),labelIds:stringList(body.labelIds,50),snippet:str(body.snippet,1000),headers:safeHeaders(body)},String(body.id??id));
  }

  private async findGmailByMessageId(access:string,messageId:string){
    const url=new URL(`${GMAIL}/messages`);
    url.searchParams.set("q",`rfc822msgid:${messageId}`);
    url.searchParams.set("maxResults","1");
    const response=await this.transport.request({url:url.toString(),headers:{authorization:`Bearer ${access}`,accept:"application/json"}});
    if(!successful(response))throw googleHttpError(response);
    const body=parseGoogleJson<any>(response);
    const first=Array.isArray(body.messages)?body.messages[0]:null;
    return first?.id?String(first.id):null;
  }

  private async gmailSend(scope:SecretScope,access:string,input:Record<string,unknown>,context:IntegrationExecutionContext){
    const fingerprint=requestFingerprint(input);
    const record=await this.actions.begin(scope,{connectionId:context.connectionId,integrationId:this.id,actionId:"gmail.send",idempotencyKey:context.idempotencyKey,requestFingerprint:fingerprint});
    if(record.status==="completed")return basicResult(context,200,{reconciled:true,messageId:record.providerMetadata.messageId??null},record.externalId??undefined);
    const messageId=gmailMessageId(context.idempotencyKey);
    const existing=await this.findGmailByMessageId(access,messageId);
    if(existing){
      await this.actions.complete(scope,record.id,existing,{messageId,reconciled:true});
      return basicResult(context,200,{reconciled:true,messageId},existing);
    }
    const raw=encodeEmail(input,messageId);
    try{
      const response=await this.transport.request({
        url:`${GMAIL}/messages/send`,method:"POST",
        headers:{authorization:`Bearer ${access}`,"content-type":"application/json",accept:"application/json"},
        body:JSON.stringify({raw})
      });
      if(!successful(response)){
        if(retryableStatus(response.status)){
          await this.actions.ambiguous(scope,record.id,`google-http-${response.status}`);
          throw new Error(`google-ambiguous-send-http-${response.status}`);
        }
        await this.actions.fail(scope,record.id,`google-http-${response.status}`);
        throw googleHttpError(response);
      }
      const body=parseGoogleJson<any>(response);
      const externalId=String(body.id??"");if(!externalId)throw new Error("google-gmail-send-id-missing");
      await this.actions.complete(scope,record.id,externalId,{messageId,threadId:body.threadId??null});
      return basicResult(context,response.status,{messageId,threadId:body.threadId??null},externalId);
    }catch(error){
      const message=error instanceof Error?error.message:"google-network-failure";
      if(/google-network|google-ambiguous/i.test(message))await this.actions.ambiguous(scope,record.id,message);
      throw error;
    }
  }

  private async calendarList(access:string,input:Record<string,unknown>,context:IntegrationExecutionContext){
    const calendarId=str(input.calendarId,512)||"primary";
    const url=new URL(`${CALENDAR}/calendars/${encodeURIComponent(calendarId)}/events`);
    url.searchParams.set("maxResults",String(boundedInt(input.maxResults,20,1,100)));
    url.searchParams.set("singleEvents","true");
    url.searchParams.set("orderBy","startTime");
    if(typeof input.timeMin==="string")url.searchParams.set("timeMin",input.timeMin);
    if(typeof input.timeMax==="string")url.searchParams.set("timeMax",input.timeMax);
    const response=await this.transport.request({url:url.toString(),headers:{authorization:`Bearer ${access}`,accept:"application/json"}});
    if(!successful(response))throw googleHttpError(response);
    const body=parseGoogleJson<any>(response);
    const items=Array.isArray(body.items)?body.items.slice(0,100).map((e:any)=>({id:String(e.id??""),summary:str(e.summary,1000),start:e.start??null,end:e.end??null,status:str(e.status,100)})):[];
    return basicResult(context,response.status,{items,timeZone:str(body.timeZone,200)});
  }

  private async getCalendarEvent(access:string,calendarId:string,eventId:string){
    const response=await this.transport.request({url:`${CALENDAR}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,headers:{authorization:`Bearer ${access}`,accept:"application/json"}});
    if(response.status===404)return null;
    if(!successful(response))throw googleHttpError(response);
    return parseGoogleJson<any>(response);
  }

  private async calendarCreate(scope:SecretScope,access:string,input:Record<string,unknown>,context:IntegrationExecutionContext){
    const calendarId=str(input.calendarId,512)||"primary";
    const fingerprint=requestFingerprint(input);
    const record=await this.actions.begin(scope,{connectionId:context.connectionId,integrationId:this.id,actionId:"calendar.create",idempotencyKey:context.idempotencyKey,requestFingerprint:fingerprint});
    if(record.status==="completed")return basicResult(context,200,{reconciled:true},record.externalId??undefined);
    const eventId=calendarEventId(context.idempotencyKey);
    const marker=atlasMarker(context.idempotencyKey);
    const existing=await this.getCalendarEvent(access,calendarId,eventId);
    if(existing){
      await this.actions.complete(scope,record.id,eventId,{calendarId,reconciled:true});
      return basicResult(context,200,{reconciled:true,htmlLink:existing.htmlLink??null},eventId);
    }
    const body=eventBody(input,marker,eventId);
    try{
      const response=await this.transport.request({
        url:`${CALENDAR}/calendars/${encodeURIComponent(calendarId)}/events`,method:"POST",
        headers:{authorization:`Bearer ${access}`,"content-type":"application/json",accept:"application/json"},
        body:JSON.stringify(body)
      });
      if(response.status===409){
        const reconciled=await this.getCalendarEvent(access,calendarId,eventId);
        if(reconciled){
          await this.actions.complete(scope,record.id,eventId,{calendarId,reconciled:true});
          return basicResult(context,200,{reconciled:true,htmlLink:reconciled.htmlLink??null},eventId);
        }
      }
      if(!successful(response)){
        if(retryableStatus(response.status)){await this.actions.ambiguous(scope,record.id,`google-http-${response.status}`);throw new Error(`google-ambiguous-calendar-create-http-${response.status}`)}
        await this.actions.fail(scope,record.id,`google-http-${response.status}`);throw googleHttpError(response);
      }
      const created=parseGoogleJson<any>(response);const externalId=String(created.id??eventId);
      await this.actions.complete(scope,record.id,externalId,{calendarId,htmlLink:created.htmlLink??null});
      return basicResult(context,response.status,{htmlLink:created.htmlLink??null},externalId);
    }catch(error){
      const message=error instanceof Error?error.message:"google-network-failure";
      if(/google-network|google-ambiguous/i.test(message))await this.actions.ambiguous(scope,record.id,message);
      throw error;
    }
  }

  private async calendarUpdate(scope:SecretScope,access:string,input:Record<string,unknown>,context:IntegrationExecutionContext){
    const calendarId=str(input.calendarId,512)||"primary";
    const eventId=str(input.eventId,1024);if(!eventId)throw new Error("google-calendar-event-id-required");
    const fingerprint=requestFingerprint(input);
    const record=await this.actions.begin(scope,{connectionId:context.connectionId,integrationId:this.id,actionId:"calendar.update",idempotencyKey:context.idempotencyKey,requestFingerprint:fingerprint});
    if(record.status==="completed")return basicResult(context,200,{reconciled:true},record.externalId??eventId);
    const marker=atlasMarker(context.idempotencyKey);
    const existing=await this.getCalendarEvent(access,calendarId,eventId);
    if(existing?.extendedProperties?.private?.atlasActionId===marker){
      await this.actions.complete(scope,record.id,eventId,{calendarId,reconciled:true});
      return basicResult(context,200,{reconciled:true,htmlLink:existing.htmlLink??null},eventId);
    }
    const patch=eventBody(input,marker);
    try{
      const response=await this.transport.request({
        url:`${CALENDAR}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,method:"PATCH",
        headers:{authorization:`Bearer ${access}`,"content-type":"application/json",accept:"application/json"},
        body:JSON.stringify(patch)
      });
      if(!successful(response)){
        if(retryableStatus(response.status)){await this.actions.ambiguous(scope,record.id,`google-http-${response.status}`);throw new Error(`google-ambiguous-calendar-update-http-${response.status}`)}
        await this.actions.fail(scope,record.id,`google-http-${response.status}`);throw googleHttpError(response);
      }
      const updated=parseGoogleJson<any>(response);const externalId=String(updated.id??eventId);
      await this.actions.complete(scope,record.id,externalId,{calendarId,htmlLink:updated.htmlLink??null});
      return basicResult(context,response.status,{htmlLink:updated.htmlLink??null},externalId);
    }catch(error){
      const message=error instanceof Error?error.message:"google-network-failure";
      if(/google-network|google-ambiguous/i.test(message))await this.actions.ambiguous(scope,record.id,message);
      throw error;
    }
  }
}
