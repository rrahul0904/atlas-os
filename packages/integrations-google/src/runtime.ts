import type {AtlasSql} from "../../db/src/index.js";
import {EncryptedPostgresSecretStore,keyringFromEnvironment} from "../../secrets/src/index.js";
import {GoogleWorkspaceAdapter} from "./adapter.js";
import {GoogleOAuthService} from "./oauth.js";
import {FetchGoogleHttpTransport} from "./transport.js";
import {googleOAuthConfigFromEnv,GoogleTokenManager} from "./tokens.js";

export function googleRuntimeConfigured(env=process.env){
  try{
    googleOAuthConfigFromEnv(env);
    keyringFromEnvironment(env);
    return true;
  }catch{return false}
}

export function createGoogleRuntime(sql:AtlasSql){
  const config=googleOAuthConfigFromEnv();
  const secrets=new EncryptedPostgresSecretStore(sql);
  const transport=new FetchGoogleHttpTransport();
  const tokens=new GoogleTokenManager(sql,secrets,transport,config);
  const adapter=new GoogleWorkspaceAdapter(sql,tokens,transport);
  const oauth=new GoogleOAuthService(sql,secrets,transport,config,tokens);
  return{config,secrets,transport,tokens,adapter,oauth};
}
