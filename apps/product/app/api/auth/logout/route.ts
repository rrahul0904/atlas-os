import {NextResponse} from "next/server";import {atlasSessionCookieName} from "@/lib/session";
export async function GET(request:Request){const response=NextResponse.redirect(new URL("/",request.url),303);response.cookies.set(atlasSessionCookieName,"",{httpOnly:true,sameSite:"lax",secure:process.env.NODE_ENV==="production",path:"/",maxAge:0});return response}
