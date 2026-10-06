const test = require("node:test");
const assert = require("node:assert/strict");
const { createPostgresRepository } = require("../src/postgres-repository");

test("PostgreSQL repository uses parameterized device queries", async () => {
  const calls = [];
  const pool = { query: async (sql, params) => {
    calls.push({ sql, params });
    return { rows: [{ id: "d1", user_id: "u1", name: "Phone", platform: "ANDROID" }] };
  }};
  const repo = createPostgresRepository(pool);
  const row = await repo.upsertDevice({ id:"d1", userId:"u1", name:"Phone", platform:"ANDROID" });
  assert.equal(row.id, "d1");
  assert.deepEqual(calls[0].params, ["d1","u1","Phone","ANDROID"]);
  assert.match(calls[0].sql, /ON CONFLICT/);
});

test("audit writes metadata as a JSON parameter", async () => {
  let call;
  const pool = { query: async (sql, params) => {
    call = { sql, params };
    return { rows: [{ id: 1 }] };
  }};
  const repo = createPostgresRepository(pool);
  await repo.recordAudit({ userId:"u1", deviceId:"d1", feature:"LOCATION", action:"START", metadata:{source:"test"} });
  assert.deepEqual(call.params, ["u1","d1","LOCATION","START",JSON.stringify({source:"test"})]);
});
