const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const checks = [
  ["Android", "app/src/main/AndroidManifest.xml"],
  ["iOS", "ios/SmartControl/SmartControlApp.swift"],
  ["Web", "web/app/page.tsx"],
  ["Electron", "desktop/src/main.js"],
  ["Node backend", "backend/src/server.js"],
  ["Firebase Functions", "functions/index.js"],
  ["Blockchain contract", "contracts/AuditAnchor.sol"]
];

const missing = checks.filter(([, file]) => !fs.existsSync(path.join(root, file)));
for (const [name, file] of checks) {
  console.log((missing.some(([n]) => n === name) ? "MISSING " : "OK ") + name + " :: " + file);
}

const backend = fs.readFileSync(path.join(root, "backend/src/app.js"), "utf8");
const server = fs.readFileSync(path.join(root, "backend/src/server.js"), "utf8");
const web = fs.readFileSync(path.join(root, "web/app/page.tsx"), "utf8");
const ios = fs.readFileSync(path.join(root, "ios/SmartControl/SmartControlApp.swift"), "utf8");
const androidManifest = fs.readFileSync(path.join(root, "app/src/main/AndroidManifest.xml"), "utf8");
const androidWifi = fs.readFileSync(path.join(root, "app/src/main/java/com/smartcontrol/data/offline/WifiDirectTransport.kt"), "utf8");
const androidBluetooth = fs.readFileSync(path.join(root, "app/src/main/java/com/smartcontrol/data/offline/BluetoothOfflineTransport.kt"), "utf8");
const webPackage = fs.readFileSync(path.join(root, "web/package.json"), "utf8");
const migrations = fs.readdirSync(path.join(root, "backend/migrations"));

const interfaceChecks = [
  ["backend health endpoint", /\/healthz/.test(backend)],
  ["backend device endpoint", /\/api\/devices/.test(backend)],
  ["socket session authorization", /session:join/.test(server)],
  ["web backend session integration", /api\/auth\/session/.test(web)],
  ["iOS backend integration", /URLSession|apiBaseURL|backend/i.test(ios)],
  ["Android FCM service registered", /SmartControlMessagingService|firebase.MESSAGING_EVENT/.test(androidManifest)],
  ["Android Wi-Fi Direct connect", /manager\.connect/.test(androidWifi)],
  ["Android Bluetooth RFCOMM", /listenUsingRfcommWithServiceRecord|createRfcommSocketToServiceRecord/.test(androidBluetooth)],
  ["Web Google and OTP auth dependencies", /firebase/.test(webPackage) && /RecaptchaVerifier|signInWithPhoneNumber/.test(web)],
  ["PostgreSQL group capacity migration", migrations.includes("002_group_pairing.sql") && migrations.includes("003_group_capacity.sql")],
  ["FCM backend registration", /api\/notifications\/register/.test(backend)],
  ["Remote Config backend", /api\/config/.test(backend)],
  ["Residency policy enforcement", /getResidencyPolicy\(\)/.test(backend) && /residency/.test(backend)]
];

for (const [name, ok] of interfaceChecks) console.log((ok ? "OK " : "MISSING ") + name);
const failed = missing.length || interfaceChecks.some(([, ok]) => !ok);
if (failed) {
  console.error("CROSS_PLATFORM_INTEGRATION=FAILED");
  process.exit(1);
}
console.log("CROSS_PLATFORM_INTEGRATION=STATIC_CONTRACTS_OK");
