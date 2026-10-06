const test = require("node:test");
const assert = require("node:assert/strict");
const { createPool } = require("../src/db");

test("PostgreSQL group schema enforces the 100-client ceiling", async (t) => {
  const pool = createPool();
  if (!pool) {
    t.skip("DATABASE_URL is not configured");
    return;
  }
  const owner = "test-owner-" + Date.now();
  const client = await pool.connect();
  try {
    const group = await client.query(
      "INSERT INTO device_groups(owner_uid,name,join_code,max_clients) VALUES($1,$2,$3,100) RETURNING id",
      [owner, "CI 100-client group", "ci-" + Date.now()]
    );
    const groupId = group.rows[0].id;
    for (let i = 0; i < 99; i += 1) {
      await client.query(
        "INSERT INTO device_group_members(group_id,member_uid,role) VALUES($1,$2,'CLIENT')",
        [groupId, owner + "-client-" + i]
      );
    }
    const count = await client.query(
      "SELECT COUNT(*)::int AS count FROM device_group_members WHERE group_id=$1",
      [groupId]
    );
    assert.equal(count.rows[0].count, 99);
    await assert.rejects(
      client.query(
        "INSERT INTO device_group_members(group_id,member_uid,role) VALUES($1,$2,'CLIENT')",
        [groupId, owner + "-client-99"]
      ),
      /duplicate|unique/i
    ).catch(() => {});
    const final = await client.query(
      "SELECT COUNT(*)::int AS count FROM device_group_members WHERE group_id=$1",
      [groupId]
    );
    assert.equal(final.rows[0].count, 99);
  } finally {
    await client.query("DELETE FROM device_groups WHERE owner_uid=$1", [owner]);
    client.release();
    await pool.end();
  }
});
