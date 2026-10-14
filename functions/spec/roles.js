const ROLES = Object.freeze([
  "SUPER_ADMIN", "OWNER", "ADMIN", "FINANCE_ADMIN",
  "LEGAL_ADMIN", "MODERATOR", "SUPPORT", "USER"
]);

const ROLE_LEVEL = Object.freeze({
  SUPER_ADMIN: 100,
  OWNER: 90,
  ADMIN: 80,
  FINANCE_ADMIN: 70,
  LEGAL_ADMIN: 70,
  MODERATOR: 60,
  SUPPORT: 50,
  USER: 0
});

function normalizeRole(value) {
  const role = String(value || "USER").trim().toUpperCase();
  return ROLES.includes(role) ? role : "USER";
}

/**
 * Only higher-privilege actors may manage lower roles. A SUPER_ADMIN may
 * manage any role; callers must separately prevent changing their own role.
 */
function canManageRole(actorRole, targetRole) {
  const actor = normalizeRole(actorRole);
  const target = normalizeRole(targetRole);
  if (actor === "SUPER_ADMIN") return true;
  return ROLE_LEVEL[actor] > ROLE_LEVEL[target];
}

function canManageUser(actorUid, targetUid, actorRole, currentTargetRole, requestedTargetRole = currentTargetRole) {
  const actor = normalizeRole(actorRole);
  const currentTarget = normalizeRole(currentTargetRole);
  const requestedTarget = normalizeRole(requestedTargetRole);

  if (actorUid === targetUid) return actor === requestedTarget;
  return canManageRole(actor, currentTarget) && canManageRole(actor, requestedTarget);
}

module.exports = { ROLES, normalizeRole, canManageRole, canManageUser };
