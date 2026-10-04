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

The two callable functions currently exported by the repository are:

- `changeParentPin`
- `verifyParentPin`

Use Firebase Console -> Functions to confirm that both functions are deployed and inspect logs after a test call.

## GitHub Actions

The Android workflow validates the Functions source with `node --check` and builds debug plus unsigned release APK artifacts.

Required GitHub Actions secrets:

- `FIREBASE_GOOGLE_SERVICES_JSON`: complete Android `google-services.json` contents.
- `SMARTCONTROL_GOOGLE_WEB_CLIENT_ID`: the OAuth web client ID used by Google Sign-In.

The workflow does not deploy Firebase Functions automatically because deployment requires credentials and access to the user's Firebase project. This keeps project credentials out of source control.

## Important media note

The Android project currently has the consent/session architecture and permission center, but a production WebRTC media transport still requires an end-to-end signaling design, runtime MediaProjection consent handling, ICE/STUN/TURN configuration, and testing on two physical Android devices. Camera, microphone, and screen capture must remain visibly active and user-approved.
