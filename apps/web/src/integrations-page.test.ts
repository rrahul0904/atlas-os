import test from "node:test";
import assert from "node:assert/strict";
import {renderIntegrationsPage} from "./integrations-page.js";

test("integrations page renders truthful not-configured Google state",()=>{
  const html=renderIntegrationsPage({workspaceName:"Acme",connections:[],canManage:true,googleConnectAvailable:false});
  assert.ok(html.includes("Gmail + Calendar"));
  assert.ok(html.includes("Not connected"));
  assert.ok(html.includes("Google OAuth server configuration is not available"));
  assert.equal(html.includes("Connect Google"),false);
});

test("connected Google state exposes account and controls but never secret reference",()=>{
  const html=renderIntegrationsPage({workspaceName:"Acme",canManage:true,googleConnectAvailable:true,connections:[{
    id:"g",tenantId:"t",workspaceId:"w",integrationId:"google-workspace",status:"connected",
    externalAccountRef:"owner@example.test",secretReference:"pgsecret:super-private-reference",
    config:{scopes:["https://www.googleapis.com/auth/gmail.send","https://www.googleapis.com/auth/calendar.events"]},
    lastHealthAt:"2026-09-05T00:00:00Z",lastSuccessAt:"2026-09-05T00:00:00Z",lastError:null,lastErrorAt:null,healthDetails:{}
  }]});
  assert.ok(html.includes("owner@example.test"));
  assert.ok(html.includes("Reconnect Google"));
  assert.ok(html.includes("/app/integrations/google/check"));
  assert.ok(html.includes("/app/integrations/google/disconnect"));
  assert.equal(html.includes("super-private-reference"),false);
});

test("webhook integration renders persisted health without secret values",()=>{
  const html=renderIntegrationsPage({workspaceName:"Acme",canManage:true,connections:[{
    id:"c",tenantId:"t",workspaceId:"w",integrationId:"webhook",status:"error",
    externalAccountRef:null,secretReference:"env:WEBHOOK_TOKEN",
    config:{baseUrl:"https://api.example.com",allowedHosts:["api.example.com"],allowedPaths:["/events"],allowedMethods:["POST"]},
    lastHealthAt:"2026-09-04T00:00:00Z",lastSuccessAt:null,lastError:"timeout",lastErrorAt:"2026-09-04T00:00:00Z",healthDetails:{}
  }]});
  assert.ok(html.includes("https://api.example.com"));
  assert.ok(html.includes("timeout"));
  assert.ok(html.includes("env:WEBHOOK_TOKEN"));
  assert.equal(html.includes("actual-secret-value"),false);
});
