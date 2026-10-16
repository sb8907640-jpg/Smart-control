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
  "CORS_ORIGIN",
  "PUBLIC_APP_URL",
  "SMARTCONTROL_DATA_REGION",
  "NEXT_PUBLIC_FIREBASE_API_KEY",
  "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
  "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
  "NEXT_PUBLIC_FIREBASE_APP_ID",
  "NEXT_PUBLIC_SMARTCONTROL_API_BASE_URL",
  "SMARTCONTROL_WEB_URL",
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

// Firebase Android client configuration is public app configuration, not a
// server credential. Accept either a securely supplied JSON value or the
// repository's validated google-services.json instead of requiring both.
const firebaseConfigErrors = [];
let firebaseConfig = null;
const firebaseConfigRaw = String(process.env.FIREBASE_GOOGLE_SERVICES_JSON || "").trim();
try {
  const configPath = path.join(root, "app/google-services.json");
  if (firebaseConfigRaw) {
    firebaseConfig = JSON.parse(firebaseConfigRaw);
  } else if (fs.existsSync(configPath)) {
    firebaseConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));
  }
} catch (_) {
  firebaseConfigErrors.push("Firebase Android configuration is not valid JSON.");
}
if (!firebaseConfig) {
  firebaseConfigErrors.push("Firebase Android configuration is missing.");
} else {
  const projectId = firebaseConfig.project_info?.project_id;
  const clients = Array.isArray(firebaseConfig.client) ? firebaseConfig.client : [];
  if (typeof projectId !== "string" || !projectId.trim() || /example|placeholder|dummy/i.test(projectId)) {
    firebaseConfigErrors.push("Firebase Android project ID is missing or appears to be a placeholder.");
  }
  if (!clients.some((client) => client.client_info?.android_client_info?.package_name === "com.smart.control")) {
    firebaseConfigErrors.push("Firebase Android configuration does not contain package com.smart.control.");
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
console.log("Firebase Android configuration:", firebaseConfigErrors.length ? "INVALID" : "VALID");
for (const item of firebaseConfigErrors) console.log("FIREBASE_CONFIG_ERROR=" + item);

if (missingPaths.length || missingEnv.length || firebaseConfigErrors.length) {
  console.error("PRODUCTION_READINESS=BLOCKED");
  process.exit(1);
}

console.log("PRODUCTION_READINESS=CONFIGURED");
