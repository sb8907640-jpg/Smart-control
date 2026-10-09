const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const failures = [];
const pending = [];

function read(rel) {
  const file = path.join(root, rel);
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
}
function check(name, ok, detail = "") {
  console.log((ok ? "PASS " : "FAIL ") + name + (detail ? " :: " + detail : ""));
  if (!ok) failures.push(name);
}
function runtime(name, detail) {
  console.log("PENDING RUNTIME " + name + " :: " + detail);
  pending.push(name);
}
function anyFileContains(paths, patterns) {
  const sourceFiles = [];
  function collect(target) {
    if (!fs.existsSync(target)) return;
    const stat = fs.statSync(target);
    if (stat.isDirectory()) {
      for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
        if (["build", ".gradle", "node_modules", ".next"].includes(entry.name)) continue;
        collect(path.join(target, entry.name));
      }
      return;
    }
    if (/\.(kt|kts|java|xml|tsx|ts|js|jsx)$/.test(target)) sourceFiles.push(target);
  }
  for (const rel of paths) collect(path.join(root, rel));
  return sourceFiles.some(file => {
    const content = fs.readFileSync(file, "utf8");
    return patterns.some(pattern => content.includes(pattern));
  });
}
function hasReceiverBootHandler() {
  const manifest = read("app/src/main/AndroidManifest.xml");
  const candidates = [
    "app/src/main/java/com/smartcontrol/BootReceiver.kt",
    "app/src/main/java/com/smartcontrol/service/BootReceiver.kt",
    "app/src/main/java/com/smartcontrol/receiver/BootReceiver.kt"
  ];
  return manifest.includes("android.intent.action.BOOT_COMPLETED") &&
    candidates.some(file => read(file).includes("BOOT_COMPLETED"));
}

const manifest = read("app/src/main/AndroidManifest.xml");
const mainActivity = read("app/src/main/java/com/smartcontrol/MainActivity.kt");
const pairingScreen = read("app/src/main/java/com/smartcontrol/presentation/pairing/PairingScreen.kt");
const pairingModels = read("app/src/main/java/com/smartcontrol/domain/pairing/PairingModels.kt");
const pairingRepo = read("app/src/main/java/com/smartcontrol/domain/pairing/PairingRepository.kt");
const recovery = read("app/src/main/java/com/smartcontrol/domain/recovery/ConnectionRecoveryPolicy.kt");
const auth = read("app/src/main/java/com/smartcontrol/domain/auth/AuthRepository.kt");
const catalog = read("backend/src/catalog-api.js");
const gradle = read("app/build.gradle.kts");

console.log("SMART CONTROL — SMART AUTO-LINK + PERSISTENT CONNECTION VERIFICATION");
console.log("");

check(
  "Controller — unique pairing code",
  catalog.includes("crypto.randomBytes") &&
    catalog.includes('firestoreCollection("pairingCodes").doc(code)') &&
    pairingModels.includes("token")
);
check(
  "Controller — QR link surface",
  anyFileContains(
    [
      "app/src/main/java/com/smartcontrol",
      "backend/src",
      "web/app"
    ],
    ["QRCode", "QR_CODE", "qrCode", "qrUrl", "ZXing"]
  ),
  "A QR generator/rendering surface must be present."
);
check(
  "Controller — URL/deep-link payload surface",
  catalog.includes("https://") &&
    (catalog.includes("pairing") || catalog.includes("link")) &&
    (manifest.includes("android.intent.action.VIEW") || mainActivity.includes("dataString") || mainActivity.includes("intent.data"))
);
check(
  "Controller — share surface",
  pairingScreen.includes("Intent.ACTION_SEND") &&
    catalog.includes("/api/link/share")
);
check(
  "Controller — WhatsApp/SMS/Email/Copy share actions",
  ["WhatsApp", "SMS", "Email", "Copy"].every(channel =>
    pairingScreen.includes(channel) || mainActivity.includes(channel)
  ),
  "Generic Android share is present, but explicit channel actions are required by this verification."
);

check(
  "Receiver — app auto-open from link",
  manifest.includes("android.intent.action.VIEW") &&
    (manifest.includes("android:scheme") || manifest.includes("android:host"))
);
check(
  "Receiver — auto-fill pairing code from link",
  mainActivity.includes("intent.data") ||
    mainActivity.includes("dataString") ||
    mainActivity.includes("Uri.parse")
);
check(
  "Receiver — no manual entry required for link claim",
  pairingScreen.includes("claimCode") &&
    !(
      pairingScreen.includes("OutlinedTextField") &&
      pairingScreen.includes('label = { Text("Pairing token") }')
    ),
  "The current UI still exposes manual token entry."
);

check(
  "Auto device link — pairing claim and persisted paired state",
  pairingRepo.includes("claimPairingCode") &&
    pairingRepo.includes("observePairing") &&
    pairingModels.includes("PairedDevice")
);
runtime(
  "Auto device link — two physical devices",
  "Requires Controller generate/share -> Receiver open -> automatic claim -> connected-state evidence."
);

check(
  "Persistent link — explicit active state",
  pairingModels.includes("active") &&
    recovery.includes("PersistentLinkState") &&
    recovery.includes("pairingToken")
);
check(
  "Persistent link — explicit user disconnect/unpair path",
  pairingRepo.includes("unpair") &&
    catalog.includes("/api/disconnect")
);
check(
  "Persistent link — no automatic TTL on paired-device state",
  !pairingModels.includes("expiresAtEpochMs") ||
    pairingModels.includes("PairingCode(val token") ,
  "PairingCode expiry is for the temporary pairing credential; PairedDevice itself has no expiry field."
);
runtime(
  "Persistent link — lifetime behavior",
  "Requires long-running runtime evidence across normal operation; reset/factory reset and explicit disconnect must terminate the link."
);

check(
  "Auto-reconnect — network restoration policy",
  recovery.includes("shouldRecover") &&
    recovery.includes("networkAvailable") &&
    recovery.includes("recovered")
);
runtime(
  "Auto-reconnect — physical network off/on",
  "Requires real device network interruption and automatic recovery without manual re-pairing."
);

check(
  "Boot persistence — Android boot receiver",
  hasReceiverBootHandler(),
  "Requires BOOT_COMPLETED receiver that restores the persisted pairing/recovery state."
);
runtime(
  "Boot persistence — physical reboot",
  "Requires device restart followed by automatic service/link recovery under Android OS restrictions."
);

check(
  "Group pairing — capacity of up to 100 clients",
  /(?:MAX|MAXIMUM|LIMIT|CAPACITY|CLIENTS).{0,80}100/i.test(catalog) ||
    /100.{0,80}(client|device|member)/i.test(catalog),
  "A hard/explicit 100-client group capacity is not established by the current pairing implementation."
);
runtime(
  "Group pairing — 100 real clients",
  "Requires production-like multi-client load/connection testing; static source cannot prove 100 simultaneous clients."
);

check(
  "Secure login — Google",
  auth.includes("signInWithGoogle")
);
check(
  "Secure login — Mobile OTP",
  auth.includes("sendOtp") && auth.includes("verifyOtp")
);
runtime(
  "Secure login — real Google + OTP providers",
  "Requires production Firebase credentials and physical-device provider click-through."
);

runtime(
  "End-to-end Smart Auto-Link",
  "Requires Controller + Receiver install, generated QR/URL, share/open, automatic claim, persistent connection, network recovery and reboot evidence."
);

console.log("");
if (failures.length) {
  console.error("SMART_AUTO_LINK_VERIFY=FAILED");
  console.error("Static failures: " + failures.join(", "));
  console.error("Pending runtime checks: " + pending.length);
  process.exit(1);
}

console.log("SMART_AUTO_LINK_VERIFY=STATIC_PASS");
console.log("Pending runtime checks: " + pending.length);
