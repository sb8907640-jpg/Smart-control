const fs = require("node:fs");
const path = require("node:path");
const {
  TABLES, API, POLICY
} = require("../functions/spec/masterCatalog");
const {
  FEATURES, MODES, PLATFORMS, APP_VARIANTS, ROLES, ONLINE_COUNT, OFFLINE_COUNT
} = require("../functions/spec/featureCatalog");

const root = path.resolve(__dirname, "..");
const failures = [];
const pending = [];

function read(rel) {
  const file = path.join(root, rel);
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
}
function exists(rel) {
  return fs.existsSync(path.join(root, rel));
}
function check(name, ok, detail = "") {
  console.log((ok ? "PASS " : "FAIL ") + name + (detail ? " :: " + detail : ""));
  if (!ok) failures.push(name);
}
function note(name, detail) {
  console.log("PENDING " + name + " :: " + detail);
  pending.push(name);
}

console.log("SMART CONTROL — MASTER SPECIFICATION FINAL VERIFICATION");
console.log("");

/* Contract totals */
check("19 control features", FEATURES.length === 19, String(FEATURES.length));
check("Feature IDs 1..19", FEATURES.every((f, i) => f.id === i + 1));
check("Feature keys unique", new Set(FEATURES.map(f => f.key)).size === 19);
check("Online support 19/19", ONLINE_COUNT === 19, String(ONLINE_COUNT));
check("Offline support 18/19", OFFLINE_COUNT === 18, String(OFFLINE_COUNT));
check("Screen Share online-only", FEATURES.find(f => f.id === 7)?.offline === false && FEATURES.find(f => f.id === 7)?.online === true);
check("Touch Control P2P offline", FEATURES.find(f => f.id === 9)?.offline === "P2P");
check("Keyboard Input P2P offline", FEATURES.find(f => f.id === 10)?.offline === "P2P");
check("App Install/Uninstall queued offline", FEATURES.find(f => f.id === 11)?.offline === "QUEUE");
check("2 modes", Object.keys(MODES).length === 2 && MODES.CONTROLLER && MODES.CLIENT);
check("5 platforms", PLATFORMS.length === 5);
check("4 app variants", APP_VARIANTS.length === 4);
check("8 roles", ROLES.length === 8);

/* Database/API catalog */
check("database catalog >= 42 tables", TABLES.length >= 42, String(TABLES.length));
check("API catalog >= 60 endpoints", API.length >= 60, String(API.length));
check("sensitive routes consent-gated policy", POLICY.everySensitiveRouteRequiresActiveConsent === true);
check("media sessions visible-consent policy", POLICY.everyMediaSessionRequiresVisibleSystemConsent === true);
check("remote commands approved-session policy", POLICY.everyRemoteCommandRequiresApprovedSession === true);
check("admin routes authenticated policy", POLICY.adminEndpointsRequireAuthenticatedAdminRole === true);
check("no hidden owner identity/capture policy", POLICY.noHiddenOwnerIdentityOrHiddenCapture === true);
check("no permission bypass policy", POLICY.noPermissionBypass === true);

/* Owner identity and panel */
const backendApp = read("backend/src/app.js");
const ownerAuth = read("backend/src/owner-auth.js");
const ownerPanel = read("backend/src/owner-panel.js");
const catalogApi = read("backend/src/catalog-api.js");
const backendPackage = JSON.parse(read("backend/package.json") || "{}");

check("owner auth module exists", Boolean(ownerAuth));
check("owner allowlist is environment-backed", ownerAuth.includes("OWNER_EMAILS") && ownerAuth.includes("OWNER_MOBILE_NUMBERS"));
check("owner role assignment is exact allowlist based", ownerAuth.includes("applyOwnerRole") && ownerAuth.includes('role: "OWNER"') && ownerAuth.includes("owner: true"));
check("owner role is applied after authentication", backendApp.includes("applyOwnerRole(verifiedUser)"));
check("owner identity is not hard-coded in source", !/(gmail\.com|@.*\.com|\+91\d{10})/i.test(ownerAuth));
check("owner panel mounted", backendApp.includes("installOwnerPanelRoutes(app, { db: firestore })"));
check("owner panel requires OWNER role", ownerPanel.includes("req.user?.owner !== true") && ownerPanel.includes('!== "OWNER"'));
check("owner panel identity hidden", ownerPanel.includes("ownerIdentity: null"));
check("owner panel audit trail", ownerPanel.includes("/api/owner/audit") && ownerPanel.includes("auditLogs"));
check("owner panel management routes", [
  "/api/owner/users", "/api/owner/plans", "/api/owner/feature-flags",
  "/api/owner/settings", "/api/owner/subscriptions", "/api/owner/payments",
  "/api/owner/emi", "/api/owner/legal-templates", "/api/owner/support-tickets",
  "/api/owner/health", "/api/owner/free-access",
  "/api/owner/device-links/generate", "/api/owner/device-links/regenerate/:code",
  "/api/owner/device-links/revoke/:code"
].every(p => ownerPanel.includes(p)));
check("owner config verifier exists", exists("backend/src/verify-owner-config.js"));
check("owner config package script", backendPackage.scripts?.["verify:owner"] === "node src/verify-owner-config.js");

/* Free-plan manual approval */
check("free plan hidden from public catalog", catalogApi.includes("isOwnerOnlyFreePlan") && catalogApi.includes(".filter(plan=>!isOwnerOnlyFreePlan(plan))"));
check("free plan direct lookup blocked", catalogApi.includes("isOwnerOnlyFreePlan(plan)"));
check("free plan self-subscribe blocked", catalogApi.includes("isOwnerOnlyFreePlan(p.data())"));
check("free access OWNER-only admin routes", catalogApi.includes('/api/admin/free-access/grant",requireOwnerAdmin') && catalogApi.includes('/api/admin/free-access/edit",requireOwnerAdmin') && catalogApi.includes('/api/admin/free-access/revoke",requireOwnerAdmin'));
check("free access manual approval fields", ownerPanel.includes("userName") && ownerPanel.includes("email") && ownerPanel.includes("mobile") && ownerPanel.includes("approvedAt"));
check("free access custom dates/presets", ownerPanel.includes("durationPreset") && ownerPanel.includes("startsAt") && ownerPanel.includes("endsAt"));
check("free access all-19/selected features", ownerPanel.includes("all19") && ownerPanel.includes("normalizeFeatures") && ownerPanel.includes("featureCount"));
check("free access approval audit", ownerPanel.includes("OWNER_FREE_ACCESS_APPROVED"));
check("free access edit/extend/reduce audit", ownerPanel.includes("OWNER_FREE_ACCESS_EDITED") && ownerPanel.includes("changedFields"));
check("free access revoke audit", ownerPanel.includes("OWNER_FREE_ACCESS_REVOKED"));
check("free access expiry enforcement", ownerPanel.includes('status: "EXPIRED"') && ownerPanel.includes("endsAt <= now()"));
check("user free-access status expiry enforcement", catalogApi.includes("/api/free-access/status") && catalogApi.includes("expireFreeAccessForUser"));

/* Paid plan policy */
const planPolicy = read("backend/src/plan-policy.js");
check("plan duration supports minutes/hours/days/months", ["MINUTES", "HOURS", "DAYS", "MONTHS"].every(u => planPolicy.includes(u)));
check("plan duration is independent", planPolicy.includes("durationValue") && planPolicy.includes("durationUnit") && planPolicy.includes("getPlanDuration"));
check("device-link validity is independent", planPolicy.includes("linkValidityValue") && planPolicy.includes("linkValidityUnit") && planPolicy.includes("getLinkValidity"));
check("lifetime plan policy supported", planPolicy.includes("LIFETIME"));
check("subscription snapshots plan duration", catalogApi.includes("planDurationValue") && catalogApi.includes("planDurationUnit") && catalogApi.includes("planDurationMs"));
check("payment activation computes expiry", catalogApi.includes("calculateExpiry") && catalogApi.includes('subscriptionStatus:"ACTIVE"'));
check("generated link uses plan validity", catalogApi.includes("getLinkValidity(plan)") && catalogApi.includes("linkValidityValue"));
check("expired/revoked link join blocked", catalogApi.includes('data.status!=="PENDING"||Number(data.expiresAt)<now()'));
check("expired paid subscription blocks new link", catalogApi.includes("expiry > now()") && catalogApi.includes("unexpired paid subscription"));
check("owner plan edit exists", ownerPanel.includes("/api/owner/plans/:id") && ownerPanel.includes("OWNER_PLAN_EDITED"));

/* Support */
const support = read("backend/src/support-whatsapp.js");
check("hidden WhatsApp support uses private env", support.includes("SUPPORT_WHATSAPP_NUMBER") && support.includes("wa.me/"));
check("support message fixed", support.includes("Hello, I need support for Total Control System"));
check("support verifier exists", exists("backend/src/verify-support-whatsapp.js"));
check("support package script", backendPackage.scripts?.["verify:support"] === "node src/verify-support-whatsapp.js");

/* Security, consent, live indicator, STOP, boot */
const security = read("backend/src/security-controls.js");
const service = read("app/src/main/java/com/smartcontrol/service/FamilySafetyService.kt");
const boot = read("app/src/main/java/com/smartcontrol/service/SmartControlBootReceiver.kt");
const manifest = read("app/src/main/AndroidManifest.xml");
const sessionModels = read("app/src/main/java/com/smartcontrol/domain/session/SessionModels.kt");
const sessionRepo = read("app/src/main/java/com/smartcontrol/domain/session/SessionRepository.kt");
const recovery = read("app/src/main/java/com/smartcontrol/domain/recovery/ConnectionRecoveryPolicy.kt");

check("AES-256-GCM security baseline", security.includes("AES-256-GCM") && security.includes("createCipheriv"));
check("Google + Mobile OTP + 2FA policy", security.includes("Google") && security.includes("Mobile OTP") && security.includes("2FA/MFA"));
check("consent/activity log policy", security.includes("consentLog: true") && security.includes("activityLog: true"));
check("visible live indicator", service.includes("setOngoing(true)") && service.includes("Family Safety Active"));
check("user STOP action", service.includes("ACTION_STOP_SYNC") && service.includes("Stop Sync") && service.includes("stopSelf()"));
check("data deletion policy", security.includes("userDataDeletion: true"));
check("legal readiness labels", ["GDPR", "IT Act 2000", "DPDP Act 2023"].every(x => security.includes(x)));
check("persistent link policy", security.includes("persistentLink") && recovery.includes("PersistentLinkState"));
check("boot opt-in policy", security.includes("explicit user opt-in only") && boot.includes("auto_start_service"));
check("boot receiver declared", manifest.includes("RECEIVE_BOOT_COMPLETED") && manifest.includes("SmartControlBootReceiver") && manifest.includes("BOOT_COMPLETED"));
check("emergency authorization is approval-bounded", security.includes("approved-session emergency authorization") && security.includes("never silently grants protected OS permissions"));
check("session has approved/active states", sessionModels.includes("APPROVED") && sessionModels.includes("ACTIVE") && sessionRepo.includes("suspend fun approve("));
check("no silent permission bypass markers", !/(auto_grant|silentGrant|permissionBypass|skipPermissionDialog|withoutUserAction)/i.test(security + service + boot + manifest));

/* Android, platforms, variants */
const gradle = read("app/build.gradle.kts");
check("Android Owner flavor", /create\("owner"\)/.test(gradle));
check("Android Lite flavor", /create\("lite"\)/.test(gradle));
check("Android Full flavor", /create\("full"\)/.test(gradle));
check("Android Permission Center surface", exists("app/src/main/java/com/smartcontrol/domain/permission/PermissionCenter.kt"));
check("Android recovery surface", exists("app/src/main/java/com/smartcontrol/domain/recovery/ConnectionRecoveryPolicy.kt"));

const platformFiles = [
  "app/src/main/AndroidManifest.xml",
  "ios/SmartControl/SmartControlApp.swift",
  "web/app/page.tsx",
  "web/app/owner/page.tsx",
  "desktop/package.json",
  "backend/src/server.js",
  "functions/index.js",
  "contracts/AuditAnchor.sol"
];
for (const file of platformFiles) check("platform surface " + file, exists(file));

const workflows = [
  ".github/workflows/android.yml",
  ".github/workflows/ios.yml",
  ".github/workflows/web.yml",
  ".github/workflows/desktop.yml",
  ".github/workflows/backend.yml",
  ".github/workflows/production-readiness.yml"
];
for (const file of workflows) check("CI workflow " + file, exists(file));

/* Pairing/recovery and verification infrastructure */
const pairingModels = read("app/src/main/java/com/smartcontrol/domain/pairing/PairingModels.kt");
const pairingRepo = read("app/src/main/java/com/smartcontrol/domain/pairing/PairingRepository.kt");
const pairingScreen = read("app/src/main/java/com/smartcontrol/presentation/pairing/PairingScreen.kt");
const auth = read("app/src/main/java/com/smartcontrol/domain/auth/AuthRepository.kt");

check("Google login surface", auth.includes("signInWithGoogle"));
check("Mobile OTP surface", auth.includes("sendOtp") && auth.includes("verifyOtp"));
check("pairing code create/claim surface", pairingRepo.includes("createPairingCode") && pairingRepo.includes("claimPairingCode"));
check("paired-device persisted state", pairingModels.includes("PairedDevice") && pairingModels.includes("active"));
check("persistent recovery policy", recovery.includes("shouldRecover") && recovery.includes("networkAvailable") && recovery.includes("recovered"));
check("explicit disconnect/unpair path", pairingRepo.includes("unpair") && catalogApi.includes("/api/disconnect"));
check("manual pairing fallback retained", pairingScreen.includes("claimCode"));
check("verification: feature catalog script exists", exists("scripts/verify-feature-catalog.js"));
check("verification: 11-step script exists", exists("scripts/verify-11-step-flow.js"));
check("verification: smart auto-link script exists", exists("scripts/verify-smart-autolink-persistent.js"));
check("verification: manual permission script exists", exists("scripts/verify-manual-permission-choice.js"));
check("verification: 24x7 script exists", exists("scripts/verify-continuous-24x7.js"));
check("verification: security script exists", exists("scripts/verify-security-controls.js"));

/* Package and workflow integration */
const requiredScripts = {
  "verify:owner": "node src/verify-owner-config.js",
  "verify:support": "node src/verify-support-whatsapp.js",
  "verify:11-step-flow": "node ../scripts/verify-11-step-flow.js",
  "verify:smart-autolink": "node ../scripts/verify-smart-autolink-persistent.js",
  "verify:manual-permission-choice": "node ../scripts/verify-manual-permission-choice.js",
  "verify:start-stop-background": "node ../scripts/verify-start-stop-background.js",
  "verify:continuous-24x7": "node ../scripts/verify-continuous-24x7.js",
  "verify:security-controls": "node ../scripts/verify-security-controls.js",
  "verify:feature-catalog": "node ../scripts/verify-feature-catalog.js"
};
for (const [name, command] of Object.entries(requiredScripts)) {
  check("backend package script " + name, backendPackage.scripts?.[name] === command);
}

const productionWorkflow = read(".github/workflows/production-readiness.yml");
for (const step of [
  "Verify final master specification",
  "Verify 11-step Owner + Receiver flow",
  "Verify Smart Auto-Link + Persistent Connection",
  "Verify Manual Permission Choice",
  "Verify Start Stop background behavior",
  "Verify Designed for Continuous 24x7 Operation",
  "Verify Security, Encryption, Consent and Safety Controls",
  "Verify Feature / Mode / Platform / Role contract"
]) {
  check("production workflow includes " + step, productionWorkflow.includes(step));
}

/* Runtime/production gates — never falsely promoted */
note("19-feature physical/runtime coverage", "Static contract is present; physical device evidence for each feature remains required.");
note("Allow All / One-by-One runtime", "Requires physical Android UI evidence and real OS permission dialogs.");
note("Controller + Client end-to-end", "Requires two-device runtime evidence.");
note("QR/URL auto-open/auto-fill/auto-connect", "Requires implementation plus two-device click-through evidence; static catalog is not runtime proof.");
note("100-client group pairing", "Requires explicit capacity implementation and production-like load testing.");
note("18/19 offline runtime", "Requires feature-by-feature offline/P2P/queue tests.");
note("19/19 online runtime", "Requires production-like backend/WebRTC/Socket.IO tests.");
note("24x7 endurance", "Requires extended physical-device soak and remains subject to OS limits.");
note("network auto-reconnect", "Requires real network OFF/ON test without manual re-pairing.");
note("boot persistence", "Requires physical reboot evidence; Android/OEM restrictions still apply.");
note("real Android device", "APK install/login/consent/permissions/pairing/control/recovery require physical device evidence.");
note("real iPhone", "Simulator build is not physical-device evidence.");
note("production credentials", "Google/OTP/Firebase/FCM/turn/RPC credentials must be validated in a controlled environment.");
note("blockchain deployment", "Contract compilation is not wallet/RPC/deployment evidence.");
note("full E2E encryption", "AES-256-GCM helper exists, but transport/media E2E integration still requires session key exchange and real transport verification.");
note("all-feature access notifications", "Policy exists, but every one of the 19 feature accesses must be verified at event/runtime level.");
note("complete data deletion", "Deletion policy exists; complete cross-store deletion must be runtime/production verified.");
note("full 2FA enforcement", "Policy references 2FA/MFA; deployment-level enforcement still requires an explicit authenticated MFA flow test.");
note("owner runtime", "Requires private owner allowlist and authenticated OWNER runtime test; identifiers are intentionally excluded from source.");
note("support runtime", "Requires private SUPPORT_WHATSAPP_NUMBER and authenticated click-through test; the number is intentionally excluded from source.");

console.log("");
if (failures.length) {
  console.error("MASTER_SPEC_VERIFY=FAILED");
  console.error("Failures: " + failures.join(", "));
  process.exit(1);
}
console.log("MASTER_SPEC_VERIFY=STATIC_PASS");
console.log("Pending runtime/production evidence: " + pending.length);
