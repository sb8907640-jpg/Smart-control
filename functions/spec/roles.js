const ROLES = Object.freeze([
  "SUPER_ADMIN",
  "OWNER",
  "ADMIN",
  "FINANCE_ADMIN",
  "LEGAL_ADMIN",
  "MODERATOR",
  "SUPPORT",
  "USER"
]);

function normalizeRole(value) {
  const role = String(value ?? "USER").trim().toUpperCase();
  return ROLES.includes(role) ? role : "USER";
}

// Role assignment is deliberately narrower than ordinary admin access.
// Owner identities are managed through the private owner-account allowlist;
// only SUPER_ADMIN may assign SUPER_ADMIN or OWNER roles.
function canManageRole(actorRole, targetRole) {
  const actor = normalizeRole(actorRole);
  const target = normalizeRole(targetRole);

  if (actor === "SUPER_ADMIN") return true;
  if (actor === "OWNER") {
    return ["ADMIN", "FINANCE_ADMIN", "LEGAL_ADMIN", "MODERATOR", "SUPPORT", "USER"].includes(target);
  }
  if (actor === "ADMIN") {
    return ["MODERATOR", "SUPPORT", "USER"].includes(target);
  }
  return false;
}

module.exports = { ROLES, normalizeRole, canManageRole };
