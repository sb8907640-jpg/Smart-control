const test = require("node:test");
const assert = require("node:assert/strict");
const {
  normalizeEmail,
  normalizePhone,
  getOwnerAllowlist,
  isOwnerIdentity,
  applyOwnerRole
} = require("../src/owner-auth");

const env = {
  OWNER_EMAILS: "Owner@One.example, second@example.com",
  OWNER_MOBILE_NUMBERS: "+91 70915-23681, +918092302602"
};

test("owner allowlist normalizes configured identities", () => {
  const allowlist = getOwnerAllowlist(env);
  assert.equal(allowlist.emails.has("owner@one.example"), true);
  assert.equal(allowlist.emails.has("second@example.com"), true);
  assert.equal(allowlist.phones.has("+917091523681"), true);
  assert.equal(allowlist.phones.has("+918092302602"), true);
});

test("owner identity matches exact email or phone allowlist", () => {
  const allowlist = getOwnerAllowlist(env);
  assert.equal(isOwnerIdentity({ email: "OWNER@ONE.EXAMPLE" }, allowlist), true);
  assert.equal(isOwnerIdentity({ phone_number: "+91 70915 23681" }, allowlist), true);
  assert.equal(isOwnerIdentity({ email: "not-owner@example.com" }, allowlist), false);
  assert.equal(isOwnerIdentity({ phone_number: "+919999999999" }, allowlist), false);
});

test("owner role grants privileged role only after authenticated identity match", () => {
  const allowlist = getOwnerAllowlist(env);
  const owner = applyOwnerRole({ uid: "verified-owner", email: "owner@one.example" }, allowlist);
  assert.equal(owner.role, "OWNER");
  assert.equal(owner.owner, true);
  assert.equal(owner.admin, true);

  const ordinary = applyOwnerRole({ uid: "ordinary", email: "ordinary@example.com", admin: false }, allowlist);
  assert.equal(ordinary.role, undefined);
  assert.equal(ordinary.owner, undefined);
  assert.equal(ordinary.admin, false);
});

test("normalizers reject empty values", () => {
  assert.equal(normalizeEmail(""), "");
  assert.equal(normalizePhone(""), "");
});
