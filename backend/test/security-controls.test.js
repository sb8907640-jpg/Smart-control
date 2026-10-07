const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { encryptAes256Gcm, decryptAes256Gcm, securityControlPolicy } = require("../src/security-controls");
const env = { DATA_ENCRYPTION_KEY: crypto.randomBytes(32).toString("base64") };

test("AES-256-GCM encrypts and decrypts", () => {
  const payload = encryptAes256Gcm("consent-event", env);
  assert.equal(payload.algorithm, "AES-256-GCM");
  assert.equal(decryptAes256Gcm(payload, env), "consent-event");
});
test("security policy preserves consent, visibility, stop and emergency boundaries", () => {
  const p = securityControlPolicy();
  assert.equal(p.consentLog, true); assert.equal(p.activityLog, true);
  assert.equal(p.liveIndicator, true); assert.equal(p.userStop, true);
  assert.equal(p.accessNotification, true); assert.equal(p.userDataDeletion, true);
  assert.match(p.emergency, /never silently grants/i);
});
