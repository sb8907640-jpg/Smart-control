const test = require("node:test");
const assert = require("node:assert/strict");
const { getPlanDuration, getLinkValidity, calculateExpiry } = require("../src/plan-policy");

test("plan duration is independent per plan", () => {
  const basic = getPlanDuration({ durationValue: 1, durationUnit: "MONTHS" });
  const standard = getPlanDuration({ durationValue: 2, durationUnit: "MONTHS" });
  assert.equal(basic.value, 1);
  assert.equal(standard.value, 2);
  assert.notEqual(basic.ms, standard.ms);
});

test("duration supports minutes hours days months", () => {
  assert.equal(getPlanDuration({ durationValue: 5, durationUnit: "MINUTES" }).ms, 5 * 60 * 1000);
  assert.equal(getPlanDuration({ durationValue: 2, durationUnit: "HOURS" }).ms, 2 * 60 * 60 * 1000);
  assert.equal(getPlanDuration({ durationValue: 3, durationUnit: "DAYS" }).ms, 3 * 24 * 60 * 60 * 1000);
  assert.equal(getPlanDuration({ durationValue: 1, durationUnit: "MONTHS" }).ms, 30 * 24 * 60 * 60 * 1000);
});

test("lifetime duration has no expiry", () => {
  const lifetime = getPlanDuration({ lifetime: true });
  assert.equal(lifetime.unit, "LIFETIME");
  assert.equal(lifetime.ms, null);
  assert.equal(calculateExpiry(Date.now(), lifetime), null);
});

test("device-link validity is separate from plan duration", () => {
  const plan = { durationValue: 12, durationUnit: "MONTHS", linkValidityValue: 15, linkValidityUnit: "MINUTES" };
  const duration = getPlanDuration(plan);
  const link = getLinkValidity(plan);
  assert.equal(duration.value, 12);
  assert.equal(duration.unit, "MONTHS");
  assert.equal(link.value, 15);
  assert.equal(link.unit, "MINUTES");
  assert.notEqual(duration.ms, link.ms);
});

test("invalid duration/link settings are rejected", () => {
  assert.equal(getPlanDuration({ durationValue: 0, durationUnit: "MONTHS" }), null);
  assert.equal(getLinkValidity({ linkValidityValue: -1, linkValidityUnit: "DAYS" }), null);
  assert.equal(getLinkValidity({ linkValidityValue: 1, linkValidityUnit: "MONTHS" }), null);
});
