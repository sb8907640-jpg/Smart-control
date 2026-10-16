const test = require("node:test");
const assert = require("node:assert/strict");
const {
  globalFileTransferEnabled,
  userFileTransferEnabled
} = require("./file-transfer-policy");

const enabledGlobal = {
  globalFeaturesEnabled: true,
  globalEnabled: true,
  featureOverrides: {},
  globalFeatureOverrides: {}
};

test("global file-transfer policy fails closed when missing or disabled", () => {
  assert.equal(globalFileTransferEnabled(null), false);
  assert.equal(globalFileTransferEnabled({ ...enabledGlobal, globalEnabled: false }), false);
  assert.equal(globalFileTransferEnabled({ ...enabledGlobal, globalFeaturesEnabled: false }), false);
  assert.equal(globalFileTransferEnabled({ ...enabledGlobal, featureOverrides: { FILE_TRANSFER: false } }), false);
  assert.equal(globalFileTransferEnabled({ ...enabledGlobal, globalFeatureOverrides: { FILE_TRANSFER: false } }), false);
  assert.equal(globalFileTransferEnabled(enabledGlobal), true);
});

test("per-user file-transfer policy honors access, overrides, and expiry", () => {
  assert.equal(userFileTransferEnabled(null), true);
  assert.equal(userFileTransferEnabled({}), true);
  assert.equal(userFileTransferEnabled({ enabled: false }), false);
  assert.equal(userFileTransferEnabled({ ownerEnabled: false }), false);
  assert.equal(userFileTransferEnabled({ featureOverrides: { FILE_TRANSFER: false } }), false);
  assert.equal(userFileTransferEnabled({ expiresAtEpochMs: 999 }, 1000), false);
  assert.equal(userFileTransferEnabled({ expiresAtEpochMs: "invalid" }, 1000), false);
  assert.equal(userFileTransferEnabled({ expiresAtEpochMs: 2000 }, 1000), true);
});
