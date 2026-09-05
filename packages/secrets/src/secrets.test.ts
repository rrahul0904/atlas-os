import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {db,closeDb} from "../../db/src/index.js";
import {UserRepository,provisionWorkspace} from "../../repositories/src/index.js";
import {EncryptedPostgresSecretStore,type SecretKeyring} from "./index.js";

function key(byte:string){return Buffer.from(byte.repeat(32),"hex")}
function keyring(activeVersion:number,...pairs:Array<[number,Uint8Array]>):SecretKeyring{
  return{activeVersion,keys:new Map(pairs)};
}

test("encrypted secret store isolates tenant/workspace and supports rotation",async()=>{
  if(!process.env.DATABASE_URL)return;
  const sql=db();
  try{
    const user=await new UserRepository(sql).create({email:`secret-${randomUUID()}@example.test`,passwordHash:"test"});
    const first=await provisionWorkspace(sql,{userId:user.id,workspaceName:`Secret A ${randomUUID().slice(0,8)}`,verticalId:"founder",moduleIds:["today"]});
    const second=await provisionWorkspace(sql,{userId:user.id,workspaceName:`Secret B ${randomUUID().slice(0,8)}`,verticalId:"founder",moduleIds:["today"]});
    const scope={tenantId:first.tenantId,workspaceId:first.workspaceId};

    const storeV1=new EncryptedPostgresSecretStore(sql,keyring(1,[1,key("11")]));
    const plaintext=JSON.stringify({accessToken:"access-token-value",refreshToken:"refresh-token-value"});
    const reference=await storeV1.put(scope,plaintext);
    assert.ok(reference.startsWith("pgsecret:"));
    assert.equal(await storeV1.get(scope,reference),plaintext);
    assert.equal(await storeV1.get({tenantId:"wrong-tenant",workspaceId:scope.workspaceId},reference),null);
    assert.equal(await storeV1.get({tenantId:second.tenantId,workspaceId:second.workspaceId},reference),null);

    const id=reference.slice("pgsecret:".length);
    const rows=await sql`SELECT algorithm,key_version,ciphertext,iv,auth_tag FROM atlas_secret_values WHERE id=${id}`;
    assert.equal(rows[0]?.algorithm,"aes-256-gcm");
    assert.equal(Number(rows[0]?.key_version),1);
    const stored=JSON.stringify(rows[0]??{});
    assert.equal(stored.includes("access-token-value"),false);
    assert.equal(stored.includes("refresh-token-value"),false);

    const storeV2=new EncryptedPostgresSecretStore(sql,keyring(2,[1,key("11")],[2,key("22")]));
    assert.equal(await storeV2.rotate(scope,reference),true);
    assert.equal(await storeV2.get(scope,reference),plaintext);
    const rotated=await sql`SELECT key_version,ciphertext FROM atlas_secret_values WHERE id=${id}`;
    assert.equal(Number(rotated[0]?.key_version),2);
    assert.equal(String(rotated[0]?.ciphertext)===String(rows[0]?.ciphertext),false);

    const updated=JSON.stringify({accessToken:"new-access",refreshToken:"refresh-token-value"});
    await storeV2.put(scope,updated,reference);
    assert.equal(await storeV2.get(scope,reference),updated);

    let unavailable=false;
    try{await storeV1.get(scope,reference)}catch(error){unavailable=error instanceof Error&&error.message==="secret-key-version-unavailable"}
    assert.equal(unavailable,true);

    await storeV2.delete(scope,reference);
    assert.equal(await storeV2.get(scope,reference),null);
  }finally{
    await closeDb();
  }
});
