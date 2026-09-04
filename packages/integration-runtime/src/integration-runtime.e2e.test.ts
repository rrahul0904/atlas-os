import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {db,closeDb} from "../../db/src/index.js";
import {
  UserRepository,
  WorkspaceRepository,
  AgentRepository,
  WorkflowRepository,
  ApprovalRepository,
  AuditRepository,
  IntegrationConnectionRepository,
  provisionWorkspace
} from "../../repositories/src/index.js";
import {DurableWorkflowRuntime,ToolExecutorRegistry,WorkflowRuntimeError} from "../../workflow-runtime/src/index.js";
import {resolveWorkflowApproval} from "../../approvals/src/index.js";
import {IntegrationAdapterRegistry} from "../../integrations-sdk/src/index.js";
import {WebhookIntegrationAdapter,type SecretResolver,type WebhookTransport,type WebhookTransportRequest} from "../../integrations-webhook/src/index.js";
import {IntegrationToolExecutor} from "./index.js";
import type {WorkflowDefinition} from "../../workflows/src/index.js";

class TestSecrets implements SecretResolver{
  async resolve(reference:string){return reference==="env:TEST_WEBHOOK_SECRET"?"super-secret-value":null;}
}

class DeterministicTransport implements WebhookTransport{
  requests:WebhookTransportRequest[]=[];
  effects=0;
  private readonly byKey=new Map<string,{status:number;body:string;contentType:string|null}>();
  constructor(private readonly status=200,private readonly includeSensitive=false){}
  async send(request:WebhookTransportRequest){
    this.requests.push(request);
    const key=request.headers["idempotency-key"]??"health:"+request.url;
    const existing=this.byKey.get(key);
    if(existing)return existing;
    this.effects+=1;
    const body=this.includeSensitive
      ?JSON.stringify({id:"external-1",accepted:true,access_token:"provider-secret",nested:{password:"hidden"}})
      :JSON.stringify({id:"external-1",accepted:true});
    const response={status:this.status,body,contentType:"application/json"};
    this.byKey.set(key,response);
    return response;
  }
}

async function expectRuntimeError(fn:()=>Promise<unknown>,kind:"retryable"|"non_retryable",message:string){
  try{
    await fn();
    assert.ok(false,"expected workflow runtime error");
  }catch(error){
    assert.ok(error instanceof WorkflowRuntimeError);
    if(error instanceof WorkflowRuntimeError){
      assert.equal(error.kind,kind);
      assert.equal(error.message,message);
    }
  }
}

function webhookTool(){
  return{
    id:"webhook.customer-followup",
    name:"webhook.customer-followup",
    connector:"webhook",
    action:"webhook.post",
    description:"Send an approved customer follow-up through the configured webhook.",
    isWrite:true,
    reversible:false,
    risk:"medium" as const,
    scopes:["integrations:write"],
    dataClasses:["internal" as const],
    costUnits:1,
    enabled:true,
    actionClass:"LOW_RISK_WRITE" as const
  };
}

test("governed webhook execution completes once with scoped connection health and safe audit",async()=>{
  if(!process.env.DATABASE_URL)return;
  const sql=db();
  try{
    const users=new UserRepository(sql);
    const workspaces=new WorkspaceRepository(sql);
    const agents=new AgentRepository(sql);
    const workflows=new WorkflowRepository(sql);
    const approvals=new ApprovalRepository(sql);
    const audit=new AuditRepository(sql);
    const connections=new IntegrationConnectionRepository(sql);

    const user=await users.create({email:`integration-${randomUUID()}@example.test`,passwordHash:"test-hash"});
    const provisioned=await provisionWorkspace(sql,{
      userId:user.id,
      workspaceName:`Webhook ${randomUUID().slice(0,8)}`,
      verticalId:"founder",
      moduleIds:["today","founder","agent-governance"],
      planId:"business"
    });
    const scope={tenantId:provisioned.tenantId,workspaceId:provisioned.workspaceId};
    await workspaces.setApprovalMode(scope.tenantId,scope.workspaceId,"BALANCED");

    const agent=await agents.create(scope,{
      name:`Webhook Agent ${randomUUID().slice(0,6)}`,
      moduleId:"founder",
      description:"Webhook certification agent",
      tools:["webhook.customer-followup"],
      scopes:["integrations:write"],
      riskPolicy:{},
      costBudgetDaily:5,
      enabled:true
    });

    const connection=await connections.upsert(scope,{
      integrationId:"webhook",
      status:"degraded",
      externalAccountRef:"api.example.com",
      secretReference:"env:TEST_WEBHOOK_SECRET",
      config:{
        baseUrl:"https://api.example.com",
        allowedHosts:["api.example.com"],
        allowedPaths:["/events"],
        allowedMethods:["POST"],
        timeoutMs:1000,
        authHeaderName:"authorization",
        authPrefix:"Bearer "
      }
    });
    assert.equal(connection.config.secretReference,undefined,"secret reference must stay outside config JSON");
    const hydratedConnection=await connections.findByIntegration(scope,"webhook");
    assert.ok(Array.isArray(hydratedConnection?.config.allowedMethods),"webhook config must hydrate from JSONB as an object");
    assert.equal((hydratedConnection?.config.allowedMethods as unknown[])[0],"POST");

    const transport=new DeterministicTransport(200,true);
    const adapter=new WebhookIntegrationAdapter(new TestSecrets(),transport,async()=>["93.184.216.34"]);
    const adapterRegistry=new IntegrationAdapterRegistry().register(adapter);
    const integrationExecutor=new IntegrationToolExecutor(sql,adapterRegistry,"webhook");
    const runtime=new DurableWorkflowRuntime(sql,{
      executors:new ToolExecutorRegistry().register(integrationExecutor),
      retryDelaysMs:[0,0,0]
    });

    const definition:WorkflowDefinition={
      id:`wf-webhook-${randomUUID()}`,
      name:"Governed webhook certification",
      trigger:"manual",
      enabled:true,
      steps:[
        {id:"read",kind:"read",name:"Load evidence",config:{output:{ready:true}}},
        {
          id:"external",
          kind:"action",
          name:"Send approved webhook",
          config:{
            agentId:agent.id,
            businessReason:"Evidence-backed customer follow-up.",
            target:"customer:test",
            tool:webhookTool(),
            input:{path:"/events",body:{customerRef:"safe-ref",action:"follow-up"}}
          }
        },
        {id:"measure",kind:"measure",name:"Measure outcome",config:{output:{measured:true}}}
      ]
    };
    await workflows.createDefinition(scope,definition);
    const runId=await workflows.enqueue(scope,definition.id,{source:"integration-certification"},user.id);

    const paused=await runtime.processNext();
    assert.equal(paused?.id,runId);
    assert.equal(paused?.status,"waiting_approval");
    assert.equal(transport.effects,0,"provider cannot execute before approval");

    const approval=(await approvals.listPending(scope)).find((row:any)=>row.workflow_run_id===runId);
    assert.ok(Boolean(approval));
    if(!approval)throw new Error("approval-not-created");

    await resolveWorkflowApproval(
      sql,
      {userId:user.id,tenantId:scope.tenantId,workspaceId:scope.workspaceId,role:"owner",scopes:["*"]},
      approval.id,
      "approved"
    );

    const completed=await runtime.processNext();
    assert.equal(completed?.id,runId);
    assert.equal(completed?.status,"completed",completed?.lastError??"governed webhook workflow should complete");
    assert.equal(transport.effects,1,"external provider effect occurs once");
    assert.equal(transport.requests.length,1);
    assert.equal(transport.requests[0].headers["idempotency-key"],`${scope.workspaceId}:${runId}:external:webhook.customer-followup`);
    assert.equal(transport.requests[0].headers.authorization,"Bearer super-secret-value");

    await runtime.processRun((await workflows.getRun(scope,runId))!);
    assert.equal(transport.effects,1,"completed workflow replay cannot repeat external effect");
    assert.equal(transport.requests.length,1);

    const refreshed=await connections.findByIntegration(scope,"webhook");
    assert.equal(refreshed?.status,"connected");
    assert.ok(Boolean(refreshed?.lastSuccessAt));
    assert.equal(refreshed?.lastError,null);

    const steps=await workflows.listSteps(scope,runId);
    const externalStep=steps.find((row:any)=>row.step_id==="external");
    assert.ok(Boolean(externalStep));
    const persistedOutput=JSON.stringify(externalStep?.output??{});
    assert.equal(persistedOutput.includes("provider-secret"),false);
    assert.equal(persistedOutput.includes("hidden"),false);
    assert.equal(persistedOutput.includes("super-secret-value"),false);

    const trail=await audit.listRecent(scope,200);
    const auditJson=JSON.stringify(trail);
    assert.ok(trail.some((row:any)=>row.action==="integration.execution_started"));
    assert.ok(trail.some((row:any)=>row.action==="integration.execution_succeeded"));
    assert.ok(trail.some((row:any)=>row.action==="tool.executed"));
    assert.equal(auditJson.includes("super-secret-value"),false);
    assert.equal(auditJson.includes("provider-secret"),false);

    assert.equal(await connections.findByIntegration({tenantId:"wrong-tenant",workspaceId:scope.workspaceId},"webhook"),null);
    assert.equal(await connections.findByIntegration({tenantId:scope.tenantId,workspaceId:"wrong-workspace"},"webhook"),null);

    const second=await provisionWorkspace(sql,{
      userId:user.id,
      workspaceName:`No Connection ${randomUUID().slice(0,8)}`,
      verticalId:"founder",
      moduleIds:["today"],
      planId:"business"
    });
    await expectRuntimeError(
      ()=>integrationExecutor.execute(webhookTool(),{path:"/events",body:{}},{
        tenantId:second.tenantId,workspaceId:second.workspaceId,runId:"missing",stepId:"external",agentId:agent.id,initiatedBy:user.id,idempotencyKey:"missing-key"
      }),
      "non_retryable",
      "integration-not-configured"
    );

    const unregistered=new IntegrationToolExecutor(sql,new IntegrationAdapterRegistry(),"webhook");
    await expectRuntimeError(
      ()=>unregistered.execute(webhookTool(),{path:"/events",body:{}},{
        ...scope,runId:"unregistered",stepId:"external",agentId:agent.id,initiatedBy:user.id,idempotencyKey:"unregistered-key"
      }),
      "non_retryable",
      "integration-adapter-not-registered"
    );

    const retryTransport=new DeterministicTransport(503);
    const retryExecutor=new IntegrationToolExecutor(
      sql,
      new IntegrationAdapterRegistry().register(new WebhookIntegrationAdapter(new TestSecrets(),retryTransport,async()=>["93.184.216.34"])),
      "webhook"
    );
    await expectRuntimeError(
      ()=>retryExecutor.execute(webhookTool(),{path:"/events",body:{}},{
        ...scope,runId:"retry",stepId:"external",agentId:agent.id,initiatedBy:user.id,idempotencyKey:"retry-key"
      }),
      "retryable",
      "webhook-http-503"
    );
    const retryHealth=await connections.findByIntegration(scope,"webhook");
    assert.equal(retryHealth?.status,"error");
    assert.equal(retryHealth?.healthDetails.category,"retryable");

    const recoveryTransport=new DeterministicTransport(200);
    const recoveryExecutor=new IntegrationToolExecutor(
      sql,
      new IntegrationAdapterRegistry().register(new WebhookIntegrationAdapter(new TestSecrets(),recoveryTransport,async()=>["93.184.216.34"])),
      "webhook"
    );
    await recoveryExecutor.execute(webhookTool(),{path:"/events",body:{}},{
      ...scope,runId:"recover",stepId:"external",agentId:agent.id,initiatedBy:user.id,idempotencyKey:"recover-key"
    });
    assert.equal((await connections.findByIntegration(scope,"webhook"))?.status,"connected");

    const badTransport=new DeterministicTransport(400);
    const badExecutor=new IntegrationToolExecutor(
      sql,
      new IntegrationAdapterRegistry().register(new WebhookIntegrationAdapter(new TestSecrets(),badTransport,async()=>["93.184.216.34"])),
      "webhook"
    );
    await expectRuntimeError(
      ()=>badExecutor.execute(webhookTool(),{path:"/events",body:{}},{
        ...scope,runId:"bad",stepId:"external",agentId:agent.id,initiatedBy:user.id,idempotencyKey:"bad-key"
      }),
      "non_retryable",
      "webhook-http-400"
    );
    const badHealth=await connections.findByIntegration(scope,"webhook");
    assert.equal(badHealth?.healthDetails.category,"non_retryable");

    await expectRuntimeError(
      ()=>recoveryExecutor.execute(webhookTool(),{path:"/events",body:{}},{
        ...scope,runId:"blocked",stepId:"external",agentId:agent.id,initiatedBy:user.id,idempotencyKey:"blocked-key"
      }),
      "non_retryable",
      "integration-unhealthy"
    );
  }finally{
    await closeDb();
  }
});
