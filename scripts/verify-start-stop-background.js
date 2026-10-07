const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const failures = [];

function read(rel) {
  const file = path.join(root, rel);
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
}

function check(name, ok) {
  console.log((ok ? "PASS " : "FAIL ") + name);
  if (!ok) failures.push(name);
}

const main = read("app/src/main/java/com/smartcontrol/MainActivity.kt");
const session = read("app/src/main/java/com/smartcontrol/presentation/session/SessionScreen.kt");
const service = read("app/src/main/java/com/smartcontrol/service/FamilySafetyService.kt");
const policy = read("functions/spec/masterCatalog.js");

check("Main screen uses SessionScreen", main.includes("SessionScreen("));
check("Main screen exposes START and STOP callbacks", main.includes("onStart = ::startServiceFromUserAction") && main.includes("onStop = ::stopServiceFromUserAction"));
check("START is user-triggered", session.includes("Button(") && session.includes("onClick = onStart") && session.includes('Text("START")'));
check("STOP is user-triggered", session.includes("OutlinedButton(") && session.includes("onClick = onStop") && session.includes('Text("STOP")'));
check("Service is not auto-started by screen LaunchedEffect", !main.includes("LaunchedEffect") && !main.includes("else FamilySafetyService.start(this@MainActivity)"));
check("Service starts only from START callback", main.includes("fun startServiceFromUserAction()") && main.includes("FamilySafetyService.start(this@MainActivity)"));
check("Service stops from STOP callback", main.includes("fun stopServiceFromUserAction()") && main.includes("FamilySafetyService.stop(this@MainActivity)"));
check("Background operation is foreground-visible", service.includes("startVisibleForeground") && service.includes("setOngoing(true)"));
check("No silent permission bypass markers", !/autoAllow|auto_grant|backgroundAllow|silentGrant|grantAllAutomatically|permissionBypass|skipPermissionDialog|withoutUserAction/i.test(main + session + service));
check("Master policy still forbids permission bypass", policy.includes("noPermissionBypass") && policy.includes("true"));

if (failures.length) {
  console.error("START_STOP_BACKGROUND_VERIFY=FAILED");
  console.error("Failures: " + failures.join(", "));
  process.exit(1);
}
console.log("START_STOP_BACKGROUND_VERIFY=STATIC_PASS");
