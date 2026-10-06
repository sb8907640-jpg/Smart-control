const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const { io: connect } = require("socket.io-client");
const { createRealtimeServer } = require("../src/server");

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

  await new Promise(resolve => httpServer.listen(0, "127.0.0.1", resolve));
  const port = httpServer.address().port;
  const client = connect("http://127.0.0.1:" + port, {
    auth: { token: "valid-token" },
    transports: ["websocket"]
  });

  try {
    const connected = await new Promise((resolve, reject) => {
      client.once("connect", resolve);
      client.once("connect_error", reject);
    });
    assert.ok(connected);

    const result = await new Promise(resolve => {
      client.emit("session:join", { sessionId: "session-1" }, resolve);
    });
    assert.deepEqual(result, { ok: true });
    assert.ok(io.sockets.sockets.size >= 1);
  } finally {
    client.close();
    await new Promise(resolve => io.close(resolve));
    await new Promise(resolve => httpServer.close(resolve));
  }
});
