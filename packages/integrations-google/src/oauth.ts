import {createHash,randomBytes,randomUUID} from "node:crypto";
import type {AtlasSql} from "../../db/src/index.js";
import type {TenantPrincipal} from "../../tenancy/src/index.js";
import type {SecretStore,SecretScope} from "../../secrets/src/index.js";
import {AuditRepository} from "../../repositories/src/index.js";
import {formBody,googleHttpError,parseGoogleJson,type GoogleHttpTransport} from "./transport.js";
import {GOOGLE_INTEGRATION_ID,GOOGLE_SCOPES,GoogleTokenManager,type GoogleOAuthConfig} from "./tokens.js";

const PROVIDER=GOOGLE_INTEGRATION_ID;
const AUTH_ENDPOINT="https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT="https://oauth2.googleapis.com/token";
const GMAIL_PROFILE_ENDPOINT="https://gmail.googleapis.com/gmail/v1/users/me/profile";

function sha256(value:string){return createHash("sha256").update(value).digest().toString("base64url")}
function randomVerifier(){return randomBytes(48).toString("base64url")}

export class GoogleOAuthTransactionRepository{
  constructor(private readonly sql:AtlasSql){}

  async create(input:{
    tenantId:string;workspaceId:string;userId:string;stateHash:string;
    verifierSecretReference:string;expiresAt:string;
  }){
    const id=randomUUID();
    await this.sql`INSERT INTO atlas_oauth_transactions(
      id,tenant_id,workspace_id,user_id,provider,state_hash,verifier_secret_reference,expires_at
    ) VALUES(
      ${id},${input.tenantId},${input.workspaceId},${input.userId},${PROVIDER},${input.stateHash},${input.verifierSecretReference},${input.expiresAt}
    )`;
    return id;
  }

  async consume(input:{tenantId:string;workspaceId:string;userId:string;stateHash:string}){
    const rows=await this.sql`UPDATE atlas_oauth_transactions SET consumed_at=now()
      WHERE tenant_id=${input.tenantId}
        AND workspace_id=${input.workspaceId}
        AND user_id=${input.userId}
        AND provider=${PROVIDER}
        AND state_hash=${input.stateHash}
        AND consumed_at IS NULL
        AND expires_at>now()
      RETURNING id,verifier_secret_reference,expires_at`;
    return rows[0]??null;
  }
}

export interface GoogleOAuthBeginResult{authorizationUrl:string;expiresAt:string}
export interface GoogleOAuthCompleteResult{connectionId:string;accountEmail:string;scopes:string[]}

export class GoogleOAuthService{
  private readonly transactions:GoogleOAuthTransactionRepository;
  private readonly audit:AuditRepository;

  constructor(
    private readonly sql:AtlasSql,
    private readonly secrets:SecretStore,
    private readonly transport:GoogleHttpTransport,
    private readonly config:GoogleOAuthConfig,
    private readonly tokens:GoogleTokenManager
  ){
    this.transactions=new GoogleOAuthTransactionRepository(sql);
    this.audit=new AuditRepository(sql);
  }

  async begin(principal:TenantPrincipal):Promise<GoogleOAuthBeginResult>{
    const scope:SecretScope={tenantId:principal.tenantId,workspaceId:principal.workspaceId};
    const state=randomBytes(32).toString("base64url");
    const verifier=randomVerifier();
    const challenge=sha256(verifier);
    const verifierRef=await this.secrets.put(scope,verifier);
    const expiresAt=new Date(Date.now()+10*60_000).toISOString();
    try{
      await this.transactions.create({
        ...scope,userId:principal.userId,stateHash:sha256(state),
        verifierSecretReference:verifierRef,expiresAt
      });
    }catch(error){
      await this.secrets.delete(scope,verifierRef);
      throw error;
    }

    const url=new URL(AUTH_ENDPOINT);
    url.searchParams.set("client_id",this.config.clientId);
    url.searchParams.set("redirect_uri",this.config.redirectUri);
    url.searchParams.set("response_type","code");
    url.searchParams.set("scope",GOOGLE_SCOPES.join(" "));
    url.searchParams.set("access_type","offline");
    url.searchParams.set("include_granted_scopes","true");
    url.searchParams.set("prompt","consent");
    url.searchParams.set("state",state);
    url.searchParams.set("code_challenge",challenge);
    url.searchParams.set("code_challenge_method","S256");

    await this.audit.record(scope,{
      actorId:principal.userId,
      action:"integration.oauth_started",
      targetType:"integration",
      targetId:PROVIDER,
      metadata:{provider:PROVIDER,expiresAt,scopeCount:GOOGLE_SCOPES.length}
    });
    return{authorizationUrl:url.toString(),expiresAt};
  }

  async complete(principal:TenantPrincipal,state:string,code:string):Promise<GoogleOAuthCompleteResult>{
    if(state.length<20||state.length>512||code.length<5||code.length>4096)throw new Error("google-oauth-callback-invalid");
    const scope:SecretScope={tenantId:principal.tenantId,workspaceId:principal.workspaceId};
    const transaction=await this.transactions.consume({...scope,userId:principal.userId,stateHash:sha256(state)});
    if(!transaction)throw new Error("google-oauth-state-invalid-or-expired");
    const verifierRef=String(transaction.verifier_secret_reference);
    const verifier=await this.secrets.get(scope,verifierRef);
    if(!verifier)throw new Error("google-oauth-verifier-unavailable");

    try{
      const tokenResponse=await this.transport.request({
        url:TOKEN_ENDPOINT,
        method:"POST",
        headers:{"content-type":"application/x-www-form-urlencoded","accept":"application/json"},
        body:formBody({
          client_id:this.config.clientId,
          client_secret:this.config.clientSecret,
          code,
          code_verifier:verifier,
          grant_type:"authorization_code",
          redirect_uri:this.config.redirectUri
        })
      });
      if(tokenResponse.status<200||tokenResponse.status>=300)throw googleHttpError(tokenResponse);
      const token=parseGoogleJson<any>(tokenResponse);
      if(typeof token.access_token!=="string")throw new Error("google-oauth-access-token-missing");

      const profileResponse=await this.transport.request({
        url:GMAIL_PROFILE_ENDPOINT,
        method:"GET",
        headers:{authorization:`Bearer ${token.access_token}`,"accept":"application/json"}
      });
      if(profileResponse.status<200||profileResponse.status>=300)throw googleHttpError(profileResponse);
      const profile=parseGoogleJson<any>(profileResponse);
      if(typeof profile.emailAddress!=="string"||!profile.emailAddress.includes("@"))throw new Error("google-account-email-missing");

      const scopes=typeof token.scope==="string"?token.scope.split(/\s+/).filter(Boolean):[...GOOGLE_SCOPES];
      const connection=await this.tokens.persistAuthorization(scope,{
        accessToken:token.access_token,
        refreshToken:typeof token.refresh_token==="string"?token.refresh_token:null,
        expiresIn:Number(token.expires_in??3600),
        tokenType:typeof token.token_type==="string"?token.token_type:"Bearer",
        scopes,
        accountEmail:profile.emailAddress
      });
      await this.audit.record(scope,{
        actorId:principal.userId,
        action:"integration.oauth_connected",
        targetType:"integration_connection",
        targetId:connection.id,
        metadata:{provider:PROVIDER,accountEmail:profile.emailAddress,scopeCount:scopes.length}
      });
      return{connectionId:connection.id,accountEmail:profile.emailAddress,scopes};
    }finally{
      await this.secrets.delete(scope,verifierRef);
    }
  }
}
