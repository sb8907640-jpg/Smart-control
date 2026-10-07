# Smart Control — Total Control System Master Specification

This document is the canonical product and verification specification for the repository. It separates **declared contracts**, **implemented repository surfaces**, and **runtime/production evidence**. A catalog entry alone is never treated as proof of runtime behavior.

## 1. Master targets

| Target | Requirement |
|---|---:|
| Control features | 19 |
| Modes | 2 — Controller + Client |
| Platforms | 5 — Android / iOS / Web / Desktop / Backend |
| App variants | 4 — Owner / Receiver Lite / Receiver Full / Desktop Agent |
| User roles | 8 |
| Database tables | 42+ |
| API endpoints | 60+ |
| Offline support | 18/19 |
| Online support | 19/19 |
| Continuous operation | Designed for 24×7, subject to OS/platform restrictions |
| Auto-reconnect | Automatic recovery when network returns |
| Persistent link | Until explicit disconnect/reset, subject to OS/platform restrictions |
| Permission choice | Manual Allow All or manual One-by-One |
| Security | Consent/session gated, auditable, no permission bypass |

## 2. Canonical 19-feature matrix

| # | Feature | Offline | Online |
|---:|---|---|---|
| 1 | 📍 Location — Live location share | Yes | Yes |
| 2 | 🔔 Notifications — Read notifications | Yes | Yes |
| 3 | 🔋 Battery & Network — Battery/network info | Yes | Yes |
| 4 | 📷 Camera — Camera access | Yes | Yes |
| 5 | 🎤 Microphone — Mic access | Yes | Yes |
| 6 | 🖼️ Gallery — Photos/videos | Yes | Yes |
| 7 | 🖥️ Screen Share — Share screen | No | Yes |
| 8 | ⏺️ Screen Recording — Record screen | Yes | Yes |
| 9 | 👆 Touch Control — Touch control | P2P | Yes |
| 10 | ⌨️ Keyboard Input — Keyboard input | P2P | Yes |
| 11 | 📦 App Install/Uninstall — Install/uninstall requests | Queue | Yes |
| 12 | 📤 File Transfer — Send/receive files | Yes | Yes |
| 13 | 📋 Clipboard Sync — Sync clipboard text | Yes | Yes |
| 14 | 📁 Files Access — Files/folders | Yes | Yes |
| 15 | 👥 Contacts — View contacts | Yes | Yes |
| 16 | 💬 SMS — Read-only SMS | Yes | Yes |
| 17 | 📞 Call Logs — View call history | Yes | Yes |
| 18 | 📱 App Usage — App usage information | Yes | Yes |
| 19 | 🆘 SOS Alerts — Emergency SOS alerts | Yes | Yes |

The canonical machine-readable source is `functions/spec/featureCatalog.js`. The feature verifier is `scripts/verify-feature-catalog.js`.

## 3. Modes

### Controller
- Generate pairing code/link.
- Manage paired devices.
- Manage consent/session requests.
- Request permitted control functions.
- Observe connection/session state.
- Explicitly disconnect/unpair.

### Client
- Open/claim pairing link.
- Review permission/consent requests.
- Allow or deny permissions/features.
- Use the visible STOP control.
- Disconnect/unpair explicitly.

No mode may silently bypass Android/iOS protected-permission controls.

## 4. Platforms and app variants

### Platforms
1. Android — Kotlin + Jetpack Compose + Hilt
2. iOS — Swift + SwiftUI + Combine
3. Web — Next.js + TypeScript + Tailwind
4. Desktop — Electron for Windows/macOS/Linux
5. Backend — Node.js + Express + PostgreSQL

### Variants
1. Owner App — full-control owner surface
2. Receiver Lite — lightweight permission/receiver flow
3. Receiver Full — full receiver capability set
4. Desktop Agent — controller/client desktop surface

## 5. Roles

1. Super Admin — full system administration
2. Owner — plans, settings, private free-access approval and owner controls
3. Admin — limited administration
4. Finance Admin — payments/EMI
5. Legal Admin — legal templates
6. Moderator — user management
7. Support — support/ticket access
8. User — normal product access

Owner access is authenticated, authorized and auditable. The owner identity itself is not hard-coded or publicly exposed.

## 6. Database and API contract

The machine-readable coverage catalog is `functions/spec/masterCatalog.js`.

Required minimums:
- 42+ production application tables.
- 60+ catalogued API endpoints.
- Schema verification must require the catalogued master tables.
- API verification must exercise every catalogued endpoint and require an actual HTTP 2xx response.
- A route existing only in a catalog does not count as runtime verification.

Current catalog includes connection/pairing, permissions/consent, control, data, admin, plans/subscriptions/payments, support, SOS and system surfaces.

## 7. Authentication, consent and permission policy

Required authentication surfaces:
- Google login.
- Mobile OTP.
- Deployment-level 2FA/MFA where required.

Required permission behavior:
- Android protected permissions must use the operating-system permission dialog.
- No silent/background permission grant.
- Allow All is itself a user action; it does not bypass individual OS dialogs.
- One-by-One is a user-controlled Allow/Deny path.
- Sensitive device operations require appropriate consent and an approved session.
- Every sensitive operation must remain auditable.

The product's 19 features are **feature/control permissions**; they must not be confused with the number of Android OS runtime-permission declarations.

## 8. Required 11-step Owner + Receiver flow

1. Install Owner + Receiver.
2. Login with Google or Mobile OTP.
3. Select Controller or Client.
4. Controller generates link; Client opens/claims it.
5. Paired-device state is established.
6. Permission Center appears.
7. User manually chooses Allow All or One-by-One.
8. Allow All still presents required OS permission dialogs; One-by-One presents each user choice.
9. Approved permissions + approved session activate permitted control.
10. Background operation uses platform-compliant foreground/recovery behavior.
11. Persistent link remains until explicit disconnect/reset, subject to OS/platform limits.

Verifier: `scripts/verify-11-step-flow.js`.

## 9. Smart Auto-Link and persistent connection

Required design:
- Unique pairing credential.
- QR representation.
- URL/deep-link representation.
- Explicit share actions for WhatsApp, SMS, Email and Copy.
- Receiver link-open/app-launch surface.
- Automatic pairing-code extraction where supported.
- Automatic device linking after valid consent/authorization.
- Persistent paired-device state separate from temporary pairing-code expiry.
- Explicit unpair/disconnect.
- Network recovery without manual re-pairing.
- Boot restoration only after explicit user opt-in and subject to Android/OEM restrictions.
- Group pairing target: up to 100 clients; capacity/load testing is a separate runtime gate.

Verifier: `scripts/verify-smart-autolink-persistent.js`.

## 10. Start / Stop / background operation

Existing Start and Stop controls must be preserved.

- Visible foreground service notification is required for applicable Android background work.
- STOP remains user-accessible.
- Optional automatic service start is user-controlled.
- Automatic service start must never imply automatic permission granting.
- Recovery/watchdog behavior must not bypass user consent or OS restrictions.

Verifier: `scripts/verify-start-stop-background.js`.

## 11. Continuous 24×7 operation target

The architecture targets continuous operation subject to OS/platform restrictions.

Required design surfaces:
- Persistent connection state.
- Network recovery.
- Foreground service where required.
- Boot persistence only with explicit opt-in.
- Recovery/backoff policy.
- Approved-session and permission checks before background-sensitive activity.

Runtime evidence remains required for:
- Screen lock.
- App closed/returned.
- Battery/Doze/background restrictions.
- Force Stop behavior.
- Reboot.
- Internet OFF/ON.
- Airplane mode/P2P fallback where supported.
- Extended endurance/soak testing.

Verifier: `scripts/verify-continuous-24x7.js`.

## 12. Security and safety controls

Required controls:
- AES-256-GCM data-encryption baseline.
- Google + Mobile OTP authentication surfaces.
- 2FA/MFA policy where deployed.
- Consent/activity audit logs.
- Visible live-control indicator.
- User STOP action.
- Access notification/audit requirement.
- Data deletion capability/policy.
- GDPR + IT Act 2000 + DPDP Act 2023 readiness.
- Persistent-link state without permission bypass.
- Boot persistence only after explicit user opt-in.
- Emergency/SOS authorization remains consent/session bounded.

Emergency behavior must **not** silently grant Android protected permissions in the background. If a required permission has not already been granted, the device user must complete the platform permission flow.

Verifier: `scripts/verify-security-controls.js`.

Important implementation distinction: an AES-256-GCM helper is not by itself proof of full end-to-end encrypted transport. Full E2E requires session key exchange plus encrypted media/data transport integration and runtime verification.

## 13. Owner access and private free plan

Owner access:
- Environment-backed allowlist.
- Exact email/mobile matching.
- OWNER role assignment after authentication.
- OWNER-only management routes.
- Private audit trail.
- No owner identity hard-coded in source.

Free plan:
- Not publicly listed.
- No public self-subscribe.
- Owner manually approves access for a named user.
- Supports email/mobile and optional user ID.
- Supports preset/custom start and end dates.
- Supports all-19 or selected feature grants.
- Owner can edit/extend/reduce/revoke.
- Expiry is enforced and audited.
- Pre-expiry notification delivery remains a separate scheduler/provider runtime gate unless independently verified.

## 14. Paid plans and link validity

Each plan has independent:
- Price.
- Plan duration: Minutes / Hours / Days / Months (or lifetime policy where applicable).
- Feature set.
- Device-link validity: Minutes / Hours / Days.

Plan duration and link validity are separate policies.

Expired/revoked links must not join. Expired paid subscriptions must not generate new links. Owner controls include plan edit, enable/disable, custom plans, upgrade/downgrade, special offers, EMI, and device-link generate/regenerate/revoke.

Verifier surfaces:
- `backend/src/plan-policy.js`
- `backend/src/catalog-api.js`
- `backend/src/owner-panel.js`
- `backend/test/plan-policy.test.js`

## 15. Support

WhatsApp support uses a private deployment environment variable and the fixed support message:

`Hello, I need support for Total Control System`

The support number must never be hard-coded into public source or documentation.

Verifier: `backend/src/verify-support-whatsapp.js`.

## 16. Verification gates

Static/source verification scripts:
- `scripts/master-spec-verify.js`
- `scripts/verify-feature-catalog.js`
- `scripts/verify-11-step-flow.js`
- `scripts/verify-smart-autolink-persistent.js`
- `scripts/verify-manual-permission-choice.js`
- `scripts/verify-start-stop-background.js`
- `scripts/verify-continuous-24x7.js`
- `scripts/verify-security-controls.js`
- `backend/src/verify-schema.js`
- `backend/src/verify-api.js`
- `backend/src/verify-owner-config.js`
- `backend/src/verify-support-whatsapp.js`

The Production Readiness workflow must invoke the relevant verification stages.

## 17. Runtime / production gates — never falsely promoted

The following remain separate evidence gates and cannot be marked PASS merely because source files exist:
- Physical Android install and complete feature flow.
- Physical iPhone/iOS device test; simulator is not physical-device evidence.
- Two-device Controller/Client E2E.
- Real Google/OTP/Firebase/FCM production-like credentials.
- QR/deep-link automatic open/fill/connect click-through.
- 100-client group-pairing/load test.
- Feature-by-feature 18/19 offline and 19/19 online runtime verification.
- Network OFF/ON automatic recovery.
- App restart/reboot persistent-link recovery.
- 24×7 endurance/soak testing.
- Full transport/media E2E encryption.
- Complete cross-store data deletion verification.
- Every-feature notification delivery verification.
- Full deployment-level 2FA enforcement.
- Owner runtime authentication/authorization test with private identifiers.
- Support WhatsApp authenticated click-through.
- Blockchain wallet/RPC/contract deployment evidence.

Status vocabulary:
- **VERIFIED** — implementation plus required automated/runtime evidence exists.
- **PENDING RUNTIME/PRODUCTION EVIDENCE** — static implementation exists but required real-world evidence is not yet available.
- **BLOCKED** — a required dependency/environment/credential prevents the test.

## 18. Final verification commands

From the repository root:

`node scripts/master-spec-verify.js`

`node scripts/verify-feature-catalog.js`

`cd backend && npm run verify:schema && npm run verify:api`

Platform CI/build workflows must also complete successfully before a production-readiness claim is made.

## 19. Safety invariants

Existing Safety/Security Alert, Notification, Start, Stop, Disconnect, Permission Center, Owner Settings, privacy/deletion and other completed features must be preserved.

No implementation may:
- Hide capture from the device user.
- Hide or falsify the owner identity.
- Bypass OS permission dialogs.
- Silently grant protected permissions.
- Treat a static catalog as runtime proof.
- Declare CI PASS without an actual successful workflow result.
- Replace a working feature merely to satisfy a verifier.

