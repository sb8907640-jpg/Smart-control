const test = require("node:test");
const assert = require("node:assert/strict");
const { ROLES, normalizeRole, canManageRole, canManageUser } = require("./roles");

test("all supported roles are unique and normalized", () => {
  assert.equal(ROLES.length, 8);
  assert.equal(new Set(ROLES).size, ROLES.length);
  assert.equal(normalizeRole(" owner "), "OWNER");
  assert.equal(normalizeRole("unknown-role"), "USER");
  assert.equal(normalizeRole(undefined), "USER");
});

test("roles can manage only lower-privilege roles", () => {
  assert.equal(canManageRole("OWNER", "ADMIN"), true);
  assert.equal(canManageRole("OWNER", "USER"), true);
  assert.equal(canManageRole("OWNER", "SUPER_ADMIN"), false);
  assert.equal(canManageRole("OWNER", "OWNER"), false);
  assert.equal(canManageRole("ADMIN", "SUPPORT"), true);
  assert.equal(canManageRole("ADMIN", "ADMIN"), false);
  assert.equal(canManageRole("SUPPORT", "USER"), true);
  assert.equal(canManageRole("USER", "USER"), false);
});

test("SUPER_ADMIN can manage all roles", () => {
  for (const role of ROLES) assert.equal(canManageRole("SUPER_ADMIN", role), true);
});

test("user management checks current and requested roles and blocks self-promotion", () => {
  assert.equal(canManageUser("owner", "admin-1", "OWNER", "ADMIN", "USER"), true);
  assert.equal(canManageUser("admin", "owner-1", "ADMIN", "OWNER", "USER"), false);
  assert.equal(canManageUser("admin", "admin", "ADMIN", "ADMIN", "OWNER"), false);
  assert.equal(canManageUser("admin", "admin", "ADMIN", "ADMIN", "ADMIN"), true);
  assert.equal(canManageUser("super", "owner-1", "SUPER_ADMIN", "OWNER", "SUPER_ADMIN"), true);
});
