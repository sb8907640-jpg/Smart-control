# Production Readiness Configuration

This document records the external configuration required after code and CI verification. Configuration presence is not proof of production deployment.

## Exact production-readiness gate checklist

The production preflight requires these 16 values to be configured in GitHub Actions secrets/variables and the corresponding hosting environments. Use the same trusted production values consistently across services; never commit credentials or paste secrets into issues, pull requests, or chat.

| Variable | Purpose | Handling |
|---|---|---|
| `CORS_ORIGIN` | Exact trusted web origin(s) allowed by the API | Variable; HTTPS origin(s) only |
| `PUBLIC_APP_URL` | Trusted public app origin for generated invitation links | Variable; HTTPS origin, no path/query/fragment |
| `SMARTCONTROL_DATA_REGION` | Data residency region: IN, EU, US, UK, or APAC | Variable |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Firebase web client config | Public client config; still set per environment |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Firebase web auth domain | Public client config |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Firebase project ID | Public client config |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | Firebase web app ID | Public client config |
| `NEXT_PUBLIC_SMARTCONTROL_API_BASE_URL` | Deployed HTTPS API base URL | Variable; HTTPS in production |
| `SMARTCONTROL_WEB_URL` | Deployed web origin used by desktop/client configuration | Variable; HTTPS origin |
| `SMARTCONTROL_GOOGLE_WEB_CLIENT_ID` | Google OAuth web client ID for supported clients | Public client ID; configure matching OAuth origins |
| `SMARTCONTROL_TURN_URLS` | TURN/STUN server URL list for WebRTC | Variable; use production relay endpoints |
| `SMARTCONTROL_TURN_CREDENTIAL` | TURN relay credential | Secret; rotate if exposed |
| `SMARTCONTROL_IOS_FIREBASE_CONFIG` | Production iOS Firebase configuration | Secret/config value; restrict access |
| `SMARTCONTROL_AUDIT_RPC_URL` | Blockchain RPC endpoint for audit anchoring | Secret/config value |
| `SMARTCONTROL_AUDIT_PRIVATE_KEY` | Signer key for audit anchor transactions | **Secret; never commit or share** |
| `SMARTCONTROL_AUDIT_CONTRACT_ADDRESS` | Deployed audit-anchor contract address | Variable; verify deployed network and signer |

The preflight also validates Android Firebase client configuration from `app/google-services.json` or `FIREBASE_GOOGLE_SERVICES_JSON`. Android OAuth/TURN values may be needed by client builds even when they are not among the 16 gate variables.

## Backend

Required in production:
- `DATABASE_URL`
- `SMARTCONTROL_DATA_REGION` (IN, EU, US, UK, or APAC)
- Firebase Admin credentials/environment supported by firebase-admin
- `CORS_ORIGIN`
- `PUBLIC_APP_URL` (trusted HTTPS origin used for invitation links; no path, query, or fragment)
- `PORT` (defaults to 8080)

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

CI accepts optional:
- `FIREBASE_GOOGLE_SERVICES_JSON`
- `SMARTCONTROL_GOOGLE_WEB_CLIENT_ID`
- `SMARTCONTROL_TURN_URLS`
- `SMARTCONTROL_TURN_USERNAME`
- `SMARTCONTROL_TURN_CREDENTIAL`

Physical verification remains required for Wi-Fi Direct, Bluetooth P2P, WebRTC, and MediaProjection/system-consent flows.

## iOS

The simulator build is CI-verified. Production authentication and service verification still require the production Firebase/iOS configuration and a real-device test.

## Desktop

Production deployment requires:
- `SMARTCONTROL_WEB_URL`
- optional `SMARTCONTROL_API_BASE_URL`

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
