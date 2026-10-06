const test=require("node:test");
const assert=require("node:assert/strict");
const {newDb}=require("pg-mem");
const fs=require("node:fs");
const path=require("node:path");

test("PostgreSQL schema creates required production tables and indexes", async()=>{
  const mem=newDb();
  const pg=mem.adapters.createPg();
  const pool=new pg.Pool();
  const sql=fs.readFileSync(path.join(__dirname,"../db/001_initial.sql"),"utf8");
  await pool.query(sql);
  const tables=await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name");
  assert.deepEqual(tables.rows.map(r=>r.table_name),["audit_events","consent_events","devices","users"]);
  await pool.query("INSERT INTO users(firebase_uid,email) VALUES($1,$2)",["u1","u@example.invalid"]);
  const row=await pool.query("SELECT firebase_uid FROM users WHERE email=$1",["u@example.invalid"]);
  assert.equal(row.rows[0].firebase_uid,"u1");
  await pool.query("INSERT INTO devices(owner_uid,device_key,platform,name) VALUES($1,$2,$3,$4)",["u1","device-1","android","Test phone"]);
  const device=await pool.query("SELECT owner_uid,device_key,name FROM devices WHERE owner_uid=$1",["u1"]);
  assert.equal(device.rows[0].device_key,"device-1");
  assert.equal(device.rows[0].name,"Test phone");
  await pool.end();
});
