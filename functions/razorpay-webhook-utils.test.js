"use strict";

const assert = require("node:assert/strict");
const { extractRazorpayWebhookEvent } = require("./razorpay-webhook-utils");

const captured = extractRazorpayWebhookEvent({
  event: "payment.captured",
  payload: { payment: { entity: { id: "pay_123", order_id: "order_123" } } }
});
assert.equal(captured.supported, true);
assert.equal(captured.isRefundEvent, false);
assert.equal(captured.razorpayPaymentId, "pay_123");
assert.equal(captured.orderId, "order_123");

const refundProcessed = extractRazorpayWebhookEvent({
  event: "refund.processed",
  payload: { refund: { entity: { id: "rfnd_123", payment_id: "pay_123", amount: 250, notes: { smartcontrolRefundRequestId: "req_123" } } } }
});
assert.equal(refundProcessed.supported, true);
assert.equal(refundProcessed.isRefundEvent, true);
assert.equal(refundProcessed.razorpayPaymentId, "pay_123");
assert.equal(refundProcessed.orderId, "");
assert.equal(refundProcessed.refundRequestId, "req_123");

const paymentRefunded = extractRazorpayWebhookEvent({
  event: "payment.refunded",
  payload: { payment: { entity: { id: "pay_123", order_id: "order_123", amount_refunded: 500 } } }
});
assert.equal(paymentRefunded.supported, true);
assert.equal(paymentRefunded.razorpayPaymentId, "pay_123");
assert.equal(paymentRefunded.orderId, "order_123");

const failedRefund = extractRazorpayWebhookEvent({
  event: "refund.failed",
  payload: { refund: { entity: { id: "rfnd_456", payment_id: "pay_456" } } }
});
assert.equal(failedRefund.supported, true);
assert.equal(failedRefund.razorpayPaymentId, "pay_456");

assert.deepEqual(extractRazorpayWebhookEvent({
  event: "subscription.activated",
  payload: {}
}), { supported: false, eventName: "subscription.activated" });

console.log("Razorpay webhook parser tests passed.");
