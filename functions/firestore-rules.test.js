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
    const owner = env.authenticatedContext("owner-user", { admin: true, role: "OWNER" });
    const controller = env.authenticatedContext("controller-user");
    const target = env.authenticatedContext("target-user");

    await assertSucceeds(setDoc(doc(normal.firestore(), "pairingCodes", token), {
      deviceUid: "normal-user",
      expiresAt: now + 10 * 60 * 1000,
      createdAt: now,
      expiryMinutes: 10,
      expiryMode: "PLAN",
      senderRole: "Father",
      receiverRole: "Son"
    }));
    // A signed-in user must not be able to enumerate other users' pairing tokens.
    await assertFails(getDocs(collection(normal.firestore(), "pairingCodes")));

    // Financial records must be created by trusted callable functions only.
    await assertFails(setDoc(doc(normal.firestore(), "payments", "forged-payment"), {
      userId: "normal-user",
      status: "SUCCESS",
      amountMinor: 1,
      createdAtEpochMs: now
    }));
    await assertFails(setDoc(doc(normal.firestore(), "emiSchedule", "forged-emi"), {
      userId: "normal-user",
      paymentId: "forged-payment",
      tenureMonths: 12,
      status: "PENDING"
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
    const sessionRef = doc(mediaController.firestore(), "mediaSessions", "session-1");
    await assertFails(setDoc(doc(mediaController.firestore(), "mediaSessions", "session-bypass"), {
      controllerUid: "media-controller",
      targetDeviceId: "media-target",
      capabilities: ["CAMERA"],
      status: "ACTIVE",
      createdAt: Date.now()
    }));
    await assertSucceeds(setDoc(sessionRef, {
      controllerUid: "media-controller",
      targetDeviceId: "media-target",
      capabilities: ["CAMERA"],
      status: "REQUESTED",
      createdAt: Date.now()
    }));
    await assertFails(setDoc(doc(mediaController.firestore(), "mediaSessions/session-1/iceCandidates/early-candidate"), {
      senderUid: "media-controller",
      candidate: "candidate:early",
      sdpMid: "0",
      sdpMLineIndex: 0
    }));
    await assertSucceeds(updateDoc(doc(mediaTarget.firestore(), "mediaSessions", "session-1"), { status: "APPROVED" }));
    await assertSucceeds(setDoc(doc(mediaTarget.firestore(), "mediaSessions/session-1/iceCandidates/target-candidate"), {
      senderUid: "media-target",
      candidate: "candidate:target",
      sdpMid: "0",
      sdpMLineIndex: 0
    }));
    await assertFails(setDoc(doc(mediaController.firestore(), "mediaSessions/session-1/iceCandidates/forged-candidate"), {
      senderUid: "media-target",
      candidate: "candidate:forged",
      sdpMid: "0",
      sdpMLineIndex: 0
    }));
    await assertSucceeds(updateDoc(doc(mediaTarget.firestore(), "mediaSessions", "session-1"), { offerSdp: "test-offer-sdp" }));
    await assertSucceeds(updateDoc(sessionRef, { answerSdp: "test-answer-sdp" }));
    await assertSucceeds(updateDoc(sessionRef, { status: "ACTIVE" }));
    await assertSucceeds(updateDoc(doc(mediaTarget.firestore(), "mediaSessions", "session-1"), { status: "ACTIVE" }));

    const alertRef = doc(mediaTarget.firestore(), "devices/media-target/statusAlerts/alert-1");
    await assertSucceeds(setDoc(alertRef, {
      alertId: "alert-1",
      deviceId: "media-target",
      type: "SOS",
      message: "Test alert",
      createdAt: Date.now(),
      acknowledged: false,
      createdBy: "media-target"
    }));
    await assertSucceeds(updateDoc(doc(mediaController.firestore(), "devices/media-target/statusAlerts/alert-1"), {
      acknowledged: true,
      acknowledgedBy: "media-controller"
    }));
    await assertSucceeds(setDoc(doc(mediaTarget.firestore(), "devices/media-target/statusAlerts/alert-2"), {
      alertId: "alert-2",
      deviceId: "media-target",
      type: "SOS",
      message: "Test alert",
      createdAt: Date.now(),
      acknowledged: false,
      createdBy: "media-target"
    }));
    await assertFails(updateDoc(doc(mediaController.firestore(), "devices/media-target/statusAlerts/alert-2"), {
      acknowledged: true,
      acknowledgedBy: "media-target"
    }));

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
    console.log("Covered: pairing expiry/claim/listing, payment and EMI write protection, media-session approval, ICE sender ownership, SDP permissions, remote SOS acknowledgements, and paired-device file transfers.");
  } finally {
    await env.cleanup();
  }
}

main().catch((error) => {
  console.error("FIRESTORE_RULES_RUNTIME_TEST=FAIL");
  console.error(error);
  process.exitCode = 1;
});
