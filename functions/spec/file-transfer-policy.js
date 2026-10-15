function globalFileTransferEnabled(policy) {
  if (!policy || policy.globalFeaturesEnabled !== true || policy.globalEnabled !== true) return false;
  if (policy.featureOverrides?.FILE_TRANSFER === false) return false;
  if (policy.globalFeatureOverrides?.FILE_TRANSFER === false) return false;
  return true;
}

function userFileTransferEnabled(policy, now = Date.now()) {
  // An absent per-user policy means no additional override; global policy still applies.
  if (!policy) return true;
  if (policy.enabled === false || policy.ownerEnabled === false) return false;
  if (policy.featureOverrides?.FILE_TRANSFER === false) return false;
  if (policy.expiresAtEpochMs == null) return true;
  const expiresAt = Number(policy.expiresAtEpochMs);
  return Number.isFinite(expiresAt) && (expiresAt <= 0 || expiresAt > now);
}

module.exports = { globalFileTransferEnabled, userFileTransferEnabled };
