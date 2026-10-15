const ROLES = Object.freeze([
  "SUPER_ADMIN","OWNER","ADMIN","FINANCE_ADMIN",
  "LEGAL_ADMIN","MODERATOR","SUPPORT","USER"
]);

const ROLE_RANK = Object.freeze({
  SUPER_ADMIN: 100,
  OWNER: 90,
  ADMIN: 80,
  FINANCE_ADMIN: 70,
  LEGAL_ADMIN: 70,
  MODERATOR: 50,
  SUPPORT: 50,
  USER: 10
});

function normalizeRole(value) {
  const role = String(value || "USER").trim().toUpperCase();
  return ROLES.includes(role) ? role : "USER";
}

// A role may only assign roles strictly below its own rank. Equal-ranked roles
// cannot promote, demote, or modify one another through the user-management API.
function canManageRole(actorRole, targetRole) {
  const actor = normalizeRole(actorRole);
  const target = normalizeRole(targetRole);
  return ROLE_RANK[actor] > ROLE_RANK[target];
}

module.exports = { ROLES, normalizeRole, canManageRole };
