const { getOwnerAllowlist, isOwnerIdentity } = require("./owner-auth");

const allowlist = getOwnerAllowlist();
const emailCount = allowlist.emails.size;
const phoneCount = allowlist.phones.size;

if (emailCount !== 3 || phoneCount !== 2) {
  throw new Error("OWNER configuration must contain exactly 3 emails and 2 mobile numbers.");
}

const identities = [
  ...[...allowlist.emails].map(email => ({ email })),
  ...[...allowlist.phones].map(phone_number => ({ phone_number }))
];

if (!identities.every(identity => isOwnerIdentity(identity, allowlist))) {
  throw new Error("OWNER configuration self-verification failed.");
}

console.log("OWNER_CONFIG_VERIFY=PASS");
console.log("OWNER_EMAIL_COUNT=3");
console.log("OWNER_MOBILE_COUNT=2");
