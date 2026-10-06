const crypto = require("crypto");
const { ethers } = require("ethers");

const ABI = [
  "function anchor(bytes32 auditRoot)",
  "function latestRoot() view returns (bytes32)",
  "function latestAnchoredAt() view returns (uint64)"
];

function canonicalEvent(event) {
  return JSON.stringify({
    id: String(event.id || ""),
    userId: String(event.userId || ""),
    deviceId: String(event.deviceId || ""),
    action: String(event.action || ""),
    createdAt: Number(event.createdAt || 0)
  });
}

function computeAuditRoot(events) {
  if (!Array.isArray(events) || events.length === 0) {
    throw new Error("At least one audit event is required.");
  }
  let hash = Buffer.alloc(32);
  for (const event of [...events].sort((a, b) => canonicalEvent(a).localeCompare(canonicalEvent(b)))) {
    hash = crypto.createHash("sha256")
      .update(hash)
      .update(canonicalEvent(event))
      .digest();
  }
  return "0x" + hash.toString("hex");
}

function getAnchorConfig(env = process.env) {
  return {
    rpcUrl: String(env.SMARTCONTROL_AUDIT_RPC_URL || "").trim(),
    privateKey: String(env.SMARTCONTROL_AUDIT_PRIVATE_KEY || "").trim(),
    contractAddress: String(env.SMARTCONTROL_AUDIT_CONTRACT_ADDRESS || "").trim()
  };
}

async function anchorAuditRoot(root, env = process.env) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(root)) throw new Error("Invalid audit root.");
  const config = getAnchorConfig(env);
  if (!config.rpcUrl || !config.privateKey || !ethers.isAddress(config.contractAddress)) {
    throw new Error("Blockchain audit anchoring is not configured.");
  }
  const provider = new ethers.JsonRpcProvider(config.rpcUrl);
  const signer = new ethers.Wallet(config.privateKey, provider);
  const contract = new ethers.Contract(config.contractAddress, ABI, signer);
  const tx = await contract.anchor(root);
  const receipt = await tx.wait();
  return { root, transactionHash: receipt.hash, blockNumber: receipt.blockNumber };
}

module.exports = { ABI, canonicalEvent, computeAuditRoot, getAnchorConfig, anchorAuditRoot };
