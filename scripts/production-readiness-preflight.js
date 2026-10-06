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
  "FIREBASE_GOOGLE_SERVICES_JSON",
  "SMARTCONTROL_GOOGLE_WEB_CLIENT_ID",
  "SMARTCONTROL_TURN_URLS",
  "SMARTCONTROL_TURN_USERNAME",
  "SMARTCONTROL_TURN_CREDENTIAL",
  "SMARTCONTROL_IOS_FIREBASE_CONFIG",
  "SMARTCONTROL_AUDIT_RPC_URL",
  "SMARTCONTROL_AUDIT_PRIVATE_KEY",
  "SMARTCONTROL_AUDIT_CONTRACT_ADDRESS"
];

const missingPaths = requiredPaths.filter((p) => !fs.existsSync(path.join(root, p)));
const missingEnv = requiredEnv.filter((name) => !String(process.env[name] || "").trim());

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

if (missingPaths.length || missingEnv.length) {
  console.error("PRODUCTION_READINESS=BLOCKED");
  process.exit(1);
}

console.log("PRODUCTION_READINESS=CONFIGURED");
