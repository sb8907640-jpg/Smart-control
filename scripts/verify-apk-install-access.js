const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const manifest = fs.readFileSync(path.join(root, "app/src/main/AndroidManifest.xml"), "utf8");
const screen = fs.readFileSync(
  path.join(root, "app/src/main/java/com/smartcontrol/presentation/localdata/AppInstallScreen.kt"),
  "utf8"
);

const checks = [
  ["APK installation permission is declared", manifest.includes('android.permission.REQUEST_INSTALL_PACKAGES')],
  ["Unknown-app access is checked on Android 8+", screen.includes("Build.VERSION_CODES.O") && screen.includes("canRequestPackageInstalls()")],
  ["Settings opens the per-app unknown-source access page", screen.includes("Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES") && screen.includes("package:${context.packageName}")],
  ["Installer receives a read-granted APK URI", screen.includes("setDataAndType(uri, \"application/vnd.android.package-archive\")") && screen.includes("Intent.FLAG_GRANT_READ_URI_PERMISSION")],
  ["Installation remains user-confirmed by Android", screen.includes("context.startActivity(intent)") && screen.includes("The user must confirm the installation.")],
  ["Uninstall remains a system confirmation flow", screen.includes("Intent.ACTION_DELETE") && screen.includes("package:\" + pkg")]
];

const failures = [];
for (const [name, passed] of checks) {
  console.log((passed ? "PASS " : "FAIL ") + name);
  if (!passed) failures.push(name);
}

if (failures.length) {
  console.error("APK_INSTALL_ACCESS_VERIFY=FAILED");
  console.error("Failures: " + failures.join(", "));
  process.exit(1);
}
console.log("APK_INSTALL_ACCESS_VERIFY=STATIC_PASS");
