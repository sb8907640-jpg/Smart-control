const { createProductionApp } = require("./app");
const { createPool } = require("./db");

const port = Number(process.env.PORT || 8080);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PORT must be an integer between 1 and 65535.");

let pool;
try { pool = createPool(); } catch (error) {
  if (process.env.NODE_ENV === "production") throw error;
  console.warn("PostgreSQL not configured:", error.message);
}

const app = createProductionApp({ postgresPool: pool });
const server = app.listen(port, "0.0.0.0", () => {
  console.log(JSON.stringify({ event: "server_started", service: "smart-control-backend", port, postgresql: Boolean(pool) }));
});

function shutdown(signal) {
  console.log(JSON.stringify({ event: "server_shutdown", signal }));
  server.close(async () => {
    if (pool) await pool.end().catch(() => {});
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
