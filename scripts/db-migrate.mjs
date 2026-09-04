import postgres from "postgres";
import {readdir,readFile} from "node:fs/promises";
import {resolve} from "node:path";

const url=process.env.DATABASE_URL;
if(!url) throw new Error("DATABASE_URL is required");

const sql=postgres(url,{max:1,prepare:false,connect_timeout:10,idle_timeout:5});
try{
  await sql`CREATE TABLE IF NOT EXISTS atlas_schema_migrations (
    name text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`;
  const dir=resolve("db/migrations");
  const files=(await readdir(dir)).filter(name=>/^\d+_.+\.sql$/.test(name)).sort();
  for(const name of files){
    const existing=await sql`SELECT name FROM atlas_schema_migrations WHERE name=${name}`;
    if(existing.length){console.log(`skip ${name}`);continue;}
    const body=await readFile(resolve(dir,name),"utf8");
    await sql.begin(async tx=>{
      await tx.unsafe(body);
      await tx`INSERT INTO atlas_schema_migrations(name) VALUES (${name})`;
    });
    console.log(`applied ${name}`);
  }
}finally{
  await sql.end({timeout:2});
}
