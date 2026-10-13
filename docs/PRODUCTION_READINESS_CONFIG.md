# Production Readiness Configuration

This document records the external configuration required after code and CI verification. Configuration presence is not proof of production deployment.

## Backend
Required in production:
- DATABASE_URL
- SMARTCONTROL_DATA_REGION (IN, EU, US, UK, or APAC)
- Firebase Admin credentials/environment supported by firebase-admin
- CORS_ORIGIN
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

## GitHub Actions production-readiness secrets

The blocking Production Readiness Gate expects these repository Actions secrets. Configure them in **GitHub → Settings → Secrets and variables → Actions → New repository secret**. Do not commit their values, put private keys in app code, or paste credentials into chat.

| Secret | Obtain/configure it from |
|---|---|
| `SMARTCONTROL_DATA_REGION` | Choose the deployment/data-residency region approved for your users and legal obligations: `IN`, `EU`, `US`, `UK`, or `APAC`. This is an operator decision, not a placeholder. |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Firebase Console → Project settings → General → Web app configuration. |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Same Firebase Web app configuration. |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | The actual Firebase project ID. |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | Same Firebase Web app configuration. |
| `NEXT_PUBLIC_SMARTCONTROL_API_BASE_URL` | HTTPS base URL of the deployed backend API; do not use localhost. |
| `FIREBASE_GOOGLE_SERVICES_JSON` | Contents of the matching Android app's `google-services.json` from Firebase Console. |
| `SMARTCONTROL_GOOGLE_WEB_CLIENT_ID` | OAuth 2.0 Web application client ID used by Google Sign-In. |
| `SMARTCONTROL_TURN_URLS` | TURN/TURNS URLs from the provisioned TURN service, comma-separated. |
| `SMARTCONTROL_TURN_CREDENTIAL` | TURN REST/shared-secret credential from the TURN provider. Keep it server-side. |
| `SMARTCONTROL_IOS_FIREBASE_CONFIG` | Contents of the matching iOS app's `GoogleService-Info.plist`. |
| `SMARTCONTROL_AUDIT_RPC_URL` | HTTPS RPC endpoint for the selected EVM network. |
| `SMARTCONTROL_AUDIT_PRIVATE_KEY` | Dedicated deployer/anchor signer key stored only in GitHub Secrets/Secret Manager; never reuse a personal wallet key. Fund it only as required for the chosen network. |
| `SMARTCONTROL_AUDIT_CONTRACT_ADDRESS` | Address of the deployed `AuditAnchor` contract on the same network as the RPC URL. Verify the contract and signer/network match before enabling anchoring. |

The gate checks that values exist; it cannot prove that credentials are correct, a TURN relay is reachable, or a contract is deployed. After setting secrets, rerun the Production Readiness Gate, deploy only through the approved deployment process, and perform authenticated smoke tests. A green CI run alone is not evidence of a production deployment.

Additional runtime settings such as `DATABASE_URL`, `CORS_ORIGIN`, Razorpay credentials, and `SMARTCONTROL_GATEWAY_ENCRYPTION_KEY` must be configured in the hosting provider's secret manager for the services that use them. Use the deployment docs and the provider's secure secret prompt; do not create fake values just to pass CI.
