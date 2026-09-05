import type {AtlasSql} from "../../db/src/index.js";
import {IntegrationConnectionRepository,type StoredIntegrationConnection} from "../../repositories/src/index.js";
import type {SecretStore,SecretScope} from "../../secrets/src/index.js";
import {formBody,googleHttpError,parseGoogleJson,type GoogleHttpTransport} from "./transport.js";

export const GOOGLE_INTEGRATION_ID="google-workspace";
export const GOOGLE_SCOPES=[
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/calendar.events"
] as const;

export interface GoogleOAuthConfig{
  clientId:string;
  clientSecret:string;
  redirectUri:string;
}
export interface GoogleTokenSecret{
  accessToken:string;
  refreshToken:string|null;
  expiresAt:number;
  tokenType:string;
  scopes:string[];
}

export class GoogleReauthenticationRequired extends Error{
  constructor(message="google-needs-reauthentication"){super(message);this.name="GoogleReauthenticationRequired"}
}

export function googleOAuthConfigFromEnv(env=process.env):GoogleOAuthConfig{
  const clientId=env.GOOGLE_CLIENT_ID?.trim()??"";
  const clientSecret=env.GOOGLE_CLIENT_SECRET?.trim()??"";
  const redirectUri=env.GOOGLE_OAUTH_REDIRECT_URI?.trim()??"";
  if(!clientId||!clientSecret||!redirectUri)throw new Error("google-oauth-not-configured");
  let parsed:URL;
  try{parsed=new URL(redirectUri)}catch{throw new Error("google-oauth-redirect-invalid")}
  if(env.NODE_ENV==="production"&&parsed.protocol!=="https:")throw new Error("google-oauth-https-redirect-required");
  if(!["http:","https:"].includes(parsed.protocol))throw new Error("google-oauth-redirect-invalid");
  return{clientId,clientSecret,redirectUri};
}

function parseSecret(value:string|null):GoogleTokenSecret|null{
  if(!value)return null;
  try{
    const parsed=JSON.parse(value) as Partial<GoogleTokenSecret>;
    if(typeof parsed.accessToken!=="string"||typeof parsed.expiresAt!=="number")return null;
    return{
      accessToken:parsed.accessToken,
      refreshToken:typeof parsed.refreshToken==="string"?parsed.refreshToken:null,
      expiresAt:parsed.expiresAt,
      tokenType:typeof parsed.tokenType==="string"?parsed.tokenType:"Bearer",
      scopes:Array.isArray(parsed.scopes)?parsed.scopes.filter((item):item is string=>typeof item==="string"):[]
    };
  }catch{return null}
}

export class GoogleTokenManager{
  private readonly connections:IntegrationConnectionRepository;
  constructor(
    private readonly sql:AtlasSql,
    private readonly secrets:SecretStore,
    private readonly transport:GoogleHttpTransport,
    private readonly oauth:GoogleOAuthConfig
  ){this.connections=new IntegrationConnectionRepository(sql)}

  async load(scope:SecretScope,connection:StoredIntegrationConnection){
    if(!connection.secretReference)throw new GoogleReauthenticationRequired();
    const raw=await this.secrets.get(scope,connection.secretReference);
    const token=parseSecret(raw);
    if(!token)throw new GoogleReauthenticationRequired("google-token-secret-invalid");
    return token;
  }

  async getAccessToken(scope:SecretScope,connectionId:string){
    const connection=await this.connections.findScoped(scope,connectionId);
    if(!connection)throw new Error("google-connection-not-found");
    let token=await this.load(scope,connection);
    if(token.expiresAt>Date.now()+60_000)return token.accessToken;
    if(!token.refreshToken){
      await this.connections.updateHealth(scope,connection.id,{state:"needs_reauthentication",message:"Google refresh token is unavailable.",checkedAt:new Date().toISOString()});
      throw new GoogleReauthenticationRequired();
    }

    const response=await this.transport.request({
      url:"https://oauth2.googleapis.com/token",
      method:"POST",
      headers:{"content-type":"application/x-www-form-urlencoded","accept":"application/json"},
      body:formBody({
        client_id:this.oauth.clientId,
        client_secret:this.oauth.clientSecret,
        refresh_token:token.refreshToken,
        grant_type:"refresh_token"
      })
    });
    if(response.status<200||response.status>=300){
      if(response.status===400&&/invalid_grant/i.test(response.body)){
        await this.connections.updateHealth(scope,connection.id,{state:"needs_reauthentication",message:"Google authorization was revoked or expired.",checkedAt:new Date().toISOString()});
        throw new GoogleReauthenticationRequired();
      }
      throw googleHttpError(response);
    }
    const body=parseGoogleJson<any>(response);
    if(typeof body.access_token!=="string")throw new Error("google-refresh-access-token-missing");
    token={
      ...token,
      accessToken:body.access_token,
      expiresAt:Date.now()+Math.max(30,Number(body.expires_in??3600))*1000,
      tokenType:typeof body.token_type==="string"?body.token_type:token.tokenType,
      scopes:typeof body.scope==="string"?body.scope.split(/\s+/).filter(Boolean):token.scopes
    };
    if(!connection.secretReference)throw new GoogleReauthenticationRequired();
    await this.secrets.put(scope,JSON.stringify(token),connection.secretReference);
    return token.accessToken;
  }

  async persistAuthorization(scope:SecretScope,input:{
    accessToken:string;
    refreshToken?:string|null;
    expiresIn?:number;
    tokenType?:string;
    scopes?:string[];
    accountEmail:string;
  }){
    const current=await this.connections.findByIntegration(scope,GOOGLE_INTEGRATION_ID);
    let existing:GoogleTokenSecret|null=null;
    if(current?.secretReference){
      try{existing=await this.load(scope,current)}catch{}
    }
    const token:GoogleTokenSecret={
      accessToken:input.accessToken,
      refreshToken:input.refreshToken??existing?.refreshToken??null,
      expiresAt:Date.now()+Math.max(30,input.expiresIn??3600)*1000,
      tokenType:input.tokenType??"Bearer",
      scopes:input.scopes?.length?input.scopes:[...GOOGLE_SCOPES]
    };
    if(!token.refreshToken)throw new Error("google-refresh-token-missing");
    const reference=await this.secrets.put(scope,JSON.stringify(token),current?.secretReference);
    return this.connections.upsert(scope,{
      integrationId:GOOGLE_INTEGRATION_ID,
      status:"connected",
      externalAccountRef:input.accountEmail,
      secretReference:reference,
      config:{scopes:token.scopes,accountEmail:input.accountEmail}
    });
  }

  async disconnect(scope:SecretScope){
    const current=await this.connections.findByIntegration(scope,GOOGLE_INTEGRATION_ID);
    let revoked=false;
    if(current?.secretReference){
      try{
        const token=await this.load(scope,current);
        const value=token.refreshToken??token.accessToken;
        const response=await this.transport.request({
          url:"https://oauth2.googleapis.com/revoke",
          method:"POST",
          headers:{"content-type":"application/x-www-form-urlencoded","accept":"application/json"},
          body:formBody({token:value})
        });
        revoked=response.status>=200&&response.status<300;
      }catch{}
      await this.secrets.delete(scope,current.secretReference);
    }
    const connection=await this.connections.upsert(scope,{
      integrationId:GOOGLE_INTEGRATION_ID,
      status:"not_configured",
      externalAccountRef:null,
      secretReference:null,
      config:{}
    });
    return{connection,revoked};
  }
}
