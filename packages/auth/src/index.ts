import{createHmac,timingSafeEqual}from"node:crypto";import type{TenantPrincipal}from"../../tenancy/src/index.js";
interface SessionPayload extends TenantPrincipal{issuedAt:number;expiresAt:number}
const encode=(v:string)=>Buffer.from(v).toString("base64url");const decode=(v:string)=>Buffer.from(v,"base64url").toString("utf8");
const signature=(payload:string,secret:string)=>createHmac("sha256",secret).update(payload).digest("base64url");
export function createSession(principal:TenantPrincipal,secret:string,ttlSeconds=43200,nowSeconds=Math.floor(Date.now()/1000)):string{
  if(secret.length<32)throw new Error("auth-secret-too-short");
  const payload:SessionPayload={...principal,issuedAt:nowSeconds,expiresAt:nowSeconds+ttlSeconds};
  const encoded=encode(JSON.stringify(payload));return `${encoded}.${signature(encoded,secret)}`;
}
export function verifySession(token:string,secret:string,nowSeconds=Math.floor(Date.now()/1000)):SessionPayload|null{
  const[encoded,provided]=token.split(".");if(!encoded||!provided||secret.length<32)return null;
  const expected=signature(encoded,secret);const a=Buffer.from(provided);const b=Buffer.from(expected);
  if(a.length!==b.length||!timingSafeEqual(a,b))return null;
  try{const payload=JSON.parse(decode(encoded)) as SessionPayload;if(payload.expiresAt<=nowSeconds)return null;return payload}catch{return null}
}
