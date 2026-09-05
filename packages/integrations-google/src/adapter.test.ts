import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {db,closeDb} from "../../db/src/index.js";
import {UserRepository,IntegrationConnectionRepository,provisionWorkspace} from "../../repositories/src/index.js";
import {MemorySecretStore} from "../../secrets/src/index.js";
import {GoogleWorkspaceAdapter} from "./adapter.js";
import {GoogleTokenManager} from "./tokens.js";
import type {GoogleHttpRequest,GoogleHttpResponse,GoogleHttpTransport} from "./transport.js";

class DynamicTransport implements GoogleHttpTransport{
  requests:GoogleHttpRequest[]=[];
  gmailMessageId:string|null=null;
  gmailSendEffects=0;
  calendarEvents=new Map<string,any>();
  failFirstGmailSend=false;

  async request(input:GoogleHttpRequest):Promise<GoogleHttpResponse>{
    this.requests.push(input);
    const url=new URL(input.url);

    if(url.hostname==="gmail.googleapis.com"&&url.pathname.endsWith("/messages")&&input.method!=="POST"){
      const q=url.searchParams.get("q")??"";
      if(q.startsWith("rfc822msgid:")){
        if(this.gmailMessageId&&q.includes(this.gmailMessageId)){
          return{status:200,body:JSON.stringify({messages:[{id:"gmail-1",threadId:"thread-1"}],resultSizeEstimate:1}),headers:{}};
        }
        return{status:200,body:JSON.stringify({messages:[],resultSizeEstimate:0}),headers:{}};
      }
      if(q)return{status:200,body:JSON.stringify({messages:[{id:"search-1",threadId:"thread-1"}],resultSizeEstimate:1}),headers:{}};
      return{status:200,body:JSON.stringify({messages:[],resultSizeEstimate:0}),headers:{}};
    }

    if(url.hostname==="gmail.googleapis.com"&&url.pathname.includes("/messages/")&&input.method!=="POST"){
      return{status:200,body:JSON.stringify({id:"search-1",threadId:"thread-1",labelIds:["INBOX"],snippet:"safe snippet",payload:{headers:[{name:"Subject",value:"Hello"},{name:"From",value:"sender@example.test"},{name:"X-Secret",value:"hidden"}]}}),headers:{}};
    }

    if(url.hostname==="gmail.googleapis.com"&&url.pathname.endsWith("/messages/send")&&input.method==="POST"){
      this.gmailSendEffects+=1;
      const parsed=JSON.parse(input.body??"{}") as any;
      const email=Buffer.from(String(parsed.raw??""),"base64url").toString("utf8");
      const line=email.split("\r\n").find((value:string)=>value.startsWith("Message-ID: "));
      this.gmailMessageId=line?.slice("Message-ID: ".length)??null;
      if(this.failFirstGmailSend&&this.gmailSendEffects===1)throw new Error("google-network-failure");
      return{status:200,body:JSON.stringify({id:"gmail-1",threadId:"thread-1"}),headers:{}};
    }

    if(url.hostname==="www.googleapis.com"&&url.pathname.includes("/calendar/v3/calendars/")){
      const parts=url.pathname.split("/");
      const eventsIndex=parts.indexOf("events");
      const eventId=eventsIndex>=0&&parts[eventsIndex+1]?decodeURIComponent(parts[eventsIndex+1]):null;
      if(input.method==="POST"&&url.pathname.endsWith("/events")){
        const body=JSON.parse(input.body??"{}");
        this.calendarEvents.set(String(body.id),body);
        return{status:200,body:JSON.stringify({...body,htmlLink:"https://calendar.example/event"}),headers:{}};
      }
      if(input.method==="PATCH"&&eventId){
        const current=this.calendarEvents.get(eventId)??{id:eventId};
        const body=JSON.parse(input.body??"{}");
        const next={...current,...body,id:eventId,htmlLink:"https://calendar.example/event"};
        this.calendarEvents.set(eventId,next);
        return{status:200,body:JSON.stringify(next),headers:{}};
      }
      if(eventId){
        const event=this.calendarEvents.get(eventId);
        return event?{status:200,body:JSON.stringify(event),headers:{}}:{status:404,body:JSON.stringify({error:{code:404}}),headers:{}};
      }
      return{status:200,body:JSON.stringify({items:[...this.calendarEvents.values()],timeZone:"America/New_York"}),headers:{}};
    }

    throw new Error("unexpected-google-request:"+input.url);
  }
}

async function setup(){
  const sql=db();
  const user=await new UserRepository(sql).create({email:`google-adapter-${randomUUID()}@example.test`,passwordHash:"test"});
  const workspace=await provisionWorkspace(sql,{userId:user.id,workspaceName:`Google Adapter ${randomUUID().slice(0,8)}`,verticalId:"founder",moduleIds:["today"]});
  const scope={tenantId:workspace.tenantId,workspaceId:workspace.workspaceId};
  const secrets=new MemorySecretStore();
  const reference=await secrets.put(scope,JSON.stringify({accessToken:"access-token",refreshToken:"refresh-token",expiresAt:Date.now()+3600_000,tokenType:"Bearer",scopes:[]}));
  const connection=await new IntegrationConnectionRepository(sql).upsert(scope,{integrationId:"google-workspace",status:"connected",externalAccountRef:"owner@example.test",secretReference:reference,config:{}});
  const transport=new DynamicTransport();
  const tokens=new GoogleTokenManager(sql,secrets,transport,{clientId:"client",clientSecret:"secret",redirectUri:"https://atlas.example.test/callback"});
  const adapter=new GoogleWorkspaceAdapter(sql,tokens,transport);
  return{sql,user,scope,connection,transport,adapter};
}

test("Google adapter parses Gmail search/read and Calendar list without leaking extra headers",async()=>{
  if(!process.env.DATABASE_URL)return;
  const ctx=await setup();
  try{
    const base={tenantId:ctx.scope.tenantId,workspaceId:ctx.scope.workspaceId,connectionId:ctx.connection.id,initiatedBy:ctx.user.id,actionId:"gmail.search",idempotencyKey:"read-1"};
    const search=await ctx.adapter.execute("gmail.search",{query:"from:sender@example.test"},base);
    assert.equal((search.data.messages as any[])[0].id,"search-1");

    const read=await ctx.adapter.execute("gmail.read",{messageId:"search-1"},{...base,actionId:"gmail.read",idempotencyKey:"read-2"});
    const headers=read.data.headers as any[];
    assert.equal(headers.some(item=>item.name==="Subject"),true);
    assert.equal(headers.some(item=>item.name==="X-Secret"),false);

    const list=await ctx.adapter.execute("calendar.list",{calendarId:"primary"},{...base,actionId:"calendar.list",idempotencyKey:"read-3"});
    assert.ok(Array.isArray(list.data.items));
  }finally{await closeDb()}
});

test("Gmail send reconciles ambiguous provider acceptance using stable Message-ID",async()=>{
  if(!process.env.DATABASE_URL)return;
  const ctx=await setup();
  try{
    ctx.transport.failFirstGmailSend=true;
    const execution={tenantId:ctx.scope.tenantId,workspaceId:ctx.scope.workspaceId,connectionId:ctx.connection.id,initiatedBy:ctx.user.id,actionId:"gmail.send",idempotencyKey:"gmail-send-ambiguous"};
    let failed=false;
    try{await ctx.adapter.execute("gmail.send",{to:"person@example.test",subject:"Hello",text:"Body"},execution)}catch(error){failed=error instanceof Error&&error.message==="google-network-failure"}
    assert.equal(failed,true);
    assert.equal(ctx.transport.gmailSendEffects,1);
    assert.ok(Boolean(ctx.transport.gmailMessageId));

    const reconciled=await ctx.adapter.execute("gmail.send",{to:"person@example.test",subject:"Hello",text:"Body"},execution);
    assert.equal(reconciled.externalId,"gmail-1");
    assert.equal(reconciled.data.reconciled,true);
    assert.equal(ctx.transport.gmailSendEffects,1,"ambiguous retry must not send a second message");
  }finally{await closeDb()}
});

test("Calendar create and update are replay-safe through deterministic provider markers",async()=>{
  if(!process.env.DATABASE_URL)return;
  const ctx=await setup();
  try{
    const base={tenantId:ctx.scope.tenantId,workspaceId:ctx.scope.workspaceId,connectionId:ctx.connection.id,initiatedBy:ctx.user.id,actionId:"calendar.create",idempotencyKey:"calendar-create-1"};
    const input={calendarId:"primary",summary:"Consult",start:{dateTime:"2026-09-05T10:00:00-04:00"},end:{dateTime:"2026-09-05T11:00:00-04:00"}};
    const created=await ctx.adapter.execute("calendar.create",input,base);
    assert.ok(Boolean(created.externalId));
    assert.equal(ctx.transport.calendarEvents.size,1);
    await ctx.adapter.execute("calendar.create",input,base);
    assert.equal(ctx.transport.calendarEvents.size,1,"replay cannot create second calendar event");

    const eventId=created.externalId!;
    const updateInput={calendarId:"primary",eventId,summary:"Consult updated",start:{dateTime:"2026-09-05T10:00:00-04:00"},end:{dateTime:"2026-09-05T11:00:00-04:00"}};
    const updateContext={...base,actionId:"calendar.update",idempotencyKey:"calendar-update-1"};
    await ctx.adapter.execute("calendar.update",updateInput,updateContext);
    const requestCount=ctx.transport.requests.length;
    await ctx.adapter.execute("calendar.update",updateInput,updateContext);
    assert.equal(ctx.transport.requests.length,requestCount,"completed update replay cannot call provider again");
    assert.equal(ctx.transport.calendarEvents.get(eventId)?.summary,"Consult updated");
  }finally{await closeDb()}
});
