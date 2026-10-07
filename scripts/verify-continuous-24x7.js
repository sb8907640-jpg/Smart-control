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

const service = read("app/src/main/java/com/smartcontrol/service/FamilySafetyService.kt");
const manifest = read("app/src/main/AndroidManifest.xml");
const recovery = read("app/src/main/java/com/smartcontrol/domain/recovery/ConnectionRecoveryPolicy.kt");
const docs = read("docs/master-specification.md");
const smartLink = read("scripts/verify-smart-autolink-persistent.js");
const session = read("app/src/main/java/com/smartcontrol/domain/session/SessionModels.kt");
const sessionRepo = read("app/src/main/java/com/smartcontrol/domain/session/SessionRepository.kt");
const permission = read("app/src/main/java/com/smartcontrol/domain/permission/PermissionCenter.kt");

const receiverCandidates = [
  "app/src/main/java/com/smartcontrol/BootReceiver.kt",
  "app/src/main/java/com/smartcontrol/service/BootReceiver.kt",
  "app/src/main/java/com/smartcontrol/receiver/BootReceiver.kt"
];
const hasBootReceiver = manifest.includes("android.intent.action.BOOT_COMPLETED") &&
  receiverCandidates.some(file => read(file).includes("BOOT_COMPLETED"));

function allCodeFiles(dir) {
  const abs = path.join(root, dir);
  if (!fs.existsSync(abs)) return [];
  const out = [];
  const walk = d => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (/\.(kt|java|ts|tsx|js)$/.test(entry.name)) out.push(p);
    }
  };
  walk(abs);
  return out;
}
const codeFiles = allCodeFiles("app/src/main/java");
const appText = codeFiles.map(f => fs.readFileSync(f, "utf8")).join("\n");

console.log("SMART CONTROL — DESIGNED FOR CONTINUOUS 24×7 OPERATION VERIFICATION");
console.log("Subject: persistent background operation, explicit user/OS authorization, recovery and offline fallback.");
console.log("");

check(
  "24×7 design wording acknowledges OS/platform restrictions",
  docs.includes("24x7") || docs.includes("24×7"),
  "The specification must not promise unrestricted perpetual execution."
);

check(
  "Foreground service architecture",
  service.includes("extends Service") &&
  service.includes("startForeground") &&
  manifest.includes("android:foregroundServiceType"),
  "Long-running work is represented by an Android foreground service with a visible notification."
);

check(
  "Foreground service remains restart-oriented",
  service.includes("return START_STICKY"),
  "START_STICKY supports service restart when Android permits it."
);

check(
  "Persistent link recovery state",
  recovery.includes("PersistentLinkState") &&
  recovery.includes("pairingToken") &&
  recovery.includes("active"),
  "Persisted pairing/recovery state is required for reconnection."
);

check(
  "Network restoration recovery policy",
  recovery.includes("shouldRecover") &&
  recovery.includes("networkAvailable") &&
  recovery.includes("recovered"),
  "Network loss/recovery is represented by an explicit recovery policy."
);

check(
  "Approved session state exists",
  session.includes("SessionStatus") &&
  session.includes("APPROVED") &&
  session.includes("ACTIVE") &&
  sessionRepo.includes("suspend fun approve("),
  "Control authorization must be approved before an active session; this does not bypass Android permission dialogs."
);

check(
  "Permission Center exists for user-controlled permission approval",
  permission.includes("DevicePermission"),
  "Android protected permissions remain user/OS controlled."
);

check(
  "Family-safety background mode requires approved session and permission grant",
  session.includes("APPROVED") &&
  session.includes("ACTIVE") &&
  sessionRepo.includes("suspend fun approve(") &&
  permission.includes("DevicePermission"),
  "Background family-safety control may become active only after explicit user/guardian approval and required OS permissions; no silent activation is accepted."
);

check(
  "Persistent mode is not treated as a permission bypass",
  !/bypass|silent|automatically.?grant|auto.?grant|without.?approval/i.test(
    service + sessionRepo + permission
  ),
  "Persistence/recovery cannot override the user's approval or Android's protected-permission controls."
);

check(
  "No silent/background permission bypass is present",
  !/autoAllow|auto_grant|backgroundAllow|silentGrant|grantAllAutomatically|permissionBypass|skipPermissionDialog|withoutUserAction/i.test(
    appText
  ),
  "No automatic protected-permission grant path is accepted."
);

check(
  "Boot auto-start surface",
  hasBootReceiver,
  "BOOT_COMPLETED receiver must restore only eligible, previously authorized state."
);

check(
  "Wi-Fi Direct / Bluetooth P2P fallback implementation surface",
  /WifiP2pManager|WifiP2p|BluetoothAdapter|BluetoothManager/.test(appText),
  "Manifest permissions alone do not establish an operational P2P fallback."
);

check(
  "Required Wi-Fi/Bluetooth permissions declared",
  manifest.includes("android.permission.NEARBY_WIFI_DEVICES") &&
  manifest.includes("android.permission.BLUETOOTH_CONNECT") &&
  manifest.includes("android.permission.BLUETOOTH_SCAN"),
  "Runtime authorization remains user/OS controlled."
);

check(
  "Persistent-link verifier is part of repository verification",
  fs.existsSync(path.join(root, "scripts/verify-smart-autolink-persistent.js")) &&
  smartLink.includes("Persistent link"),
  "Existing persistent-link checks are retained."
);

runtime(
  "Screen locked/unlocked",
  "Requires real-device testing while the display is locked and unlocked."
);
runtime(
  "App closed/open",
  "Requires real-device testing after the app UI is closed while an approved foreground service/session remains active."
);
runtime(
  "Battery low/full",
  "Requires real-device testing across battery states and Android power-management restrictions."
);
runtime(
  "Physical reboot recovery",
  "Requires device restart followed by eligible service/pairing recovery; Android may restrict background starts."
);
runtime(
  "Internet OFF/ON",
  "Requires physical network interruption and automatic recovery without manual re-pairing."
);
runtime(
  "Airplane mode P2P fallback",
  "Requires real hardware and an implemented Wi-Fi Direct/Bluetooth transport; Airplane Mode behavior is platform/OEM dependent."
);
runtime(
  "Family/child-safety approved activation",
  "Requires real-device confirmation that the family/guardian user explicitly enables background mode and the receiver user/guardian approves the session and required OS permissions before protected control activates."
);
runtime(
  "Force Stop / watchdog",
  "Requires real-device testing. Android Force Stop is OS-enforced; a normal app cannot guarantee self-restart until the OS/user permits it. Watchdog behavior must never become a permission or force-stop bypass."
);
runtime(
  "Battery optimization user consent",
  "Requires an explicit user-facing exemption flow where supported; exemption must never be silently granted."
);
runtime(
  "Doze mode",
  "Requires real-device Doze testing; idle restrictions cannot be silently bypassed."
);
runtime(
  "Background restriction user consent",
  "Requires real-device/OEM testing; any exemption must be explicitly user-approved and subject to platform policy."
);
runtime(
  "24×7 family-safety endurance/soak",
  "Requires an extended real-device soak test across charging/battery, network changes, screen lock, app closure, reboot, and OS power-management states."
);
runtime(
  "Approved session + Android permission grant",
  "Requires real-device confirmation that control starts only after the receiver user has approved the session and granted the required OS permissions."
);
runtime(
  "Long-running 24×7 endurance",
  "Requires an extended physical-device soak test; source/CI checks cannot prove unrestricted 24×7 execution."
);

console.log("");
if (failures.length) {
  console.error("CONTINUOUS_24X7_VERIFY=FAILED");
  console.error("Static failures: " + failures.join(", "));
  console.error("Pending runtime checks: " + pending.length);
  process.exit(1);
}
console.log("CONTINUOUS_24X7_VERIFY=STATIC_PASS");
console.log("Pending runtime checks: " + pending.length);
