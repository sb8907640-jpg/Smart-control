const fs = require("fs");
const path = require("path");
const { TABLES, API, POLICY } = require("../functions/spec/masterCatalog");

const root = path.resolve(__dirname, "..");
const failures = [];
const pending = [];

function check(name, ok, detail) {
  console.log((ok ? "PASS " : "FAIL ") + name + (detail ? " :: " + detail : ""));
  if (!ok) failures.push(name);
}
function note(name, detail) {
  console.log("PENDING " + name + " :: " + detail);
  pending.push(name);
}

check("catalog tables >= 42", TABLES.length >= 42, String(TABLES.length));
check("catalog API >= 60", API.length >= 60, String(API.length));
check("sensitive routes consent-gated", POLICY.everySensitiveRouteRequiresActiveConsent === true);
check("media sessions visible consent", POLICY.everyMediaSessionRequiresVisibleSystemConsent === true);
check("remote commands approved-session gated", POLICY.everyRemoteCommandRequiresApprovedSession === true);
check("admin routes authenticated", POLICY.adminEndpointsRequireAuthenticatedAdminRole === true);
check("no hidden owner/hidden capture", POLICY.noHiddenOwnerIdentityOrHiddenCapture === true);
check("no permission bypass", POLICY.noPermissionBypass === true);
check("secure owner auth module", fs.existsSync(path.join(root, "backend/src/owner-auth.js")));
const backendApp = fs.readFileSync(path.join(root, "backend/src/app.js"), "utf8");
check("authenticated owner role enforcement", backendApp.includes("applyOwnerRole(verifiedUser)"));
check("owner allowlist is server-side", backendApp.includes('require("./owner-auth")'));
check("owner access documentation", fs.existsSync(path.join(root, "docs/owner-access.md")));
check("owner config verifier", fs.existsSync(path.join(root, "backend/src/verify-owner-config.js")));
const backendPackage = JSON.parse(fs.readFileSync(path.join(root, "backend/package.json"), "utf8"));
check("owner config verification script", backendPackage.scripts?.["verify:owner"] === "node src/verify-owner-config.js");
check("owner panel API module", fs.existsSync(path.join(root, "backend/src/owner-panel.js")));
check("private WhatsApp support helper", fs.existsSync(path.join(root, "backend/src/support-whatsapp.js")));
check("WhatsApp support verifier", fs.existsSync(path.join(root, "backend/src/verify-support-whatsapp.js")));
check("WhatsApp support verification script", backendPackage.scripts?.["verify:support"] === "node src/verify-support-whatsapp.js");
check("free plan public catalog protection", fs.readFileSync(path.join(root, "backend/src/catalog-api.js"), "utf8").includes("isOwnerOnlyFreePlan") && fs.readFileSync(path.join(root, "backend/src/catalog-api.js"), "utf8").includes(".filter(plan=>!isOwnerOnlyFreePlan(plan))"));
check("free plan direct lookup protection", fs.readFileSync(path.join(root, "backend/src/catalog-api.js"), "utf8").includes("plan.enabled!==true||isOwnerOnlyFreePlan(plan)"));
check("free plan self-subscribe protection", fs.readFileSync(path.join(root, "backend/src/catalog-api.js"), "utf8").includes("p.data()?.enabled!==true||isOwnerOnlyFreePlan(p.data())"));
check("free access grant OWNER-only", fs.readFileSync(path.join(root, "backend/src/catalog-api.js"), "utf8").includes("const requireOwnerAdmin") && fs.readFileSync(path.join(root, "backend/src/catalog-api.js"), "utf8").includes('/api/admin/free-access/grant",requireOwnerAdmin'));
check("free access edit/revoke OWNER-only", ["/api/admin/free-access/edit", "/api/admin/free-access/revoke"].every(p => fs.readFileSync(path.join(root, "backend/src/catalog-api.js"), "utf8").includes(p + '",requireOwnerAdmin')));
check("free access expiry enforcement", fs.readFileSync(path.join(root, "backend/src/owner-panel.js"), "utf8").includes('status: "EXPIRED"') && fs.readFileSync(path.join(root, "backend/src/owner-panel.js"), "utf8").includes("endsAt <= now()"));
const planPolicy = fs.readFileSync(path.join(root, "backend/src/plan-policy.js"), "utf8");
check("independent plan duration policy", planPolicy.includes("durationValue") && planPolicy.includes("durationUnit") && planPolicy.includes("MONTHS"));
check("independent device-link validity policy", planPolicy.includes("linkValidityValue") && planPolicy.includes("linkValidityUnit") && planPolicy.includes("MINUTES"));
const catalogApi = fs.readFileSync(path.join(root, "backend/src/catalog-api.js"), "utf8");
check("subscription stores plan duration", catalogApi.includes("planDurationValue") && catalogApi.includes("planDurationUnit") && catalogApi.includes("planDurationMs"));
check("payment activation calculates plan expiry", catalogApi.includes("calculateExpiry(startsAt,duration)") && catalogApi.includes("subscriptionStatus:\"ACTIVE\""));
check("plan-wise link validity", catalogApi.includes("getLinkValidity(plan)") && catalogApi.includes("linkValidityValue") && catalogApi.includes("linkValidityUnit"));
check("expired/revoked link cannot join", catalogApi.includes('data.status!=="PENDING"||Number(data.expiresAt)<now()'));
check("expired paid subscription blocks new link", catalogApi.includes("expiry > now()") && catalogApi.includes("unexpired paid subscription"));
const ownerPlanApi = fs.readFileSync(path.join(root, "backend/src/owner-panel.js"), "utf8");
check("owner independent plan editing", ownerPlanApi.includes('/api/owner/plans/:id') && ownerPlanApi.includes("OWNER_PLAN_EDITED"));
check("owner device-link generate", ownerPlanApi.includes("/api/owner/device-links/generate"));
check("owner device-link regenerate", ownerPlanApi.includes("/api/owner/device-links/regenerate/:code"));
check("owner device-link revoke", ownerPlanApi.includes("/api/owner/device-links/revoke/:code"));
check("owner panel mounted", backendApp.includes("installOwnerPanelRoutes(app, { db: firestore })"));
const ownerPanel = fs.readFileSync(path.join(root, "backend/src/owner-panel.js"), "utf8");
check("owner panel requires OWNER role", ownerPanel.includes('req.user?.owner !== true') && ownerPanel.includes('role || "").toUpperCase() !== "OWNER"'));
check("owner panel omits owner identity", ownerPanel.includes("ownerIdentity: null"));
check("owner panel audit trail", ownerPanel.includes('/api/owner/audit') && ownerPanel.includes("auditLogs"));
check("owner panel management capabilities", ["/api/owner/users", "/api/owner/plans", "/api/owner/feature-flags", "/api/owner/settings", "/api/owner/subscriptions", "/api/owner/payments", "/api/owner/emi", "/api/owner/legal-templates", "/api/owner/support-tickets", "/api/owner/health"].every(p => ownerPanel.includes(p)));

const requiredPaths = [
  "app/src/main/AndroidManifest.xml",
  "ios/SmartControl/SmartControlApp.swift",
  "web/app/page.tsx",
  "web/app/owner/page.tsx",
  "desktop/package.json",
  "backend/src/server.js",
  "functions/index.js",
  "contracts/AuditAnchor.sol"
];
for (const file of requiredPaths) {
  check("platform surface " + file, fs.existsSync(path.join(root, file)));
}

const workflowPaths = [
  ".github/workflows/android.yml",
  ".github/workflows/ios.yml",
  ".github/workflows/web.yml",
  ".github/workflows/desktop.yml",
  ".github/workflows/backend.yml"
];
for (const file of workflowPaths) {
  check("CI workflow " + file, fs.existsSync(path.join(root, file)));
}

const gradle = fs.readFileSync(path.join(root, "app/build.gradle.kts"), "utf8");
check("Android Owner flavor", /create\("owner"\)/.test(gradle));
check("Android Lite flavor", /create\("lite"\)/.test(gradle));
check("Android Full flavor", /create\("full"\)/.test(gradle));
check("Desktop variant present", fs.existsSync(path.join(root, "desktop/package.json")));

const manifest = fs.readFileSync(path.join(root, "app/src/main/AndroidManifest.xml"), "utf8");
check("Android runtime-sensitive permissions declared", [
  "android.permission.CAMERA",
  "android.permission.RECORD_AUDIO",
  "android.permission.POST_NOTIFICATIONS"
].every(p => manifest.includes(p)));

const permissionCenter = path.join(root, "app/src/main/java/com/smartcontrol/domain/permission/PermissionCenter.kt");
check("Permission Center implementation surface", fs.existsSync(permissionCenter));

const recovery = path.join(root, "app/src/main/java/com/smartcontrol/domain/recovery/ConnectionRecoveryPolicy.kt");
check("Connection recovery implementation surface", fs.existsSync(recovery));

note("19-permission runtime coverage", "Requires device/runtime evidence for every permission and user-choice flow.");
note("2-mode runtime coverage", "Static source presence is not proof of Controller/Client end-to-end behavior.");
note("8-role authorization coverage", "Requires explicit role matrix plus authorization tests.");
note("18/19 offline coverage", "Requires offline feature-by-feature runtime tests.");
note("19/19 online coverage", "Requires production-like integration tests.");
note("24x7 continuous operation", "Requires long-running runtime evidence and remains subject to OS/platform limits.");
note("auto-reconnect/persistent link", "Requires physical/runtime network interruption and app-restart tests.");
note("physical Android/iOS", "Static CI cannot substitute for a real device.");
note("production blockchain", "Compilation is not deployment/wallet/RPC evidence.");
note("owner identity configuration", "Real owner identities must be supplied through private deployment secrets OWNER_EMAILS and OWNER_MOBILE_NUMBERS; they are intentionally not stored in public source.");
note("owner panel runtime", "Requires authenticated OWNER runtime verification against the private allowlist and live backend data.");
note("WhatsApp support runtime", "Requires private SUPPORT_WHATSAPP_NUMBER deployment configuration and an authenticated click-through test; the number is intentionally not stored in public source.");

console.log("");
if (failures.length) {
  console.error("MASTER_SPEC_VERIFY=FAILED");
  console.error("Failures: " + failures.join(", "));
  process.exit(1);
}
console.log("MASTER_SPEC_VERIFY=STATIC_PASS");
console.log("Pending runtime/production evidence: " + pending.length);
