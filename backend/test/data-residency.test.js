const test = require("node:test");
const assert = require("node:assert/strict");
const { ALLOWED_REGIONS, getResidencyPolicy } = require("../src/data-residency");

test("residency policy accepts supported regions", () => {
  const previousRegion = process.env.SMARTCONTROL_DATA_REGION;
  const previousNodeEnv = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = "production";
    for (const region of ALLOWED_REGIONS) {
      process.env.SMARTCONTROL_DATA_REGION = region;
      const policy = getResidencyPolicy();
      assert.equal(policy.configured, true);
      assert.equal(policy.region, region);
      assert.equal(policy.failClosed, false);
    }
  } finally {
    if (previousRegion === undefined) delete process.env.SMARTCONTROL_DATA_REGION;
    else process.env.SMARTCONTROL_DATA_REGION = previousRegion;
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
  }
});

test("production residency policy fails closed when region is missing or unsupported", () => {
  const previousRegion = process.env.SMARTCONTROL_DATA_REGION;
  const previousNodeEnv = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = "production";
    delete process.env.SMARTCONTROL_DATA_REGION;
    assert.equal(getResidencyPolicy().failClosed, true);
    process.env.SMARTCONTROL_DATA_REGION = "INVALID";
    const policy = getResidencyPolicy();
    assert.equal(policy.configured, false);
    assert.equal(policy.region, null);
    assert.equal(policy.failClosed, true);
  } finally {
    if (previousRegion === undefined) delete process.env.SMARTCONTROL_DATA_REGION;
    else process.env.SMARTCONTROL_DATA_REGION = previousRegion;
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
  }
});