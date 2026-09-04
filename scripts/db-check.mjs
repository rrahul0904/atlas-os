import postgres from "postgres";
const url=process.env.DATABASE_URL;
if(!url) throw new Error("DATABASE_URL is required");
const required=[
  "atlas_tenants","atlas_users","atlas_workspaces","atlas_memberships",
  "atlas_workspace_modules","atlas_tasks","atlas_approvals","atlas_events",
  "atlas_audit_events","atlas_integration_connections","atlas_billing_accounts",
  "atlas_schema_migrations","atlas_evidence","atlas_action_items"
];
const sql=postgres(url,{max:1,prepare:false,connect_timeout:10,idle_timeout:5});
try{
  const rows=await sql`SELECT table_name FROM information_schema.tables WHERE table_schema='public'`;
  const found=new Set(rows.map(row=>row.table_name));
  const missing=required.filter(name=>!found.has(name));
  if(missing.length) throw new Error(`Missing AtlasOS tables: ${missing.join(", ")}`);
  const migrations=await sql`SELECT count(*)::int AS count FROM atlas_schema_migrations`;
  if(Number(migrations[0]?.count)!==5) throw new Error(`Expected 5 migrations, found ${migrations[0]?.count ?? 0}`);
  console.log(`Database contract OK: ${required.length} tables, 5 migrations.`);
}finally{
  await sql.end({timeout:2});
}
