const fs = require("node:fs");
const path = require("node:path");
const {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds
} = require("@firebase/rules-unit-testing");
const {
  collection,
  doc,
  getDocs,
  setDoc,
  updateDoc,
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
    const owner = env.authenticatedContext("owner-user", { admin: true, owner: true, role: "OWNER" });
    const adminOnly = env.authenticatedContext("admin-only", { admin: true, role: "ADMIN" });
    const controller = env.authenticatedContext("controller-user");
    const target = env.authenticatedContext("target-user");

    // Financial records must be server-created; a client cannot forge payment
    // success or manufacture an EMI schedule by writing directly to Firestore.
    await assertFails(setDoc(doc(normal.firestore(), "payments", "forged-payment"), {
      userId: "normal-user",
      amountMinor: 100,
      currency: "INR",
      gateway: "TEST",
      status: "SUCCESS",
      createdAtEpochMs: now
    }));
    await assertFails(setDoc(doc(normal.firestore(), "emiSchedule", "forged-emi"), {
      paymentId: "forged-payment",
      userId: "normal-user",
      tenureMonths: 12,
      status: "ACTIVE",
      createdAtEpochMs: now
    }));

    await assertFails(getDocs(collection(normal.firestore(), "pairingCodes")));

    await env.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "ownerAccounts", "config"), {
        emails: ["owner@example.com"],
        mobiles: ["+911234567890"],
        displayName: "Owner"
      });
    });
    await assertFails(updateDoc(doc(owner.firestore(), "ownerAccounts", "config"), {
      emails: ["attacker@example.com"]
    }));
    await assertFails(setDoc(doc(adminOnly.firestore(), "ownerAccounts", "self-created"), {
      emails: ["admin@example.com"],
      mobiles: ["+911111111111"]
    }));
    await assertSucceeds(updateDoc(doc(owner.firestore(), "ownerAccounts", "config"), {
      displayName: "Updated Owner"
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

    // Device health heartbeats are allowed only on the signed-in user's own
    // device document and may not be combined with pairing/link changes.
    const healthHeartbeat = {
      serviceAlive: true,
      lastHeartbeatAt: Date.now(),
      permissions: {
        camera: true,
        microphone: true,
        location: false,
        notifications: true
      }
    };
    await assertSucceeds(updateDoc(doc(target.firestore(), "devices", "target-user"), {
      health: healthHeartbeat
    }));
    await assertFails(updateDoc(doc(controller.firestore(), "devices", "target-user"), {
      health: { ...healthHeartbeat, lastHeartbeatAt: Date.now() }
    }));
    await assertFails(updateDoc(doc(target.firestore(), "devices", "target-user"), {
      health: healthHeartbeat,
      controllerUid: null,
      pairingActive: false
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
    const sessionRef = doc(mediaController.firestore(), "mediaSessions", "session-1");
    await assertSucceeds(setDoc(sessionRef, {
      controllerUid: "media-controller",
      targetDeviceId: "media-target",
      capabilities: ["CAMERA"],
      status: "REQUESTED",
      createdAt: Date.now()
    }));
    await assertSucceeds(updateDoc(doc(mediaTarget.firestore(), "mediaSessions", "session-1"), { status: "APPROVED" }));
    await assertSucceeds(updateDoc(doc(mediaTarget.firestore(), "mediaSessions", "session-1"), { offerSdp: "test-offer-sdp" }));
    await assertSucceeds(updateDoc(sessionRef, { answerSdp: "test-answer-sdp" }));
    await assertSucceeds(updateDoc(sessionRef, { status: "ACTIVE" }));
    await assertSucceeds(updateDoc(doc(mediaTarget.firestore(), "mediaSessions", "session-1"), { status: "ACTIVE" }));

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
