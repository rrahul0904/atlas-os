import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {db,closeDb} from "../../db/src/index.js";
import {
  UserRepository,
  MembershipRepository,
  ModuleConfigurationRepository,
  EvidenceRepository,
  ActionItemRepository,
  provisionWorkspace,
  provisionOwnerWorkspace
} from "./index.js";

test("real Postgres repositories provision, scope, and ground actions in evidence",async()=>{
  if(!process.env.DATABASE_URL)return;
  const sql=db();const email=`repo-${randomUUID()}@example.test`;
  const users=new UserRepository(sql);const memberships=new MembershipRepository(sql);const modules=new ModuleConfigurationRepository(sql);
  const user=await users.create({email,passwordHash:"test-hash"});
  const provisioned=await provisionWorkspace(sql,{userId:user.id,workspaceName:`Workspace ${randomUUID().slice(0,8)}`,verticalId:"founder",moduleIds:["today","founder","agent-governance"]});
  const scope={tenantId:provisioned.tenantId,workspaceId:provisioned.workspaceId};
  const membership=await memberships.firstActiveForUser(user.id);
  assert.equal(membership?.workspaceId,provisioned.workspaceId);
  assert.equal((await modules.enabled(scope.tenantId,scope.workspaceId)).join(","),"agent-governance,founder,today");
  assert.equal((await modules.enabled("wrong-tenant",scope.workspaceId)).length,0);

  const evidenceRepo=new EvidenceRepository(sql);
  const evidence=await evidenceRepo.record(scope,{sourceType:"metric",sourceId:"checkout_conversion",claim:"Checkout conversion dropped from 4.1% to 3.2%",confidence:.99,metadata:{baseline:4.1,current:3.2}});
  const actions=new ActionItemRepository(sql);
  const action=await actions.create(scope,{sourceModule:"revenue-intelligence",title:"Checkout conversion dropped",description:"Conversion is below the observed baseline.",severity:"critical",businessImpact:"Revenue may be at risk if the change persists.",evidenceIds:[evidence.id],recommendedAction:"Inspect checkout deployment",risk:"lost revenue",approvalPolicy:"human"});
  assert.equal((await actions.listOpen(scope))[0].id,action.id);
  assert.equal((await actions.listOpen({tenantId:"wrong-tenant",workspaceId:scope.workspaceId})).length,0);
  assert.equal((await evidenceRepo.findByIds(scope,[evidence.id]))[0].claim,evidence.claim);

  const ownerEmail=`owner-${randomUUID()}@example.test`;
  const ownerWorkspaceName=`Owner Workspace ${randomUUID().slice(0,8)}`;
  const owner=await provisionOwnerWorkspace(sql,{
    email:ownerEmail,displayName:"Owner",passwordHash:"test-hash",workspaceName:ownerWorkspaceName,
    verticalId:"bakery",moduleIds:["today","business-ops","agent-governance"]
  });
  const ownerMembership=await memberships.firstActiveForUser(owner.userId);
  assert.equal(ownerMembership?.role,"owner");
  assert.equal(ownerMembership?.workspaceId,owner.workspaceId);
  assert.deepEqual(await modules.enabled(owner.tenantId,owner.workspaceId),["agent-governance","business-ops","today"]);
  const billing=await sql`SELECT status,plan_id,trial_ends_at FROM atlas_billing_accounts WHERE tenant_id=${owner.tenantId} AND workspace_id=${owner.workspaceId}`;
  assert.equal(billing[0]?.status,"trialing");
  assert.equal(billing[0]?.plan_id,"business");
  assert.ok(billing[0]?.trial_ends_at);

  const duplicateWorkspaceName=`Should Roll Back ${randomUUID().slice(0,8)}`;
  await assert.rejects(()=>provisionOwnerWorkspace(sql,{
    email:ownerEmail,displayName:"Duplicate",passwordHash:"test-hash",workspaceName:duplicateWorkspaceName,
    verticalId:"founder",moduleIds:["today"]
  }));
  const orphanTenants=await sql`SELECT COUNT(*)::int AS count FROM atlas_tenants WHERE name=${duplicateWorkspaceName}`;
  assert.equal(Number(orphanTenants[0]?.count),0);

  await closeDb();
});
