const CAPABILITY_TO_FEATURE = Object.freeze({
  CAMERA: "CAMERA",
  MICROPHONE: "MICROPHONE",
  SCREEN_SHARING: "SCREEN_SHARE"
});

function mediaCapabilitiesAllowed(capabilities, globalPolicy, userPolicy = null, now = Date.now()) {
  if (!Array.isArray(capabilities) || capabilities.length === 0 || !globalPolicy) return false;
  if (globalPolicy.globalFeaturesEnabled !== true || globalPolicy.globalEnabled !== true) return false;

  const globalOverrides = globalPolicy.featureOverrides || {};
  const globalFeatureOverrides = globalPolicy.globalFeatureOverrides || {};
  const userOverrides = userPolicy?.featureOverrides || {};
  if (userPolicy) {
    if (userPolicy.enabled === false || userPolicy.ownerEnabled === false) return false;
    const expiresAt = Number(userPolicy.expiresAtEpochMs || 0);
    if (expiresAt > 0 && expiresAt <= now) return false;
  }

  return capabilities.every(capability => {
    const feature = CAPABILITY_TO_FEATURE[String(capability || "")];
    if (!feature) return false;
    if (globalOverrides[feature] === false || globalFeatureOverrides[feature] === false) return false;
    return !userPolicy || userOverrides[feature] !== false;
  });
}

module.exports = { CAPABILITY_TO_FEATURE, mediaCapabilitiesAllowed };
