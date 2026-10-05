# Smart Control — Master Feature Implementation Status

This document maps the supplied master specification to the current Android implementation.

## Implemented and consent-gated
1. Location sharing — Android permission + visible share/update/stop.
2. Notifications — visible notification permission + foreground service notification.
3. Battery/network — local device status.
4. Camera — approved media session only.
5. Microphone — approved media session only.
6. Gallery/files — user-selected Android Storage Access Framework.
7. Screen sharing — MediaProjection system consent + visible foreground service.
8. Screen capture transport — MediaProjection consent-gated; no hidden recording.
12. File transfer — user-selected file + receiver approval + Firebase Storage rules.
19. SOS alerts — visible trigger + acknowledgement.

## Safety/platform gated
9. Touch control — session/expiry/accessibility validation exists, but arbitrary remote input injection is intentionally not enabled.
10. Keyboard input — session/expiry/accessibility validation exists, but arbitrary remote input injection is intentionally not enabled.
11. App install/uninstall — Android system confirmation is required; no silent install/uninstall.
13. Clipboard sync — not enabled.
14. Files access — SAF only; no background directory scanning.
15. Contacts — no remote collection.
16. SMS — no remote collection.
17. Call logs — no remote collection.
18. App usage — no hidden monitoring.

## Core workflow
- Visible legal consent gate before sign-in.
- Google and mobile OTP authentication.
- Explicit pairing with temporary token.
- Visible sharing of pairing token.
- Explicit session approval/denial.
- Camera/mic/screen media transport through WebRTC.
- MediaProjection consent and visible foreground notification.
- Visible Stop Sync path.
- Privacy Controls enforce session/media/location/file-transfer switches.
- Parent PIN is server-side hashed and cannot be read through Firestore.
- Firestore/Storage rules enforce pairing/session/file-transfer boundaries.
- Consent audit log and safety alerts are available.

## Platform constraints
Android cannot legally/safely grant Android permissions by itself, silently bypass system confirmation, guarantee an unrestricted 24/7 background service, or survive a factory reset as a persistent remote-control agent. The implementation therefore follows the consent-first interpretation of the supplied specification.
