# Production Readiness Configuration

This document records the external configuration required after code and CI verification. Configuration presence is not proof of production deployment.

## Backend
Required in production:
- DATABASE_URL
- SMARTCONTROL_DATA_REGION (IN, EU, US, UK, or APAC)
- Firebase Admin credentials/environment supported by firebase-admin
- CORS_ORIGIN
- PUBLIC_APP_URL (trusted HTTPS origin used for invitation links; no path, query, or fragment)
- PORT (defaults to 8080)

For blockchain audit anchoring:
- SMARTCONTROL_AUDIT_RPC_URL
- SMARTCONTROL_AUDIT_PRIVATE_KEY
- SMARTCONTROL_AUDIT_CONTRACT_ADDRESS

The blockchain contract must be deployed first and the configured anchorer address must match the signing key.

## Web
Required build/runtime configuration:
- NEXT_PUBLIC_FIREBASE_API_KEY
- NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
- NEXT_PUBLIC_FIREBASE_PROJECT_ID
- NEXT_PUBLIC_FIREBASE_APP_ID
- NEXT_PUBLIC_SMARTCONTROL_API_BASE_URL

## Android
CI accepts optional:
- FIREBASE_GOOGLE_SERVICES_JSON
- SMARTCONTROL_GOOGLE_WEB_CLIENT_ID
- SMARTCONTROL_TURN_URLS
- SMARTCONTROL_TURN_USERNAME
- SMARTCONTROL_TURN_CREDENTIAL

Physical verification remains required for Wi-Fi Direct, Bluetooth P2P, WebRTC, and MediaProjection/system-consent flows.

## iOS
The simulator build is CI-verified. Production authentication and service verification still require the production Firebase/iOS configuration and a real-device test.

## Desktop
Production deployment requires:
- SMARTCONTROL_WEB_URL
- optional SMARTCONTROL_API_BASE_URL

Linux AppImage packaging is automated in CI. Windows/macOS packaging and real deployed-service verification require the respective build environments/configuration.

## Deployment order
1. Deploy Firebase rules, indexes, and functions from the repository configuration.
2. Deploy PostgreSQL migrations and verify connectivity.
3. Deploy the Node/Socket.IO backend with the selected data-residency region.
4. Deploy the web application with its Firebase/API environment.
5. Deploy desktop/mobile clients with the production service endpoints.
6. Run authenticated production smoke tests.
7. Run physical two-device WebRTC and MediaProjection tests.
8. Verify blockchain anchor transactions and recorded on-chain roots.

No item is considered production-verified merely because these variables exist; the live service and end-to-end behavior must be observed.

## Android background-service limits

The Android family-safety service uses a visible foreground notification and rechecks consent, sign-in, and the user's auto-start choice. Android 15+ (for apps targeting API 35 or later) limits `dataSync` foreground services to six hours per 24-hour period and blocks starting that service directly from `BOOT_COMPLETED`. The app therefore stops cleanly at timeout and posts a resume notification when notifications are allowed; after reboot, the notification asks the user to open the app. Continuous 24x7 execution is **not guaranteed** by source code or CI and must not be advertised as unrestricted. Real-device/OEM testing and user-approved recovery are required.
