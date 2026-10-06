const { createProductionApp } = require("./app");

const port = Number(process.env.PORT || 8080);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be an integer between 1 and 65535.");
}

const app = createProductionApp();
const server = app.listen(port, "0.0.0.0", () => {
  console.log(JSON.stringify({ event: "server_started", service: "smart-control-backend", port }));
});

function shutdown(signal) {
  console.log(JSON.stringify({ event: "server_shutdown", signal }));
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
