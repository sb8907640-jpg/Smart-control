const assert = require("node:assert/strict");
const { ROLES, normalizeRole, canManageRole } = require("./roles");

assert.equal(normalizeRole(" owner "), "OWNER");
assert.equal(normalizeRole("not-a-role"), "USER");
assert.equal(normalizeRole(undefined), "USER");
assert.deepEqual(ROLES.includes("SUPER_ADMIN"), true);

assert.equal(canManageRole("SUPER_ADMIN", "SUPER_ADMIN"), true);
assert.equal(canManageRole("OWNER", "ADMIN"), true);
assert.equal(canManageRole("OWNER", "USER"), true);
assert.equal(canManageRole("OWNER", "OWNER"), false);
assert.equal(canManageRole("ADMIN", "OWNER"), false);
assert.equal(canManageRole("FINANCE_ADMIN", "LEGAL_ADMIN"), false);
assert.equal(canManageRole("SUPPORT", "USER"), true);
assert.equal(canManageRole("USER", "USER"), false);

console.log("ROLE_POLICY_TEST=PASS");
