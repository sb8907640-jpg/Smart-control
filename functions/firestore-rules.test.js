const fs = require("node:fs");
const path = require("node:path");
const {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds
} = require("@firebase/rules-unit-testing");
const {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc
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
    // Pairing tokens are private to their creator. A controller must use the
    // authenticated claimPairingCode callable instead of reading/listing codes.
    await assertFails(getDoc(doc(controller.firestore(), "pairingCodes", claimToken)));
    await assertSucceeds(getDoc(doc(target.firestore(), "pairingCodes", claimToken)));
    await assertFails(deleteDoc(doc(controller.firestore(), "pairingCodes", claimToken)));
    await assertSucceeds(deleteDoc(doc(target.firestore(), "pairingCodes", claimToken)));

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
    console.log("Covered: pairing expiry, pairing-token privacy, SDP participant permissions, and paired-device file-transfer requests.");
  } finally {
    await env.cleanup();
  }
}

main().catch((error) => {
  console.error("FIRESTORE_RULES_RUNTIME_TEST=FAIL");
  console.error(error);
  process.exitCode = 1;
});
