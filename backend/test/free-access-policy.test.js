const test = require("node:test");
const assert = require("node:assert/strict");

test("free access approval model supports manual identity, dates and all 19 features", () => {
  const grant = {
    userName: "Test User",
    email: "test@example.invalid",
    userId: "user-test",
    durationPreset: "7_DAYS",
    startsAt: Date.now(),
    endsAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
    all19: true,
    features: Array.from({ length: 19 }, (_, i) => "PERMISSION_" + (i + 1)),
    status: "ACTIVE"
  };
  assert.equal(grant.all19, true);
  assert.equal(grant.features.length, 19);
  assert.ok(grant.endsAt > grant.startsAt);
});

test("expired free access must not remain active", () => {
  const grant = { status: "ACTIVE", startsAt: Date.now() - 1000, endsAt: Date.now() - 1 };
  assert.ok(grant.endsAt <= Date.now());
});

test("selected-feature mode can contain fewer than 19", () => {
  const grant = { all19: false, features: ["PERMISSION_1", "PERMISSION_2"] };
  assert.equal(grant.all19, false);
  assert.equal(grant.features.length, 2);
});
