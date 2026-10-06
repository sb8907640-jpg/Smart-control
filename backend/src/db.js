const { Pool } = require("pg");

function createPool(options = {}) {
  const connectionString = options.connectionString || process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required for PostgreSQL.");
  return new Pool({
    connectionString,
    max: Number(process.env.PG_POOL_MAX || 20),
    idleTimeoutMillis: Number(process.env.PG_IDLE_TIMEOUT_MS || 30000),
    connectionTimeoutMillis: Number(process.env.PG_CONNECT_TIMEOUT_MS || 5000),
    ssl: process.env.PGSSL === "disable" ? false : (process.env.NODE_ENV === "production" ? { rejectUnauthorized: true } : undefined)
  });
}

async function checkDatabase(pool) {
  const result = await pool.query("SELECT 1 AS ok");
  return result.rows[0]?.ok === 1;
}

module.exports = { createPool, checkDatabase };
