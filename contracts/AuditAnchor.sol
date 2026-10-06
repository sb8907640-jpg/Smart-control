// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * Minimal tamper-evident audit anchor.
 * The application computes the audit root off-chain and records the root on-chain.
 * Only the configured anchorer may write a new root.
 */
contract AuditAnchor {
    address public immutable anchorer;
    bytes32 public latestRoot;
    uint64 public latestAnchoredAt;

    event AuditRootAnchored(bytes32 indexed auditRoot, uint64 anchoredAt);

    constructor(address initialAnchorer) {
        require(initialAnchorer != address(0), "invalid anchorer");
        anchorer = initialAnchorer;
    }

    function anchor(bytes32 auditRoot) external {
        require(msg.sender == anchorer, "not anchorer");
        require(auditRoot != bytes32(0), "empty root");
        latestRoot = auditRoot;
        latestAnchoredAt = uint64(block.timestamp);
        emit AuditRootAnchored(auditRoot, latestAnchoredAt);
    }
}
