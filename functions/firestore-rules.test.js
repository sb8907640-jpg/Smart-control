const fs = require("node:fs");
const path = require("node:path");
const {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds
} = require("@firebase/rules-unit-testing");
const {
  doc,
  setDoc,
  updateDoc,
  getDoc,
  runTransaction
} = require("firebase/firestore");

const rules = fs.readFileSync(path.join(__dirname, "../firestore.rules"), "utf8");
const projectId = "demo-family-suraksha";
const token = "a".repeat(48);
const now = Date.now();

async function main() {
  const env = await initializeTestEnvironment({
    projectId,
    firestore: { rules, host: "127.0.0.1", port: 8080 }
  });

  try {
    const normal = env.authenticatedContext("normal-user");
    const owner = env.authenticatedContext("owner-user", { admin: true, role: "OWNER" });
    const controller = env.authenticatedContext("controller-user");
    const target = env.authenticatedContext("target-user");
    const adminOnly = env.authenticatedContext("admin-only", { admin: true, role: "ADMIN" });
    const allowlistOwner = env.authenticatedContext("allowlist-owner", { email: "allowlist-owner@example.test" });
    const mobileAllowlistOwner = env.authenticatedContext("mobile-allowlist-owner", { phone_number: "+15551234567" });
    await env.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "featurePolicy", "global"), {
        globalFeaturesEnabled: true,
        globalEnabled: true,
        dataCollectionEnabled: true,
        dataShareAllowed: true,
        featureOverrides: {},
        globalFeatureOverrides: {}
      });
      await setDoc(doc(context.firestore(), "users", "blocked-user"), { status: "SUSPENDED" });
      await setDoc(doc(context.firestore(), "users", "blocked-by-access"), { status: "ACTIVE" });
      await setDoc(doc(context.firestore(), "userAccess", "blocked-by-access"), { blocked: true });
      await setDoc(doc(context.firestore(), "ownerAccounts", "config"), {
        emails: ["allowlist-owner@example.test"],
        mobiles: ["+15551234567"]
      });
    });
    const blocked = env.authenticatedContext("blocked-user");
    const blockedByAccess = env.authenticatedContext("blocked-by-access");
    await assertFails(setDoc(doc(blocked.firestore(), "pairingCodes", "d".repeat(48)), {
      deviceUid: "blocked-user",
      expiresAt: now + 10 * 60 * 1000,
      createdAt: now,
      expiryMinutes: 10,
      expiryMode: "PLAN",
      senderRole: "Father",
      receiverRole: "Son"
    }));
    await assertFails(setDoc(doc(blockedByAccess.firestore(), "pairingCodes", "e".repeat(48)), {
      deviceUid: "blocked-by-access",
      expiresAt: now + 10 * 60 * 1000,
      createdAt: now,
      expiryMinutes: 10,
      expiryMode: "PLAN",
      senderRole: "Father",
      receiverRole: "Son"
    }));

    await assertFails(setDoc(doc(normal.firestore(), "payments", "client-forged-payment"), {
      userId: "normal-user",
      status: "PAID",
      amountMinor: 1,
      currency: "INR"
    }));
    await assertFails(setDoc(doc(normal.firestore(), "emiSchedule", "client-forged-schedule"), {
      userId: "normal-user",
      status: "ACTIVE",
      amountMinor: 1
    }));

    await assertSucceeds(setDoc(doc(normal.firestore(), "pairingCodes", token), {
      deviceUid: "normal-user",
      expiresAt: now + 10 * 60 * 1000,
      createdAt: now,
      expiryMinutes: 10,
      expiryMode: "PLAN",
      senderRole: "Father",
      receiverRole: "Son"
    }));
    await assertFails(setDoc(doc(normal.firestore(), "devices", "normal-user"), {
      controllerUid: "normal-user",
      pairingToken: token,
      pairedAt: now,
      pairingActive: true,
      senderRole: "Father",
      receiverRole: "Son"
    }));

    await assertFails(setDoc(doc(normal.firestore(), "pairingCodes", "f".repeat(48)), {
      deviceUid: "normal-user",
      expiresAt: now + 10 * 60 * 1000,
      createdAt: now,
      expiryMinutes: 10,
      expiryMode: "PLAN",
      senderRole: "NotARealRole",
      receiverRole: "Son"
    }));

    await assertFails(setDoc(doc(normal.firestore(), "pairingCodes", "b".repeat(48)), {
      deviceUid: "normal-user",
      expiresAt: 253402300799000,
      createdAt: now,
      expiryMinutes: 0,
      expiryMode: "NO_EXPIRY"
    }));

    await assertSucceeds(setDoc(doc(owner.firestore(), "pairingCodes", "c".repeat(48)), {
      deviceUid: "owner-user",
      expiresAt: 253402300799000,
      createdAt: now,
      expiryMinutes: 0,
      expiryMode: "NO_EXPIRY"
    }));

    await assertFails(setDoc(doc(adminOnly.firestore(), "pairingCodes", "g".repeat(48)), {
      deviceUid: "admin-only",
      expiresAt: 253402300799000,
      createdAt: now,
      expiryMinutes: 0,
      expiryMode: "NO_EXPIRY"
    }));

    await assertSucceeds(setDoc(doc(allowlistOwner.firestore(), "pairingCodes", "h".repeat(48)), {
      deviceUid: "allowlist-owner",
      expiresAt: 253402300799000,
      createdAt: now,
      expiryMinutes: 0,
      expiryMode: "NO_EXPIRY"
    }));

    await assertSucceeds(setDoc(doc(mobileAllowlistOwner.firestore(), "pairingCodes", "i".repeat(48)), {
      deviceUid: "mobile-allowlist-owner",
      expiresAt: 253402300799000,
      createdAt: now,
      expiryMinutes: 0,
      expiryMode: "NO_EXPIRY"
    }));

    const claimToken = "d".repeat(48);
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "pairingCodes", claimToken), {
        deviceUid: "target-user",
        expiresAt: Date.now() + 10 * 60 * 1000,
        createdAt: Date.now(),
        expiryMinutes: 10,
        expiryMode: "PLAN",
        senderRole: "Mother",
        receiverRole: "Daughter"
      });
    });
    await assertSucceeds(runTransaction(controller.firestore(), async (tx) => {
      const codeRef = doc(controller.firestore(), "pairingCodes", claimToken);
      const snapshot = await tx.get(codeRef);
      if (!snapshot.exists()) throw new Error("seeded pairing code missing");
      tx.set(doc(controller.firestore(), "devices", "target-user"), {
        controllerUid: "controller-user",
        pairingToken: claimToken,
        pairedAt: Date.now(),
        pairingActive: true,
        senderRole: "Mother",
        receiverRole: "Daughter"
      });
      tx.delete(codeRef);
    }));

    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "devices", "media-target"), {
        controllerUid: "media-controller",
        pairingActive: true,
        pairingToken: "e".repeat(48),
        pairedAt: Date.now()
      });
    });
    const mediaController = env.authenticatedContext("media-controller");
    const mediaTarget = env.authenticatedContext("media-target");
    const targetDeviceRef = doc(mediaTarget.firestore(), "devices", "media-target");
    await assertSucceeds(updateDoc(targetDeviceRef, {
      health: {
        serviceAlive: true,
        lastHeartbeatAt: Date.now(),
        permissions: {
          camera: true,
          microphone: false,
          location: false,
          notifications: true
        }
      }
    }));

    const locationRef = doc(mediaTarget.firestore(), "devices", "media-target", "sharedLocation", "location-1");
    await assertSucceeds(setDoc(locationRef, {
      deviceId: "media-target",
      latitude: 26.8,
      longitude: 80.9,
      accuracyMeters: 15,
      capturedAtEpochMs: Date.now(),
      sharingActive: true
    }));
    await assertSucceeds(getDoc(locationRef));
    await assertSucceeds(getDoc(doc(mediaController.firestore(), "devices", "media-target", "sharedLocation", "location-1")));
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "devices", "media-target", "sharedLocation", "location-stale"), {
        deviceId: "media-target",
        latitude: 26.8,
        longitude: 80.9,
        accuracyMeters: 15,
        capturedAtEpochMs: Date.now() - 11 * 60 * 1000,
        sharingActive: true
      });
    });
    await assertFails(getDoc(doc(mediaController.firestore(), "devices", "media-target", "sharedLocation", "location-stale")));
    const sosRef = doc(mediaTarget.firestore(), "devices", "media-target", "statusAlerts", "sos-1");
    await assertSucceeds(setDoc(sosRef, {
      alertId: "sos-1",
      deviceId: "media-target",
      type: "SOS",
      message: "Test alert",
      createdAt: Date.now(),
      acknowledged: false,
      createdBy: "media-target"
    }));
    await assertSucceeds(setDoc(doc(mediaTarget.firestore(), "devices", "media-target", "statusAlerts", "test-alert"), {
      alertId: "test-alert",
      deviceId: "media-target",
      type: "TEST",
      message: "Test safety alert. This is not an emergency.",
      createdAt: Date.now(),
      acknowledged: false,
      createdBy: "media-target"
    }));

    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "featurePolicy", "global"), {
        globalFeaturesEnabled: true,
        globalEnabled: true,
        dataCollectionEnabled: true,
        dataShareAllowed: true,
        featureOverrides: { LOCATION: false },
        globalFeatureOverrides: {}
      });
    });
    await assertFails(setDoc(doc(mediaTarget.firestore(), "devices", "media-target", "sharedLocation", "location-disabled-global"), {
      deviceId: "media-target",
      latitude: 26.8,
      longitude: 80.9,
      capturedAtEpochMs: Date.now(),
      sharingActive: true
    }));
    await assertFails(getDoc(doc(mediaController.firestore(), "devices", "media-target", "sharedLocation", "location-1")));

    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "featurePolicy", "global"), {
        globalFeaturesEnabled: true,
        globalEnabled: true,
        dataCollectionEnabled: true,
        dataShareAllowed: true,
        featureOverrides: {},
        globalFeatureOverrides: {}
      });
      await setDoc(doc(ctx.firestore(), "featurePolicyUsers", "media-target"), {
        ownerEnabled: true,
        featureOverrides: { LOCATION: false }
      });
    });
    await assertFails(setDoc(doc(mediaTarget.firestore(), "devices", "media-target", "sharedLocation", "location-disabled-user"), {
      deviceId: "media-target",
      latitude: 26.8,
      longitude: 80.9,
      capturedAtEpochMs: Date.now(),
      sharingActive: true
    }));
    await assertFails(getDoc(doc(mediaController.firestore(), "devices", "media-target", "sharedLocation", "location-1")));

    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "featurePolicy", "global"), {
        globalFeaturesEnabled: true,
        globalEnabled: true,
        dataCollectionEnabled: true,
        dataShareAllowed: true,
        featureOverrides: { SOS_ALERTS: false },
        globalFeatureOverrides: {}
      });
    });
    await assertFails(setDoc(doc(mediaTarget.firestore(), "devices", "media-target", "statusAlerts", "sos-disabled"), {
      alertId: "sos-disabled",
      deviceId: "media-target",
      type: "SOS",
      message: "Blocked by owner policy",
      createdAt: Date.now(),
      acknowledged: false,
      createdBy: "media-target"
    }));
    await assertSucceeds(setDoc(doc(mediaTarget.firestore(), "devices", "media-target", "statusAlerts", "permission-revoked"), {
      type: "PERMISSION_REVOKED",
      permission: "camera",
      message: "Camera permission was revoked.",
      createdAt: Date.now(),
      read: false
    }));

    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "featurePolicyUsers", "media-target"), {
        ownerEnabled: true,
        featureOverrides: {}
      });
      await setDoc(doc(ctx.firestore(), "featurePolicy", "global"), {
        globalFeaturesEnabled: true,
        globalEnabled: true,
        dataCollectionEnabled: false,
        dataShareAllowed: true,
        featureOverrides: {},
        globalFeatureOverrides: {}
      });
    });
    await assertFails(updateDoc(targetDeviceRef, {
      health: {
        serviceAlive: true,
        lastHeartbeatAt: Date.now(),
        permissions: {
          camera: true,
          microphone: false,
          location: false,
          notifications: true
        }
      }
    }));
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "featurePolicy", "global"), {
        globalFeaturesEnabled: true,
        globalEnabled: true,
        dataCollectionEnabled: true,
        dataShareAllowed: true,
        featureOverrides: {},
        globalFeatureOverrides: {}
      });
    });
    await assertFails(updateDoc(targetDeviceRef, { controllerUid: "attacker-user" }));

    const sessionRef = doc(mediaController.firestore(), "mediaSessions", "session-1");
    await assertSucceeds(setDoc(sessionRef, {
      controllerUid: "media-controller",
      targetDeviceId: "media-target",
      capabilities: ["CAMERA"],
      status: "REQUESTED",
      createdAt: Date.now()
    }));
    await assertFails(setDoc(doc(mediaController.firestore(), "mediaSessions", "forged-active"), {
      controllerUid: "media-controller",
      targetDeviceId: "media-target",
      capabilities: ["CAMERA"],
      status: "ACTIVE",
      createdAt: Date.now()
    }));
    await assertFails(setDoc(doc(mediaController.firestore(), "mediaSessions", "invalid-capability"), {
      controllerUid: "media-controller",
      targetDeviceId: "media-target",
      capabilities: ["CAMERA", "REMOTE_INPUT"],
      status: "REQUESTED",
      createdAt: Date.now()
    }));
    await assertFails(updateDoc(doc(mediaTarget.firestore(), "mediaSessions", "session-1"), { status: "APPROVED" }));
    await env.withSecurityRulesDisabled(async (context) => {
      await updateDoc(doc(context.firestore(), "mediaSessions", "session-1"), { status: "APPROVED" });
    });
    await assertSucceeds(updateDoc(doc(mediaTarget.firestore(), "mediaSessions", "session-1"), { offerSdp: "test-offer-sdp" }));
    await assertSucceeds(updateDoc(sessionRef, { answerSdp: "test-answer-sdp" }));
    await assertSucceeds(updateDoc(sessionRef, { status: "ACTIVE" }));
    await assertSucceeds(updateDoc(doc(mediaTarget.firestore(), "mediaSessions", "session-1"), { status: "ACTIVE" }));

    const ownCandidate = doc(mediaController.firestore(), "mediaSessions", "session-1", "iceCandidates", "controller-candidate");
    await assertSucceeds(setDoc(ownCandidate, {
      senderUid: "media-controller",
      candidate: "candidate:controller",
      sdpMid: "0",
      sdpMLineIndex: 0
    }));
    await assertFails(setDoc(
      doc(mediaController.firestore(), "mediaSessions", "session-1", "iceCandidates", "spoofed-candidate"),
      {
        senderUid: "media-target",
        candidate: "candidate:spoofed",
        sdpMid: "0",
        sdpMLineIndex: 0
      }
    ));

    await assertSucceeds(updateDoc(sessionRef, { status: "STOPPED" }));
    await assertFails(setDoc(
      doc(mediaController.firestore(), "mediaSessions", "session-1", "iceCandidates", "late-candidate"),
      {
        senderUid: "media-controller",
        candidate: "candidate:late",
        sdpMid: "0",
        sdpMLineIndex: 0
      }
    ));

    await assertFails(setDoc(doc(controller.firestore(), "fileTransfers", "unpaired-transfer"), {
      senderDeviceId: "controller-user",
      receiverDeviceId: "unrelated-user",
      fileName: "file.txt",
      mimeType: "text/plain",
      sizeBytes: 10,
      createdAtEpochMs: Date.now(),
      status: "REQUESTED"
    }));
    await assertSucceeds(setDoc(doc(controller.firestore(), "fileTransfers", "paired-transfer"), {
      senderDeviceId: "controller-user",
      receiverDeviceId: "target-user",
      fileName: "file.txt",
      mimeType: "text/plain",
      sizeBytes: 10,
      createdAtEpochMs: Date.now(),
      status: "REQUESTED"
    }));

    // Owner policy must be enforced by rules even when a modified client bypasses UI gates.
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "featurePolicyUsers", "controller-user"), {
        enabled: true,
        ownerEnabled: true,
        featureOverrides: { FILE_TRANSFER: false }
      });
    });
    await assertFails(setDoc(doc(controller.firestore(), "fileTransfers", "disabled-feature-transfer"), {
      senderDeviceId: "controller-user",
      receiverDeviceId: "target-user",
      fileName: "blocked.txt",
      mimeType: "text/plain",
      sizeBytes: 10,
      createdAtEpochMs: Date.now(),
      status: "REQUESTED"
    }));
    await assertFails(updateDoc(doc(target.firestore(), "fileTransfers", "paired-transfer"), {
      status: "APPROVED"
    }));

    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "featurePolicyUsers", "controller-user"), {
        enabled: true,
        ownerEnabled: true,
        featureOverrides: {}
      });
      await setDoc(doc(ctx.firestore(), "featurePolicy", "global"), {
        globalFeaturesEnabled: true,
        globalEnabled: false,
        featureOverrides: {},
        globalFeatureOverrides: {}
      });
    });
    await assertFails(setDoc(doc(controller.firestore(), "fileTransfers", "globally-disabled-transfer"), {
      senderDeviceId: "controller-user",
      receiverDeviceId: "target-user",
      fileName: "blocked.txt",
      mimeType: "text/plain",
      sizeBytes: 10,
      createdAtEpochMs: Date.now(),
      status: "REQUESTED"
    }));
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "featurePolicy", "global"), {
        globalFeaturesEnabled: true,
        globalEnabled: true,
        featureOverrides: {},
        globalFeatureOverrides: {}
      });
    });
    await assertSucceeds(updateDoc(doc(target.firestore(), "fileTransfers", "paired-transfer"), {
      status: "APPROVED"
    }));

    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "featurePolicyUsers", "controller-user"), {
        enabled: true,
        ownerEnabled: true,
        featureOverrides: { FILE_TRANSFER: false }
      });
    });
    await assertFails(updateDoc(doc(controller.firestore(), "fileTransfers", "paired-transfer"), {
      status: "UPLOADING"
    }));
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "featurePolicyUsers", "controller-user"), {
        enabled: true,
        ownerEnabled: true,
        featureOverrides: {}
      });
    });
    await assertSucceeds(updateDoc(doc(controller.firestore(), "fileTransfers", "paired-transfer"), {
      status: "UPLOADING"
    }));

    console.log("FIRESTORE_RULES_RUNTIME_TEST=PASS");
    console.log("Covered: pairing expiry, atomic pairing claim, SDP participant permissions, and paired-device file-transfer requests.");
  } finally {
    await env.cleanup();
  }
}

main().catch((error) => {
  console.error("FIRESTORE_RULES_RUNTIME_TEST=FAIL");
  console.error(error);
  process.exitCode = 1;
});
