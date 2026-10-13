# Production Readiness Configuration

This document records the external configuration required after code and CI verification. Configuration presence is not proof of production deployment.

## Backend and deployment
Required in production:
- `DATABASE_URL`
- `SMARTCONTROL_DATA_REGION` (IN, EU, US, UK, or APAC)
- Firebase Admin credentials/environment supported by firebase-admin (use the hosting platform service identity / Application Default Credentials where available; a JSON key file is not universally required)
- `CORS_ORIGIN`
- `PUBLIC_APP_URL` (HTTPS base URL used to generate pairing invitation links)
- `SMARTCONTROL_WEB_URL` (web URL used by desktop and web clients)
- `PORT` (defaults to 8080)

For payment gateway credential encryption:
- `SMARTCONTROL_GATEWAY_ENCRYPTION_KEY`: a 32-byte key encoded as Base64 or a 64-character hex string. Keep it server-side and back it up securely; changing it without re-encrypting stored gateway credentials prevents those credentials from being decrypted.
- Razorpay server secrets: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, and `RAZORPAY_WEBHOOK_SECRET` must be configured through Firebase Functions secrets or the Owner-only Permanent Gateway Permit. Never embed live payment credentials in an APK or source control.
- Only Razorpay has a built-in live payment adapter at this revision. Other provider entries are drafts/catalog options and cannot be activated until a provider-specific checkout, webhook verification, refund flow, and tests are implemented. A display name or generic HMAC webhook is not a substitute for a provider adapter.

For blockchain audit anchoring:
- `SMARTCONTROL_AUDIT_RPC_URL`
- `SMARTCONTROL_AUDIT_PRIVATE_KEY`
- `SMARTCONTROL_AUDIT_CONTRACT_ADDRESS`

The blockchain contract must be deployed first and the configured anchorer address must match the signing key.

## Web
Required build/runtime configuration:
- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`
- `NEXT_PUBLIC_SMARTCONTROL_API_BASE_URL`

## Android
CI validates `app/google-services.json` for package `com.smart.control`. The config can be supplied through `FIREBASE_GOOGLE_SERVICES_JSON` or the checked-in client config.

Production authentication and remote media require:
- `SMARTCONTROL_GOOGLE_WEB_CLIENT_ID`
- `SMARTCONTROL_TURN_URLS`
- `SMARTCONTROL_TURN_USERNAME`
- `SMARTCONTROL_TURN_CREDENTIAL`

The TURN credentials must belong to a deployed TURN service and should be issued/used as short-lived credentials where supported. A STUN-only connection is not proof of reliable operation across restrictive NATs.

For signed release APKs, configure GitHub Actions secrets:
- `ANDROID_RELEASE_KEYSTORE_BASE64`
- `ANDROID_RELEASE_STORE_PASSWORD`
- `ANDROID_RELEASE_KEY_ALIAS`
- `ANDROID_RELEASE_KEY_PASSWORD`

The standard Android CI build compiles Owner, Lite, and Full debug and release variants. Release variants produced without signing secrets are explicitly unsigned and must not be distributed as production releases. The dedicated APK workflow verifies signatures when a release/all build is explicitly requested.

Physical verification remains required for Wi-Fi Direct, Bluetooth P2P, WebRTC ICE restart/reconnect, background operation, notifications, and MediaProjection/system-consent flows.

## iOS
Required production configuration:
- `SMARTCONTROL_IOS_FIREBASE_CONFIG`

The simulator build is CI-verified. Production authentication and service verification still require the production Firebase/iOS configuration and a real-device test.

## Desktop
Production deployment requires:
- `SMARTCONTROL_WEB_URL`
- optional `SMARTCONTROL_API_BASE_URL`

Linux AppImage packaging is automated in CI. Windows/macOS packaging and real deployed-service verification require the respective build environments/configuration.

## Deployment order
1. Configure production secrets and service endpoints; verify the production-readiness preflight reports `PRODUCTION_READINESS=CONFIGURED`.
2. Deploy Firebase rules, indexes, and functions from the repository configuration.
3. Deploy PostgreSQL migrations and verify connectivity.
4. Deploy the Node/Socket.IO backend with the selected data-residency region.
5. Deploy the web application with its Firebase/API environment.
6. Deploy desktop/mobile clients with the production service endpoints.
7. Run authenticated production smoke tests and a real payment test followed by refund verification.
8. Run physical two-device WebRTC/ICE-restart and MediaProjection tests.
9. Verify blockchain anchor transactions and recorded on-chain roots.

No item is considered production-verified merely because these variables exist; the live service and end-to-end behavior must be observed. CI may report its code checks successful while the production configuration preflight is blocked, because pull-request runs allow missing deployment secrets. Check the explicit `PRODUCTION_READINESS` line rather than the overall workflow status alone.
