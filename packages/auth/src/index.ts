import{createHmac,timingSafeEqual,randomBytes,scryptSync}from"node:crypto";
import type{TenantPrincipal}from"../../tenancy/src/index.js";

interface SessionPayload extends TenantPrincipal{issuedAt:number;expiresAt:number;purpose:"session"}
interface SetupPayload{userId:string;email:string;issuedAt:number;expiresAt:number;purpose:"onboarding"}

const encode=(v:string)=>Buffer.from(v).toString("base64url");
const decode=(v:string)=>Buffer.from(v,"base64url").toString("utf8");
const signature=(payload:string,secret:string)=>createHmac("sha256",secret).update(payload).digest("base64url");

function signPayload(payload:object,secret:string){
  if(secret.length<32)throw new Error("auth-secret-too-short");
  const encoded=encode(JSON.stringify(payload));
  return `${encoded}.${signature(encoded,secret)}`;
}

function verifySigned<T>(token:string,secret:string,nowSeconds:number):T|null{
  const[encoded,provided]=token.split(".");
  if(!encoded||!provided||secret.length<32)return null;
  const expected=signature(encoded,secret);
  const a=Buffer.from(provided);const b=Buffer.from(expected);
  if(a.length!==b.length||!timingSafeEqual(a,b))return null;
  try{
    const payload=JSON.parse(decode(encoded)) as T&{expiresAt?:number};
    if(!payload.expiresAt||payload.expiresAt<=nowSeconds)return null;
    return payload as T;
  }catch{return null}
}

export function createSession(principal:TenantPrincipal,secret:string,ttlSeconds=43200,nowSeconds=Math.floor(Date.now()/1000)):string{
  const payload:SessionPayload={...principal,issuedAt:nowSeconds,expiresAt:nowSeconds+ttlSeconds,purpose:"session"};
  return signPayload(payload,secret);
}

export function verifySession(token:string,secret:string,nowSeconds=Math.floor(Date.now()/1000)):SessionPayload|null{
  const payload=verifySigned<SessionPayload>(token,secret,nowSeconds);
  return payload?.purpose==="session"?payload:null;
}

export function createSetupToken(input:{userId:string;email:string},secret:string,ttlSeconds=1800,nowSeconds=Math.floor(Date.now()/1000)):string{
  return signPayload({...input,issuedAt:nowSeconds,expiresAt:nowSeconds+ttlSeconds,purpose:"onboarding"} satisfies SetupPayload,secret);
}

export function verifySetupToken(token:string,secret:string,nowSeconds=Math.floor(Date.now()/1000)):SetupPayload|null{
  const payload=verifySigned<SetupPayload>(token,secret,nowSeconds);
  return payload?.purpose==="onboarding"?payload:null;
}

export function hashPassword(password:string):string{
  if(password.length<10)throw new Error("password-too-short");
  const salt=randomBytes(16).toString("base64url");
  const hash=scryptSync(password,salt,64).toString("base64url");
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password:string,stored:string):boolean{
  const[scheme,salt,expected]=stored.split("$");
  if(scheme!=="scrypt"||!salt||!expected)return false;
  const actual=scryptSync(password,salt,64);
  const expectedBytes=Buffer.from(expected,"base64url");
  return actual.length===expectedBytes.length&&timingSafeEqual(actual,expectedBytes);
}
