const test = require("node:test");
const assert = require("node:assert/strict");
const { ROLES, normalizeRole, canManageRole } = require("./roles");

test("normalizeRole handles case, whitespace, and unknown values", () => {
  assert.equal(normalizeRole(" owner "), "OWNER");
  assert.equal(normalizeRole("SUPER_ADMIN"), "SUPER_ADMIN");
  assert.equal(normalizeRole(undefined), "USER");
  assert.equal(normalizeRole("not-a-role"), "USER");
});

test("role list contains all supported role identifiers", () => {
  assert.deepEqual(ROLES, [
    "SUPER_ADMIN", "OWNER", "ADMIN", "FINANCE_ADMIN",
    "LEGAL_ADMIN", "MODERATOR", "SUPPORT", "USER"
  ]);
});

test("SUPER_ADMIN can assign any role", () => {
  for (const role of ROLES) assert.equal(canManageRole("SUPER_ADMIN", role), true);
});

test("OWNER cannot assign OWNER or SUPER_ADMIN", () => {
  assert.equal(canManageRole("OWNER", "ADMIN"), true);
  assert.equal(canManageRole("OWNER", "USER"), true);
  assert.equal(canManageRole("OWNER", "OWNER"), false);
  assert.equal(canManageRole("OWNER", "SUPER_ADMIN"), false);
});

test("ADMIN is restricted to lower-privilege support roles", () => {
  assert.equal(canManageRole("ADMIN", "USER"), true);
  assert.equal(canManageRole("ADMIN", "SUPPORT"), true);
  assert.equal(canManageRole("ADMIN", "MODERATOR"), true);
  assert.equal(canManageRole("ADMIN", "OWNER"), false);
  assert.equal(canManageRole("ADMIN", "ADMIN"), false);
  assert.equal(canManageRole("USER", "USER"), false);
});
