"use strict";

const assert = require("node:assert/strict");
const { reconcileProcessedRefund } = require("./razorpay-refund-state");

const partial = reconcileProcessedRefund(
  { amountMinor: 1000, refundedAmountMinor: 0, processedGatewayRefundIds: [] },
  "rfnd_1",
  400
);
assert.equal(partial.duplicate, false);
assert.equal(partial.refundedAmountMinor, 400);
assert.equal(partial.fullyRefunded, false);

const duplicate = reconcileProcessedRefund(
  { amountMinor: 1000, refundedAmountMinor: 400, processedGatewayRefundIds: ["rfnd_1"] },
  "rfnd_1",
  400
);
assert.equal(duplicate.duplicate, true);
assert.equal(duplicate.refundedAmountMinor, 400);

const full = reconcileProcessedRefund(
  { amountMinor: 1000, refundedAmountMinor: 400, processedGatewayRefundIds: ["rfnd_1"] },
  "rfnd_2",
  600
);
assert.equal(full.refundedAmountMinor, 1000);
assert.equal(full.fullyRefunded, true);
assert.deepEqual(full.processedRefundIds, ["rfnd_1", "rfnd_2"]);

assert.throws(() => reconcileProcessedRefund(
  { amountMinor: 1000, refundedAmountMinor: 900, processedGatewayRefundIds: [] },
  "rfnd_over",
  101
), /remaining refundable balance/);
assert.throws(() => reconcileProcessedRefund(
  { amountMinor: 1000, refundedAmountMinor: 0, processedGatewayRefundIds: [] },
  "rfnd_bad",
  0
), /positive integer/);
assert.throws(() => reconcileProcessedRefund(
  { amountMinor: 1000, refundedAmountMinor: 0, processedGatewayRefundIds: [] },
  "",
  100
), /Refund ID/);

console.log("Razorpay refund-state tests passed (partial, duplicate, full, over-refund, invalid amount, missing ID).");
