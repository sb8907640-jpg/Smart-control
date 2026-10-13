const { createServer } = require("node:http");
const { Server } = require("socket.io");

function createRealtimeServer({ app, verifyToken, firestore }) {
  const httpServer = createServer(app);
  const allowedOrigins = String(process.env.CORS_ORIGIN || "").split(",").map(v => v.trim()).filter(Boolean);
  const io = new Server(httpServer, {
    cors: { origin: allowedOrigins.length ? allowedOrigins : true, credentials: true },
    transports: ["websocket", "polling"]
  });

  io.use(async (socket, next) => {
    try {
      const token = typeof socket.handshake.auth?.token === "string" ? socket.handshake.auth.token : "";
      if (!token) return next(new Error("Authentication required."));
      const verifiedUser = await verifyToken(token, true);
      if (firestore && typeof firestore.collection === "function" && verifiedUser?.uid) {
        const account = await firestore.collection("users").doc(verifiedUser.uid).get();
        const accountStatus = String(account.exists ? account.data()?.status || "ACTIVE" : "ACTIVE").toUpperCase();
        if (["SUSPENDED", "BLOCKED", "BANNED", "DISABLED"].includes(accountStatus)) {
          try {
            await firestore.collection("securityEvents").add({
              event: "SOCKET_REJECTED_ACCOUNT_STATUS",
              userId: verifiedUser.uid,
              status: accountStatus,
              createdAtEpochMs: Date.now()
            });
          } catch (_) {
            // Logging failures must never bypass account-status enforcement.
          }
          return next(new Error("This account is suspended or blocked."));
        }
      }
      socket.user = verifiedUser;
      return next();
    } catch (_) {
      return next(new Error("Authentication or account-status verification failed."));
    }
  });

  io.on("connection", socket => {
    socket.join("user:" + socket.user.uid);
    socket.on("session:join", async ({ sessionId } = {}, acknowledge) => {
      try {
        if (typeof sessionId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(sessionId)) {
          throw new Error("Invalid session ID.");
        }
        const doc = await firestore.collection("mediaSessions").doc(sessionId).get();
        if (!doc.exists) throw new Error("Session not found.");
        const data = doc.data() || {};
        const allowed = data.controllerUid === socket.user.uid || data.targetDeviceId === socket.user.uid;
        if (!allowed) throw new Error("Not authorized for this session.");
        if (!["REQUESTED", "APPROVED", "ACTIVE"].includes(String(data.status || ""))) {
          throw new Error("Session is not active.");
        }
        socket.join("session:" + sessionId);
        if (typeof acknowledge === "function") acknowledge({ ok: true });
      } catch (error) {
        if (typeof acknowledge === "function") acknowledge({ ok: false, error: error.message });
      }
    });
    socket.on("session:leave", ({ sessionId } = {}) => {
      if (typeof sessionId === "string") socket.leave("session:" + sessionId);
    });
    socket.on("disconnect", reason => {
      console.log(JSON.stringify({ event: "socket_disconnect", uid: socket.user.uid, reason }));
    });
  });

  return { httpServer, io };
}

function startProductionServer() {
  const { createProductionApp } = require("./app");
  const { getAuth } = require("firebase-admin/auth");
  const { getFirestore } = require("firebase-admin/firestore");

  const port = Number(process.env.PORT || 8080);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be an integer between 1 and 65535.");
  }

  const app = createProductionApp();
  const { httpServer, io } = createRealtimeServer({
    app,
    verifyToken: (token, checkRevoked) => getAuth().verifyIdToken(token, checkRevoked),
    firestore: getFirestore()
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
}

if (require.main === module) startProductionServer();

module.exports = { createRealtimeServer, startProductionServer };
