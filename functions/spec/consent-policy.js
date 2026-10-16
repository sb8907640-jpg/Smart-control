const CURRENT_LEGAL_CONSENT_VERSION = 1;

function isCurrentConsentRecord(record, uid) {
  if (!record || typeof record !== "object" || typeof uid !== "string" || !uid) return false;
  return record.userId === uid &&
    typeof record.consentVersion === "number" &&
    Number.isInteger(record.consentVersion) &&
    record.consentVersion === CURRENT_LEGAL_CONSENT_VERSION &&
    record.deviceOwnerConsent === true &&
    record.privacyConsent === true &&
    record.eulaConsent === true;
}

module.exports = { CURRENT_LEGAL_CONSENT_VERSION, isCurrentConsentRecord };
