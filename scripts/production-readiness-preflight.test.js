const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const baseEnv = {
  ...process.env,
  SMARTCONTROL_DATA_REGION: "IN",
  DATABASE_URL: "postgresql://user:password@example.test:5432/app",
  CORS_ORIGIN: "https://app.example.test",
  SMARTCONTROL_GATEWAY_ENCRYPTION_KEY: Buffer.alloc(32).toString("base64"),
  PUBLIC_APP_URL: "https://app.example.test",
  SMARTCONTROL_WEB_URL: "https://app.example.test",
  NEXT_PUBLIC_FIREBASE_API_KEY: "A".repeat(30),
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "smartcontrol-prod.firebaseapp.com",
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: "smartcontrol-prod",
  NEXT_PUBLIC_FIREBASE_APP_ID: "1:1234567890:web:abcdef",
  NEXT_PUBLIC_SMARTCONTROL_API_BASE_URL: "https://api.example.test",
  SMARTCONTROL_GOOGLE_WEB_CLIENT_ID: "1234567890-example.apps.googleusercontent.com",
  SMARTCONTROL_TURN_URLS: "turns:turn.example.test:5349,stun:stun.example.test:3478",
  SMARTCONTROL_TURN_USERNAME: "ephemeral-user",
  SMARTCONTROL_TURN_CREDENTIAL: "ephemeral-password",
  SMARTCONTROL_IOS_FIREBASE_CONFIG: JSON.stringify({ projectId: "smartcontrol-prod", appId: "1:1234567890:ios:abcdef", apiKey: "ios-api-key" }),
  SMARTCONTROL_AUDIT_RPC_URL: "https://rpc.example.test",
  SMARTCONTROL_AUDIT_PRIVATE_KEY: Array.from({ length: 64 }, (_, i) => String(i % 10)).join(""),
  SMARTCONTROL_AUDIT_CONTRACT_ADDRESS: "0x" + "a".repeat(40),
  ANDROID_RELEASE_KEYSTORE_BASE64: Buffer.from("test-keystore-placeholder").toString("base64"),
  ANDROID_RELEASE_STORE_PASSWORD: "test-store-password",
  ANDROID_RELEASE_KEY_ALIAS: "test-key-alias",
  ANDROID_RELEASE_KEY_PASSWORD: "test-key-password",
  FIREBASE_GOOGLE_SERVICES_JSON: JSON.stringify({
    project_info: { project_id: "smartcontrol-prod" },
    client: [{
      client_info: {
        mobilesdk_app_id: "1:1234567890:android:abcdef",
        android_client_info: { package_name: "com.smart.control" }
      },
      api_key: [{ current_key: "android-api-key" }]
    }]
  })
};

function run(overrides = {}) {
  return spawnSync(process.execPath, [path.join(__dirname, "production-readiness-preflight.js")], {
    cwd: root,
    env: { ...baseEnv, ...overrides },
    encoding: "utf8"
  });
}

const valid = run();
assert.equal(valid.status, 0, "Expected valid configuration to pass.\n" + valid.stdout + "\n" + valid.stderr);
assert.match(valid.stdout, /PRODUCTION_READINESS=CONFIGURED/);

const missingTurnUser = run({ SMARTCONTROL_TURN_USERNAME: "" });
assert.notEqual(missingTurnUser.status, 0, "Missing TURN username must block production readiness.");
assert.match(missingTurnUser.stdout, /MISSING_ENV=SMARTCONTROL_TURN_USERNAME/);

const stunOnly = run({ SMARTCONTROL_TURN_URLS: "stun:stun.example.test:3478" });
assert.notEqual(stunOnly.status, 0, "STUN-only config must not pass production readiness.");
assert.match(stunOnly.stdout, /INVALID_CONFIG=SMARTCONTROL_TURN_URLS/);

const malformedKey = run({ SMARTCONTROL_GATEWAY_ENCRYPTION_KEY: "not-a-32-byte-key" });
assert.notEqual(malformedKey.status, 0, "Invalid gateway encryption key must block readiness.");
assert.match(malformedKey.stdout, /INVALID_CONFIG=SMARTCONTROL_GATEWAY_ENCRYPTION_KEY/);

const malformedIos = run({ SMARTCONTROL_IOS_FIREBASE_CONFIG: "{bad-json" });
assert.notEqual(malformedIos.status, 0, "Malformed iOS Firebase config must block readiness.");
assert.match(malformedIos.stdout, /INVALID_CONFIG=SMARTCONTROL_IOS_FIREBASE_CONFIG/);

console.log("Production readiness preflight tests passed (valid config, missing TURN username, STUN-only, invalid encryption key, malformed iOS Firebase JSON).");
