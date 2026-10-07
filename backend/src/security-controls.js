const crypto = require("node:crypto");

const ALGORITHM = "aes-256-gcm";
const KEY_BYTES = 32;
const IV_BYTES = 12;

function getEncryptionKey(env = process.env) {
  const raw = String(env.DATA_ENCRYPTION_KEY || "");
  if (!raw) throw new Error("DATA_ENCRYPTION_KEY is required.");
  const key = Buffer.from(raw, "base64");
  if (key.length !== KEY_BYTES) throw new Error("DATA_ENCRYPTION_KEY must be a base64-encoded 32-byte key.");
  return key;
}

function encryptAes256Gcm(value, env = process.env) {
  const key = getEncryptionKey(env);
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(String(value), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { algorithm: "AES-256-GCM", iv: iv.toString("base64"), ciphertext: ciphertext.toString("base64"), tag: tag.toString("base64") };
}

function decryptAes256Gcm(payload, env = process.env) {
  if (!payload || payload.algorithm !== "AES-256-GCM") throw new Error("Unsupported encrypted payload.");
  const key = getEncryptionKey(env);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(payload.iv, "base64"));
  decipher.setAuthTag(Buffer.from(payload.tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(payload.ciphertext, "base64")), decipher.final()]).toString("utf8");
}

function securityControlPolicy() {
  return {
    encryption: "AES-256-GCM",
    authentication: ["Google", "Mobile OTP", "2FA/MFA when required by deployment policy"],
    consentLog: true, activityLog: true, liveIndicator: true, userStop: true,
    accessNotification: true, userDataDeletion: true,
    legalCompliance: ["GDPR", "IT Act 2000", "DPDP Act 2023"],
    persistentLink: "until user disconnects, app/OS reset, or pairing state is reset",
    bootPersistence: "explicit user opt-in only",
    watchdog: "best-effort; never bypasses OS restrictions or permission controls",
    emergency: "approved-session emergency authorization; never silently grants protected OS permissions"
  };
}

module.exports = { encryptAes256Gcm, decryptAes256Gcm, securityControlPolicy };
