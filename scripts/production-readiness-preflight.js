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
  "DATABASE_URL",
  "CORS_ORIGIN",
  "SMARTCONTROL_GATEWAY_ENCRYPTION_KEY",
  "PUBLIC_APP_URL",
  "SMARTCONTROL_WEB_URL",
  "NEXT_PUBLIC_FIREBASE_API_KEY",
  "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
  "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
  "NEXT_PUBLIC_FIREBASE_APP_ID",
  "NEXT_PUBLIC_SMARTCONTROL_API_BASE_URL",
  "SMARTCONTROL_GOOGLE_WEB_CLIENT_ID",
  "SMARTCONTROL_TURN_URLS",
  "SMARTCONTROL_TURN_CREDENTIAL",
  "SMARTCONTROL_IOS_FIREBASE_CONFIG",
  "SMARTCONTROL_AUDIT_RPC_URL",
  "SMARTCONTROL_AUDIT_PRIVATE_KEY",
  "SMARTCONTROL_AUDIT_CONTRACT_ADDRESS",
  "ANDROID_RELEASE_KEYSTORE_BASE64",
  "ANDROID_RELEASE_STORE_PASSWORD",
  "ANDROID_RELEASE_KEY_ALIAS",
  "ANDROID_RELEASE_KEY_PASSWORD"
];

const missingPaths = requiredPaths.filter((p) => !fs.existsSync(path.join(root, p)));
const missingEnv = requiredEnv.filter((name) => !String(process.env[name] || "").trim());
const firebaseConfigPath = path.join(root, "app/google-services.json");
const firebaseConfigSecret = String(process.env.FIREBASE_GOOGLE_SERVICES_JSON || "").trim();
let firebaseConfigValid = fs.existsSync(firebaseConfigPath);
if (firebaseConfigSecret) {
  try {
    const parsed = JSON.parse(firebaseConfigSecret);
    firebaseConfigValid = parsed && Array.isArray(parsed.client) && parsed.client.length > 0 &&
      parsed.client.some((client) => client.client_info?.android_client_info?.package_name === "com.smart.control");
  } catch (_) {
    firebaseConfigValid = false;
  }
}
if (firebaseConfigValid && fs.existsSync(firebaseConfigPath)) {
  try {
    const parsed = JSON.parse(fs.readFileSync(firebaseConfigPath, "utf8"));
    firebaseConfigValid = parsed && Array.isArray(parsed.client) && parsed.client.length > 0 &&
      parsed.client.some((client) => client.client_info?.android_client_info?.package_name === "com.smart.control");
  } catch (_) {
    firebaseConfigValid = false;
  }
}

console.log("SMARTCONTROL production readiness preflight");
console.log("Required implementation surfaces:", requiredPaths.length);
console.log("Missing implementation surfaces:", missingPaths.length);
if (missingPaths.length) {
  for (const item of missingPaths) console.log("MISSING_PATH=" + item);
}

console.log("Required production configuration:", requiredEnv.length + 1);
console.log("Android Firebase config valid:", firebaseConfigValid);
if (!firebaseConfigValid) console.log("MISSING_OR_INVALID_CONFIG=app/google-services.json or FIREBASE_GOOGLE_SERVICES_JSON for com.smart.control");
console.log("Missing production configuration:", missingEnv.length);
if (missingEnv.length) {
  for (const item of missingEnv) console.log("MISSING_ENV=" + item);
}

if (missingPaths.length || missingEnv.length || !firebaseConfigValid) {
  console.error("PRODUCTION_READINESS=BLOCKED");
  process.exit(1);
}

console.log("PRODUCTION_READINESS=CONFIGURED");
