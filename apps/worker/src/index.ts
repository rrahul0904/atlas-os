import {db,closeDb} from "../../../packages/db/src/index.js";
import {DurableWorkflowRuntime,ToolExecutorRegistry,SimulatedToolExecutor} from "../../../packages/workflow-runtime/src/index.js";

const pollMs=Math.max(1000,Number(process.env.ATLAS_WORKER_POLL_MS||2000));
const executors=new ToolExecutorRegistry();

if(process.env.ATLAS_ENABLE_SIMULATION==="true"){
  if(process.env.NODE_ENV==="production")throw new Error("simulation-executor-forbidden-in-production");
  executors.register(new SimulatedToolExecutor());
}

const runtime=new DurableWorkflowRuntime(db(),{executors});
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
