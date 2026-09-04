import test from "node:test";
import assert from "node:assert/strict";
import {renderIntegrationsPage} from "./integrations-page.js";

test("integrations page renders truthful not-configured Google state",()=>{
  const html=renderIntegrationsPage({workspaceName:"Acme",connections:[],canManage:true});
  assert.ok(html.includes("Google Workspace"));
  assert.ok(html.includes("Not connected"));
  assert.ok(html.includes("OAuth is intentionally not activated"));
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
