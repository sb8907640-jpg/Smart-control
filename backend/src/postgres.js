const { Pool } = require("pg");

function createPool(options = {}) {
  return new Pool({
    connectionString: options.connectionString || process.env.DATABASE_URL,
    max: Number(process.env.PG_POOL_MAX || 20),
    idleTimeoutMillis: Number(process.env.PG_IDLE_TIMEOUT_MS || 30000),
    connectionTimeoutMillis: Number(process.env.PG_CONNECTION_TIMEOUT_MS || 5000),
    ssl: process.env.PGSSL === "true" ? { rejectUnauthorized: true } : undefined
  });
}

async function healthcheck(pool) {
  const result = await pool.query("SELECT 1 AS ok");
  return result.rows[0]?.ok === 1;
}

module.exports = { createPool, healthcheck };
