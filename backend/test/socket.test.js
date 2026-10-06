const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const { io: connect } = require("socket.io-client");
const { createRealtimeServer } = require("../src/server");
const { createApp } = require("../src/app");

function fakeFirestore(session) {
  return {
    collection(name) {
      assert.equal(name, "mediaSessions");
      return {
        doc(id) {
          assert.equal(id, "session-1");
          return { get: async () => ({ exists: true, data: () => session }) };
        }
      };
    }
  };
}

test("Socket.IO authenticates clients and authorizes session rooms", async () => {
  const app = express();
  const { httpServer, io } = createRealtimeServer({
    app,
    verifyToken: async token => {
      assert.equal(token, "valid-token");
      return { uid: "controller-1" };
    },
    firestore: fakeFirestore({
      controllerUid: "controller-1",
      targetDeviceId: "device-1",
      status: "ACTIVE"
    })
  });

  await new Promise((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(0, "127.0.0.1", resolve);
  });
  const port = httpServer.address().port;
  const client = connect("http://127.0.0.1:" + port, {
    auth: { token: "valid-token" },
    transports: ["polling", "websocket"],
    timeout: 5000,
    reconnection: false
  });

  try {
    await new Promise((resolve, reject) => {
      client.once("connect", resolve);
      client.once("connect_error", reject);
    });

    const result = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("session:join acknowledgement timed out")), 5000);
      client.emit("session:join", { sessionId: "session-1" }, response => {
        clearTimeout(timer);
        resolve(response);
      });
    });
    assert.deepEqual(result, { ok: true });
    assert.ok(io.sockets.sockets.size >= 1);
  } finally {
    client.close();
    await new Promise(resolve => io.close(resolve));
    await new Promise(resolve => httpServer.close(resolve));
  }
});

test("backend health readiness enforces production data residency", async () => {
  const http = require("node:http");
  const previousNodeEnv = process.env.NODE_ENV;
  const previousRegion = process.env.SMARTCONTROL_DATA_REGION;
  process.env.NODE_ENV = "production";
  delete process.env.SMARTCONTROL_DATA_REGION;
  const app = createApp();
  const server = await new Promise(resolve => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  try {
    const result = await new Promise((resolve, reject) => {
      const req = http.get({ host: "127.0.0.1", port: server.address().port, path: "/healthz" }, res => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", chunk => { body += chunk; });
        res.on("end", () => resolve({ status: res.statusCode, body: JSON.parse(body) }));
      });
      req.on("error", reject);
    });
    assert.equal(result.status, 503);
    assert.equal(result.body.ok, false);
  } finally {
    await new Promise(resolve => server.close(resolve));
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    if (previousRegion === undefined) delete process.env.SMARTCONTROL_DATA_REGION;
    else process.env.SMARTCONTROL_DATA_REGION = previousRegion;
  }
});


test("Socket.IO client recovers after a simulated transport disconnect", async () => {
  const app = express();
  const { httpServer, io } = createRealtimeServer({
    app,
    verifyToken: async token => {
      assert.equal(token, "valid-token");
      return { uid: "controller-1" };
    },
    firestore: fakeFirestore({
      controllerUid: "controller-1",
      targetDeviceId: "device-1",
      status: "ACTIVE"
    })
  });

  await new Promise((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(0, "127.0.0.1", resolve);
  });
  const port = httpServer.address().port;
  const client = connect("http://127.0.0.1:" + port, {
    auth: { token: "valid-token" },
    transports: ["polling", "websocket"],
    timeout: 5000,
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 50
  });

  try {
    await new Promise((resolve, reject) => {
      client.once("connect", resolve);
      client.once("connect_error", reject);
    });
    const reconnecting = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("automatic reconnect timed out")), 5000);
      client.io.once("reconnect", attempt => {
        clearTimeout(timer);
        resolve(attempt);
      });
    });
    client.io.engine.close();
    const attempt = await reconnecting;
    assert.ok(attempt >= 1);
    assert.equal(client.connected, true);
  } finally {
    client.close();
    await new Promise(resolve => io.close(resolve));
    await new Promise(resolve => httpServer.close(resolve));
  }
});
