# Smart Control — Total Control System Master Specification

This document is the verification target for the repository. A metric is **verified** only when repository code/tests provide evidence; catalog entries alone are not sufficient.

| Target | Requirement |
|---|---:|
| Control permissions | 19 |
| Modes | 2 — Controller + Client |
| Platforms | 5 — Android / iOS / Web / Desktop / Backend |
| App variants | 4 — Owner / Lite / Full / Desktop |
| User roles | 8 |
| Database tables | 42+ |
| API endpoints | 60+ |
| Offline support | 18/19 |
| Online support | 19/19 |
| Continuous operation | Designed for 24×7 operation, subject to OS/platform restrictions |
| Auto-reconnect | Automatic recovery on network restoration |
| Persistent link | Until explicit disconnect/reset, subject to OS/platform restrictions |
| Auto-Allow | Manual user tap required |
| Manual Allow | One-by-one user choice supported |
| Dual permission system | Controller + Client |
| Owner access | Authenticated, authorized, auditable privileged access |
| Free-plan control | Owner approval is explicit and auditable |

## Verification rules

1. The PostgreSQL verifier must require every master table and at least 42 public application tables.
2. The API verifier must exercise every catalogued endpoint and require a real HTTP 2xx response.
3. Android verification must build Owner, Lite and Full variants; Desktop is the fourth app variant.
4. All five platform implementation surfaces and their CI workflows must exist.
5. Sensitive device capabilities must remain consent-gated, session-gated and auditable.
6. Android permission flows must not bypass OS permission dialogs or silently grant permissions.
7. Continuous/background operation is a design target, not a claim that an OS can be bypassed.
8. Physical-device tests, production credentials, real network recovery, and deployed blockchain evidence remain separate runtime/production gates and must not be marked verified by static source checks.
9. The repository's existing safety policy remains authoritative: no hidden capture, hidden owner identity, or permission bypass.

## Current verification status

Run:

`node scripts/master-spec-verify.js`

Then run the backend schema/API verification and the platform-specific CI workflows. The final status must distinguish **VERIFIED**, **PENDING RUNTIME/PRODUCTION EVIDENCE**, and **BLOCKED**.

## 11-step Owner + Receiver flow verification

The repository now has an explicit structural verifier:

`node scripts/verify-11-step-flow.js`

It checks the required flow in order:

1. App Install — Owner + Receiver Android build/manifest surfaces.
2. Login — Google + Mobile OTP interfaces.
3. Mode Select — Controller + Client pairing surfaces.
4. Link Generate/Open — pairing code creation/claim and expiry model.
5. Auto Device Link — paired-device state surfaces.
6. Permission Screen — Permission Center and Android runtime permission declarations.
7. Manual choice — user-controlled permission path; no permission bypass.
8. Permission execution — 19-feature catalog plus separate Allow-All and One-by-One runtime gates.
9. Full Control — approved/active session gating.
10. Background operation — persistent-link recovery policy.
11. Persistent Link — retained link state and network recovery policy.

The verifier intentionally reports physical-device/provider checks as **PENDING RUNTIME** rather than claiming they are proven by source inspection. In particular, real two-device installation, Google/OTP sign-in, Controller/Client UI selection, automatic connection, all 19 OS permission dialogs, manual Allow/Deny choices, background operation, network interruption, app restart, and reset/disconnect behavior require runtime evidence.

The Production Readiness workflow executes this verifier on every applicable run.

## Smart Auto-Link + Persistent Connection verification

The repository also has a dedicated verifier:

`node scripts/verify-smart-autolink-persistent.js`

It verifies the requested Controller -> Receiver flow without treating source inspection as proof of physical behavior:

1. Controller generates a unique pairing credential.
2. QR representation and URL/deep-link surfaces are required.
3. Sharing surface is required, including explicit WhatsApp/SMS/Email/Copy actions.
4. Receiver link-open/app-launch and automatic pairing-code extraction are required.
5. Automatic device linking is checked against the persisted pairing repository/state.
6. Persistent link state is checked separately from the temporary pairing-code expiry.
7. Explicit user disconnect/unpair is required to terminate a link.
8. Automatic network recovery is checked against the persistent recovery policy.
9. Android boot persistence requires an explicit `BOOT_COMPLETED` receiver and persisted-link restoration surface.
10. Group pairing requires an explicit 100-client capacity declaration; 100-client runtime load remains a separate test.
11. Google and Mobile OTP login interfaces are checked.
12. Physical two-device, provider, network interruption/recovery, reboot and 100-client tests remain **PENDING RUNTIME** until real evidence exists.

The verifier is executed by the Production Readiness workflow. Missing static implementation surfaces fail the verifier; physical/runtime behavior is never promoted to PASS from source inspection alone.

