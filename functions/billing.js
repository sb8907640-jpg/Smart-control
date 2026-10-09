const crypto = require("crypto");
const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { getApps, getApp, initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const paymentWebhookSecret = defineSecret("SMARTCONTROL_PAYMENT_WEBHOOK_SECRET");

const app = getApps().length ? getApp() : initializeApp();
const db = getFirestore(app);

const PAYMENT_CONFIG_DOC = "ownerSettings/global";

const SUPPORTED_PAYMENT_GATEWAYS = new Set([
  "TEST",
  "RAZORPAY",
  "STRIPE",
  "PAYPAL",
  "CASHFREE",
  "PHONEPE",
  "PAYU",
  "CUSTOM"
]);

function normalizeGateway(value) {
  return String(value || "TEST").trim().toUpperCase();
}

function activeGateway(config) {
  const provider = normalizeGateway(config["payment.gatewayProvider"] || config["payment.gateway"]);
  if (!SUPPORTED_PAYMENT_GATEWAYS.has(provider)) {
    throw new HttpsError("failed-precondition", "Configured payment gateway is not supported.");
  }
  return provider;
}

function gatewaySecret(config, provider) {
  const mapRaw = String(config["payment.gatewayWebhookSecrets"] || "").trim();
  if (mapRaw) {
    try {
      const map = JSON.parse(mapRaw);
      if (map && typeof map === "object" && typeof map[provider] === "string" && map[provider]) {
        return map[provider];
      }
    } catch (_) {
      // Fall back to the single configured secret for backwards compatibility.
    }
  }
  return String(config["payment.webhookSecret"] || config["payment.encryptionKey"] || "");
}

function requireAuth(request) {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in first.");
}

function requireAdmin(request) {
  requireAuth(request);
  if (request.auth.token?.admin !== true) {
    throw new HttpsError("permission-denied", "Firebase admin role required.");
  }
}

async function readPaymentConfig() {
  const snap = await db.doc(PAYMENT_CONFIG_DOC).get();
  const data = snap.exists ? (snap.data() || {}) : {};
  // Current Android Owner Settings persist editable values under
  // masterConfig.ownerControl.editableValues. Also accept the legacy top-level
  // "values" map so existing deployments remain compatible.
  const nestedValues = data.masterConfig?.ownerControl?.editableValues || {};
  const legacyValues = data.values || {};
  const values = { ...nestedValues, ...legacyValues };
  return Object.fromEntries(
    Object.entries(values).filter(([key]) => key.startsWith("payment."))
  );
}

function money(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) throw new HttpsError("invalid-argument", "Invalid amount.");
  return Math.round(n);
}

function percent(value, name) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n) || n < 0 || n > 100) {
    throw new HttpsError("invalid-argument", name + " must be between 0 and 100.");
  }
  return n;
}

function effectivePlanPrice(plan) {
  const base = money(plan.priceMinor || 0);
  const discountPercent = percent(plan.discountPercent, "Discount");
  const discountMinor = money(plan.discountMinor || 0);
  const afterPercent = Math.max(0, Math.round(base - (base * discountPercent / 100)));
  return Math.max(0, afterPercent - discountMinor);
}

function applyTax(amountMinor, config, planTaxPercent = 0) {
  const tax = Number(config["payment.gstPercent"] || 0)
    + Number(config["payment.vatPercent"] || 0)
    + Number(config["payment.serviceTaxPercent"] || 0)
    + Number(planTaxPercent || 0);
  percent(tax, "Combined tax");
  if (config["payment.taxInclusive"] === "true") return amountMinor;
  return Math.round(amountMinor + amountMinor * tax / 100);
}

async function getPlan(planId) {
  const snap = await db.collection("plans").doc(planId).get();
  if (!snap.exists) throw new HttpsError("not-found", "Plan not found.");
  const plan = snap.data() || {};
  if (plan.enabled !== true) throw new HttpsError("failed-precondition", "Plan is disabled.");
  return { id: snap.id, ...plan };
}

async function getSubscriptionForUser(userId) {
  const snap = await db.collection("subscriptions")
    .where("userId", "==", userId)
    .where("status", "in", ["TRIAL", "ACTIVE", "PAST_DUE", "PAUSED"])
    .limit(1).get();
  return snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() };
}

function planDurationMs(plan) {
  const value = Math.max(1, Number(plan.durationValue || plan.durationDays || 30));
  const unit = String(plan.durationUnit || "DAY").toUpperCase();
  const factors = {
    HOUR: 3600000,
    DAY: 86400000,
    WEEK: 7 * 86400000,
    MONTH: 30 * 86400000,
    YEAR: 365 * 86400000
  };
  return Math.round(value * (factors[unit] || factors.DAY));
}

async function activateSubscriptionForPayment(paymentId, payment, verification = {}) {
  const paymentRef = db.collection("payments").doc(paymentId);
  const now = Date.now();
  const activation = await db.runTransaction(async (tx) => {
    const paymentSnap = await tx.get(paymentRef);
    if (!paymentSnap.exists) throw new HttpsError("not-found", "Payment not found.");
    const storedPayment = paymentSnap.data() || {};
    if (storedPayment.status === "REFUNDED") throw new HttpsError("failed-precondition", "Refunded payment cannot activate a subscription.");
    if (storedPayment.status === "SUCCESS" && storedPayment.subscriptionId) {
      return { subscriptionId: storedPayment.subscriptionId, expiresAtEpochMs: Number(storedPayment.expiresAtEpochMs || 0), payment: storedPayment, alreadyApplied: true };
    }
    const planRef = db.collection("plans").doc(storedPayment.planId || payment.planId);
    const planSnap = await tx.get(planRef);
    if (!planSnap.exists) throw new HttpsError("not-found", "Payment plan not found.");
    const plan = planSnap.data() || {};
    const userId = storedPayment.userId || payment.userId;
    if (!userId) throw new HttpsError("failed-precondition", "Payment has no user.");
    const existingQuery = db.collection("subscriptions").where("userId", "==", userId)
      .where("status", "in", ["TRIAL", "ACTIVE", "PAST_DUE", "PAUSED"]).limit(1);
    const existingSnap = await tx.get(existingQuery);
    const existing = existingSnap.empty ? null : { id: existingSnap.docs[0].id, ...existingSnap.docs[0].data() };
    const couponCode = storedPayment.couponCode;
    const couponRef = couponCode ? db.collection("coupons").doc(couponCode) : null;
    const couponSnap = couponRef ? await tx.get(couponRef) : null;
    const startsAt = existing?.expiresAtEpochMs > now ? existing.expiresAtEpochMs : now;
    const agreedDurationMs = Number(storedPayment.planDurationMs || planDurationMs(plan));
    const expiresAt = startsAt + agreedDurationMs;
    const subscriptionRef = existing ? db.collection("subscriptions").doc(existing.id) : db.collection("subscriptions").doc();
    tx.set(subscriptionRef, {
      userId, planId: planRef.id, status: "ACTIVE",
      startedAtEpochMs: existing?.startedAtEpochMs || now,
      expiresAtEpochMs: expiresAt, autoRenew: storedPayment.planAutoRenew === true,
      gracePeriodDays: Math.max(0, Number(storedPayment.planGracePeriodDays ?? plan.gracePeriodDays ?? 0)),
      // Snapshot the terms used for this paid period. Later plan edits
      // apply to future purchases and do not rewrite this subscription.
      agreedPriceMinor: Number(storedPayment.planPriceMinor ?? plan.priceMinor ?? 0),
      agreedAmountMinor: Number(storedPayment.amountMinor ?? payment.amountMinor ?? 0),
      agreedCurrency: String(storedPayment.currency ?? payment.currency ?? plan.currency ?? "INR"),
      agreedDiscountPercent: Number(storedPayment.planDiscountPercent ?? plan.discountPercent ?? 0),
      agreedDiscountMinor: Number(storedPayment.planDiscountMinor ?? plan.discountMinor ?? 0),
      agreedTaxPercent: Number(storedPayment.planTaxPercent ?? plan.taxPercent ?? 0),
      planVersionEpochMs: Number(storedPayment.planVersionEpochMs ?? plan.updatedAtEpochMs ?? plan.createdAtEpochMs ?? 0),
      pausedAtEpochMs: null, updatedAtEpochMs: now
    }, { merge: true });
    const updatedPayment = {
      status: "SUCCESS", subscriptionId: subscriptionRef.id, expiresAtEpochMs: expiresAt,
      activationApplied: true, updatedAtEpochMs: now, ...verification
    };
    if (couponRef && couponSnap?.exists && storedPayment.couponUsageCounted !== true) {
      tx.set(couponRef, { usageCount: FieldValue.increment(1), updatedAtEpochMs: now }, { merge: true });
      updatedPayment.couponUsageCounted = true;
    }
    tx.set(paymentRef, updatedPayment, { merge: true });
    return { subscriptionId: subscriptionRef.id, expiresAtEpochMs: expiresAt, payment: { ...storedPayment, ...updatedPayment }, alreadyApplied: false };
  });

  const config = await readPaymentConfig();
  if (config["payment.autoInvoice"] !== "false") {
    const invoiceRef = db.collection("invoices").doc(paymentId);
    const invoiceSnap = await invoiceRef.get();
    if (!invoiceSnap.exists) {
      const invoicePayment = activation.payment || payment;
      await invoiceRef.set({
        paymentId, subscriptionId: activation.subscriptionId, userId: invoicePayment.userId,
        planId: invoicePayment.planId, invoiceNumber: "INV-" + paymentId.slice(0, 12).toUpperCase(),
        amountMinor: invoicePayment.amountMinor, currency: invoicePayment.currency,
        template: String(config["payment.invoiceTemplate"] || "default"),
        footer: String(config["payment.invoiceFooter"] || ""),
        gstNumber: String(config["payment.gstNumber"] || ""),
        companyDetails: String(config["payment.companyDetails"] || ""),
        status: "ISSUED", issuedAtEpochMs: now, updatedAtEpochMs: now
      });
    }
  }
  return activation;
}

async function incrementCouponUsage(code) {
  if (!code) return;
  await db.collection("coupons").doc(code).update({
    usageCount: FieldValue.increment(1),
    updatedAtEpochMs: Date.now()
  }).catch(() => {});
}

exports.getPaymentConfig = onCall(async (request) => {
  requireAdmin(request);
  return { config: await readPaymentConfig() };
});

exports.createPayment = onCall(async (request) => {
  requireAuth(request);
  const planId = String(request.data?.planId || "").trim();
  if (!planId) throw new HttpsError("invalid-argument", "Plan ID is required.");

  const plan = await getPlan(planId);
  const config = await readPaymentConfig();
  const gateway = activeGateway(config);
  const method = String(request.data?.paymentMethod || "UPI").trim().toUpperCase();
  const gatewayMode = String(config["payment.gatewayMode"] || "TEST").toUpperCase();
  if (!["TEST", "LIVE"].includes(gatewayMode)) {
    throw new HttpsError("failed-precondition", "Payment gateway mode must be TEST or LIVE.");
  }
  if (gatewayMode === "LIVE" && gateway === "TEST") {
    throw new HttpsError("failed-precondition", "LIVE payment mode requires a non-test gateway.");
  }

  const methodMap = {
    UPI: "payment.upiEnabled",
    CARD: "payment.cardEnabled",
    NET_BANKING: "payment.netBankingEnabled",
    WALLET: "payment.walletEnabled",
    EMI: "payment.emiEnabled",
    CASH: "payment.cashOnDeliveryEnabled",
    CRYPTO: "payment.cryptoEnabled",
    BANK_TRANSFER: "payment.bankTransferEnabled"
  };
  if (methodMap[method] && config[methodMap[method]] === "false") {
    throw new HttpsError("failed-precondition", "Selected payment method is disabled.");
  }

  let amountMinor = effectivePlanPrice(plan);
  const couponCode = String(request.data?.couponCode || "").trim().toUpperCase();
  let couponId = null;

  if (couponCode) {
    const couponSnap = await db.collection("coupons").doc(couponCode).get();
    if (!couponSnap.exists) throw new HttpsError("not-found", "Coupon not found.");
    const coupon = couponSnap.data() || {};
    const now = Date.now();
    if (coupon.enabled !== true || (coupon.expiresAtEpochMs && coupon.expiresAtEpochMs <= now)) {
      throw new HttpsError("failed-precondition", "Coupon is not active.");
    }
    if (coupon.usageLimit > 0 && Number(coupon.usageCount || 0) >= coupon.usageLimit) {
      throw new HttpsError("failed-precondition", "Coupon usage limit reached.");
    }
    if (Number(coupon.discountPercent || 0) > 0) {
      amountMinor = Math.max(0, Math.round(amountMinor * (1 - percent(coupon.discountPercent, "Coupon discount") / 100)));
    }
    amountMinor = Math.max(0, amountMinor - money(coupon.discountMinor || 0));
    couponId = couponCode;
  }

  amountMinor = applyTax(amountMinor, config, plan.taxPercent);
  const ref = db.collection("payments").doc();
  const payment = {
    userId: request.auth.uid,
    planId,
    subscriptionId: null,
    amountMinor,
    currency: plan.currency || "INR",
    gateway,
    paymentMethod: method,
    gatewayReference: null,
    gatewayMode,
    gatewayProvider: gateway,
    couponCode: couponId,
    // Purchase-time snapshot for billing audit/history.
    planPriceMinor: Number(plan.priceMinor || 0),
    planDiscountPercent: Number(plan.discountPercent || 0),
    planDiscountMinor: Number(plan.discountMinor || 0),
    planTaxPercent: Number(plan.taxPercent || 0),
    planDurationMs: planDurationMs(plan),
    planAutoRenew: plan.autoRenew === true,
    planGracePeriodDays: Math.max(0, Number(plan.gracePeriodDays || 0)),
    planVersionEpochMs: Number(plan.updatedAtEpochMs || plan.createdAtEpochMs || 0),
    status: amountMinor === 0 ? "SUCCESS" : "PENDING",
    createdAtEpochMs: Date.now(),
    updatedAtEpochMs: Date.now()
  };
  await ref.set(payment);

  if (payment.status === "SUCCESS") {
    const activation = await activateSubscriptionForPayment(ref.id, payment);
    payment.subscriptionId = activation.subscriptionId;
  }

  return { payment: { id: ref.id, ...payment } };
});

exports.verifyPayment = onCall(async (request) => {
  requireAdmin(request);
  const paymentId = String(request.data?.paymentId || "").trim();
  const reference = String(request.data?.gatewayReference || "").trim();
  if (!paymentId || !reference) {
    throw new HttpsError("invalid-argument", "Payment ID and gateway reference are required.");
  }

  const ref = db.collection("payments").doc(paymentId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Payment not found.");
  const payment = snap.data() || {};
  if (payment.status === "REFUNDED") throw new HttpsError("failed-precondition", "Refunded payment cannot be verified.");

  const now = Date.now();
  const update = {
    status: "SUCCESS",
    gatewayReference: reference,
    verifiedBy: request.auth.uid,
    verifiedAtEpochMs: now,
    updatedAtEpochMs: now
  };
  await ref.update(update);

  const activation = await activateSubscriptionForPayment(paymentId, payment);
  await ref.update({ subscriptionId: activation.subscriptionId });
  return { ok: true, paymentId, subscriptionId: activation.subscriptionId, expiresAtEpochMs: activation.expiresAtEpochMs };
});

exports.applyEmi = onCall(async (request) => {
  requireAuth(request);
  const paymentId = String(request.data?.paymentId || "").trim();
  const tenureMonths = Number(request.data?.tenureMonths || 0);
  if (!paymentId || !Number.isInteger(tenureMonths) || tenureMonths <= 0) {
    throw new HttpsError("invalid-argument", "Payment ID and valid EMI tenure are required.");
  }

  const config = await readPaymentConfig();
  if (config["payment.emiEnabled"] === "false") {
    throw new HttpsError("failed-precondition", "EMI is disabled.");
  }
  const tenures = String(config["payment.emiTenuresMonths"] || "3,6,9,12")
    .split(",").map(v => Number(v.trim())).filter(Number.isInteger);
  if (!tenures.includes(tenureMonths)) {
    throw new HttpsError("failed-precondition", "Selected EMI tenure is not available.");
  }

  const paymentSnap = await db.collection("payments").doc(paymentId).get();
  if (!paymentSnap.exists || paymentSnap.data()?.userId !== request.auth.uid) {
    throw new HttpsError("not-found", "Payment not found.");
  }
  const payment = paymentSnap.data();
  if (String(payment.paymentMethod || "").toUpperCase() !== "EMI") {
    throw new HttpsError("failed-precondition", "EMI can only be applied to an EMI payment.");
  }
  const existingEmi = await db.collection("emiSchedule").where("paymentId", "==", paymentId).limit(1).get();
  if (!existingEmi.empty) {
    return { id: existingEmi.docs[0].id };
  }
  const processingFeeMinor = money(config["payment.emiProcessingFeeMinor"] || 0);
  const downPercent = percent(config["payment.emiDownPaymentPercent"] || 0, "EMI down payment");
  const downPaymentMinor = Math.round(payment.amountMinor * downPercent / 100);
  const scheduleRef = db.collection("emiSchedule").doc();
  await scheduleRef.set({
    paymentId,
    userId: request.auth.uid,
    tenureMonths,
    annualInterestBasisPoints: Math.round(Number(config["payment.emiInterestRatePercent"] || 0) * 100),
    processingFeeMinor,
    downPaymentMinor,
    autoDebitRequested: request.data?.autoDebit === true && config["payment.emiAutoDebit"] !== "false",
    status: "PENDING",
    createdAtEpochMs: Date.now(),
    updatedAtEpochMs: Date.now()
  });
  return { id: scheduleRef.id };
});

exports.refundPayment = onCall(async (request) => {
  requireAdmin(request);
  const paymentId = String(request.data?.paymentId || "").trim();
  if (!paymentId) throw new HttpsError("invalid-argument", "Payment ID is required.");

  const config = await readPaymentConfig();
  if (config["payment.refundEnabled"] === "false") {
    throw new HttpsError("failed-precondition", "Refunds are disabled.");
  }

  const ref = db.collection("payments").doc(paymentId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Payment not found.");
  const payment = snap.data() || {};
  if (payment.status !== "SUCCESS") throw new HttpsError("failed-precondition", "Only successful payments can be refunded.");

  const windowDays = Math.max(0, Number(config["payment.refundWindowDays"] || 0));
  if (windowDays > 0 && Date.now() - Number(payment.createdAtEpochMs || 0) > windowDays * 86400000) {
    throw new HttpsError("failed-precondition", "Refund window has expired.");
  }

  const refundPercent = percent(config["payment.refundPercent"] ?? 100, "Refund percent");
  const refundAmountMinor = Math.round(Number(payment.amountMinor || 0) * refundPercent / 100);
  await ref.update({
    status: "REFUNDED",
    refundAmountMinor,
    refundedAtEpochMs: Date.now(),
    refundedBy: request.auth.uid,
    updatedAtEpochMs: Date.now()
  });

  if (payment.subscriptionId) {
    await db.collection("subscriptions").doc(payment.subscriptionId).set({
      status: "CANCELLED",
      cancelledAtEpochMs: Date.now(),
      updatedAtEpochMs: Date.now()
    }, { merge: true });
  }
  return { ok: true, refundAmountMinor };
});

exports.createCoupon = onCall(async (request) => {
  requireAdmin(request);
  const code = String(request.data?.code || "").trim().toUpperCase();
  if (!/^[A-Z0-9_-]{3,40}$/.test(code)) {
    throw new HttpsError("invalid-argument", "Coupon code is invalid.");
  }
  const discountPercent = percent(request.data?.discountPercent || 0, "Coupon discount");
  const discountMinor = money(request.data?.discountMinor || 0);
  if (discountPercent === 0 && discountMinor === 0) {
    throw new HttpsError("invalid-argument", "Coupon must contain a discount.");
  }
  const validityDays = Math.max(0, Number(request.data?.validityDays || 0));
  const usageLimit = Math.max(0, Number(request.data?.usageLimit || 0));
  const now = Date.now();
  const coupon = {
    code,
    discountPercent,
    discountMinor,
    usageLimit,
    usageCount: 0,
    enabled: request.data?.enabled !== false,
    createdAtEpochMs: now,
    updatedAtEpochMs: now,
    expiresAtEpochMs: validityDays > 0 ? now + validityDays * 86400000 : null
  };
  await db.collection("coupons").doc(code).set(coupon);
  return { coupon };
});

exports.updateCoupon = onCall(async (request) => {
  requireAdmin(request);
  const code = String(request.data?.code || "").trim().toUpperCase();
  if (!code) throw new HttpsError("invalid-argument", "Coupon code is required.");
  const allowed = ["discountPercent","discountMinor","usageLimit","enabled","expiresAtEpochMs"];
  const patch = {};
  for (const key of allowed) if (request.data?.[key] !== undefined) patch[key] = request.data[key];
  if (patch.discountPercent !== undefined) patch.discountPercent = percent(patch.discountPercent, "Coupon discount");
  if (patch.discountMinor !== undefined) patch.discountMinor = money(patch.discountMinor);
  if (patch.usageLimit !== undefined) patch.usageLimit = Math.max(0, Number(patch.usageLimit));
  patch.updatedAtEpochMs = Date.now();
  await db.collection("coupons").doc(code).set(patch, { merge: true });
  return { ok: true };
});

exports.deleteCoupon = onCall(async (request) => {
  requireAdmin(request);
  const code = String(request.data?.code || "").trim().toUpperCase();
  if (!code) throw new HttpsError("invalid-argument", "Coupon code is required.");
  await db.collection("coupons").doc(code).delete();
  return { ok: true };
});

exports.listPaymentLedger = onCall(async (request) => {
  requireAdmin(request);
  const limit = Math.min(500, Math.max(1, Number(request.data?.limit || 100)));
  const snap = await db.collection("payments").orderBy("createdAtEpochMs", "desc").limit(limit).get();
  return { payments: snap.docs.map(d => ({ id: d.id, ...d.data() })) };
});

exports.listSubscriptions = onCall(async (request) => {
  requireAdmin(request);
  const limit = Math.min(500, Math.max(1, Number(request.data?.limit || 100)));
  const snap = await db.collection("subscriptions").orderBy("updatedAtEpochMs", "desc").limit(limit).get();
  return { subscriptions: snap.docs.map(d => ({ id: d.id, ...d.data() })) };
});

exports.updateSubscription = onCall(async (request) => {
  requireAdmin(request);
  const id = String(request.data?.subscriptionId || "").trim();
  const action = String(request.data?.action || "").toUpperCase();
  if (!id || !["CANCEL","EXTEND","UPGRADE","DOWNGRADE","PAUSE","RESUME"].includes(action)) {
    throw new HttpsError("invalid-argument", "Unsupported subscription action.");
  }

  const ref = db.collection("subscriptions").doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Subscription not found.");
  const sub = snap.data() || {};
  const now = Date.now();
  const patch = { updatedAtEpochMs: now };

  if (action === "CANCEL") patch.status = "CANCELLED";
  if (action === "PAUSE") { patch.status = "PAUSED"; patch.pausedAtEpochMs = now; }
  if (action === "RESUME") { patch.status = "ACTIVE"; patch.pausedAtEpochMs = null; }
  if (action === "EXTEND") {
    const days = Math.max(1, Number(request.data?.days || 30));
    patch.expiresAtEpochMs = Number(sub.expiresAtEpochMs || now) + days * 86400000;
    if (sub.status === "EXPIRED" || sub.status === "CANCELLED") patch.status = "ACTIVE";
  }
  if (action === "UPGRADE" || action === "DOWNGRADE") {
    const planId = String(request.data?.planId || "").trim();
    if (!planId) throw new HttpsError("invalid-argument", "Target plan is required.");
    const target = await getPlan(planId);
    patch.planId = target.id;
    patch.status = "ACTIVE";
  }
  await ref.set(patch, { merge: true });
  return { ok: true };
});

exports.getPaymentReport = onCall(async (request) => {
  requireAdmin(request);
  const start = Number(request.data?.startEpochMs || 0);
  const end = Number(request.data?.endEpochMs || Date.now());
  if (start < 0 || end < start) throw new HttpsError("invalid-argument", "Invalid report range.");

  const snap = await db.collection("payments")
    .where("createdAtEpochMs", ">=", start)
    .where("createdAtEpochMs", "<=", end)
    .orderBy("createdAtEpochMs", "desc")
    .limit(5000).get();

  const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  const summary = rows.reduce((a, p) => {
    const status = String(p.status || "UNKNOWN");
    a.count += 1;
    a.totalMinor += Number(p.amountMinor || 0);
    a.byStatus[status] = (a.byStatus[status] || 0) + 1;
    return a;
  }, { count: 0, totalMinor: 0, byStatus: {} });

  return { startEpochMs: start, endEpochMs: end, summary, rows };
});

exports.recordPayout = onCall(async (request) => {
  requireAdmin(request);
  const amountMinor = money(request.data?.amountMinor || 0);
  if (amountMinor <= 0) throw new HttpsError("invalid-argument", "Payout amount must be positive.");
  const ref = db.collection("payouts").doc();
  const payout = {
    amountMinor,
    currency: String(request.data?.currency || "INR"),
    method: String(request.data?.method || "BANK_TRANSFER"),
    accountLabel: String(request.data?.accountLabel || ""),
    status: "RECORDED",
    createdAtEpochMs: Date.now(),
    createdBy: request.auth.uid
  };
  await ref.set(payout);
  return { payout: { id: ref.id, ...payout } };
});

exports.listPayouts = onCall(async (request) => {
  requireAdmin(request);
  const snap = await db.collection("payouts").orderBy("createdAtEpochMs", "desc").limit(500).get();
  return { payouts: snap.docs.map(d => ({ id: d.id, ...d.data() })) };
});


exports.getPublicPlans = onCall(async (request) => {
  requireAuth(request);
  const snap = await db.collection("plans")
    .where("enabled", "==", true)
    .orderBy("displayOrder", "asc")
    .limit(100).get();
  return {
    plans: snap.docs.map(d => ({ id: d.id, ...d.data() }))
  };
});

exports.getMySubscription = onCall(async (request) => {
  requireAuth(request);
  const snap = await db.collection("subscriptions")
    .where("userId", "==", request.auth.uid)
    .orderBy("updatedAtEpochMs", "desc")
    .limit(1).get();
  return {
    subscription: snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() }
  };
});

exports.duplicatePlan = onCall(async (request) => {
  requireAdmin(request);
  const sourceId = String(request.data?.sourcePlanId || "").trim();
  const newId = String(request.data?.newPlanId || "").trim();
  if (!sourceId || !newId) throw new HttpsError("invalid-argument", "Source and new plan IDs are required.");
  if (sourceId === newId) throw new HttpsError("invalid-argument", "New plan ID must differ from source.");
  const source = await db.collection("plans").doc(sourceId).get();
  if (!source.exists) throw new HttpsError("not-found", "Source plan not found.");
  const target = db.collection("plans").doc(newId);
  if ((await target.get()).exists) throw new HttpsError("already-exists", "New plan ID already exists.");
  const data = { ...source.data(), name: String(request.data?.newName || source.data()?.name || newId), createdAtEpochMs: Date.now(), updatedAtEpochMs: Date.now() };
  await target.set(data);
  return { ok: true, plan: { id: newId, ...data } };
});


exports.getPaymentInvoice = onCall(async (request) => {
  requireAuth(request);
  const paymentId = String(request.data?.paymentId || "").trim();
  if (!paymentId) throw new HttpsError("invalid-argument", "Payment ID is required.");
  const snap = await db.collection("invoices").doc(paymentId).get();
  if (!snap.exists) throw new HttpsError("not-found", "Invoice not found.");
  const invoice = snap.data() || {};
  if (request.auth.token?.admin !== true && invoice.userId !== request.auth.uid) {
    throw new HttpsError("permission-denied", "Invoice access denied.");
  }
  return { invoice: { id: snap.id, ...invoice } };
});

exports.getPaymentReportExport = onCall(async (request) => {
  requireAdmin(request);
  const start = Number(request.data?.startEpochMs || 0);
  const end = Number(request.data?.endEpochMs || Date.now());
  if (start < 0 || end < start) throw new HttpsError("invalid-argument", "Invalid report range.");
  const snap = await db.collection("payments")
    .where("createdAtEpochMs", ">=", start)
    .where("createdAtEpochMs", "<=", end)
    .orderBy("createdAtEpochMs", "desc")
    .limit(5000).get();
  const esc = (v) => '"' + String(v ?? "").replace(/"/g, '""') + '"';
  const header = ["id","userId","planId","amountMinor","currency","gateway","paymentMethod","status","createdAtEpochMs"];
  const csv = [
    header.join(","),
    ...snap.docs.map(d => {
      const p = d.data() || {};
      return header.map(k => esc(p[k])).join(",");
    })
  ].join("\n");
  return { fileName: "payments-" + start + "-" + end + ".csv", mimeType: "text/csv", csv };
});

exports.expireSubscriptions = onSchedule("every 1 hours", async () => {
  const now = Date.now();
  const snap = await db.collection("subscriptions")
    .where("status", "in", ["TRIAL", "ACTIVE", "PAST_DUE"])
    .where("expiresAtEpochMs", "<=", now)
    .limit(500).get();
  if (snap.empty) return;
  const batch = db.batch();
  snap.docs.forEach(doc => {
    const sub = doc.data() || {};
    const graceDays = Math.max(0, Number(sub.gracePeriodDays || 0));
    const graceUntil = Number(sub.expiresAtEpochMs || 0) + graceDays * 86400000;
    batch.update(doc.ref, {
      status: graceDays > 0 && now < graceUntil ? "PAST_DUE" : "EXPIRED",
      updatedAtEpochMs: now
    });
  });
  await batch.commit();
});


exports.paymentGatewayWebhook = require("firebase-functions/v2/https").onRequest(async (req, res) => {
  try {
    if (req.method !== "POST") {
      res.status(405).send("Method Not Allowed");
      return;
    }
    const config = await readPaymentConfig();
    const paymentId = String((req.body || {}).paymentId || (req.body || {}).payment_id || "").trim();
    let paymentForSecret = null;
    if (paymentId) {
      const paymentSnap = await db.collection("payments").doc(paymentId).get();
      paymentForSecret = paymentSnap.exists ? paymentSnap.data() : null;
    }
    const provider = normalizeGateway(paymentForSecret?.gatewayProvider || paymentForSecret?.gateway || config["payment.gatewayProvider"] || config["payment.gateway"]);
    const secret = gatewaySecret(config, provider);
    const signature = String(req.get("x-smartcontrol-signature") || "");
    if (!secret || !signature) {
      res.status(401).send("Webhook authentication is not configured.");
      return;
    }
    const rawBody = Buffer.isBuffer(req.rawBody)
      ? req.rawBody
      : Buffer.from(JSON.stringify(req.body || {}));
    const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
    if (signature.length !== expected.length ||
        !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
      res.status(401).send("Invalid signature.");
      return;
    }

    const body = req.body || {};
    const webhookPaymentId = String(body.paymentId || body.payment_id || "").trim();
    const reference = String(body.gatewayReference || body.reference || body.id || "").trim();
    const status = String(body.status || "").toUpperCase();
    if (!webhookPaymentId || !reference) {
      res.status(400).send("Payment ID and reference are required.");
      return;
    }

    const ref = db.collection("payments").doc(paymentId);
    const snap = await ref.get();
    if (!snap.exists) {
      res.status(404).send("Payment not found.");
      return;
    }
    const payment = snap.data() || {};
    if (status === "SUCCESS" || status === "PAID" || status === "CAPTURED") {
      const activation = await activateSubscriptionForPayment(paymentId, payment);
      await ref.update({
        status: "SUCCESS",
        gatewayReference: reference,
        subscriptionId: activation.subscriptionId,
        verifiedAtEpochMs: Date.now(),
        updatedAtEpochMs: Date.now()
      });
    } else if (status === "FAILED" || status === "CANCELLED") {
      await ref.update({
        status: status === "CANCELLED" ? "FAILED" : "FAILED",
        gatewayReference: reference,
        updatedAtEpochMs: Date.now()
      });
    } else if (status === "REFUNDED") {
      await ref.update({
        status: "REFUNDED",
        gatewayReference: reference,
        refundAmountMinor: Number(payment.amountMinor || 0),
        refundedAtEpochMs: Date.now(),
        updatedAtEpochMs: Date.now()
      });
      if (payment.subscriptionId) {
        await db.collection("subscriptions").doc(payment.subscriptionId).set({
          status: "CANCELLED",
          cancelledAtEpochMs: Date.now(),
          updatedAtEpochMs: Date.now()
        }, { merge: true });
      }
    } else {
      await ref.update({
        status: "PENDING",
        gatewayReference: reference,
        updatedAtEpochMs: Date.now()
      });
    }

    res.status(200).json({ ok: true });
  } catch (error) {
    console.error("paymentGatewayWebhook", error);
    res.status(500).send("Webhook processing failed.");
  }
});
