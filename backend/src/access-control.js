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

const ROLE_ACCESS = Object.freeze({
  SUPER_ADMIN: ["*"],
  OWNER: ["owner:*", "device:*", "session:*", "feature:*", "billing:*", "legal:*", "support:*"],
  ADMIN: ["device:*", "session:*", "feature:*", "user:*", "support:*"],
  FINANCE_ADMIN: ["billing:*", "user:read", "support:read"],
  LEGAL_ADMIN: ["legal:*", "audit:read", "consent:read", "user:read"],
  MODERATOR: ["user:read", "user:moderate", "session:moderate", "support:moderate"],
  SUPPORT: ["user:read", "device:read", "session:read", "support:*"],
  USER: ["device:self", "session:self", "feature:self", "consent:self", "support:self"]
});

function normalizeRole(role) {
  const value = String(role || "USER").trim().toUpperCase();
  return ROLES.includes(value) ? value : "USER";
}

function hasAccess(role, capability) {
  const normalized = normalizeRole(role);
  const requested = String(capability || "").trim();
  if (!requested) return false;
  return ROLE_ACCESS[normalized].some(rule => rule === "*" || rule === requested || (rule.endsWith(":*") && requested.startsWith(rule.slice(0, -1))));
}

function canManageRole(actorRole, targetRole) {
  const actor = normalizeRole(actorRole);
  const target = normalizeRole(targetRole);
  if (actor === "SUPER_ADMIN") return true;
  if (actor === "OWNER") return target !== "SUPER_ADMIN";
  if (actor === "ADMIN") return ["MODERATOR", "SUPPORT", "USER"].includes(target);
  return false;
}

module.exports = { ROLES, ROLE_ACCESS, normalizeRole, hasAccess, canManageRole };
