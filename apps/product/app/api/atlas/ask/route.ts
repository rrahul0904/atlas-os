import {NextResponse} from "next/server";
import {db} from "@atlas/db";
import {resolveWorkspaceContext} from "@atlas/context";
import {answerAtlas} from "@atlas/ask-atlas";
import {AuditRepository} from "@atlas/repositories";
import {optionalAtlasPrincipal} from "@/lib/session";

export const runtime="nodejs";
export async function POST(request:Request){
  const principal=await optionalAtlasPrincipal();if(!principal)return NextResponse.json({message:"Authentication required."},{status:401});
  const body=await request.json().catch(()=>({})),question=typeof body.question==="string"?body.question.trim():"";
  if(!question||question.length>2000)return NextResponse.json({message:"Question must be between 1 and 2000 characters."},{status:400});
  const sql=db(),context=await resolveWorkspaceContext(sql,principal),answer=answerAtlas(context,question);
  await new AuditRepository(sql).record({tenantId:principal.tenantId,workspaceId:principal.workspaceId},{actorId:principal.userId,action:"atlas.ask",targetType:"workspace",targetId:principal.workspaceId,metadata:{intent:answer.intent,evidenceCount:answer.evidence.length,surface:"product-next"}});
  return NextResponse.json(answer,{headers:{"cache-control":"no-store"}});
}
