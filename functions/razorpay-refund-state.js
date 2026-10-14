"use strict";

function reconcileProcessedRefund(current, refundIdValue, refundAmountValue) {
  const refundId = String(refundIdValue || "").trim();
  const refundAmountMinor = Number(refundAmountValue);
  const amountMinor = Number(current?.amountMinor || 0);
  const refundedBeforeMinor = Number(current?.refundedAmountMinor || 0);
  if (!refundId) throw new TypeError("Refund ID is required.");
  if (!Number.isSafeInteger(refundAmountMinor) || refundAmountMinor <= 0) {
    throw new TypeError("Refund amount must be a positive integer in minor currency units.");
  }
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
    throw new TypeError("Payment amount must be a positive integer in minor currency units.");
  }
  if (!Number.isSafeInteger(refundedBeforeMinor) || refundedBeforeMinor < 0 || refundedBeforeMinor > amountMinor) {
    throw new TypeError("Existing refunded amount is invalid.");
  }
  const processedIds = Array.isArray(current?.processedGatewayRefundIds)
    ? current.processedGatewayRefundIds
    : [];
  if (processedIds.includes(refundId)) {
    return {
      duplicate: true,
      refundedAmountMinor: refundedBeforeMinor,
      fullyRefunded: current?.status === "REFUNDED",
      processedRefundIds: processedIds
    };
  }
  if (refundAmountMinor > amountMinor - refundedBeforeMinor) {
    throw new TypeError("Refund amount exceeds the remaining refundable balance.");
  }
  const refundedAmountMinor = refundedBeforeMinor + refundAmountMinor;
  return {
    duplicate: false,
    refundedAmountMinor,
    fullyRefunded: refundedAmountMinor === amountMinor,
    processedRefundIds: [...processedIds, refundId]
  };
}

module.exports = { reconcileProcessedRefund };
