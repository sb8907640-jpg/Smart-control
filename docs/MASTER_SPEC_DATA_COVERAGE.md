# Master specification data coverage

The supplied master specification is represented by:

- `domain/spec/FeatureCatalog.kt` — canonical 19-feature list and consent kinds.
- `domain/spec/MasterSpecification.kt` — controller/client configuration contract.

## Configuration covered

- App branding: app name, short name, logo key, theme and color keys.
- Permission behavior: one-by-one vs user-tapped Allow All, explanations, live indicator, deny controls, feature order, custom permission text/icons.
- Global/per-user access: global enable switch, per-user feature overrides, plan association, per-feature duration and priority.
- Plans: Free plan, manual approval, public-menu visibility, enabled features and feature limits.
- Connection: pairing requirement, persistent pairing preference, reconnect preferences, foreground-service preference, session approval and session expiry.
- Notifications: push/email/SMS switches, active-session notification, permission-revoked alert and connection state.
- Content: support/privacy/terms/permission/stop text and configurable links.
- Security policy: authenticated controller/client, admin 2FA, sensitive-auth OTP, consent audit and application-layer encryption policy declaration.
- Support: support visibility and client-facing owner identity policy.

## Important platform boundary

These fields are policy/configuration data. They do not grant Android permissions or bypass Android system consent. In particular, Accessibility, MediaProjection, Notification Access, Usage Access, runtime permissions and user-approved sessions remain OS/user controlled.

Persistent pairing is represented as a reconnect preference; it is not a promise to survive factory reset or override user revocation/force-stop/OS restrictions.

The master specification's hidden/covert access, silent permission bypass, unrestricted background control and unrestricted arbitrary remote input behavior remain intentionally excluded.

## Verification

`MasterSpecificationTest` verifies that the canonical contract contains exactly the same 19 feature IDs, in the same order, and that the safe defaults keep individual consent, visible indication, session approval and manually approved Free access enabled.
