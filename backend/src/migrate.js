const fs=require("fs"); const path=require("path"); const {createPool}=require("./db");
async function main(){
 const pool=createPool();
 try{
  const dir=path.join(__dirname,"..","migrations");
  await pool.query("CREATE TABLE IF NOT EXISTS schema_migrations(version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
  for(const file of fs.readdirSync(dir).filter(f=>f.endsWith(".sql")).sort()){
   const exists=await pool.query("SELECT 1 FROM schema_migrations WHERE version=$1",[file]);
   if(!exists.rowCount){ const sql=fs.readFileSync(path.join(dir,file),"utf8"); await pool.query("BEGIN"); try{await pool.query(sql);await pool.query("INSERT INTO schema_migrations(version) VALUES($1)",[file]);await pool.query("COMMIT");}catch(e){await pool.query("ROLLBACK");throw e;} }
  }
 } finally {await pool.end();}
}
main().catch(e=>{console.error(e);process.exit(1)});
