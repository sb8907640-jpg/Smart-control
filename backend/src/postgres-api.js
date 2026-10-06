function installPostgresRoutes(app,{pool}){
 const auth=async(req,res,next)=>{try{const uid=req.user?.uid;if(!uid)return res.status(401).json({error:"Authentication required."});req.pgUser=uid;next();}catch(e){next(e)}};
 app.get("/api/postgres/status",async(_req,res)=>{try{await pool.query("SELECT 1");res.json({ok:true,database:"postgresql"})}catch(e){res.status(503).json({ok:false,database:"postgresql"})}});
 app.get("/api/postgres/devices",auth,async(req,res,next)=>{try{const q=await pool.query("SELECT id,device_key,platform,name,created_at,updated_at FROM devices WHERE owner_uid=$1 ORDER BY updated_at DESC LIMIT 100",[req.pgUser]);res.json({devices:q.rows})}catch(e){next(e)}});
 app.post("/api/postgres/devices",auth,async(req,res,next)=>{try{const {deviceKey,platform,name}=req.body||{};if(!deviceKey||!platform)return res.status(400).json({error:"deviceKey and platform are required."});const q=await pool.query("INSERT INTO devices(owner_uid,device_key,platform,name) VALUES($1,$2,$3,$4) ON CONFLICT(owner_uid,device_key) DO UPDATE SET platform=EXCLUDED.platform,name=EXCLUDED.name,updated_at=NOW() RETURNING id,device_key,platform,name,created_at,updated_at",[req.pgUser,deviceKey,platform,name||null]);res.status(201).json({device:q.rows[0]})}catch(e){next(e)}});
}
module.exports={installPostgresRoutes};
