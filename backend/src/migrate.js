const fs = require("node:fs/promises");
const path = require("node:path");
const { createPool } = require("./postgres");

async function main() {
  const pool = createPool();
  if (!pool) throw new Error("DATABASE_URL is required for migrations.");
  try {
    const sql = await fs.readFile(path.join(__dirname, "../db/001_initial.sql"), "utf8");
    await pool.query("BEGIN");
    await pool.query(sql);
    await pool.query("COMMIT");
    console.log("PostgreSQL schema verified.");
  } catch (error) {
    try { await pool.query("ROLLBACK"); } catch (_) {}
    throw error;
  } finally {
    await pool.end();
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
