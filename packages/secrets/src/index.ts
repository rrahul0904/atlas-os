import {randomUUID,randomBytes,createCipheriv,createDecipheriv} from "node:crypto";
import type {AtlasSql} from "../../db/src/index.js";

export interface SecretScope{tenantId:string;workspaceId:string}
export interface SecretStore{
  put(scope:SecretScope,value:string,existingReference?:string|null):Promise<string>;
  get(scope:SecretScope,reference:string):Promise<string|null>;
  delete(scope:SecretScope,reference:string):Promise<void>;
}
export interface SecretKeyring{activeVersion:number;keys:Map<number,Uint8Array>}

function decodeKey(raw:string|undefined){
  if(!raw)throw new Error("secret-encryption-key-not-configured");
  const key=raw.startsWith("hex:")?Buffer.from(raw.slice(4),"hex"):Buffer.from(raw,"base64");
  if(key.length!==32)throw new Error("secret-encryption-key-must-be-32-bytes");
  return key;
}

export function keyringFromEnvironment(env=process.env):SecretKeyring{
  const activeVersion=Math.max(1,Math.floor(Number(env.ATLAS_SECRET_KEY_VERSION??"1")));
  const keys=new Map<number,Uint8Array>();
  if(env.ATLAS_SECRET_ENCRYPTION_KEYS){
    let parsed:unknown;
    try{parsed=JSON.parse(env.ATLAS_SECRET_ENCRYPTION_KEYS)}catch{throw new Error("secret-encryption-keys-invalid-json")}
    if(!parsed||typeof parsed!=="object"||Array.isArray(parsed))throw new Error("secret-encryption-keys-invalid");
    for(const [version,raw] of Object.entries(parsed as Record<string,unknown>)){
      const numeric=Math.floor(Number(version));
      if(!Number.isInteger(numeric)||numeric<1||typeof raw!=="string")throw new Error("secret-encryption-keys-invalid");
      keys.set(numeric,decodeKey(raw));
    }
  }else{
    keys.set(activeVersion,decodeKey(env.ATLAS_SECRET_ENCRYPTION_KEY));
  }
  if(!keys.has(activeVersion))throw new Error("secret-active-key-version-missing");
  return{activeVersion,keys};
}

function idFromReference(reference:string){
  if(!reference.startsWith("pgsecret:"))throw new Error("invalid-secret-reference");
  const id=reference.slice("pgsecret:".length);
  if(!/^[0-9a-f-]{36}$/i.test(id))throw new Error("invalid-secret-reference");
  return id;
}

function aad(scope:SecretScope,id:string){
  return Buffer.from(`${scope.tenantId}|${scope.workspaceId}|${id}`,"utf8");
}

function concatBytes(parts:Uint8Array[]){
  const total=parts.reduce((sum,part)=>sum+part.byteLength,0);
  const merged=new Uint8Array(total);let offset=0;
  for(const part of parts){merged.set(part,offset);offset+=part.byteLength}
  return merged;
}

function encoded(bytes:Uint8Array){return Buffer.from(bytes).toString("base64url")}

function encrypt(scope:SecretScope,id:string,value:string,key:Uint8Array){
  const iv=randomBytes(12);
  const cipher=createCipheriv("aes-256-gcm",key,iv);
  cipher.setAAD(aad(scope,id));
  const ciphertext=concatBytes([cipher.update(Buffer.from(value,"utf8")),cipher.final()]);
  const authTag=cipher.getAuthTag();
  return{
    ciphertext:encoded(ciphertext),
    iv:encoded(iv),
    authTag:encoded(authTag)
  };
}

function decrypt(scope:SecretScope,id:string,row:{ciphertext:string;iv:string;auth_tag:string},key:Uint8Array){
  const decipher=createDecipheriv("aes-256-gcm",key,Buffer.from(row.iv,"base64url"));
  decipher.setAAD(aad(scope,id));
  decipher.setAuthTag(Buffer.from(row.auth_tag,"base64url"));
  return Buffer.from(concatBytes([
    decipher.update(Buffer.from(row.ciphertext,"base64url")),
    decipher.final()
  ])).toString("utf8");
}

export class EncryptedPostgresSecretStore implements SecretStore{
  constructor(
    private readonly sql:AtlasSql,
    private readonly keyring:SecretKeyring=keyringFromEnvironment()
  ){}

  async put(scope:SecretScope,value:string,existingReference?:string|null){
    if(!value)throw new Error("secret-value-required");
    const id=existingReference?idFromReference(existingReference):randomUUID();
    const key=this.keyring.keys.get(this.keyring.activeVersion);
    if(!key)throw new Error("secret-active-key-version-missing");
    const encrypted=encrypt(scope,id,value,key);
    const rows=await this.sql`INSERT INTO atlas_secret_values(id,tenant_id,workspace_id,algorithm,key_version,ciphertext,iv,auth_tag)
      VALUES(${id},${scope.tenantId},${scope.workspaceId},'aes-256-gcm',${this.keyring.activeVersion},${encrypted.ciphertext},${encrypted.iv},${encrypted.authTag})
      ON CONFLICT(id) DO UPDATE SET
        algorithm=excluded.algorithm,
        key_version=excluded.key_version,
        ciphertext=excluded.ciphertext,
        iv=excluded.iv,
        auth_tag=excluded.auth_tag,
        updated_at=now()
      WHERE atlas_secret_values.tenant_id=excluded.tenant_id AND atlas_secret_values.workspace_id=excluded.workspace_id
      RETURNING id`;
    if(!rows[0])throw new Error("secret-scope-conflict");
    return `pgsecret:${rows[0].id}`;
  }

  async get(scope:SecretScope,reference:string){
    const id=idFromReference(reference);
    const rows=await this.sql`SELECT algorithm,key_version,ciphertext,iv,auth_tag FROM atlas_secret_values
      WHERE id=${id} AND tenant_id=${scope.tenantId} AND workspace_id=${scope.workspaceId} LIMIT 1`;
    const row=rows[0];if(!row)return null;
    if(row.algorithm!=="aes-256-gcm")throw new Error("secret-algorithm-unsupported");
    const key=this.keyring.keys.get(Number(row.key_version));
    if(!key)throw new Error("secret-key-version-unavailable");
    return decrypt(scope,id,{ciphertext:row.ciphertext,iv:row.iv,auth_tag:row.auth_tag},key);
  }

  async rotate(scope:SecretScope,reference:string){
    const value=await this.get(scope,reference);
    if(value===null)return false;
    await this.put(scope,value,reference);
    return true;
  }

  async delete(scope:SecretScope,reference:string){
    const id=idFromReference(reference);
    await this.sql`DELETE FROM atlas_secret_values WHERE id=${id} AND tenant_id=${scope.tenantId} AND workspace_id=${scope.workspaceId}`;
  }
}

export class MemorySecretStore implements SecretStore{
  private readonly values=new Map<string,{scope:SecretScope;value:string}>();
  async put(scope:SecretScope,value:string,existingReference?:string|null){
    const reference=existingReference??`memory:${randomUUID()}`;
    this.values.set(reference,{scope:{...scope},value});
    return reference;
  }
  async get(scope:SecretScope,reference:string){
    const entry=this.values.get(reference);
    if(!entry||entry.scope.tenantId!==scope.tenantId||entry.scope.workspaceId!==scope.workspaceId)return null;
    return entry.value;
  }
  async delete(scope:SecretScope,reference:string){
    const entry=this.values.get(reference);
    if(entry&&entry.scope.tenantId===scope.tenantId&&entry.scope.workspaceId===scope.workspaceId)this.values.delete(reference);
  }
}
