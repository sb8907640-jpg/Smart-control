# Firebase deployment

This repository contains the Callable Functions under `functions/`.

## One-time setup

1. Install Node.js 20.
2. From the repository root, authenticate with Firebase CLI:
   `npx firebase-tools login`
3. Select your Firebase project:
   `npx firebase-tools use --add`
4. Choose the project that contains the Android app and Firestore database.

Cloud Functions deployment requires the Firebase project to meet the current Cloud Functions billing requirements. Firebase documents the current deployment requirements in its Cloud Functions guide.

## Deploy Functions

From the repository root:

```bash
npm --prefix functions ci
npm --prefix functions run check
npx firebase-tools deploy --only functions
```

## Deploy Functions and Firestore rules

```bash
npm --prefix functions ci
npm --prefix functions run check
npx firebase-tools deploy --only functions,firestore:rules
```

## Verify

The Functions package exports callable functions for billing/subscriptions, payment verification, owner-managed gateway permits, ICE servers, and other application workflows. The complete export list is in `functions/index.js`. After deployment, inspect Firebase Console -> Functions and Cloud Logging for startup or invocation errors. Run `npm --prefix functions run check` before deployment.


## Owner payment gateway encryption

Before using the Owner panel's Payment gateway tab, configure the server-side encryption secret. Generate a fresh 32-byte key locally and store it in Firebase Secret Manager (do not commit or share it):

```bash
openssl rand -base64 32
npx firebase-tools functions:secrets:set SMARTCONTROL_GATEWAY_ENCRYPTION_KEY
```

Paste the generated key only into the secret prompt. The gateway permit code accepts a 32-byte base64 value or a 64-character hex value. Back up this secret in your approved secret manager: existing encrypted gateway credentials cannot be decrypted if the key is lost or changed. Deploy Functions after setting the secret:

```bash
npm --prefix functions ci
npm --prefix functions run check
npx firebase-tools deploy --only functions
```

Razorpay is the only gateway adapter currently marked implemented. Other gateway providers may be saved as encrypted drafts, but must not be represented as live checkout integrations until their server adapter and verification tests exist.

## GitHub Actions

The Android workflow validates the Functions source with `node --check` and builds debug plus unsigned release APK artifacts.

Required GitHub Actions secrets:

- `FIREBASE_GOOGLE_SERVICES_JSON`: complete Android `google-services.json` contents.
- `SMARTCONTROL_GOOGLE_WEB_CLIENT_ID`: the OAuth web client ID used by Google Sign-In.

The workflow does not deploy Firebase Functions automatically because deployment requires credentials and access to the user's Firebase project. This keeps project credentials out of source control.

## Important media note

The Android project currently has the consent/session architecture and permission center, but a production WebRTC media transport still requires an end-to-end signaling design, runtime MediaProjection consent handling, ICE/STUN/TURN configuration, and testing on two physical Android devices. Camera, microphone, and screen capture must remain visibly active and user-approved.
