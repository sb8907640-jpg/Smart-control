"use strict";

const SUPPORTED_EVENTS = new Set([
  "payment.captured",
  "payment.failed",
  "payment.refunded",
  "refund.processed",
  "refund.failed"
]);

function extractRazorpayWebhookEvent(event) {
  const eventName = String(event?.event || "");
  if (!SUPPORTED_EVENTS.has(eventName)) {
    return { supported: false, eventName };
  }
  const isRefundEvent = eventName === "refund.processed" || eventName === "refund.failed";
  const entity = isRefundEvent
    ? (event?.payload?.refund?.entity || {})
    : (event?.payload?.payment?.entity || event?.payload?.order?.entity || {});
  const razorpayPaymentId = String(
    isRefundEvent ? entity.payment_id || "" : entity.id || ""
  ).trim();
  const orderId = String(
    entity.order_id || (isRefundEvent ? "" : entity.id) || ""
  ).trim();
  return {
    supported: true,
    eventName,
    isRefundEvent,
    entity,
    razorpayPaymentId,
    orderId
  };
}

module.exports = { extractRazorpayWebhookEvent };
