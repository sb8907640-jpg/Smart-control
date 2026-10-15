const fs = require("node:fs");
const path = require("node:path");
const {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds
} = require("@firebase/rules-unit-testing");
const { doc, setDoc, updateDoc } = require("firebase/firestore");
const { ref, uploadBytes, deleteObject } = require("firebase/storage");

async function main() {
  const projectId = process.env.GCLOUD_PROJECT || "demo-family-suraksha";
  const env = await initializeTestEnvironment({
    projectId,
    firestore: {
      rules: fs.readFileSync(path.join(__dirname, "../firestore.rules"), "utf8")
    },
    storage: {
      rules: fs.readFileSync(path.join(__dirname, "../storage.rules"), "utf8")
    }
  });

  try {
    await env.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, "featurePolicy", "global"), {
        globalFeaturesEnabled: true,
        globalEnabled: true,
        featureOverrides: {},
        globalFeatureOverrides: {}
      });
      await setDoc(doc(db, "fileTransfers", "transfer-known"), {
        senderDeviceId: "sender",
        receiverDeviceId: "receiver",
        sizeBytes: 4,
        status: "APPROVED"
      });
      await setDoc(doc(db, "fileTransfers", "transfer-unknown"), {
        senderDeviceId: "sender",
        receiverDeviceId: "receiver",
        sizeBytes: -1,
        status: "APPROVED"
      });
      await setDoc(doc(db, "fileTransfers", "transfer-pending"), {
        senderDeviceId: "sender",
        receiverDeviceId: "receiver",
        sizeBytes: 4,
        status: "REQUESTED"
      });
      await setDoc(doc(db, "fileTransfers", "transfer-suspended"), {
        senderDeviceId: "suspended-sender",
        receiverDeviceId: "receiver",
        sizeBytes: 4,
        status: "APPROVED"
      });
      await setDoc(doc(db, "users", "suspended-sender"), { status: "SUSPENDED" });
      await setDoc(doc(db, "fileTransfers", "transfer-blocked"), {
        senderDeviceId: "blocked-sender",
        receiverDeviceId: "receiver",
        sizeBytes: 4,
        status: "APPROVED"
      });
      // Storage Rules read one account-status document plus the transfer record
      // to stay within Firebase Storage's two-document Firestore lookup limit.
      await setDoc(doc(db, "users", "blocked-sender"), { status: "BLOCKED" });
      await setDoc(doc(db, "userAccess", "blocked-sender"), { blocked: true });
    });

    const senderStorage = env.authenticatedContext("sender").storage();
    await assertSucceeds(uploadBytes(
      ref(senderStorage, "fileTransfers/sender/transfer-known/file.bin"),
      new Uint8Array([1, 2, 3, 4])
    ));
    await assertFails(uploadBytes(
      ref(senderStorage, "fileTransfers/sender/transfer-known/wrong-size.bin"),
      new Uint8Array([1, 2, 3])
    ));
    await assertFails(uploadBytes(
      ref(senderStorage, "fileTransfers/sender/transfer-known/too-large.bin"),
      new Uint8Array([1, 2, 3, 4, 5])
    ));
    await assertSucceeds(uploadBytes(
      ref(senderStorage, "fileTransfers/sender/transfer-unknown/file.bin"),
      new Uint8Array([1, 2, 3, 4])
    ));
    await assertFails(uploadBytes(
      ref(senderStorage, "fileTransfers/sender/transfer-pending/file.bin"),
      new Uint8Array([1, 2, 3, 4])
    ));
    await assertFails(uploadBytes(
      ref(env.authenticatedContext("attacker").storage(), "fileTransfers/sender/transfer-known/file.bin"),
      new Uint8Array([1, 2, 3, 4])
    ));
    await assertFails(uploadBytes(
      ref(env.authenticatedContext("suspended-sender").storage(), "fileTransfers/suspended-sender/transfer-suspended/file.bin"),
      new Uint8Array([1, 2, 3, 4])
    ));
    await assertFails(uploadBytes(
      ref(env.authenticatedContext("blocked-sender").storage(), "fileTransfers/blocked-sender/transfer-blocked/file.bin"),
      new Uint8Array([1, 2, 3, 4])
    ));

    // Failed uploads may be cancelled after an object was uploaded but before
    // Firestore marked it READY. The sender must be able to remove that orphan.
    await assertSucceeds(updateDoc(
      doc(env.authenticatedContext("sender").firestore(), "fileTransfers", "transfer-known"),
      { status: "CANCELLED" }
    ));
    await assertSucceeds(deleteObject(ref(senderStorage, "fileTransfers/sender/transfer-known/file.bin")));

    console.log("STORAGE_RULES_VERIFY=PASS");
  } finally {
    await env.cleanup();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
