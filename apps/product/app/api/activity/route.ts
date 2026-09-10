import {NextResponse} from "next/server";
import {db} from "@atlas/db";
import {resolveWorkspaceContext} from "@atlas/context";
import {deriveAtlasActivity} from "@atlas/activity";
import {optionalAtlasPrincipal} from "@/lib/session";

export const runtime="nodejs";
export async function GET(){
  const principal=await optionalAtlasPrincipal();if(!principal)return NextResponse.json({availability:"unauthorized",events:[]},{status:401});
  try{const context=await resolveWorkspaceContext(db(),principal),events=deriveAtlasActivity(context,100);return NextResponse.json({availability:"value",events},{headers:{"cache-control":"no-store"}})}
  catch{return NextResponse.json({availability:"unavailable",events:[]},{status:503})}
}
