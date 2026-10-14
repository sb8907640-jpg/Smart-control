const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const requiredPaths = [
  "app/src/main/AndroidManifest.xml",
  "ios/SmartControl/SmartControlApp.swift",
  "web/app/page.tsx",
  "desktop/package.json",
  "backend/src/server.js",
  "backend/src/app.js",
  "functions/index.js",
  "contracts/AuditAnchor.sol"
];
const requiredEnv = [
  "SMARTCONTROL_DATA_REGION", "DATABASE_URL", "CORS_ORIGIN",
  "SMARTCONTROL_GATEWAY_ENCRYPTION_KEY", "PUBLIC_APP_URL", "SMARTCONTROL_WEB_URL",
  "NEXT_PUBLIC_FIREBASE_API_KEY", "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
  "NEXT_PUBLIC_FIREBASE_PROJECT_ID", "NEXT_PUBLIC_FIREBASE_APP_ID",
  "NEXT_PUBLIC_SMARTCONTROL_API_BASE_URL", "SMARTCONTROL_GOOGLE_WEB_CLIENT_ID",
  "SMARTCONTROL_TURN_URLS", "SMARTCONTROL_TURN_USERNAME", "SMARTCONTROL_TURN_CREDENTIAL",
  "SMARTCONTROL_IOS_FIREBASE_CONFIG", "SMARTCONTROL_AUDIT_RPC_URL",
  "SMARTCONTROL_AUDIT_PRIVATE_KEY", "SMARTCONTROL_AUDIT_CONTRACT_ADDRESS"
];
const missingPaths = requiredPaths.filter((p) => !fs.existsSync(path.join(root, p)));
const missingEnv = requiredEnv.filter((name) => !String(process.env[name] || "").trim());
const invalidConfig = [];
const value = (name) => String(process.env[name] || "").trim();
const validUrl = (raw, protocols = ["https:"]) => {
  try {
    const url = new URL(raw);
    return protocols.includes(url.protocol) && Boolean(url.hostname);
  } catch (_) { return false; }
};
const validFirebaseWeb = () =>
  value("NEXT_PUBLIC_FIREBASE_API_KEY").length >= 20 &&
  value("NEXT_PUBLIC_FIREBASE_PROJECT_ID").length > 0 &&
  value("NEXT_PUBLIC_FIREBASE_APP_ID").includes(":");
const validEncryptionKey = () => {
  const raw = value("SMARTCONTROL_GATEWAY_ENCRYPTION_KEY");
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return true;
  try { return Buffer.from(raw, "base64").length === 32; } catch (_) { return false; }
};
const validTurnUrls = () => value("SMARTCONTROL_TURN_URLS").split(",").every((entry) =>
  /^(turns?|stun):[^\s,]+$/i.test(entry.trim())
);
const validAuditPrivateKey = () => /^(0x)?[0-9a-fA-F]{64}$/.test(value("SMARTCONTROL_AUDIT_PRIVATE_KEY"));
const validEthereumAddress = () => /^0x[0-9a-fA-F]{40}$/.test(value("SMARTCONTROL_AUDIT_CONTRACT_ADDRESS"));

const region = value("SMARTCONTROL_DATA_REGION").toUpperCase();
if (region && !["IN", "EU", "US", "UK", "APAC"].includes(region)) invalidConfig.push("SMARTCONTROL_DATA_REGION");
if (value("DATABASE_URL") && !/^postgres(?:ql)?:\/\//i.test(value("DATABASE_URL"))) invalidConfig.push("DATABASE_URL");
if (value("CORS_ORIGIN") && !value("CORS_ORIGIN").split(",").every((origin) => validUrl(origin.trim(), ["https:", "http:"]))) invalidConfig.push("CORS_ORIGIN");
if (value("PUBLIC_APP_URL") && !validUrl(value("PUBLIC_APP_URL"))) invalidConfig.push("PUBLIC_APP_URL");
if (value("SMARTCONTROL_WEB_URL") && !validUrl(value("SMARTCONTROL_WEB_URL"))) invalidConfig.push("SMARTCONTROL_WEB_URL");
if (value("NEXT_PUBLIC_SMARTCONTROL_API_BASE_URL") && !validUrl(value("NEXT_PUBLIC_SMARTCONTROL_API_BASE_URL"))) invalidConfig.push("NEXT_PUBLIC_SMARTCONTROL_API_BASE_URL");
if (value("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN") && !/^[a-zA-Z0-9.-]+$/.test(value("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN"))) invalidConfig.push("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN");
if (value("NEXT_PUBLIC_FIREBASE_PROJECT_ID") && !/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(value("NEXT_PUBLIC_FIREBASE_PROJECT_ID"))) invalidConfig.push("NEXT_PUBLIC_FIREBASE_PROJECT_ID");
if (value("NEXT_PUBLIC_FIREBASE_API_KEY") && !validFirebaseWeb()) invalidConfig.push("NEXT_PUBLIC_FIREBASE_API_KEY/NEXT_PUBLIC_FIREBASE_APP_ID");
if (value("SMARTCONTROL_GATEWAY_ENCRYPTION_KEY") && !validEncryptionKey()) invalidConfig.push("SMARTCONTROL_GATEWAY_ENCRYPTION_KEY");
if (value("SMARTCONTROL_TURN_URLS") && !validTurnUrls()) invalidConfig.push("SMARTCONTROL_TURN_URLS");
if (value("SMARTCONTROL_TURN_URLS") && !/(^|,)\s*turns?:/i.test(value("SMARTCONTROL_TURN_URLS"))) {
  invalidConfig.push("SMARTCONTROL_TURN_URLS (at least one TURN endpoint is required; STUN-only is not production-ready)");
}
if (value("SMARTCONTROL_IOS_FIREBASE_CONFIG")) {
  try {
    const ios = JSON.parse(value("SMARTCONTROL_IOS_FIREBASE_CONFIG"));
    if (!ios.projectId || !ios.appId || !ios.apiKey) invalidConfig.push("SMARTCONTROL_IOS_FIREBASE_CONFIG");
  } catch (_) { invalidConfig.push("SMARTCONTROL_IOS_FIREBASE_CONFIG"); }
}
if (value("SMARTCONTROL_AUDIT_RPC_URL") && !validUrl(value("SMARTCONTROL_AUDIT_RPC_URL"), ["https:", "http:"])) invalidConfig.push("SMARTCONTROL_AUDIT_RPC_URL");
if (value("SMARTCONTROL_AUDIT_PRIVATE_KEY") && !validAuditPrivateKey()) invalidConfig.push("SMARTCONTROL_AUDIT_PRIVATE_KEY");
if (value("SMARTCONTROL_AUDIT_CONTRACT_ADDRESS") && !validEthereumAddress()) invalidConfig.push("SMARTCONTROL_AUDIT_CONTRACT_ADDRESS");

// Android Firebase configuration is client config, not a server secret.
const androidConfigText = value("FIREBASE_GOOGLE_SERVICES_JSON") || (() => {
  const file = path.join(root, "app/google-services.json");
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
})();
let androidFirebaseConfigValid = false;
try {
  const config = JSON.parse(androidConfigText);
  androidFirebaseConfigValid = Boolean(config?.project_info?.project_id && (config?.client || []).some((client) =>
    client?.client_info?.android_client_info?.package_name === "com.smart.control" &&
    Boolean(client?.client_info?.mobilesdk_app_id) &&
    (client?.api_key || []).some((key) => Boolean(key?.current_key))
  ));
} catch (_) { androidFirebaseConfigValid = false; }

console.log("SMARTCONTROL production readiness preflight");
console.log("Required implementation surfaces:", requiredPaths.length);
console.log("Missing implementation surfaces:", missingPaths.length);
for (const item of missingPaths) console.log("MISSING_PATH=" + item);
console.log("Required production configuration:", requiredEnv.length + 1);
console.log("Missing production configuration:", missingEnv.length + (androidFirebaseConfigValid ? 0 : 1));
for (const item of missingEnv) console.log("MISSING_ENV=" + item);
for (const item of invalidConfig) console.log("INVALID_CONFIG=" + item);
if (androidFirebaseConfigValid) console.log("PASS_CONFIG=FIREBASE_ANDROID_CONFIG");
else console.log("MISSING_CONFIG=FIREBASE_ANDROID_CONFIG (valid JSON for package com.smart.control required)");

if (missingPaths.length || missingEnv.length || invalidConfig.length || !androidFirebaseConfigValid) {
  console.error("PRODUCTION_READINESS=BLOCKED");
  process.exit(1);
}
console.log("PRODUCTION_READINESS=CONFIGURED");
