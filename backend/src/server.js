const { createServer } = require("node:http");
const { Server } = require("socket.io");
const { createProductionApp } = require("./app");
const { Server } = require("socket.io");

const port = Number(process.env.PORT || 8080);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be an integer between 1 and 65535.");
}

const app = createProductionApp();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: String(process.env.CORS_ORIGIN || "").split(",").map(v => v.trim()).filter(Boolean),
    credentials: true
  },
  transports: ["websocket", "polling"]
});
io.use(async (socket, next) => {
  try {
    const auth = socket.handshake.auth || {};
    const token = typeof auth.token === "string" ? auth.token : "";
    if (!token) return next(new Error("Authentication required."));
    const { getAuth } = require("firebase-admin");
    socket.user = await getAuth().verifyIdToken(token, true);
    return next();
  } catch (_) {
    return next(new Error("Invalid authentication token."));
  }
});
io.on("connection", socket => {
  socket.join("user:" + socket.user.uid);
  socket.on("session:join", ({ sessionId } = {}) => {
    if (typeof sessionId !== "string" || !sessionId || sessionId.length > 128) return;
    socket.join("session:" + sessionId);
  });
  socket.on("session:leave", ({ sessionId } = {}) => {
    if (typeof sessionId === "string") socket.leave("session:" + sessionId);
  });
  socket.on("disconnect", reason => {
    console.log(JSON.stringify({ event: "socket_disconnect", uid: socket.user.uid, reason }));
  });
});
const server = httpServer.listen(port, "0.0.0.0", () => {
  console.log(JSON.stringify({ event: "server_started", service: "smart-control-backend", port }));
});

function shutdown(signal) {
  console.log(JSON.stringify({ event: "server_shutdown", signal }));
  io.close();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
