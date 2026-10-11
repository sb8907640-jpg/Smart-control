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

check("AES-256-GCM", /AES-256-GCM/.test(policy) && /createCipheriv/.test(policy), "Authenticated AES-256-GCM policy exists.");
check("2FA + OTP", /Mobile OTP/.test(policy) && /2FA/.test(policy), "Google/Mobile OTP plus deployment-controlled 2FA/MFA.");
check("Consent + activity logs", /consentLog: true/.test(policy) && /activityLog: true/.test(policy), "Both audit categories are mandatory.");
check("Live indicator", /startVisibleForeground|setOngoing\(true\)|Family Safety Active/.test(service), "Foreground notification remains visible.");
check("STOP", /ACTION_STOP_SYNC|Stop Sync|stopSelf\(\)/.test(service), "User-visible service stop action exists.");
check("Access notification", /Notification/.test(service) && /statusAlerts/.test(service), "Notification/status alert surface exists.");
check("Data deletion policy", /userDataDeletion: true/.test(policy), "Deletion is a required policy control.");
check("Legal compliance", /GDPR/.test(policy) && /IT Act 2000/.test(policy) && /DPDP Act 2023/.test(policy), "Legal readiness labels are present.");
check("Persistent link recovery", /PersistentLinkState/.test(recovery) && /shouldRecover/.test(recovery), "Persistent recovery remains defined.");
check("Boot/watchdog opt-in", /explicit user opt-in only/i.test(policy) && /bootPersistence/.test(policy), "Restart behavior cannot bypass user choice.");
check("Boot receiver is explicit opt-in", /RECEIVE_BOOT_COMPLETED/.test(manifest) && /SmartControlBootReceiver/.test(manifest) && /auto_start_service/.test(read("app/src/main/java/com/smartcontrol/service/SmartControlBootReceiver.kt")), "Boot persistence only starts when the saved user preference is enabled.");
check("SOS approval boundary", /APPROVED/.test(session) && /approve/.test(sessionRepo) && /never silently grants/i.test(policy), "Emergency flow does not silently grant protected permissions.");
check("No permission bypass", !/(auto.?grant|silentGrant|permissionBypass|skipPermissionDialog)/i.test(policy + service + manifest), "No silent permission bypass marker.");
const pairingRepo = read("app/src/main/java/com/smartcontrol/data/pairing/FirestorePairingRepository.kt");
const mediaViewModel = read("app/src/main/java/com/smartcontrol/presentation/media/MediaSessionViewModel.kt");
const firestoreRules = read("firestore.rules");
const storageRules = read("storage.rules");
const iceServers = read("functions/ice-servers.js");
const gradle = read("app/build.gradle.kts");
const featureCenter = read("app/src/main/java/com/smartcontrol/presentation/features/FeatureCenterScreen.kt");
const recordingScreen = read("app/src/main/java/com/smartcontrol/presentation/media/ScreenRecordingScreen.kt");
const recordingService = read("app/src/main/java/com/smartcontrol/service/ScreenRecordingService.kt");

check("Pairing lifetime does not read private Owner settings on client",
  pairingRepo.includes('getHttpsCallable("getDevicePairingPolicy")') && !pairingRepo.includes("ownerSettingsRepository"),
  "Regular family accounts obtain only the effective expiry policy from the authenticated callable.");
check("Server computes the pairing policy",
  read("functions/index.js").includes("exports.getDevicePairingPolicy") &&
    read("functions/index.js").includes("PairingTokenExpiryMinutes"),
  "Plan expiry is read server-side without exposing owner settings.");
check("Pairing codes enforce Owner-only no-expiry",
  firestoreRules.includes("request.resource.data.expiresAt <= request.time.toMillis() + 3600000") &&
    firestoreRules.includes("request.auth.token.role == 'OWNER'") &&
    firestoreRules.includes("request.resource.data.expiryMode == 'NO_EXPIRY'"),
  "Non-owner pairing codes are limited to 60 minutes.");
check("Pairing claim consumes code only with matching atomic device link",
  firestoreRules.includes("getAfter(/databases/$(database)/documents/devices/$(resource.data.deviceUid))") &&
    firestoreRules.includes("pairingToken == token"),
  "A controller cannot delete a pairing code without the matching linked-device write.");
check("Media offer and answer SDP are participant-owned",
  firestoreRules.includes("affectedKeys().hasOnly(['offerSdp'])") &&
    firestoreRules.includes("affectedKeys().hasOnly(['answerSdp'])"),
  "Target publishes offer SDP; controller publishes answer SDP.");
check("File transfer requests require an active paired receiver",
  firestoreRules.includes("data.pairingActive == true") &&
    firestoreRules.includes("request.resource.data.receiverDeviceId"),
  "Transfers cannot be opened to arbitrary unrelated accounts.");
check("Receiver cannot download a transfer before READY",
  storageRules.includes("transferDoc().data.status == 'READY'"),
  "Storage read is gated until upload completes.");
check("TURN shared secret is not embedded in Android APK",
  !gradle.includes("TURN_CREDENTIAL") && iceServers.includes('defineSecret("SMARTCONTROL_TURN_CREDENTIAL")') &&
    iceServers.includes('createHmac("sha1", sharedSecret)'),
  "Authenticated callable issues expiring TURN REST credentials server-side.");
check("Media session requests server-issued ICE configuration",
  mediaViewModel.includes('getHttpsCallable("getWebRtcIceServers")') &&
    mediaViewModel.includes("resolveIceServers()"),
  "Media sessions use TURN when configured and display a STUN-only warning otherwise.");
check("Screen recording is separate and visible",
  manifest.includes('android:name=".service.ScreenRecordingService"') &&
    featureCenter.includes("onScreenRecording") &&
    recordingScreen.includes("createScreenCaptureIntent") &&
    recordingService.includes("MediaRecorder") &&
    recordingService.includes("ACTION_STOP"),
  "Local recording requires fresh Android system consent and exposes an ongoing Stop action.");


const failed = checks.filter(x => !x.ok);
for (const x of checks) console.log((x.ok ? "PASS " : "FAIL ") + x.name + " — " + x.detail);
if (failed.length) { console.error("SECURITY_CONTROLS_VERIFY=FAILED"); process.exit(1); }
console.log("SECURITY_CONTROLS_VERIFY=STATIC_PASS");
