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
      alreadyReflected: false,
      refundedAmountMinor: refundedBeforeMinor,
      fullyRefunded: current?.status === "REFUNDED",
      processedRefundIds: processedIds
    };
  }
  const proposedRefundedAmountMinor = refundedBeforeMinor + refundAmountMinor;
  const providerCumulativeMinor = Number(current?.razorpayCumulativeRefundedAmountMinor || 0);
  if (Number.isSafeInteger(providerCumulativeMinor) &&
      providerCumulativeMinor >= proposedRefundedAmountMinor) {
    return {
      duplicate: false,
      alreadyReflected: true,
      refundedAmountMinor: refundedBeforeMinor,
      fullyRefunded: refundedBeforeMinor >= amountMinor,
      processedRefundIds: [...processedIds, refundId]
    };
  }
  if (refundAmountMinor > amountMinor - refundedBeforeMinor) {
    throw new TypeError("Refund amount exceeds the remaining refundable balance.");
  }
  const refundedAmountMinor = proposedRefundedAmountMinor;
  return {
    duplicate: false,
    alreadyReflected: false,
    refundedAmountMinor,
    fullyRefunded: refundedAmountMinor === amountMinor,
    processedRefundIds: [...processedIds, refundId]
  };
}

function matchesPendingRefund(current, refundIdValue, requestIdValue) {
  if (Number(current?.pendingRefundAmountMinor || 0) <= 0) return false;
  const refundId = String(refundIdValue || "").trim();
  const requestId = String(requestIdValue || "").trim();
  return Boolean(
    (requestId && String(current?.refundRequestId || "") === requestId) ||
    (refundId && String(current?.gatewayRefundId || "") === refundId)
  );
}

module.exports = { reconcileProcessedRefund, matchesPendingRefund };
