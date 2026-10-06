const test = require("node:test");
const assert = require("node:assert/strict");
const { createApp } = require("../src/app");

async function withServer(app, fn) {
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  const port = server.address().port;
  try {
    await fn("http://127.0.0.1:" + port);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

test("health and readiness endpoints are public", async () => {
  const app = createApp();
  await withServer(app, async base => {
    const health = await fetch(base + "/healthz");
    assert.equal(health.status, 200);
    assert.equal((await health.json()).ok, true);
    const ready = await fetch(base + "/readyz");
    assert.equal(ready.status, 503);
    const readyBody = await ready.json();
    assert.equal(readyBody.ok, false);
    assert.equal(readyBody.checks.firebase, false);
  });
});

test("protected API rejects requests without bearer authentication", async () => {
  const app = createApp({ verifyIdToken: async () => ({ uid: "u1" }) });
  await withServer(app, async base => {
    const response = await fetch(base + "/api/auth/session");
    assert.equal(response.status, 401);
  });
});

test("protected API accepts a verified Firebase identity", async () => {
  const app = createApp({ verifyIdToken: async token => {
    assert.equal(token, "test-token");
    return { uid: "u1", email: "test@example.invalid", admin: false };
  }});
  await withServer(app, async base => {
    const response = await fetch(base + "/api/auth/session", {
      headers: { authorization: "Bearer test-token" }
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.uid, "u1");
    assert.equal(body.authenticated, true);
  });
});

test("plan route fails closed when Firestore is unavailable", async () => {
  const app = createApp({ verifyIdToken: async () => ({ uid: "u1" }) });
  await withServer(app, async base => {
    const response = await fetch(base + "/api/plans", {
      headers: { authorization: "Bearer test-token" }
    });
    assert.equal(response.status, 503);
  });
});
