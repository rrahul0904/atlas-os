import {NextResponse} from "next/server";
import {db} from "@atlas/db";
import {BillingRepository,WorkspaceRepository,UserRepository} from "@atlas/repositories";
import {createStripeBillingRuntime,stripeBillingConfigured} from "@atlas/billing-stripe";
import {isAtlasPlan} from "@atlas/entitlements";
import {optionalAtlasPrincipal} from "@/lib/session";
import {canManageBilling} from "@/lib/permissions";

export const runtime="nodejs";
export async function POST(request:Request,{params}:{params:Promise<{action:string}>}){
  const principal=await optionalAtlasPrincipal();if(!principal)return NextResponse.json({message:"Authentication required."},{status:401});
  if(!canManageBilling(principal))return NextResponse.json({message:"Admin role is required."},{status:403});
  if(!stripeBillingConfigured())return NextResponse.json({message:"Stripe billing is not configured."},{status:503});
  const route=await params,scope={tenantId:principal.tenantId,workspaceId:principal.workspaceId},sql=db(),workspace=await new WorkspaceRepository(sql).findScoped(scope.tenantId,scope.workspaceId);
  if(!workspace)return NextResponse.json({message:"Workspace not found."},{status:404});
  await new BillingRepository(sql).ensure(scope,workspace.planId,workspace.billingStatus,workspace.trialEndsAt);
  const stripe=createStripeBillingRuntime(sql);
  try{
    if(route.action==="portal"){const result=await stripe.createPortal(scope);return NextResponse.redirect(result.url,303)}
    if(route.action==="cancel"){await stripe.cancelAtPeriodEnd(scope);return NextResponse.redirect(new URL("/app/billing",request.url),303)}
    if(route.action==="reactivate"){await stripe.reactivate(scope);return NextResponse.redirect(new URL("/app/billing",request.url),303)}
    const form=await request.formData(),plan=String(form.get("plan")||"");if(!isAtlasPlan(plan))return NextResponse.json({message:"Unknown AtlasOS plan."},{status:400});
    if(route.action==="plan"){await stripe.changePlan(scope,plan);return NextResponse.redirect(new URL("/app/billing",request.url),303)}
    if(route.action==="checkout"){const user=await new UserRepository(sql).findById(principal.userId);if(!user)return NextResponse.json({message:"User not found."},{status:404});const result=await stripe.createCheckout(scope,{plan,createdBy:principal.userId,email:user.email});return NextResponse.redirect(result.url,303)}
    return NextResponse.json({message:"Unknown billing action."},{status:404});
  }catch(error){return NextResponse.json({message:error instanceof Error?error.message:"Billing action failed."},{status:409})}
}
