const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const failures = [];

function read(relativePath) {
  const fullPath = path.join(root, relativePath);
  return fs.existsSync(fullPath) ? fs.readFileSync(fullPath, "utf8") : "";
}
function check(label, ok, detail = "") {
  console.log((ok ? "PASS " : "FAIL ") + label + (detail ? " :: " + detail : ""));
  if (!ok) failures.push(label);
}

const ownerPanel = read("app/src/main/java/com/smartcontrol/presentation/owner/OwnerAdminScreen.kt");
const ownerRepository = read("app/src/main/java/com/smartcontrol/data/owner/FirestoreOwnerSettingsRepository.kt");
const billingScreen = read("app/src/main/java/com/smartcontrol/presentation/billing/BillingScreen.kt");
const billingRepository = read("app/src/main/java/com/smartcontrol/data/billing/FirebaseBillingRepository.kt");
const billingFunctions = read("functions/billing.js");
const gatewayPermit = read("functions/gateway-permit.js");
const mainActivity = read("app/src/main/java/com/smartcontrol/MainActivity.kt");
const firestoreRules = read("firestore.rules");

console.log("FAMILY SURAKSHA — OWNER PAYMENT / TARIFF INTEGRATION VERIFICATION");

check("Owner panel edits provider, mode, webhook secret and provider config",
  ["payment.gatewayProvider", "payment.gatewayMode", "payment.webhookSecret", "payment.gatewayProviderConfig"]
    .every(key => ownerPanel.includes('values["' + key + '"]')));
check("Owner settings persist editable values under the master owner-control model",
  ownerRepository.includes('"editableValues" to config.ownerControl.editableValues'));
check("Billing backend reads current nested owner settings",
  billingFunctions.includes("data.masterConfig?.ownerControl?.editableValues"));
check("Billing backend keeps legacy payment-config compatibility",
  billingFunctions.includes("const legacyValues = data.values || {}") &&
  billingFunctions.includes("const values = { ...nestedValues, ...legacyValues }"));
check("Payment creation selects gateway from server-side owner configuration",
  /const config = await readPaymentConfig\(\);[\s\S]{0,160}const gateway = activeGateway\(config\);/.test(billingFunctions));
check("Android billing screen loads plan catalog and invokes payment repository",
  billingScreen.includes("viewModel.load(") && billingScreen.includes("viewModel.buy(plan, method, coupon)"));
check("Android repository calls the server-side createPayment function",
  billingRepository.includes('getHttpsCallable("createPayment")'));
check("Owner payment configuration remains admin-only in Firestore rules",
  /match \/ownerSettings\/\{document\}[\s\S]{0,240}request\.auth\.token\.admin == true/.test(firestoreRules));

console.log("");
if (failures.length) {
  console.error("OWNER_PAYMENT_INTEGRATION=FAILED");
  console.error("Failures: " + failures.join(", "));
  process.exit(1);
}
console.log("OWNER_PAYMENT_INTEGRATION=STATIC_PASS");
console.log("Live gateway credentials, webhook delivery, and a real paid transaction still require deployment/runtime verification.");
