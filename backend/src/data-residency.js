const ALLOWED_REGIONS = new Set(["IN", "EU", "US", "UK", "APAC"]);

function getResidencyPolicy() {
  const region = String(process.env.SMARTCONTROL_DATA_REGION || "").trim().toUpperCase();
  const production = process.env.NODE_ENV === "production";
  const configured = ALLOWED_REGIONS.has(region);
  return {
    configured,
    region: configured ? region : null,
    production,
    failClosed: production && !configured,
    supportedRegions: [...ALLOWED_REGIONS]
  };
}

function assertResidencyPolicy() {
  const policy = getResidencyPolicy();
  if (policy.failClosed) {
    throw new Error("SMARTCONTROL_DATA_REGION must be configured to a supported residency region in production.");
  }
  return policy;
}

module.exports = { ALLOWED_REGIONS, getResidencyPolicy, assertResidencyPolicy };
