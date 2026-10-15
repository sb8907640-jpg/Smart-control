const test = require("node:test");
const assert = require("node:assert/strict");
const { mediaCapabilitiesAllowed } = require("./media-policy");

const enabledPolicy = {
  globalFeaturesEnabled: true,
  globalEnabled: true,
  featureOverrides: {},
  globalFeatureOverrides: {}
};

test("media policy allows only known capabilities when global policy is enabled", () => {
  assert.equal(mediaCapabilitiesAllowed(["CAMERA", "MICROPHONE"], enabledPolicy), true);
  assert.equal(mediaCapabilitiesAllowed(["REMOTE_INPUT"], enabledPolicy), false);
  assert.equal(mediaCapabilitiesAllowed([], enabledPolicy), false);
});

test("media policy fails closed when global policy is missing or disabled", () => {
  assert.equal(mediaCapabilitiesAllowed(["CAMERA"], null), false);
  assert.equal(mediaCapabilitiesAllowed(["CAMERA"], { ...enabledPolicy, globalEnabled: false }), false);
  assert.equal(mediaCapabilitiesAllowed(["CAMERA"], { ...enabledPolicy, globalFeaturesEnabled: false }), false);
});

test("media policy honors global and per-user feature overrides and expiry", () => {
  assert.equal(mediaCapabilitiesAllowed(["CAMERA"], { ...enabledPolicy, featureOverrides: { CAMERA: false } }), false);
  assert.equal(mediaCapabilitiesAllowed(["CAMERA"], { ...enabledPolicy, globalFeatureOverrides: { CAMERA: false } }), false);
  assert.equal(mediaCapabilitiesAllowed(["CAMERA"], enabledPolicy, { enabled: false }), false);
  assert.equal(mediaCapabilitiesAllowed(["CAMERA"], enabledPolicy, { ownerEnabled: false }), false);
  assert.equal(mediaCapabilitiesAllowed(["CAMERA"], enabledPolicy, { expiresAtEpochMs: 999 }, 1000), false);
  assert.equal(mediaCapabilitiesAllowed(["CAMERA"], enabledPolicy, { featureOverrides: { CAMERA: false } }), false);
});
