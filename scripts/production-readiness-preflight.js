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
  "FIREBASE_SERVICE_ACCOUNT_JSON",
  "SMARTCONTROL_GATEWAY_ENCRYPTION_KEY",
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
  "SMARTCONTROL_AUDIT_CONTRACT_ADDRESS"
];

const missingPaths = requiredPaths.filter((p) => !fs.existsSync(path.join(root, p)));
const missingEnv = requiredEnv.filter((name) => !String(process.env[name] || "").trim());

// Android Firebase configuration may be supplied as a CI secret or as the
// checked-in client config. It is client configuration, not a server secret;
// validate its shape instead of incorrectly requiring the secret env var.
const androidConfigText = String(process.env.FIREBASE_GOOGLE_SERVICES_JSON || "").trim()
  || (() => {
    const file = path.join(root, "app/google-services.json");
    return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  })();

let androidFirebaseConfigValid = false;
try {
  const config = JSON.parse(androidConfigText);
  const projectId = config?.project_info?.project_id;
  const matchingClient = (config?.client || []).some((client) =>
    client?.client_info?.android_client_info?.package_name === "com.smart.control"
    && Boolean(client?.client_info?.mobilesdk_app_id)
    && (client?.api_key || []).some((key) => Boolean(key?.current_key))
  );
  androidFirebaseConfigValid = Boolean(projectId && matchingClient);
} catch (_) {
  androidFirebaseConfigValid = false;
}

console.log("SMARTCONTROL production readiness preflight");
console.log("Required implementation surfaces:", requiredPaths.length);
console.log("Missing implementation surfaces:", missingPaths.length);
if (missingPaths.length) {
  for (const item of missingPaths) console.log("MISSING_PATH=" + item);
}

const missingConfigurationCount = missingEnv.length + (androidFirebaseConfigValid ? 0 : 1);
console.log("Required production configuration:", requiredEnv.length + 1);
console.log("Missing production configuration:", missingConfigurationCount);
if (missingEnv.length) {
  for (const item of missingEnv) console.log("MISSING_ENV=" + item);
}
if (!androidFirebaseConfigValid) {
  console.log("MISSING_CONFIG=FIREBASE_ANDROID_CONFIG (valid JSON for package com.smart.control required)");
} else {
  console.log("PASS_CONFIG=FIREBASE_ANDROID_CONFIG");
}

if (missingPaths.length || missingConfigurationCount) {
  console.error("PRODUCTION_READINESS=BLOCKED");
  process.exit(1);
}

console.log("PRODUCTION_READINESS=CONFIGURED");
