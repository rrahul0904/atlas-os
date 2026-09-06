import postgres from "postgres";
import {readdir,readFile} from "node:fs/promises";
import {resolve} from "node:path";

const url=process.env.DATABASE_URL;
if(!url)throw new Error("DATABASE_URL is required");
const sql=postgres(url,{max:1,prepare:false,connect_timeout:10,idle_timeout:5});
const dir=resolve("db/migrations");
try{
  const files=(await readdir(dir)).filter(name=>/^\d+_.*\.sql$/.test(name)).sort();
  if(files.length<2)throw new Error("At least two migrations are required for upgrade certification");
  await sql.unsafe("DROP SCHEMA public CASCADE; CREATE SCHEMA public");
  await sql`CREATE TABLE atlas_schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`;
  for(const name of files.slice(0,-1)){
    const body=await readFile(resolve(dir,name),"utf8");
    await sql.begin(async tx=>{await tx.unsafe(body);await tx`INSERT INTO atlas_schema_migrations(name) VALUES(${name})`;});
  }
  const before=await sql`SELECT count(*)::int AS count FROM atlas_schema_migrations`;
  if(Number(before[0]?.count)!==files.length-1)throw new Error("Previous-schema migration count mismatch");
  const latest=files.at(-1);if(!latest)throw new Error("Latest migration missing");
  const latestBody=await readFile(resolve(dir,latest),"utf8");
  await sql.begin(async tx=>{await tx.unsafe(latestBody);await tx`INSERT INTO atlas_schema_migrations(name) VALUES(${latest})`;});
  const after=await sql`SELECT count(*)::int AS count FROM atlas_schema_migrations`;
  if(Number(after[0]?.count)!==files.length)throw new Error("Upgrade migration count mismatch");
  console.log(`Upgrade contract OK: previous ${files.length-1} migrations -> ${files.length} migrations.`);
}finally{await sql.end({timeout:2});}
