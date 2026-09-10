import {NextResponse} from "next/server";
import {dbHealth} from "@atlas/db";
import {atlasRuntimeConfigured,atlasSignupEnabled} from "@/lib/session";

export const runtime="nodejs";

export async function GET(){
  const configured=atlasRuntimeConfigured();
  if(!configured){
    return NextResponse.json(
      {status:"degraded",database:"not_configured",signup:false},
      {status:503,headers:{"cache-control":"no-store"}}
    );
  }
  const database=await dbHealth();
  const healthy=database.status==="ok";
  return NextResponse.json(
    {status:healthy?"ok":"degraded",database:database.status,signup:atlasSignupEnabled()},
    {status:healthy?200:503,headers:{"cache-control":"no-store"}}
  );
}
