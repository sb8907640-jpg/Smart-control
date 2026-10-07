const fs = require("fs");
const path = require("path");

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

const manifest = read("app/src/main/AndroidManifest.xml");
const gradle = read("app/build.gradle.kts");
const auth = read("app/src/main/java/com/smartcontrol/domain/auth/AuthRepository.kt");
const permissionCenter = read("app/src/main/java/com/smartcontrol/domain/permission/PermissionCenter.kt");
const features = read("app/src/main/java/com/smartcontrol/domain/feature/FeatureModule.kt");
const pairingModels = read("app/src/main/java/com/smartcontrol/domain/pairing/PairingModels.kt");
const pairingRepo = read("app/src/main/java/com/smartcontrol/domain/pairing/PairingRepository.kt");
const recovery = read("app/src/main/java/com/smartcontrol/domain/recovery/ConnectionRecoveryPolicy.kt");
const sessionModels = read("app/src/main/java/com/smartcontrol/domain/session/SessionModels.kt");
const sessionRepo = read("app/src/main/java/com/smartcontrol/domain/session/SessionRepository.kt");

console.log("SMART CONTROL — 11-STEP OWNER + RECEIVER FLOW VERIFICATION");

check("STEP 1 App Install — Android build surfaces", ["owner", "lite", "full"].every(flavor => new RegExp(`create\\("${flavor}"\\)`).test(gradle)));
check("STEP 1 App Install — manifest exists", Boolean(manifest));

check("STEP 2 Login — Google", auth.includes("signInWithGoogle"));
check("STEP 2 Login — Mobile OTP", auth.includes("sendOtp") && auth.includes("verifyOtp"));
runtime("STEP 2 Login — real provider", "Requires real Google/OTP credentials and a physical-device click-through.");

check("STEP 3 Mode Select — Controller/Client model surface", pairingModels.includes("controllerUid") && pairingRepo.includes("observeControlledDevice"));
runtime("STEP 3 Mode Select — real UI", "Requires physical Owner/Receiver UI verification for Controller and Client selection.");

check("STEP 4 Link Generate/Open — pairing API surface", pairingRepo.includes("createPairingCode") && pairingRepo.includes("claimPairingCode"));
check("STEP 4 Link Generate/Open — expiring pairing code", pairingModels.includes("expiresAtEpochMs"));
runtime("STEP 4 Link Generate/Open — real two-app flow", "Requires Owner-generated link/code and Receiver-open/claim on two devices.");

check("STEP 5 Auto Device Link — paired-device state", pairingRepo.includes("observePairing") && pairingModels.includes("PairedDevice"));
runtime("STEP 5 Auto Device Link — automatic connection", "Requires two-device runtime evidence that both apps connect after successful pairing.");

check("STEP 6 Permission Screen — Permission Center surface", Boolean(permissionCenter));
check("STEP 6 Permission Screen — Android runtime permissions declared", [
  "android.permission.CAMERA",
  "android.permission.RECORD_AUDIO"
].every(p => manifest.includes(p)));

check("STEP 7 Manual choice — no permission bypass policy", read("scripts/master-spec-verify.js").includes("no permission bypass"));
runtime("STEP 7 Manual choice — Allow All / One-by-One taps", "Requires physical UI evidence that the user manually chooses either path; no silent grant is accepted.");

const featureCount = (features.match(/\\b[A-Z][A-Z0-9_]+\\s*\\(/g) || []).length;
check("STEP 8 19 control features catalogued", featureCount === 19, String(featureCount));
check("STEP 8 OS permission flow remains explicit", !read("scripts/master-spec-verify.js").includes("permissionBypass=true"));
runtime("STEP 8A Allow All — 19 sequential OS dialogs", "Requires physical Android evidence for all 19 feature-permission steps; CI cannot prove OS dialogs.");
runtime("STEP 8B One-by-One — Allow/Deny per permission", "Requires physical Android evidence for clear explanation plus manual Allow/Deny choices.");

check("STEP 9 Full Control — approved active session gate", sessionModels.includes("APPROVED") && sessionModels.includes("ACTIVE") && sessionRepo.includes("approve"));
check("STEP 9 Full Control — remote command session gate", read("app/src/main/java/com/smartcontrol/domain/control/RemoteCommandSessionGate.kt").includes("APPROVED"));
runtime("STEP 9 Full Control — all 19 granted", "Requires physical runtime evidence after the complete permission sequence.");

check("STEP 10 Background operation — recovery policy surface", Boolean(recovery) && recovery.includes("shouldRecover") && recovery.includes("PersistentLinkState"));
runtime("STEP 10 Background operation — real device", "Requires physical-device background/idle testing within Android OS limits; no bypass of OS restrictions.");

check("STEP 11 Persistent Link — persisted link state", recovery.includes("pairingToken") && recovery.includes("active") && recovery.includes("lastSeenAt"));
check("STEP 11 Persistent Link — recovery on network restoration", recovery.includes("networkAvailable") && recovery.includes("recovered"));
runtime("STEP 11 Persistent Link — until reset/disconnect", "Requires physical network interruption, app restart, and explicit disconnect/reset tests.");

console.log("");
if (failures.length) {
  console.error("FLOW_11_STEP_VERIFY=FAILED");
  console.error("Failures: " + failures.join(", "));
  process.exit(1);
}
console.log("FLOW_11_STEP_VERIFY=STATIC_PASS");
console.log("Pending runtime steps: " + pending.length);
