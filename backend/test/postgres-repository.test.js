const test = require("node:test");
const assert = require("node:assert/strict");
const { newDb } = require("pg-mem");
const { createPostgresRepository } = require("../src/postgres-repository");

async function createRepository() {
  const db = newDb();
  db.public.none(`
    CREATE TABLE devices (
      id BIGSERIAL PRIMARY KEY,
      owner_uid TEXT NOT NULL,
      device_key TEXT NOT NULL,
      platform TEXT NOT NULL,
      name TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(owner_uid, device_key)
    );
    CREATE TABLE audit_logs (
      id BIGSERIAL PRIMARY KEY,
      actor_uid TEXT,
      event_type TEXT NOT NULL,
      resource_type TEXT,
      resource_id TEXT,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  const Pool = db.adapters.createPg().Pool;
  const pool = new Pool();
  return { pool, repository: createPostgresRepository(pool) };
}

test("PostgreSQL repository persists and lists device records", async () => {
  const { pool, repository } = await createRepository();
  try {
    const first = await repository.upsertDevice({
      userId: "owner-1",
      deviceKey: "device-1",
      name: "Test phone",
      platform: "android"
    });
    assert.equal(first.owner_uid, "owner-1");
    assert.equal(first.device_key, "device-1");

    const updated = await repository.upsertDevice({
      userId: "owner-1",
      deviceKey: "device-1",
      name: "Updated phone",
      platform: "android"
    });
    assert.equal(updated.name, "Updated phone");

    const devices = await repository.listDevices("owner-1");
    assert.equal(devices.length, 1);
    assert.equal(devices[0].device_key, "device-1");
  } finally {
    await pool.end();
  }
});

test("PostgreSQL repository records auditable actions", async () => {
  const { pool, repository } = await createRepository();
  try {
    const audit = await repository.recordAudit({
      userId: "owner-1",
      deviceId: 7,
      feature: "permission",
      action: "grant",
      metadata: { source: "test" }
    });
    assert.ok(audit.id);
    const result = await pool.query("SELECT actor_uid, event_type, resource_type, resource_id, metadata FROM audit_logs");
    assert.equal(result.rows[0].actor_uid, "owner-1");
    assert.equal(result.rows[0].event_type, "grant");
    assert.equal(result.rows[0].resource_type, "permission");
    assert.equal(result.rows[0].resource_id, "7");
  } finally {
    await pool.end();
  }
});
