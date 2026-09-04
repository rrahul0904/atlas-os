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
  provisionWorkspace
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

  await closeDb();
});
