# Smart-Control Transfer Handoff

Last reviewed: 2026-10-16  
Repository: `sb8907640-jpg/Smart-control`  
Primary integration PR: #19 — https://github.com/sb8907640-jpg/Smart-control/pull/19  
Related PR: #18 — https://github.com/sb8907640-jpg/Smart-control/pull/18

## Current status — NOT production-ready

The source and CI checks are not equivalent to a deployed, production-verified release. The latest reported CI on commit `4bff9f506bec4bd058a9404520f6cf129c5420dc` passed Android, Backend, Web, Desktop, iOS and Platform CI; Production Readiness Gate failed because required production configuration was absent. Confirm checks again for the current PR head before merging.

PR #19 is the proposed consolidated implementation for pairing/WebRTC reconnect, heartbeat, Firestore rule tests, Razorpay refund state handling, strict production preflight and signed release workflow. PR #18 overlaps substantially; review both before merging and avoid integrating duplicate changes twice. PR #19 currently targets `main` and is open.

## Remaining external blockers

### GitHub Actions secrets and configuration

Set real values in repository Settings → Secrets and variables → Actions. Never commit secrets or send them in chat.

Required names checked by `scripts/production-readiness-preflight.js`:

- `SMARTCONTROL_DATA_REGION` (IN, EU, US, UK, APAC)
- `DATABASE_URL`, `CORS_ORIGIN`, `SMARTCONTROL_GATEWAY_ENCRYPTION_KEY`
- `PUBLIC_APP_URL`, `SMARTCONTROL_WEB_URL`
- `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID`, `NEXT_PUBLIC_FIREBASE_APP_ID`, `NEXT_PUBLIC_SMARTCONTROL_API_BASE_URL`
- `SMARTCONTROL_GOOGLE_WEB_CLIENT_ID`
- `SMARTCONTROL_TURN_URLS`, `SMARTCONTROL_TURN_USERNAME`, `SMARTCONTROL_TURN_CREDENTIAL`
- `SMARTCONTROL_IOS_FIREBASE_CONFIG`
- `SMARTCONTROL_AUDIT_RPC_URL`, `SMARTCONTROL_AUDIT_PRIVATE_KEY`, `SMARTCONTROL_AUDIT_CONTRACT_ADDRESS`
- `ANDROID_RELEASE_KEYSTORE_BASE64`, `ANDROID_RELEASE_STORE_PASSWORD`, `ANDROID_RELEASE_KEY_ALIAS`, `ANDROID_RELEASE_KEY_PASSWORD`
- Valid Android Firebase client config for package `com.smart.control`, supplied as `FIREBASE_GOOGLE_SERVICES_JSON` or `app/google-services.json`.

Values must be real, valid, and correspond to deployed services. Do not use placeholders to force the gate green. The audit contract must be deployed and match the configured key. TURN credentials must match a reachable TURN service. The Android keystore must be the authorized release key and securely backed up.

## Release APK checklist

1. Run Actions → Android APK Download → Run workflow → `all` (requires release signing secrets).
2. Verify the workflow's signature-verification step succeeds for each release APK.
3. Download artifacts and record SHA-256 checksums; keep the signing key/passwords outside the artifact.
4. Confirm package/version and install Owner, Lite and Full on authorized test devices.
5. Do not distribute unsigned release builds or treat debug builds as production releases.

## Payment integration status

Razorpay is the only implemented live checkout/refund adapter described by the current configuration documentation. Stripe, PayPal, Cashfree, PhonePe, PayU and Custom are not production-ready live adapters until each has provider-specific checkout/order creation, server-side signature/webhook verification, refund handling, idempotency, sandbox tests and documented credentials/configuration. Keep unsupported providers disabled; never report a payment/refund as successful without provider confirmation.

For Razorpay, configure credentials only through the documented server-side secret / Owner-only encrypted gateway flow, set the deployed webhook endpoint, test captured/failed/refunded events, and verify full and partial refunds in sandbox before live enablement.

## Physical-device and production smoke tests

Automated CI cannot prove real-device connectivity. Test on two physical Android devices with real authenticated accounts and deployed backend:
- Pairing and owner/controller authorization; reject unauthorized pairing and spoofed heartbeat.
- Online/offline heartbeat, process restart, network loss/recovery and bounded reconnect.
- WebRTC audio/video or screen share, ICE restart, TURN relay on restrictive networks, stop/disconnect and permissions.
- Notifications, background behavior, MediaProjection/system-consent flows.
- Payment sandbox checkout, webhook replay/idempotency, partial/full refund and pending/failed reconciliation.
Record device models, OS versions, build SHA, logs (redacted), and results.

## Transfer to another repository/account

1. Transfer the GitHub repository using GitHub repository Settings → General → Danger Zone → Transfer ownership, or create a destination repository and push all branches/tags. Verify the destination owner has access to Actions, packages, Firebase and external service accounts.
2. Migrate GitHub Actions secrets manually in the destination; GitHub does not transfer secret values with git history. Rotate any credentials that were exposed or whose custody is uncertain.
3. Recreate repository/environment protection rules, Actions permissions, variables, deploy keys, webhooks, app registrations, Firebase IAM, hosting secrets, payment webhook URLs, TURN service settings, and audit-chain configuration.
4. Re-run CI and the production preflight on the destination. Reconfigure callback/webhook URLs if the repository or deployed domains change.
5. Preserve the original release keystore securely. Losing it may prevent updates to an already-published Android app.
6. Only mark the transfer/release complete after destination CI passes, the gate reports `PRODUCTION_READINESS=CONFIGURED`, release signatures verify, and external smoke tests pass.

## Completion criteria

- [ ] PR reviewed; overlap between #18 and #19 resolved; merge only after required checks pass.
- [ ] Production preflight passes with real configuration.
- [ ] Owner, Lite and Full release APKs are signed and verified with the authorized key.
- [ ] Razorpay sandbox checkout/webhook/refund tests pass; other providers remain disabled until implemented and tested.
- [ ] Two-device physical pairing/WebRTC checks pass.
- [ ] Destination repository, secrets, deployment integrations, and CI verified after transfer.
