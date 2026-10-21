const test = require("node:test");
const assert = require("node:assert/strict");
const { resolvePublicAppUrl } = require("../src/app");

test("pairing invitation URL accepts only an explicitly configured HTTPS app origin", () => {
  assert.equal(resolvePublicAppUrl("https://family.example"), "https://family.example");
  assert.equal(resolvePublicAppUrl("https://family.example/"), "https://family.example");
  assert.equal(resolvePublicAppUrl(""), null);
  assert.equal(resolvePublicAppUrl(undefined), null);
  assert.equal(resolvePublicAppUrl("http://family.example"), null);
  assert.equal(resolvePublicAppUrl("https://user:password@family.example"), null);
  assert.equal(resolvePublicAppUrl("https://family.example?next=https://attacker.example"), null);
  assert.equal(resolvePublicAppUrl("https://family.example/#fragment"), null);
  assert.equal(resolvePublicAppUrl("https://family.example/untrusted-path"), null);
  assert.equal(resolvePublicAppUrl("not a URL"), null);
});
