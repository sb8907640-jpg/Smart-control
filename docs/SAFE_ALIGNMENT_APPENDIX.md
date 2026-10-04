# Smart Control — Safe Alignment Appendix

This document is additive. The supplied master specification remains preserved separately; no requirement is intentionally removed.

## Implementation rules

- Keep all 19 feature requirements in the catalog.
- Sensitive capabilities require applicable Android/system permission and explicit user-approved sessions.
- Active sensitive sessions show a visible foreground/system notification and a visible Stop/Disconnect action.
- Stopping a session stops further sensitive-session delivery.
- No hidden owner backdoor, covert capture, permission bypass, silent auto-grant, or stealth persistence.
- Owner/admin access is authenticated and role-gated rather than hidden through a secret URL.
- Android OS limits are respected; 24x7 unrestricted background control is not promised.
- Reconnection is allowed only for an authorized pairing/session and valid consent state.
- Factory reset requires re-pairing; no stealth persistence across reset.
- Files are selected by the user; no silent filesystem scanning.
- Camera/microphone use runtime permission plus visible session state.
- Screen sharing/recording uses Android MediaProjection user consent.
- Location is explicitly shared and visibly indicated.
- Contacts/SMS/call logs require their applicable permissions and purpose-limited user-approved access.
- Remote touch/keyboard remains session-gated; unrestricted covert arbitrary input injection is not implemented.
- App installation/uninstallation requires visible user/system confirmation.
- SOS cannot bypass Android security or permission boundaries.
- Payment secrets, owner credentials, and TURN credentials remain server-side and are not hardcoded into the APK.
- Master tables/endpoints are treated as a contract until their backend deployment and tests are verified.

## Repository baseline

The current repository contains the consent-oriented foundation for authentication, pairing, session approval/stop, visible Family Safety foreground service, WebRTC camera/microphone, MediaProjection consent, location sharing, approved file transfer, Firebase security rules, Parent PIN protection, remote-command session gating, feature/API catalogs, and Android CI.

## Verification rule

A requirement is marked complete only after its source code, permissions/consent flow, security rules/backend where applicable, tests, and build/CI evidence are verified. The master specification itself is not treated as proof that every feature is deployed.
