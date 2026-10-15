const test = require("node:test");
const assert = require("node:assert/strict");
const { ROLES, normalizeRole, canManageRole, canManageUser } = require("./roles");

test("role normalization rejects unknown roles", () => {
  assert.equal(normalizeRole("owner"), "OWNER");
  assert.equal(normalizeRole("unknown-role"), "USER");
  assert.deepEqual(ROLES.includes("SUPER_ADMIN"), true);
});

test("role hierarchy prevents owners and admins from managing higher roles", () => {
  assert.equal(canManageRole("OWNER", "USER"), true);
  assert.equal(canManageRole("OWNER", "SUPER_ADMIN"), false);
  assert.equal(canManageRole("ADMIN", "USER"), true);
  assert.equal(canManageRole("ADMIN", "OWNER"), false);
  assert.equal(canManageRole("SUPER_ADMIN", "OWNER"), true);
});

test("user-management authorization rejects self-targeting and role escalation", () => {
  assert.equal(canManageUser("same-user", "same-user", "SUPER_ADMIN", "SUPER_ADMIN", "SUPER_ADMIN"), false);
  assert.equal(canManageUser("owner-user", "other-user", "OWNER", "USER", "SUPER_ADMIN"), false);
  assert.equal(canManageUser("admin-user", "other-user", "ADMIN", "USER", "USER"), true);
  assert.equal(canManageUser("admin-user", "owner-user", "ADMIN", "OWNER", "USER"), false);
});
