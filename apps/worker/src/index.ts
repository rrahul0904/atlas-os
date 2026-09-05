import {db,closeDb} from "../../../packages/db/src/index.js";
import {DurableWorkflowRuntime,ToolExecutorRegistry,SimulatedToolExecutor} from "../../../packages/workflow-runtime/src/index.js";
import {IntegrationAdapterRegistry} from "../../../packages/integrations-sdk/src/index.js";
import {WebhookIntegrationAdapter} from "../../../packages/integrations-webhook/src/index.js";
import {IntegrationToolExecutor} from "../../../packages/integration-runtime/src/index.js";
import {createGoogleRuntime} from "../../../packages/integrations-google/src/index.js";

const pollMs=Math.max(1000,Number(process.env.ATLAS_WORKER_POLL_MS||2000));
const sql=db();
const executors=new ToolExecutorRegistry();
const integrationAdapters=new IntegrationAdapterRegistry()
  .register(new WebhookIntegrationAdapter());

executors.register(new IntegrationToolExecutor(sql,integrationAdapters,"webhook"));

const googleEnvPresent=Boolean(process.env.GOOGLE_CLIENT_ID||process.env.GOOGLE_CLIENT_SECRET||process.env.GOOGLE_OAUTH_REDIRECT_URI);
if(googleEnvPresent){
  const google=createGoogleRuntime(sql);
  integrationAdapters.register(google.adapter);
  executors.register(new IntegrationToolExecutor(sql,integrationAdapters,"google-workspace"));
}

if(process.env.ATLAS_ENABLE_SIMULATION==="true"){
  if(process.env.NODE_ENV==="production")throw new Error("simulation-executor-forbidden-in-production");
  executors.register(new SimulatedToolExecutor());
}

const runtime=new DurableWorkflowRuntime(sql,{executors});
let stopping=false;

async function sleep(ms:number){return new Promise(resolve=>setTimeout(resolve,ms));}

async function run(){
  console.log("AtlasOS durable worker started");
  while(!stopping){
    try{
      const result=await runtime.processNext();
      if(!result)await sleep(pollMs);
    }catch(error){
      console.error("AtlasOS worker iteration failed safely",error);
      await sleep(pollMs);
    }
  }
  await closeDb();
}

process.on("SIGTERM",()=>{stopping=true});
process.on("SIGINT",()=>{stopping=true});
await run();
