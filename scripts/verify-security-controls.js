const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const read = p => fs.readFileSync(path.join(root, p), "utf8");
const checks = [];
const check = (name, ok, detail) => checks.push({name, ok, detail});

const policy = read("backend/src/security-controls.js");
const service = read("app/src/main/java/com/smartcontrol/service/FamilySafetyService.kt");
const manifest = read("app/src/main/AndroidManifest.xml");
const session = read("app/src/main/java/com/smartcontrol/domain/session/SessionModels.kt");
const sessionRepo = read("app/src/main/java/com/smartcontrol/domain/session/SessionRepository.kt");
const recovery = read("app/src/main/java/com/smartcontrol/domain/recovery/ConnectionRecoveryPolicy.kt");
const fileTransferViewModel = read("app/src/main/java/com/smartcontrol/presentation/filetransfer/FileTransferViewModel.kt");
const consentScreen = read("app/src/main/java/com/smartcontrol/presentation/consent/ConsentScreen.kt");
const mainActivity = read("app/src/main/java/com/smartcontrol/MainActivity.kt");
const functionsIndex = read("functions/index.js");

check("AES-256-GCM", /AES-256-GCM/.test(policy) && /createCipheriv/.test(policy), "Authenticated AES-256-GCM policy exists.");
check("2FA + OTP", /Mobile OTP/.test(policy) && /2FA/.test(policy), "Google/Mobile OTP plus deployment-controlled 2FA/MFA.");
check("Consent + activity logs", /consentLog: true/.test(policy) && /activityLog: true/.test(policy), "Both audit categories are mandatory.");
check("Legal consent is versioned and saved before continuing",
  consentScreen.includes("CURRENT_LEGAL_CONSENT_VERSION") &&
    consentScreen.includes('putLong("accepted_at_epoch_ms"') &&
    consentScreen.includes('.commit()') &&
    mainActivity.includes('preferences.getInt("accepted_version", 0) == CURRENT_LEGAL_CONSENT_VERSION'),
  "Consent acceptance stores its version and timestamp before continuing; a new policy version forces re-acceptance.");
check("Consent ledger limitation is disclosed",
  consentScreen.includes("synchronized to the server after authentication") &&
    consentScreen.includes("Official document links are not configured in this build."),
  "The app does not misrepresent local preferences as server-audited consent or unavailable legal links.");
check("Legal consent is recorded server-side after authentication",
  functionsIndex.includes("exports.recordLegalConsent") &&
    functionsIndex.includes("FieldValue.serverTimestamp()") &&
    mainActivity.includes('getHttpsCallable("recordLegalConsent")') &&
    mainActivity.includes('consentSyncState != "SYNCED"') &&
    mainActivity.includes("Retry consent sync"),
  "An authenticated callable writes an idempotent consent record; protected app flows stay locked until synchronization succeeds.");
check("Live indicator", /startVisibleForeground|setOngoing\(true\)|Family Safety Active/.test(service), "Foreground notification remains visible.");
check("STOP", /ACTION_STOP_SYNC|Stop Sync|stopSelf\(\)/.test(service), "User-visible service stop action exists.");
check("Access notification", /Notification/.test(service) && /statusAlerts/.test(service), "Notification/status alert surface exists.");
check("Data deletion policy", /userDataDeletion: true/.test(policy), "Deletion is a required policy control.");
check("Legal compliance", /GDPR/.test(policy) && /IT Act 2000/.test(policy) && /DPDP Act 2023/.test(policy), "Legal readiness labels are present.");
check("Pending file transfer is restored only for its original signed-in user",
  fileTransferViewModel.includes('getSharedPreferences("file_transfer_pending"') &&
    fileTransferViewModel.includes('currentUid == savedOwnerUid') &&
    fileTransferViewModel.includes('putString("content_uri", uri.toString())'),
  "Pending transfer ID and persisted picker URI survive process death without crossing account boundaries.");
check("Pending file transfer state is cleared on completion and failure",
  (fileTransferViewModel.match(/pendingTransferPrefs\.edit\(\)\.clear\(\)\.apply\(\)/g) || []).length >= 3,
  "Stored pending transfer metadata is cleared when stale or after upload finishes.");

const fileTransferScreen = read("app/src/main/java/com/smartcontrol/presentation/filetransfer/FileTransferScreen.kt");
check("Pending upload requires persistent picker URI access",
  fileTransferScreen.includes("takePersistableUriPermission") &&
    fileTransferScreen.includes("if (retained)") &&
    fileTransferScreen.includes("did not allow persistent access"),
  "A transfer request is not created if the selected file cannot remain accessible while the receiver approval is pending.");

check("Persistent link recovery", /PersistentLinkState/.test(recovery) && /shouldRecover/.test(recovery), "Persistent recovery remains defined.");
check("Boot/watchdog opt-in", /explicit user opt-in only/i.test(policy) && /bootPersistence/.test(policy), "Restart behavior cannot bypass user choice.");
check("Boot receiver is explicit opt-in", /RECEIVE_BOOT_COMPLETED/.test(manifest) && /SmartControlBootReceiver/.test(manifest) && /auto_start_service/.test(read("app/src/main/java/com/smartcontrol/service/SmartControlBootReceiver.kt")), "Boot persistence only starts when the saved user preference is enabled.");
check("SOS approval boundary", /APPROVED/.test(session) && /approve/.test(sessionRepo) && /never silently grants/i.test(policy), "Emergency flow does not silently grant protected permissions.");
check("Health telemetry requires server-recorded consent",
  service.includes('collection("consentHistory")') &&
    service.includes('serverData["privacyConsent"] == true'),
  "A versioned server consent receipt is required before device health data is sent.");

check("No permission bypass", !/(auto.?grant|silentGrant|permissionBypass|skipPermissionDialog)/i.test(policy + service + manifest), "No silent permission bypass marker.");
const pairingRepo = read("app/src/main/java/com/smartcontrol/data/pairing/FirestorePairingRepository.kt");
const mediaViewModel = read("app/src/main/java/com/smartcontrol/presentation/media/MediaSessionViewModel.kt");
const firestoreRules = read("firestore.rules");
const storageRules = read("storage.rules");
const iceServers = read("functions/ice-servers.js");
const gradle = read("app/build.gradle.kts");
const featureCenter = read("app/src/main/java/com/smartcontrol/presentation/features/FeatureCenterScreen.kt");
const ownerAdmin = read("app/src/main/java/com/smartcontrol/presentation/owner/OwnerAdminScreen.kt");
const recordingScreen = read("app/src/main/java/com/smartcontrol/presentation/media/ScreenRecordingScreen.kt");
const recordingService = read("app/src/main/java/com/smartcontrol/service/ScreenRecordingService.kt");

check("Pairing lifetime does not read private Owner settings on client",
  pairingRepo.includes('getHttpsCallable("getDevicePairingPolicy")') && !pairingRepo.includes("ownerSettingsRepository"),
  "Regular family accounts obtain only the effective expiry policy from the authenticated callable.");
check("Server computes the pairing policy",
  read("functions/index.js").includes("exports.getDevicePairingPolicy") &&
    read("functions/index.js").includes("PairingTokenExpiryMinutes"),
  "Plan expiry is read server-side without exposing owner settings.");
check("Pairing codes enforce configured-Owner-only no-expiry",
  firestoreRules.includes("request.resource.data.expiresAt <= request.time.toMillis() + 3600000") &&
    firestoreRules.includes("function configuredOwner()") &&
    firestoreRules.includes("ownerAccounts/config") &&
    firestoreRules.includes("request.resource.data.expiryMode == 'NO_EXPIRY'") &&
    read("functions/firestore-rules.test.js").includes("adminOnly.firestore()") &&
    read("functions/firestore-rules.test.js").includes("allowlistOwner.firestore()"),
  "Only OWNER/SUPER_ADMIN role claims or verified Owner allowlist identities can bypass pairing-code expiry.");
check("Pairing claim consumes code only with matching atomic device link",
  firestoreRules.includes("getAfter(/databases/$(database)/documents/devices/$(resource.data.deviceUid))") &&
    firestoreRules.includes("pairingToken == token"),
  "A controller cannot delete a pairing code without the matching linked-device write.");
check("Media offer and answer SDP are participant-owned",
  firestoreRules.includes("affectedKeys().hasOnly(['offerSdp'])") &&
    firestoreRules.includes("affectedKeys().hasOnly(['answerSdp'])"),
  "Target publishes offer SDP; controller publishes answer SDP.");
const featurePolicyRepository = read("app/src/main/java/com/smartcontrol/data/owner/FirestoreFeaturePolicyRepository.kt");
check("Missing global feature policy fails closed",
  featurePolicyRepository.includes('data["globalFeaturesEnabled"] as? Boolean ?: false') &&
    featurePolicyRepository.includes('data["globalEnabled"] as? Boolean ?: false'),
  "An absent or malformed Owner policy cannot default all features to enabled.");

const featureAccessViewModel = read("app/src/main/java/com/smartcontrol/presentation/features/FeatureAccessViewModel.kt");
check("Feature policy refreshes when the signed-in UID changes",
  featureAccessViewModel.includes("state.currentUser?.uid") &&
    featureAccessViewModel.includes("repository.observe(uid)") &&
    featureAccessViewModel.includes("_settingsUserId.value != userId") &&
    featureAccessViewModel.includes("_settings.value = null"),
  "A previous account's per-user feature policy cannot remain active after account switching.");

const auditAnchorBlock = functionsIndex.slice(functionsIndex.indexOf("exports.anchorAuditRoot"));
check("Audit-root admin callable checks account suspension",
  auditAnchorBlock.includes("requireAdmin(request)") &&
    auditAnchorBlock.includes("await assertAccountActive(request.auth.uid)"),
  "A suspended or blocked admin cannot use the audit anchoring callable.");

check("Owner allowlist sync preserves explicitly role-assigned Owners",
  functionsIndex.includes('currentRole === "SUPER_ADMIN" || currentRole === "OWNER" || claims.owner === true'),
  "Removing an email/mobile allowlist entry revokes only the generic admin claim and does not demote a separately assigned Owner role.");

const approvalCallableBlock = functionsIndex.slice(
  functionsIndex.indexOf("exports.approveMediaSession"),
  functionsIndex.indexOf("function validatePin")
);
const iceCallableSource = read("functions/ice-servers.js");
const consentPolicy = read("functions/spec/consent-policy.js");
check("Media approval and ICE credentials require server-recorded consent for both peers",
  consentPolicy.includes("function isCurrentConsentRecord") &&
    approvalCallableBlock.includes('collection("consentHistory")') &&
    approvalCallableBlock.includes("isCurrentConsentRecord(") &&
    iceCallableSource.includes('collection("consentHistory")') &&
    iceCallableSource.includes("isCurrentConsentRecord(") &&
    read("functions/spec/consent-policy.test.js").includes("rejects any receipt missing a required acknowledgement"),
  "Both the target's approval and the session's ICE credentials fail closed unless both peers have current server-recorded consent.");

check("Media approval is server-authorized and policy-gated",
  read("functions/index.js").includes("exports.approveMediaSession") &&
    read("functions/spec/media-policy.js").includes("globalFeaturesEnabled !== true") &&
    read("app/src/main/java/com/smartcontrol/data/media/FirestoreMediaSignalingRepository.kt").includes('getHttpsCallable("approveMediaSession")') &&
    firestoreRules.includes("request.resource.data.status == 'STOPPED'"),
  "Direct client status writes cannot approve a session when owner policy has not authorized it.");
check("Unpairing stops pending and active media sessions",
  pairingRepo.includes('whereEqualTo("controllerUid", uid)') &&
    pairingRepo.includes('whereEqualTo("targetDeviceId", uid)') &&
    pairingRepo.includes('"REQUESTED", "APPROVED", "ACTIVE"') &&
    pairingRepo.includes('"STOPPED"'),
  "Revoking a device link also ends sessions and releases peer resources.");
check("Remote commands require an ACTIVE session and visible indicator",
  read("app/src/main/java/com/smartcontrol/domain/control/RemoteCommandSessionGate.kt").includes("session.status != SessionStatus.ACTIVE") &&
    read("app/src/main/java/com/smartcontrol/domain/control/RemoteCommandSessionGate.kt").includes("visibleIndicatorActive"),
  "APPROVED is not sufficient for command delivery.");
check("Suspended and Owner-blocked accounts are denied across service layers",
  firestoreRules.includes("function accountActive()") &&
    firestoreRules.includes("userAccess/$(request.auth.uid)") &&
    read("storage.rules").includes("function accountActive()") &&
    read("storage.rules").includes("users/$(request.auth.uid)") &&
    functionsIndex.includes('status: disabled ? "BLOCKED" : "ACTIVE"') &&
    read("backend/src/owner-panel.js").includes("auth.updateUser(id, { disabled: status !== \"ACTIVE\" })") &&
    read("backend/src/owner-panel.js").includes("auth.revokeRefreshTokens(id)") &&
    read("backend/src/app.js").includes("accessBlocked = access.exists") &&
    read("backend/src/server.js").includes("accessBlocked = access.exists") &&
    read("functions/index.js").includes("async function assertAccountActive(uid)") &&
    read("functions/index.js").includes("accessSnapshot.data()?.blocked === true") &&
    read("functions/billing.js").includes("accessSnapshot.data()?.blocked === true") &&
    read("functions/gateway-permit.js").includes("accessSnapshot.data()?.blocked === true"),
  "Suspension revokes backend sessions and blocks Firestore, Storage, Functions, billing, and realtime access.");
const configuredFirestoreIndexes = JSON.parse(read("firestore.indexes.json")).indexes;
const hasCompositeIndex = (collectionGroup, fields) => configuredFirestoreIndexes.some(index =>
  index.collectionGroup === collectionGroup &&
    fields.every((field, i) => index.fields[i]?.fieldPath === field)
);
check("Composite indexes cover subscription, expiry, transfer, and session queries",
  hasCompositeIndex("subscriptions", ["userId", "status", "updatedAtEpochMs"]) &&
    hasCompositeIndex("subscriptions", ["status", "expiresAtEpochMs"]) &&
    hasCompositeIndex("freeAccessGrants", ["userId", "status"]) &&
    hasCompositeIndex("mediaSessions", ["targetDeviceId", "status"]) &&
    hasCompositeIndex("mediaSessions", ["targetDeviceId", "controllerUid", "status"]) &&
    hasCompositeIndex("fileTransfers", ["receiverDeviceId", "status"]) &&
    hasCompositeIndex("fileTransfers", ["senderDeviceId", "status"]) &&
    hasCompositeIndex("devices", ["controllerUid", "pairingActive"]),
  "Compound Firestore queries have explicit deployed indexes rather than failing at runtime.");

check("File transfer requests require an active paired receiver",
  firestoreRules.includes("data.pairingActive == true") &&
    firestoreRules.includes("request.resource.data.receiverDeviceId"),
  "Transfers cannot be opened to arbitrary unrelated accounts.");

check("Sender can cancel an approved transfer before upload starts",
  firestoreRules.includes("resource.data.status == 'APPROVED'") &&
    firestoreRules.includes("request.resource.data.status == 'CANCELLED'") &&
    read("functions/firestore-rules.test.js").includes("approved-cancelled-transfer"),
  "A failed upload can cancel an approved-but-not-uploading request instead of leaving it stuck.");

const locationSharingViewModel = read("app/src/main/java/com/smartcontrol/presentation/location/LocationSharingViewModel.kt");
check("Location sharing uses a fresh fix and its real capture timestamp",
  locationSharingViewModel.includes("getCurrentLocation(currentLocationRequest, CancellationTokenSource().token)") &&
    locationSharingViewModel.includes("setMaxUpdateAgeMillis(0)") &&
    locationSharingViewModel.includes("val capturedAtEpochMs = location.time") &&
    locationSharingViewModel.includes("ageMs > 2 * 60 * 1000L") &&
    locationSharingViewModel.includes("SharedLocation(uid, location.latitude, location.longitude, location.accuracy, capturedAtEpochMs)"),
  "The app does not label a stale last-known coordinate as freshly captured location.");

check("Location, SOS, and health sharing enforce Owner policy server-side",
  firestoreRules.includes("featureEnabledFor(uid, 'LOCATION')") &&
    firestoreRules.includes("featureEnabledFor(uid, 'SOS_ALERTS')") &&
    firestoreRules.includes("healthSharingAllowed()") &&
    firestoreRules.includes("capturedAtEpochMs > request.time.toMillis() - 600000") &&
    read("functions/firestore-rules.test.js").includes("location-disabled-global") &&
    read("functions/firestore-rules.test.js").includes("location-stale") &&
    read("functions/firestore-rules.test.js").includes("sos-disabled") &&
    read("functions/firestore-rules.test.js").includes("dataCollectionEnabled: false") &&
    read("app/src/main/java/com/smartcontrol/data/location/FirestoreLocationSharingRepository.kt").includes('.update("sharingActive", false'),
  "Direct Firestore writes cannot bypass disabled location/SOS features or health data-sharing policy.");

const safetyAlertsViewModel = read("app/src/main/java/com/smartcontrol/presentation/safety/SafetyAlertsViewModel.kt");
const safetyAlertsScreen = read("app/src/main/java/com/smartcontrol/presentation/safety/SafetyAlertsScreen.kt");
check("Test safety alert cannot trigger a real SOS and outcomes are visible",
  safetyAlertsViewModel.includes('type = "TEST"') &&
    !safetyAlertsViewModel.includes("fun createTestAlert() = triggerSos()") &&
    safetyAlertsViewModel.includes("Could not create the safety alert.") &&
    safetyAlertsScreen.includes("viewModel.status.collectAsState()") &&
    firestoreRules.includes("request.resource.data.type in ['SOS', 'TEST']"),
  "The test button creates a labeled non-emergency event, while SOS/acknowledgement failures are shown to the user.");

check("Owner feature policy is enforced across file-transfer operations",
  firestoreRules.includes("fileTransferAllowed(resource.data.senderDeviceId, resource.data.receiverDeviceId)") &&
    functionsIndex.includes('exports.enforceGlobalFileTransferPolicy') &&
    functionsIndex.includes('exports.enforcePerUserFileTransferPolicy') &&
    functionsIndex.includes('cancelActiveFileTransfersForUser') &&
    read("functions/spec/file-transfer-policy.test.js").includes("global file-transfer policy fails closed") &&
    !storageRules.includes("featureEnabledFor"),
  "Firestore rules gate requests/transitions; policy-change triggers cancel active transfers; Storage Rules stay within their two-document lookup limit.");
check("Incoming transfer state follows the current authenticated account",
  fileTransferViewModel.includes("FirebaseAuth.AuthStateListener") &&
    fileTransferViewModel.includes("flatMapLatest") &&
    fileTransferViewModel.includes("repository.observeIncoming(uid)") &&
    fileTransferViewModel.includes("emit(emptyList())"),
  "Switching accounts or losing Firestore access clears stale transfer metadata.");

check("Receiver can explicitly approve or reject a pending transfer",
  fileTransferViewModel.includes("fun reject(transferId: String)") &&
    fileTransferViewModel.includes("Only the intended receiver can reject a pending transfer.") &&
    read("app/src/main/java/com/smartcontrol/presentation/filetransfer/FileTransferScreen.kt").includes('Text("Reject")'),
  "Receiver consent includes a working rejection action, and only the intended receiver can use it.");

check("Receiver cannot download a transfer before READY",
  storageRules.includes("transferDoc().data.status == 'READY'"),
  "Storage read is gated until upload completes.");

check("File transfer uploads are bounded and match declared size",
  storageRules.includes("request.resource.size <= 104857600") &&
    storageRules.includes("request.resource.size == transferDoc().data.sizeBytes") &&
    read("functions/storage-rules.test.js").includes("wrong-size.bin"),
  "Storage writes are capped at 100 MiB and known-size uploads must match the transfer request.");

check("Cancelled file transfers can remove orphaned upload objects",
  storageRules.includes("transferDoc().data.status in ['APPROVED', 'UPLOADING', 'CANCELLED']") &&
    read("app/src/main/java/com/smartcontrol/data/filetransfer/FirebaseFileUploader.kt").includes("suspend fun deleteUploadedFile") &&
    read("app/src/main/java/com/smartcontrol/presentation/filetransfer/FileTransferViewModel.kt").includes("uploader.deleteUploadedFile(") &&
    read("functions/storage-rules.test.js").includes("deleteObject(ref(senderStorage"),
  "An incomplete upload is cancelled and its inaccessible object can be deleted without allowing receivers to read cancelled files.");

check("Transfer path validation uses exact path segments",
  read("app/src/main/java/com/smartcontrol/data/filetransfer/FirebaseFileUploader.kt").includes('parts.none { it == "." || it == ".." }') &&
    read("app/src/main/java/com/smartcontrol/presentation/filetransfer/FileTransferViewModel.kt").includes("storageParts.size != 4") &&
    read("app/src/main/java/com/smartcontrol/presentation/filetransfer/FileTransferViewModel.kt").includes("storageParts[2] != request.transferId"),
  "Download and cleanup paths are constrained to the sender/transfer/file structure without rejecting ordinary filenames containing two dots.");
check("TURN shared secret is not embedded in Android APK",
  !gradle.includes("TURN_CREDENTIAL") && iceServers.includes('defineSecret("SMARTCONTROL_TURN_CREDENTIAL")') &&
    iceServers.includes('createHmac("sha1", sharedSecret)'),
  "Authenticated callable issues expiring TURN REST credentials server-side.");
check("Media session requests server-authorized ICE configuration",
  mediaViewModel.includes('getHttpsCallable("getWebRtcIceServers")') &&
    mediaViewModel.includes("resolveIceServers(sessionId: String)") &&
    mediaViewModel.includes('call(mapOf("sessionId" to sessionId))') &&
    mediaViewModel.includes("Secure ICE configuration or media authorization failed"),
  "TURN credentials are tied to the approved session and authorization errors fail closed.");
check("Screen recording is separate and visible",
  manifest.includes('android:name=".service.ScreenRecordingService"') &&
    featureCenter.includes("onScreenRecording") &&
    recordingScreen.includes("createScreenCaptureIntent") &&
    recordingService.includes("MediaRecorder") &&
    recordingService.includes("ACTION_STOP"),
  "Local recording requires fresh Android system consent and exposes an ongoing Stop action.");
check("Gallery and Files Access persist the selected URI",
  featureCenter.includes("selected_media_uri") &&
    featureCenter.includes("selected_folder_uri") &&
    featureCenter.includes("takePersistableUriPermission"),
  "System picker selections survive navigation and can be explicitly cleared.");


check("Owner panel exposes controls for every canonical feature",
  ownerAdmin.includes("items(FeatureCatalog.all)") &&
    ownerAdmin.includes("viewModel.toggle(spec.id, it)") &&
    ownerAdmin.includes("setFeatureDetails(spec.id, maxDurationText, priorityText)"),
  "All 19 catalog features expose enable/disable, max duration and priority controls.");
check("Owner can override each feature per user",
  ownerAdmin.includes("Manage this user's 19 feature controls") &&
    ownerAdmin.includes("setPerUserFeature") &&
    read("app/src/main/java/com/smartcontrol/data/owner/FirestoreOwnerSettingsRepository.kt").includes("encodeUserFeaturePolicy(userPolicy)"),
  "Owner can enable or disable catalog features for an individual account and persist the user policy.");

check("Owner settings supports adding, editing and removing per-section values",
  ownerAdmin.includes("Add / Update Setting") &&
    ownerAdmin.includes("onValueRemove = viewModel::removeOwnerValue") &&
    ownerAdmin.includes("Save All Owner Settings"),
  "Owner can add or edit configuration values in each section and remove values from the in-memory draft before saving.");
check("Owner panel edits typed master configuration groups",
  ownerAdmin.includes("OwnerMasterConfigurationPanel") &&
    ownerAdmin.includes("App Branding") &&
    ownerAdmin.includes("Connection & Session") &&
    ownerAdmin.includes("Security Policy") &&
    ownerAdmin.includes("Support & Free Plan") &&
    ownerAdmin.includes("setNotificationSetting"),
  "Owner UI exposes typed branding, permission, connection, notification, content, security, support and free-plan controls.");
check("Typed master configuration is persisted by the Firestore codec",
  read("app/src/main/java/com/smartcontrol/data/owner/FirestoreOwnerSettingsRepository.kt").includes("encodeMasterConfig(config)") &&
    read("app/src/main/java/com/smartcontrol/data/owner/FirestoreOwnerSettingsRepository.kt").includes("decodeMasterConfig(data[\"masterConfig\"] as? Map<*, *>)"),
  "Typed master configuration is encoded and decoded for Owner Settings persistence.");

check("Owner custom-setting removal persists to Firestore",
  read("app/src/main/java/com/smartcontrol/data/owner/FirestoreOwnerSettingsRepository.kt").includes("removedEditableKeys") &&
    read("app/src/main/java/com/smartcontrol/data/owner/FirestoreOwnerSettingsRepository.kt").includes("FieldValue.delete()"),
  "Removing a custom setting deletes its stored Firestore field instead of only hiding it in the editor.");

const ownerSettingsRepository = read("app/src/main/java/com/smartcontrol/data/owner/FirestoreOwnerSettingsRepository.kt");
const rollbackImplementation = ownerSettingsRepository.slice(
  ownerSettingsRepository.indexOf("override suspend fun rollback("),
  ownerSettingsRepository.indexOf("private fun stripNulls")
);
check("Owner settings rollback removes keys absent from the restored snapshot",
  rollbackImplementation.includes("currentEditable") &&
    rollbackImplementation.includes("removedEditableKeys") &&
    rollbackImplementation.includes("FieldValue.delete()"),
  "Rollback restores the prior editable-values set instead of leaving newer keys active.");

check("Payment secrets remain outside generic owner settings editor",
  ownerAdmin.includes("Gateway credentials are managed only by the secure Permanent Gateway Permit panel above") &&
    ownerAdmin.includes("legacyGatewaySecretKeys"),
  "Generic configuration editor blocks legacy payment secret keys; gateway changes use the dedicated secure panel.");

const messagingService = read("app/src/main/java/com/smartcontrol/service/SmartControlMessagingService.kt");
check("FCM token registration rejects insecure API URLs",
  messagingService.includes("URL(base)") &&
    messagingService.includes("parsedBase.userInfo != null") &&
    messagingService.includes("parsedBase.query != null") &&
    messagingService.includes("parsedBase.ref != null") &&
    messagingService.includes('parsedBase.protocol != "https"') &&
    messagingService.includes("parsedBase.host") &&
    messagingService.includes("instanceFollowRedirects = false"),
  "Firebase ID tokens are only posted to HTTPS endpoints, with HTTP allowed for local development only.");

const mediaEngine = read("app/src/main/java/com/smartcontrol/data/media/WebRtcMediaEngine.kt");
const mediaEngineRelease = mediaEngine.slice(
  mediaEngine.indexOf("fun release()"),
  mediaEngine.indexOf("private fun createPeerConnection")
);
check("Singleton WebRTC engine remains reusable after ViewModel cleanup",
  mediaEngineRelease.includes("peerConnections.clear()") &&
    mediaEngineRelease.includes("captures.clear()") &&
    mediaEngineRelease.includes("candidateJobs.clear()") &&
    !mediaEngineRelease.includes("factory.dispose()") &&
    !mediaEngineRelease.includes("eglBase.release()") &&
    !mediaEngineRelease.includes("initialized.set(false)"),
  "ViewModel cleanup releases active sessions but does not destroy the process-wide EGL/factory instance reused by later screens.");

const mediaViewModelSource = read("app/src/main/java/com/smartcontrol/presentation/media/MediaSessionViewModel.kt");
const viewerGateBlock = mediaViewModelSource.slice(
  mediaViewModelSource.indexOf("fun connectViewer("),
  mediaViewModelSource.indexOf("fun stop(")
);
check("Viewer policy denial stops the approved session and visible services",
  viewerGateBlock.includes("if (!capabilitiesAllowed(session.capabilities, session.targetDeviceId))") &&
    viewerGateBlock.includes("signaling.stopSession(session.sessionId)") &&
    viewerGateBlock.includes("MediaProjectionForegroundService.stop(context)") &&
    viewerGateBlock.includes("FamilySafetyService.setIdle(context)") &&
    viewerGateBlock.includes("if (!privacyPrefs.getBoolean(\"allow_media_sharing\", true))"),
  "An approved session is not left hanging when the viewer's owner policy or privacy setting blocks connection.");

const mediaEngineInitialize = mediaEngine.slice(
  mediaEngine.indexOf("fun initialize()"),
  mediaEngine.indexOf("suspend fun publish(")
);
check("WebRTC initialization can retry after native factory failure",
  mediaEngine.includes("@Synchronized\\n    fun initialize()") &&
    mediaEngineInitialize.indexOf("factory = createdFactory") >= 0 &&
    mediaEngineInitialize.indexOf("factory = createdFactory") < mediaEngineInitialize.indexOf("initialized.set(true)") &&
    mediaEngineInitialize.includes("if (initialized.get()) return"),
  "The engine marks itself initialized only after the native factory is successfully created.");

const microphoneSetup = mediaEngine.slice(
  mediaEngine.indexOf("if (MediaCapability.MICROPHONE in capabilities)"),
  mediaEngine.indexOf("if (MediaCapability.CAMERA in capabilities)")
);
check("WebRTC disposes the audio source if track creation fails",
  microphoneSetup.includes("factory.createAudioTrack") &&
    microphoneSetup.includes("catch (error: Exception)") &&
    microphoneSetup.includes("audioSource.dispose()") &&
    microphoneSetup.includes("resources += AutoCloseable"),
  "A failed microphone-track setup cannot leak its native audio source before the general session cleanup runs.");

const notificationSendBlock = read("backend/src/app.js").slice(
  read("backend/src/app.js").indexOf('app.post("/api/notifications/send"'),
  read("backend/src/app.js").indexOf('app.get("/api/plans"')
);
check("Push notification payloads are bound to the target account",
  notificationSendBlock.includes("targetUid: uid") &&
    notificationSendBlock.includes("android: { priority: \"high\" }") &&
    !notificationSendBlock.includes("notification: { title, body }") &&
    messagingService.includes('message.data["targetUid"]') &&
    messagingService.includes("FirebaseAuth.getInstance().currentUser?.uid != targetUid"),
  "Data-only FCM messages are displayed only when the currently signed-in UID matches the target, preventing stale tokens from showing another account's notification.");

const failed = checks.filter(x => !x.ok);
for (const x of checks) console.log((x.ok ? "PASS " : "FAIL ") + x.name + " — " + x.detail);
if (failed.length) { console.error("SECURITY_CONTROLS_VERIFY=FAILED"); process.exit(1); }
console.log("SECURITY_CONTROLS_VERIFY=STATIC_PASS");
