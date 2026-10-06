const test=require("node:test");
const assert=require("node:assert/strict");
const {createPool,checkPostgres}=require("../src/postgres");
test("PostgreSQL integration check fails closed without configuration",async()=>{
  const pool=createPool("");
  assert.equal(pool,null);
  assert.deepEqual(await checkPostgres(pool),{configured:false,ok:false});
});
