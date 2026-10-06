const { Pool } = require("pg");

function createPool(connectionString = process.env.DATABASE_URL) {
  if (!connectionString) return null;
  return new Pool({
    connectionString,
    max: Number(process.env.PG_POOL_MAX || 10),
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
    ssl: process.env.PG_SSL === "false" ? false : { rejectUnauthorized: process.env.PG_SSL_REJECT_UNAUTHORIZED !== "false" }
  });
}

async function checkPostgres(pool) {
  if (!pool) return { configured: false, ok: false };
  const result = await pool.query("SELECT 1 AS ok");
  return { configured: true, ok: result.rows[0]?.ok === 1 };
}

module.exports = { createPool, checkPostgres };
