const test = require("node:test");
const assert = require("node:assert/strict");
const { CURRENT_LEGAL_CONSENT_VERSION, isCurrentConsentRecord } = require("./consent-policy");

const validReceipt = {
  userId: "user-1",
  consentVersion: CURRENT_LEGAL_CONSENT_VERSION,
  deviceOwnerConsent: true,
  privacyConsent: true,
  eulaConsent: true
};

test("accepts the current complete consent receipt for the exact user", () => {
  assert.equal(isCurrentConsentRecord(validReceipt, "user-1"), true);
});

test("rejects missing, outdated, malformed, or cross-user consent receipts", () => {
  assert.equal(isCurrentConsentRecord(null, "user-1"), false);
  assert.equal(isCurrentConsentRecord({ ...validReceipt, consentVersion: 0 }, "user-1"), false);
  assert.equal(isCurrentConsentRecord({ ...validReceipt, consentVersion: "not-a-version" }, "user-1"), false);
  assert.equal(isCurrentConsentRecord({ ...validReceipt, consentVersion: "1" }, "user-1"), false);
  assert.equal(isCurrentConsentRecord({ ...validReceipt, consentVersion: true }, "user-1"), false);
  assert.equal(isCurrentConsentRecord(validReceipt, "other-user"), false);
});

test("rejects any receipt missing a required acknowledgement", () => {
  for (const field of ["deviceOwnerConsent", "privacyConsent", "eulaConsent"]) {
    assert.equal(isCurrentConsentRecord({ ...validReceipt, [field]: false }, "user-1"), false);
  }
});
