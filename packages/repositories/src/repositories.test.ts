import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {db,closeDb} from "../../db/src/index.js";
import {UserRepository,MembershipRepository,ModuleConfigurationRepository,provisionWorkspace} from "./index.js";

test("real Postgres repositories provision and scope a workspace",async()=>{
  if(!process.env.DATABASE_URL)return;
  const sql=db();const email=`repo-${randomUUID()}@example.test`;
  const users=new UserRepository(sql);const memberships=new MembershipRepository(sql);const modules=new ModuleConfigurationRepository(sql);
  const user=await users.create({email,passwordHash:"test-hash"});
  const provisioned=await provisionWorkspace(sql,{userId:user.id,workspaceName:`Workspace ${randomUUID().slice(0,8)}`,verticalId:"founder",moduleIds:["today","founder","agent-governance"]});
  const membership=await memberships.firstActiveForUser(user.id);
  assert.equal(membership?.workspaceId,provisioned.workspaceId);
  assert.equal((await modules.enabled(provisioned.tenantId,provisioned.workspaceId)).join(","),"agent-governance,founder,today");
  assert.equal((await modules.enabled("wrong-tenant",provisioned.workspaceId)).length,0);
  await closeDb();
});
