const EMAIL_ENV = "OWNER_EMAILS";
const PHONE_ENV = "OWNER_MOBILE_NUMBERS";

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizePhone(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const digits = raw.replace(/[^0-9+]/g, "");
  if (digits.startsWith("+")) return "+" + digits.slice(1).replace(/\D/g, "");
  const compact = digits.replace(/\D/g, "");
  if (compact.startsWith("00")) return "+" + compact.slice(2);
  return compact;
}

function parseList(value, normalizer) {
  return new Set(
    String(value || "")
      .split(",")
      .map(normalizer)
      .filter(Boolean)
  );
}

function getOwnerAllowlist(env = process.env) {
  return {
    emails: parseList(env[EMAIL_ENV], normalizeEmail),
    phones: parseList(env[PHONE_ENV], normalizePhone)
  };
}

function isOwnerIdentity(user, allowlist = getOwnerAllowlist()) {
  const email = normalizeEmail(user?.email);
  const phone = normalizePhone(user?.phone_number || user?.phoneNumber);
  return (email && allowlist.emails.has(email)) || (phone && allowlist.phones.has(phone));
}

function applyOwnerRole(user, allowlist = getOwnerAllowlist()) {
  if (!user || typeof user !== "object") return user;
  if (!isOwnerIdentity(user, allowlist)) return user;
  return {
    ...user,
    role: "OWNER",
    admin: true,
    owner: true
  };
}

module.exports = {
  EMAIL_ENV,
  PHONE_ENV,
  normalizeEmail,
  normalizePhone,
  getOwnerAllowlist,
  isOwnerIdentity,
  applyOwnerRole
};
