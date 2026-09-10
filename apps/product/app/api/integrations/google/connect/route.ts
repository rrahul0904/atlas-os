import {NextResponse} from "next/server";
import {db} from "@atlas/db";
import {createGoogleRuntime} from "@atlas/integrations-google";
import {optionalAtlasPrincipal} from "@/lib/session";
import {canManageIntegrations,billedModuleAllowed} from "@/lib/permissions";
export const runtime="nodejs";
export async function GET(request:Request){const principal=await optionalAtlasPrincipal();if(!principal)return NextResponse.redirect(new URL("/login",request.url),303);if(!canManageIntegrations(principal))return NextResponse.json({message:"Admin role is required."},{status:403});if(!(await billedModuleAllowed(principal,"agent-governance")))return NextResponse.json({message:"Current billing entitlements do not allow integration writes."},{status:402});try{const started=await createGoogleRuntime(db()).oauth.begin(principal);return NextResponse.redirect(started.authorizationUrl,303)}catch(error){return NextResponse.json({message:error instanceof Error?error.message:"Google OAuth is not configured."},{status:503})}}
