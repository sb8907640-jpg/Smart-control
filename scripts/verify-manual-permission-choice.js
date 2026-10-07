const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const failures = [];
const pending = [];

function read(rel) {
  const file = path.join(root, rel);
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
}
function sourceFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "build" || entry.name === ".gradle" || entry.name === "node_modules") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(full));
    else if (/\.(kt|kts|java|xml|tsx|ts|js|jsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}
const files = [
  ...sourceFiles(path.join(root, "app")),
  ...sourceFiles(path.join(root, "web")),
  ...sourceFiles(path.join(root, "backend")),
  ...sourceFiles(path.join(root, "desktop"))
];
const source = files.map(f => fs.readFileSync(f, "utf8")).join("\n");
const permissionCenter = read("app/src/main/java/com/smartcontrol/domain/permission/PermissionCenter.kt");
const features = read("app/src/main/java/com/smartcontrol/domain/feature/FeatureModule.kt");
const manifest = read("app/src/main/AndroidManifest.xml");
const masterPolicy = read("functions/spec/masterCatalog.js");

function check(name, ok, detail = "") {
  console.log((ok ? "PASS " : "FAIL ") + name + (detail ? " :: " + detail : ""));
  if (!ok) failures.push(name);
}
function runtime(name, detail) {
  console.log("PENDING RUNTIME " + name + " :: " + detail);
  pending.push(name);
}

console.log("SMART CONTROL — MANUAL PERMISSION CHOICE / NO BACKGROUND AUTO-ALLOW VERIFICATION");

check("Permission policy explicitly forbids bypass", masterPolicy.includes("noPermissionBypass") && masterPolicy.includes("true"));
check("Permission Center source exists", Boolean(permissionCenter));
check("Both manual choices are represented",
  /(ALLOW ALL PERMISSIONS|Allow All Permissions|allowAll)/i.test(source) &&
  /(ALLOW ONE-BY-ONE|Allow One-by-One|allowOneByOne|oneByOne)/i.test(source));
check("Allow All is tied to a user interaction",
  /(onClick|onTap|clickable|Button|button|setOnClickListener)[\s\S]{0,500}(ALLOW ALL|Allow All|allowAll)/i.test(source));
check("One-by-One is tied to a user interaction",
  /(onClick|onTap|clickable|Button|button|setOnClickListener)[\s\S]{0,500}(ALLOW ONE-BY-ONE|Allow One-by-One|allowOneByOne|oneByOne)/i.test(source));
check("No background auto-allow marker",
  !/(autoAllow|auto_grant|backgroundAllow|silentGrant|grantAllAutomatically|requestAllInBackground)/i.test(source));
check("No permission-bypass marker",
  !/(permissionBypass|skipPermissionDialog|suppressPermissionDialog|withoutUserAction)/i.test(source));
check("19 control features remain catalogued",
  (features.match(/^[ ]+[A-Z0-9_]+\(/gm) || []).length === 19);
check("Sensitive Android permissions remain declared", [
  "android.permission.CAMERA",
  "android.permission.RECORD_AUDIO",
  "android.permission.POST_NOTIFICATIONS"
].every(p => manifest.includes(p)));

runtime("Allow All — manual tap", "Physical device must show the button and require the user to tap it.");
runtime("Allow All — sequential permission dialogs", "Physical Android evidence is required for the complete user-driven permission sequence.");
runtime("One-by-One — manual tap", "Physical device must show the button and require the user to tap it.");
runtime("One-by-One — Allow/Deny per permission", "Physical Android evidence is required for explanation plus user choice at each step.");
runtime("Denied permission can be enabled later", "Requires physical settings/re-entry verification.");
runtime("Background never changes permission state", "Requires runtime observation with the app backgrounded.");

console.log("");
if (failures.length) {
  console.error("MANUAL_PERMISSION_VERIFY=FAILED");
  console.error("Failures: " + failures.join(", "));
  process.exit(1);
}
console.log("MANUAL_PERMISSION_VERIFY=STATIC_PASS");
console.log("Pending runtime evidence: " + pending.length);
