const ROLES = Object.freeze([
  "SUPER_ADMIN", "OWNER", "ADMIN", "FINANCE_ADMIN",
  "LEGAL_ADMIN", "MODERATOR", "SUPPORT", "USER"
]);

const ROLE_PRIORITY = Object.freeze({
  SUPER_ADMIN: 70,
  OWNER: 60,
  ADMIN: 50,
  FINANCE_ADMIN: 40,
  LEGAL_ADMIN: 40,
  MODERATOR: 30,
  SUPPORT: 20,
  USER: 10
});

function normalizeRole(value) {
  const role = typeof value === "string" ? value.trim().toUpperCase() : "USER";
  return ROLES.includes(role) ? role : "USER";
}

// A caller may manage only strictly lower roles, except SUPER_ADMIN, which is
// the sole role allowed to manage every role. Equal-level roles cannot manage
// one another.
function canManageRole(actorRole, targetRole) {
  const actor = normalizeRole(actorRole);
  const target = normalizeRole(targetRole);
  if (actor === "SUPER_ADMIN") return true;
  return ROLE_PRIORITY[actor] > ROLE_PRIORITY[target] && target !== "SUPER_ADMIN";
}

module.exports = { ROLES, normalizeRole, canManageRole };
