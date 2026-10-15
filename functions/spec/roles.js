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

function normalizeRole(role) {
  const value = String(role || "USER").trim().toUpperCase();
  return ROLES.includes(value) ? value : "USER";
}

function canManageRole(actorRole, targetRole) {
  const actor = normalizeRole(actorRole);
  const target = normalizeRole(targetRole);
  if (actor === "SUPER_ADMIN") return true;
  if (actor === "OWNER") return target !== "SUPER_ADMIN";
  if (actor === "ADMIN") return ["MODERATOR", "SUPPORT", "USER"].includes(target);
  return false;
}

function canManageUser(actorUid, targetUid, actorRole, currentTargetRole, requestedRole = null) {
  if (typeof actorUid !== "string" || !actorUid ||
      typeof targetUid !== "string" || !targetUid ||
      actorUid === targetUid) return false;
  if (!canManageRole(actorRole, currentTargetRole)) return false;
  return requestedRole == null || canManageRole(actorRole, requestedRole);
}

function canManageOwnerAccounts(claims = {}, ownerEmails = [], ownerMobiles = []) {
  const role = normalizeRole(claims.role);
  if (claims.owner === true || role === "OWNER" || role === "SUPER_ADMIN") return true;
  const email = String(claims.email || "").trim().toLowerCase();
  const phone = String(claims.phone_number || "").trim();
  const emails = ownerEmails.map(value => String(value).trim().toLowerCase());
  const mobiles = ownerMobiles.map(value => String(value).trim());
  return Boolean((email && emails.includes(email)) || (phone && mobiles.includes(phone)));
}

module.exports = { ROLES, normalizeRole, canManageRole, canManageUser, canManageOwnerAccounts };
