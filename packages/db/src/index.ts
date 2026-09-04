import postgres from "postgres";

export type AtlasSql = ReturnType<typeof postgres>;

let singleton:AtlasSql|null=null;

export function databaseConfigured(){return Boolean(process.env.DATABASE_URL)}

export function db():AtlasSql{
  if(singleton)return singleton;
  const url=process.env.DATABASE_URL;
  if(!url)throw new Error("database-not-configured");
  singleton=postgres(url,{
    max:Number(process.env.ATLAS_DB_POOL_SIZE||5),
    prepare:false,
    connect_timeout:10,
    idle_timeout:20,
    max_lifetime:60*30
  });
  return singleton;
}

export async function dbHealth(){
  try{
    const sql=db();
    await sql`SELECT 1 AS ok`;
    return {status:"ok" as const};
  }catch(error){
    return {status:"error" as const,message:error instanceof Error?error.message:"database-error"};
  }
}

export async function closeDb(){
  if(!singleton)return;
  await singleton.end({timeout:2});
  singleton=null;
}
