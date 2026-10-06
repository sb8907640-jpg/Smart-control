const test = require("node:test");
const assert = require("node:assert/strict");
const { computeAuditRoot, getAnchorConfig } = require("./blockchain-audit");

test("audit root is deterministic regardless of input ordering", () => {
  const a = [
    { id: "2", userId: "u1", deviceId: "d1", action: "STOP", createdAt: 200 },
    { id: "1", userId: "u1", deviceId: "d1", action: "START", createdAt: 100 }
  ];
  const b = [...a].reverse();
  assert.equal(computeAuditRoot(a), computeAuditRoot(b));
  assert.match(computeAuditRoot(a), /^0x[0-9a-f]{64}$/);
});

test("blockchain anchoring stays explicitly unconfigured without production credentials", () => {
  const config = getAnchorConfig({});
  assert.equal(config.rpcUrl, "");
  assert.equal(config.privateKey, "");
  assert.equal(config.contractAddress, "");
});
