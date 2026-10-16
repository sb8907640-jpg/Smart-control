const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const test = require("node:test");
const { createTurnConfiguration, DEFAULT_STUN_URL } = require("./turn-config");

test("STUN-only mode is explicit when no TURN URL is configured", () => {
  const result = createTurnConfiguration({ rawUrls: "", sharedSecret: "", uid: "uid-1", nowMs: 1_700_000_000_000 });
  assert.deepEqual(result.iceServers, [{ urls: [DEFAULT_STUN_URL] }]);
  assert.equal(result.turnConfigured, false);
  assert.equal(result.expiresAtEpochSeconds, null);
});

test("TURN URLs produce short-lived UID-scoped REST credentials", () => {
  const nowMs = 1_700_000_000_000;
  const result = createTurnConfiguration({
    rawUrls: "turn:turn.example.com:3478, turns:turn.example.com:5349",
    sharedSecret: "test-shared-secret",
    uid: "uid-123",
    nowMs
  });
  const expectedExpiry = Math.floor(nowMs / 1000) + 3600;
  const expectedUsername = expectedExpiry + ":uid-123";
  const expectedCredential = crypto.createHmac("sha1", "test-shared-secret").update(expectedUsername).digest("base64");
  assert.equal(result.turnConfigured, true);
  assert.equal(result.expiresAtEpochSeconds, expectedExpiry);
  assert.deepEqual(result.iceServers[1].urls, ["turn:turn.example.com:3478", "turns:turn.example.com:5349"]);
  assert.equal(result.iceServers[1].username, expectedUsername);
  assert.equal(result.iceServers[1].credential, expectedCredential);
});

test("rejects invalid non-TURN URLs rather than silently degrading", () => {
  assert.throws(() => createTurnConfiguration({
    rawUrls: "https://turn.example.com",
    sharedSecret: "secret",
    uid: "uid-123"
  }), /only turn: or turns: URLs/);
});

test("rejects configured TURN URLs when the shared secret is missing", () => {
  assert.throws(() => createTurnConfiguration({
    rawUrls: "turn:turn.example.com:3478",
    sharedSecret: "",
    uid: "uid-123"
  }), /SMARTCONTROL_TURN_CREDENTIAL is unavailable/);
});

test("rejects credential creation without a verified UID", () => {
  assert.throws(() => createTurnConfiguration({
    rawUrls: "turn:turn.example.com:3478",
    sharedSecret: "secret",
    uid: ""
  }), /verified account UID is required/);
});
