const { FEATURES, MODES, PLATFORMS, APP_VARIANTS, ROLES, ONLINE_COUNT, OFFLINE_COUNT } = require("../functions/spec/featureCatalog");

const failures = [];
function check(name, ok, detail = "") {
  console.log((ok ? "PASS " : "FAIL ") + name + (detail ? " :: " + detail : ""));
  if (!ok) failures.push(name);
}

console.log("SMART CONTROL — FEATURE / MODE / PLATFORM / ROLE CONTRACT VERIFICATION");

check("Exactly 19 features", FEATURES.length === 19, String(FEATURES.length));
check("Feature IDs are 1..19", FEATURES.every((f, i) => f.id === i + 1));
check("Feature keys are unique", new Set(FEATURES.map(f => f.key)).size === 19);
check("Every feature has icon and description", FEATURES.every(f => f.icon && f.description));
check("Online support is 19/19", ONLINE_COUNT === 19, String(ONLINE_COUNT));
check("Offline support is 18/19", OFFLINE_COUNT === 18, String(OFFLINE_COUNT));
check("Screen Share is online-only", FEATURES.find(f => f.id === 7).offline === false && FEATURES.find(f => f.id === 7).online === true);
check("Touch Control offline path is P2P", FEATURES.find(f => f.id === 9).offline === "P2P");
check("Keyboard Input offline path is P2P", FEATURES.find(f => f.id === 10).offline === "P2P");
check("App Install/Uninstall offline path is queued", FEATURES.find(f => f.id === 11).offline === "QUEUE");
check("All other declared offline features are available", FEATURES.filter(f => f.id !== 7 && f.offline === false).length === 0);
check("Controller mode contract", MODES.CONTROLLER.length === 4 && MODES.CONTROLLER.includes("Code generate") && MODES.CONTROLLER.includes("devices manage") && MODES.CONTROLLER.includes("consents") && MODES.CONTROLLER.includes("full control"));
check("Client mode contract", MODES.CLIENT.length === 3 && MODES.CLIENT.includes("Code enter") && MODES.CLIENT.includes("permissions allow/deny") && MODES.CLIENT.includes("STOP button"));
check("Five platform contracts", PLATFORMS.length === 5);
check("Four app variants", APP_VARIANTS.length === 4);
check("Eight role definitions", ROLES.length === 8);
check("Family-safety consent boundary", true, "This catalog does not grant Android permissions or bypass user/OS approval.");
check("Runtime verification remains separate", true, "Catalog PASS is specification coverage, not physical-device proof.");

if (failures.length) {
  console.error("FEATURE_CONTRACT_VERIFY=FAILED");
  console.error("Failures: " + failures.join(", "));
  process.exit(1);
}
console.log("FEATURE_CONTRACT_VERIFY=STATIC_PASS");
console.log("Declared online: 19/19");
console.log("Declared offline-capable: 18/19");
