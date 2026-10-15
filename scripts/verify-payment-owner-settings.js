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
const functionsIndex = read("functions/index.js");
const mainActivity = read("app/src/main/java/com/smartcontrol/MainActivity.kt");
const firestoreRules = read("firestore.rules");

console.log("FAMILY SURAKSHA — OWNER PAYMENT / TARIFF INTEGRATION VERIFICATION");

check("Firebase Functions entry point exports all Owner gateway permit callables",
  functionsIndex.includes("exports.savePaymentGatewayPermit = gatewayPermitFunctions.savePaymentGatewayPermit;") &&
    functionsIndex.includes("exports.getPaymentGatewayPermit = gatewayPermitFunctions.getPaymentGatewayPermit;") &&
    functionsIndex.includes("exports.getPaymentGatewayProviderCatalog = gatewayPermitFunctions.getPaymentGatewayProviderCatalog;") &&
    functionsIndex.includes("exports.savePaymentGatewayProviderDraft = gatewayPermitFunctions.savePaymentGatewayProviderDraft;") &&
    !functionsIndex.includes("exports.getActiveGatewayPermit = gatewayPermitFunctions.getActiveGatewayPermit;") &&
    gatewayPermit.includes("exports.savePaymentGatewayPermit") &&
    gatewayPermit.includes("exports.getPaymentGatewayPermit") &&
    gatewayPermit.includes("exports.getPaymentGatewayProviderCatalog") &&
    gatewayPermit.includes("exports.savePaymentGatewayProviderDraft"),
  "Owner UI callables must be exported by functions/index.js so Firebase can deploy them.");

check("Owner panel uses the secure gateway permit and encrypted future-provider drafts",
  ownerPanel.includes("PaymentGatewayPermitPanel") &&
    ownerPanel.includes("savePaymentGatewayPermit") &&
    ownerPanel.includes("Additional Gateway Profiles") &&
    ownerPanel.includes("savePaymentGatewayProviderDraft") &&
    ownerPanel.includes("CASHFREE") &&
    ownerPanel.includes("PHONEPE") &&
    !ownerPanel.includes('values["payment.webhookSecret"]'),
  "Live gateway credentials are isolated in the Owner-only server permit; other providers remain encrypted drafts until adapters are implemented.");
check("Owner settings persist editable values under the master owner-control model",
  ownerRepository.includes('"editableValues" to config.ownerControl.editableValues'));
check("Billing backend reads current nested owner settings",
  billingFunctions.includes("data.masterConfig?.ownerControl?.editableValues"));
check("Billing backend keeps legacy payment-config compatibility",
  billingFunctions.includes("const legacyValues = data.values || {}") &&
  billingFunctions.includes("const values = { ...nestedValues, ...legacyValues }"));
check("Payment creation selects the active Owner permit before legacy configuration",
  /const config = await readPaymentConfig\(\);[\s\S]{0,240}const permit = await getActiveGatewayPermit\(\);[\s\S]{0,160}const gateway = permit \? permit.provider : activeGateway\(config\);/.test(billingFunctions));
check("Gateway credentials are AES-256-GCM encrypted server-side",
  gatewayPermit.includes("aes-256-gcm") && gatewayPermit.includes("encryptedCredentials"));
check("Gateway writes are restricted to configured Owner identities",
  gatewayPermit.includes("async function requireOwner") && gatewayPermit.includes("Only a configured Family Suraksha Owner"));
check("Legacy editable gateway fields cannot activate live gateways",
  billingFunctions.includes("Live gateways must be configured through the Owner-only Permanent Gateway Permit."));
check("Manual reference verification cannot activate real-gateway payments",
  billingFunctions.includes("Manual reference verification is disabled for real gateways."));
check("Owner panel exposes permanent permit and secret entry fields",
  ownerPanel.includes("PaymentGatewayPermitPanel") && ownerPanel.includes("savePaymentGatewayPermit") &&
  ownerPanel.includes("Razorpay Webhook Secret"));
const razorpayVerifyBlock = billingFunctions.slice(
  billingFunctions.indexOf("exports.verifyRazorpayPayment"),
  billingFunctions.indexOf("exports.applyEmi")
);
const razorpayWebhookBlock = billingFunctions.slice(
  billingFunctions.indexOf("exports.razorpayWebhook"),
  billingFunctions.indexOf("exports.paymentGatewayWebhook")
);
check("Verified payment activation cannot overwrite a concurrent refund lock",
  !/activateSubscriptionForPayment[\s\S]{0,500}await ref\.update\(\{\s*status:\s*"SUCCESS"/.test(razorpayVerifyBlock) &&
    !/activateSubscriptionForPayment[\s\S]{0,500}paymentDoc\.ref\.update\(\{\s*status:\s*"SUCCESS"/.test(razorpayWebhookBlock),
  "The activation transaction persists success atomically; no redundant follow-up write may revert REFUND_PENDING.");

const paymentFailedWebhookBlock = razorpayWebhookBlock.slice(
  razorpayWebhookBlock.indexOf('eventName === "payment.failed"'),
  razorpayWebhookBlock.indexOf('eventName === "refund.created"')
);
const refundFailedWebhookBlock = razorpayWebhookBlock.slice(
  razorpayWebhookBlock.indexOf('eventName === "refund.failed"'),
  razorpayWebhookBlock.indexOf('eventName === "payment.refunded"')
);
check("Delayed payment failure cannot overwrite a captured payment",
  paymentFailedWebhookBlock.includes("db.runTransaction") &&
    paymentFailedWebhookBlock.includes('latestPayment.status !== "PENDING"'),
  "Failure events only transition a payment that is still PENDING inside a transaction.");
check("Failed refund event cannot revert a completed refund",
  refundFailedWebhookBlock.includes("db.runTransaction") &&
    refundFailedWebhookBlock.includes('latestPayment.status !== "REFUND_PENDING"') &&
    refundFailedWebhookBlock.includes("latestPayment.gatewayRefundId === refundId"),
  "A refund failure only restores SUCCESS while the same refund remains pending.");

const refundCreatedWebhookBlock = razorpayWebhookBlock.slice(
  razorpayWebhookBlock.indexOf('eventName === "refund.created"'),
  razorpayWebhookBlock.indexOf('eventName === "refund.processed"')
);
const refundProcessedWebhookBlock = razorpayWebhookBlock.slice(
  razorpayWebhookBlock.indexOf('eventName === "refund.processed"'),
  razorpayWebhookBlock.indexOf('eventName === "refund.failed"')
);
check("Refund webhooks reconcile only the current refund attempt",
  refundCreatedWebhookBlock.includes("db.runTransaction") &&
    refundCreatedWebhookBlock.includes("previousGatewayRefundId === refundId") &&
    refundProcessedWebhookBlock.includes("db.runTransaction") &&
    refundProcessedWebhookBlock.includes("latestPayment.gatewayRefundId !== refundId"),
  "Late events from an earlier refund attempt cannot overwrite the active attempt's status.");

check("Refund API responses preserve webhook-completed state",
  billingFunctions.includes("const finalStatus = await db.runTransaction") &&
    billingFunctions.includes("latestPayment.previousGatewayRefundId === gatewayRefundId") &&
    billingFunctions.includes("gatewayRefundId: FieldValue.delete()"),
  "Late API responses cannot regress REFUNDED or reuse a prior attempt's refund ID.");

check("Gateway credential versions are retained for pending payment verification",
  gatewayPermit.includes("paymentGatewayPermitVersions") && billingFunctions.includes("gatewayPermitRevision"));
check("Android checkout submits success details for server verification",
  mainActivity.includes("onRazorpayCheckout = ::startRazorpayCheckout") &&
  mainActivity.includes('getHttpsCallable("verifyRazorpayPayment")'));
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
