const { createPool } = require("./postgres");

const statements = [
  "CREATE TABLE IF NOT EXISTS schema_migrations (version BIGINT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())",
  "CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT, phone TEXT, role TEXT NOT NULL DEFAULT 'USER', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())",
  "CREATE TABLE IF NOT EXISTS devices (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, platform TEXT NOT NULL, device_name TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())",
  "CREATE INDEX IF NOT EXISTS idx_devices_user_id ON devices(user_id)",
  "CREATE TABLE IF NOT EXISTS audit_events (id BIGSERIAL PRIMARY KEY, actor_user_id TEXT, action TEXT NOT NULL, resource_type TEXT, resource_id TEXT, payload JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())",
  "CREATE INDEX IF NOT EXISTS idx_audit_events_actor_created ON audit_events(actor_user_id, created_at DESC)"
];

async function main() {
  const pool = createPool();
  if (!pool) throw new Error("DATABASE_URL is required for migrations.");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (let i=0;i<statements.length;i++) {
      await client.query(statements[i]);
    }
    await client.query("INSERT INTO schema_migrations(version) VALUES($1) ON CONFLICT DO NOTHING",[1]);
    await client.query("COMMIT");
    console.log("PostgreSQL schema verified.");
  } catch (e) {
    await client.query("ROLLBACK"); throw e;
  } finally { client.release(); await pool.end(); }
}
main().catch(e=>{console.error(e);process.exit(1);});
