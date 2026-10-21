const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const vm = fs.readFileSync(path.join(root, "app/src/main/java/com/smartcontrol/presentation/filetransfer/FileTransferViewModel.kt"), "utf8");
const uploader = fs.readFileSync(path.join(root, "app/src/main/java/com/smartcontrol/data/filetransfer/FirebaseFileUploader.kt"), "utf8");
const rules = fs.readFileSync(path.join(root, "firestore.rules"), "utf8");

const uploadBlock = vm.slice(vm.indexOf("fun uploadApproved()"), vm.length);
const checks = [
  ["Upload action resolves the current sender UID in its own scope", uploadBlock.includes("val sender = auth.currentUser?.uid")],
  ["Pending URI metadata is bound to the same signed-in account", uploadBlock.includes("sender != pendingOwnerUid") && uploadBlock.includes('getString("owner_uid", null) != sender')],
  ["Transfer sender and paired receiver are revalidated", uploadBlock.includes("request.senderDeviceId != sender") && uploadBlock.includes("request.receiverDeviceId != receiver")],
  ["Restored uploads accept APPROVED and UPLOADING states", uploadBlock.includes("FileTransferRequest.Status.APPROVED, FileTransferRequest.Status.UPLOADING")],
  ["Upload state is moved to UPLOADING before writing Storage", uploadBlock.includes("repository.updateStatus(id, FileTransferRequest.Status.UPLOADING)")],
  ["Already-READY uploads recover without duplicate cancellation", uploadBlock.includes("latest?.status == FileTransferRequest.Status.READY")],
  ["Approved state is preserved when the initial transition fails", uploadBlock.includes("latest?.status == FileTransferRequest.Status.APPROVED")],
  ["Upload failures cancel only confirmed UPLOADING transfers", uploadBlock.includes("latest?.status == FileTransferRequest.Status.UPLOADING") && uploadBlock.includes("repository.updateStatus(id, FileTransferRequest.Status.CANCELLED)")],
  ["Cleanup path can be derived if upload response was lost", uploader.includes("fun storagePathFor(uid: String, transferId: String, fileName: String)") && uploadBlock.includes("uploader.storagePathFor(sender, id, request.fileName)")],
  ["Firestore rules allow sender cancellation after approval", rules.includes("resource.data.status == 'APPROVED'") && rules.includes("request.resource.data.status == 'CANCELLED'")],
  ["File transfer view model braces are balanced", (vm.match(/\{/g) || []).length === (vm.match(/\}/g) || []).length]
];
const failed = checks.filter(([, passed]) => !passed);
for (const [name, passed] of checks) console.log((passed ? "PASS " : "FAIL ") + name);
if (failed.length) {
  console.error("FILE_TRANSFER_FLOW_VERIFY=FAILED");
  process.exit(1);
}
console.log("FILE_TRANSFER_FLOW_VERIFY=STATIC_PASS");
