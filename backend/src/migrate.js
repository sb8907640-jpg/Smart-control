const fs = require("node:fs/promises");
const path = require("node:path");
const { createPool } = require("./postgres");

async function main() {
  const pool = createPool();
  if (!pool) throw new Error("DATABASE_URL is required for migrations.");

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const migrationDir = path.join(__dirname, "../migrations");
    const files = (await fs.readdir(migrationDir))
      .filter(name => /^\d+_.+\.sql$/.test(name))
      .sort();

    for (const file of files) {
      const version = file.replace(/\.sql$/, "");
      const existing = await pool.query(
        "SELECT 1 FROM schema_migrations WHERE version = $1",
        [version]
      );
      if (existing.rowCount) continue;

      const sql = await fs.readFile(path.join(migrationDir, file), "utf8");
      await pool.query("BEGIN");
      try {
        await pool.query(sql);
        await pool.query(
          "INSERT INTO schema_migrations (version) VALUES ($1)",
          [version]
        );
        await pool.query("COMMIT");
        console.log("Applied PostgreSQL migration:", version);
      } catch (error) {
        await pool.query("ROLLBACK");
        throw error;
      }
    }

    console.log("PostgreSQL migrations verified.");
  } finally {
    await pool.end();
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
