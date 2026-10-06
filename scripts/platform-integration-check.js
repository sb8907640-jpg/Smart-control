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

const interfaceChecks = [
  ["backend health endpoint", /\/healthz/.test(backend)],
  ["backend device endpoint", /\/api\/devices/.test(backend)],
  ["socket session authorization", /session:join/.test(server)],
  ["web backend session integration", /api\/auth\/session/.test(web)],
  ["iOS backend integration", /URLSession|apiBaseURL|backend/i.test(ios)]
];

for (const [name, ok] of interfaceChecks) console.log((ok ? "OK " : "MISSING ") + name);
const failed = missing.length || interfaceChecks.some(([, ok]) => !ok);
if (failed) {
  console.error("CROSS_PLATFORM_INTEGRATION=FAILED");
  process.exit(1);
}
console.log("CROSS_PLATFORM_INTEGRATION=STATIC_CONTRACTS_OK");
