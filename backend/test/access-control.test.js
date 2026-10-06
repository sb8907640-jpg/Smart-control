const test = require("node:test");
const assert = require("node:assert/strict");
const { ROLES, normalizeRole, hasAccess, canManageRole } = require("../src/access-control");

test("defines exactly the eight master roles", () => {
  assert.equal(ROLES.length, 8);
  assert.deepEqual(ROLES, [
    "SUPER_ADMIN","OWNER","ADMIN","FINANCE_ADMIN",
    "LEGAL_ADMIN","MODERATOR","SUPPORT","USER"
  ]);
});

test("unknown roles fail closed to USER", () => {
  assert.equal(normalizeRole("not-a-role"), "USER");
});

test("role capabilities are restricted", () => {
  assert.equal(hasAccess("FINANCE_ADMIN", "billing:read"), true);
  assert.equal(hasAccess("FINANCE_ADMIN", "device:write"), false);
  assert.equal(hasAccess("LEGAL_ADMIN", "consent:read"), true);
  assert.equal(hasAccess("USER", "owner:write"), false);
});

test("role management follows hierarchy", () => {
  assert.equal(canManageRole("SUPER_ADMIN", "OWNER"), true);
  assert.equal(canManageRole("OWNER", "ADMIN"), true);
  assert.equal(canManageRole("ADMIN", "SUPPORT"), true);
  assert.equal(canManageRole("ADMIN", "OWNER"), false);
  assert.equal(canManageRole("USER", "SUPPORT"), false);
});
