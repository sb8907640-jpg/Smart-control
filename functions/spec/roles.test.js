const test = require("node:test");
const assert = require("node:assert/strict");
const { ROLES, normalizeRole, canManageRole } = require("./roles");

test("normalizes known roles and safely defaults unknown roles", () => {
  assert.equal(normalizeRole(" owner "), "OWNER");
  assert.equal(normalizeRole("SUPER_ADMIN"), "SUPER_ADMIN");
  assert.equal(normalizeRole("unknown-role"), "USER");
  assert.equal(normalizeRole(null), "USER");
  assert.equal(ROLES.length, 8);
});

test("higher roles can manage strictly lower roles only", () => {
  assert.equal(canManageRole("SUPER_ADMIN", "OWNER"), true);
  assert.equal(canManageRole("OWNER", "ADMIN"), true);
  assert.equal(canManageRole("ADMIN", "USER"), true);
  assert.equal(canManageRole("OWNER", "SUPER_ADMIN"), false);
  assert.equal(canManageRole("OWNER", "OWNER"), false);
  assert.equal(canManageRole("FINANCE_ADMIN", "LEGAL_ADMIN"), false);
  assert.equal(canManageRole("USER", "SUPPORT"), false);
});
