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
  "SMARTCONTROL_DATA_REGION",
  "NEXT_PUBLIC_FIREBASE_API_KEY",
  "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
  "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
  "NEXT_PUBLIC_FIREBASE_APP_ID",
  "NEXT_PUBLIC_SMARTCONTROL_API_BASE_URL",
  "SMARTCONTROL_TERMS_URL",
  "SMARTCONTROL_PRIVACY_URL",
  "SMARTCONTROL_EULA_URL",
  "FIREBASE_GOOGLE_SERVICES_JSON",
  "SMARTCONTROL_GOOGLE_WEB_CLIENT_ID",
  "SMARTCONTROL_TURN_URLS",
  "SMARTCONTROL_TURN_CREDENTIAL",
  "SMARTCONTROL_IOS_FIREBASE_CONFIG",
  "SMARTCONTROL_AUDIT_RPC_URL",
  "SMARTCONTROL_AUDIT_PRIVATE_KEY",
  "SMARTCONTROL_AUDIT_CONTRACT_ADDRESS"
];

const missingPaths = requiredPaths.filter((p) => !fs.existsSync(path.join(root, p)));
const missingEnv = requiredEnv.filter((name) => !String(process.env[name] || "").trim());
const invalidEnv = [];
const httpsUrlKeys = [
  "NEXT_PUBLIC_SMARTCONTROL_API_BASE_URL",
  "SMARTCONTROL_TERMS_URL",
  "SMARTCONTROL_PRIVACY_URL",
  "SMARTCONTROL_EULA_URL",
  "SMARTCONTROL_AUDIT_RPC_URL"
];
for (const name of httpsUrlKeys) {
  if (missingEnv.includes(name)) continue;
  try {
    const parsed = new URL(process.env[name]);
    if (parsed.protocol !== "https:" || !parsed.hostname || parsed.username || parsed.password) invalidEnv.push(name);
  } catch (_) {
    invalidEnv.push(name);
  }
}
if (!missingEnv.includes("SMARTCONTROL_DATA_REGION") &&
    !["IN", "EU", "US", "UK", "APAC"].includes(String(process.env.SMARTCONTROL_DATA_REGION).trim().toUpperCase())) {
  invalidEnv.push("SMARTCONTROL_DATA_REGION");
}
if (!missingEnv.includes("SMARTCONTROL_AUDIT_CONTRACT_ADDRESS") &&
    !/^0x[0-9a-fA-F]{40}$/.test(String(process.env.SMARTCONTROL_AUDIT_CONTRACT_ADDRESS).trim())) {
  invalidEnv.push("SMARTCONTROL_AUDIT_CONTRACT_ADDRESS");
}
if (!missingEnv.includes("SMARTCONTROL_AUDIT_PRIVATE_KEY") &&
    !/^(0x)?[0-9a-fA-F]{64}$/.test(String(process.env.SMARTCONTROL_AUDIT_PRIVATE_KEY).trim())) {
  invalidEnv.push("SMARTCONTROL_AUDIT_PRIVATE_KEY");
}
if (!missingEnv.includes("SMARTCONTROL_GOOGLE_WEB_CLIENT_ID") &&
    !/^[0-9]+-[a-zA-Z0-9_-]+\.apps\.googleusercontent\.com$/.test(String(process.env.SMARTCONTROL_GOOGLE_WEB_CLIENT_ID).trim())) {
  invalidEnv.push("SMARTCONTROL_GOOGLE_WEB_CLIENT_ID");
}
if (!missingEnv.includes("FIREBASE_GOOGLE_SERVICES_JSON")) {
  try {
    const config = JSON.parse(process.env.FIREBASE_GOOGLE_SERVICES_JSON);
    if (!config.project_info?.project_id || !Array.isArray(config.client) || !config.client.some(item => item.client_info?.mobilesdk_app_id)) {
      invalidEnv.push("FIREBASE_GOOGLE_SERVICES_JSON");
    }
  } catch (_) {
    invalidEnv.push("FIREBASE_GOOGLE_SERVICES_JSON");
  }
}
if (!missingEnv.includes("SMARTCONTROL_IOS_FIREBASE_CONFIG")) {
  const plist = String(process.env.SMARTCONTROL_IOS_FIREBASE_CONFIG);
  if (!plist.includes("GOOGLE_APP_ID") || !plist.includes("PROJECT_ID") || !plist.includes("BUNDLE_ID")) {
    invalidEnv.push("SMARTCONTROL_IOS_FIREBASE_CONFIG");
  }
}

console.log("SMARTCONTROL production readiness preflight");
console.log("Required implementation surfaces:", requiredPaths.length);
console.log("Missing implementation surfaces:", missingPaths.length);
if (missingPaths.length) {
  for (const item of missingPaths) console.log("MISSING_PATH=" + item);
}

console.log("Required production configuration:", requiredEnv.length);
console.log("Missing production configuration:", missingEnv.length);
if (missingEnv.length) {
  for (const item of missingEnv) console.log("MISSING_ENV=" + item);
}
console.log("Invalid production configuration values:", invalidEnv.length);
if (invalidEnv.length) {
  for (const item of [...new Set(invalidEnv)]) console.log("INVALID_ENV=" + item);
}

if (missingPaths.length || missingEnv.length || invalidEnv.length) {
  console.error("PRODUCTION_READINESS=BLOCKED");
  process.exit(1);
}

console.log("PRODUCTION_READINESS=CONFIGURED");
