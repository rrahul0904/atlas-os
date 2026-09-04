import { randomUUID } from "node:crypto";
export type LifecycleStage="idea"|"evidence"|"decision"|"spec"|"architecture"|"build"|"deploy"|"learn";
export type FounderAgent="validation"|"product"|"architecture"|"learning";
export interface AgentRunRecord{id:string;agent:FounderAgent;stage:LifecycleStage;provider:string;output:string;createdAt:string;}
export interface FounderProject{id:string;workspaceId:string;name:string;idea:string;stage:LifecycleStage;readiness:number;assumptions:string[];decisions:string[];latestOutput:string;runs:AgentRunRecord[];createdAt:string;updatedAt:string;}
export function deriveName(idea:string){const clean=idea.replace(/[^a-zA-Z0-9\s-]/g," ").replace(/\s+/g," ").trim();const words=clean.split(" ").filter(Boolean).slice(0,5);return words.length?words.join(" "):"Untitled product";}
export function readinessForStage(stage:LifecycleStage){const scores:Record<LifecycleStage,number>={idea:18,evidence:34,decision:48,spec:61,architecture:72,build:82,deploy:90,learn:96};return scores[stage];}
export function createFounderProject(workspaceId:string,idea:string):FounderProject{const now=new Date().toISOString();return{id:randomUUID(),workspaceId,name:deriveName(idea),idea,stage:"idea",readiness:18,assumptions:["A reachable user has this problem","The pain is strong enough to change behavior","A focused MVP can test the thesis"],decisions:[],latestOutput:"",runs:[],createdAt:now,updatedAt:now};}
export function advanceProject(project:FounderProject,stage:LifecycleStage,output:string):FounderProject{return{...project,stage,readiness:readinessForStage(stage),latestOutput:output,updatedAt:new Date().toISOString()};}
export function localFounderBrief(agent:FounderAgent,project:FounderProject):string{
  const outputs:Record<FounderAgent,string>={
    validation:`Test the problem, users, alternatives, risks, and evidence required before building: ${project.idea}`,
    product:`Convert approved evidence into a narrow ICP, MVP scope, outcomes, and acceptance criteria for: ${project.idea}`,
    architecture:`Design the smallest scalable architecture with explicit boundaries, cost, security, and operations for: ${project.idea}`,
    learning:`Define telemetry, experiments, feedback loops, and the next evidence-backed iteration for: ${project.idea}`
  };return outputs[agent];
}
