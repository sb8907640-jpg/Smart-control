const { createPool } = require("./postgres");
const { TABLES } = require("../../functions/spec/masterCatalog");

async function main() {
  const pool = createPool();
  if (!pool) throw new Error("DATABASE_URL is required.");
  try {
    const result = await pool.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'"
    );
    const actual = new Set(result.rows.map(row => row.table_name));
    const missing = TABLES.filter(name => !actual.has(name));
    if (missing.length) throw new Error(`Missing master tables: ${missing.join(", ")}`);
    if (actual.size < TABLES.length) throw new Error(`Expected at least ${TABLES.length} application tables, found ${actual.size}`);
    console.log(`PostgreSQL schema verified: ${actual.size} public base tables; all ${TABLES.length} master tables present.`);
  } finally {
    await pool.end();
  }
}

main().catch(error => { console.error(error); process.exit(1); });
