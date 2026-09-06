import postgres from "postgres";
const url=process.env.DATABASE_URL;
if(!url) throw new Error("DATABASE_URL is required");
const required=[
  "atlas_tenants","atlas_users","atlas_workspaces","atlas_memberships",
  "atlas_workspace_modules","atlas_tasks","atlas_approvals","atlas_events",
  "atlas_audit_events","atlas_integration_connections","atlas_billing_accounts",
  "atlas_schema_migrations","atlas_evidence","atlas_action_items","atlas_agents","atlas_workflow_definitions","atlas_workflow_runs","atlas_workflow_step_runs","atlas_secret_values","atlas_oauth_transactions","atlas_integration_actions","atlas_billing_events","atlas_checkout_sessions","atlas_usage_events"
];
const sql=postgres(url,{max:1,prepare:false,connect_timeout:10,idle_timeout:5});
try{
  const rows=await sql`SELECT table_name FROM information_schema.tables WHERE table_schema='public'`;
  const found=new Set(rows.map(row=>row.table_name));
  const missing=required.filter(name=>!found.has(name));
  if(missing.length) throw new Error(`Missing AtlasOS tables: ${missing.join(", ")}`);
  const integrationColumns=await sql`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='atlas_integration_connections' AND column_name IN ('last_success_at','last_error','last_error_at','health_details')`;
  if(integrationColumns.length!==4) throw new Error("Missing integration health columns");
  const billingColumns=await sql`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='atlas_billing_accounts' AND column_name IN ('price_ref','cancel_at_period_end','trial_ends_at','subscription_event_created_at','created_at')`;
  if(billingColumns.length!==5) throw new Error("Missing Stripe billing columns");
  const eventColumns=await sql`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='atlas_billing_events' AND column_name IN ('provider_created_at','verified_at','processed_at')`;
  if(eventColumns.length!==3) throw new Error("Missing Stripe billing event columns");
  const approvalMode=await sql`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='atlas_workspaces' AND column_name='approval_mode'`;
  if(!approvalMode.length) throw new Error("Missing atlas_workspaces.approval_mode");
  const migrations=await sql`SELECT count(*)::int AS count FROM atlas_schema_migrations`;
  if(Number(migrations[0]?.count)!==10) throw new Error(`Expected 10 migrations, found ${migrations[0]?.count ?? 0}`);
  console.log(`Database contract OK: ${required.length} tables, 10 migrations.`);
}finally{
  await sql.end({timeout:2});
}
