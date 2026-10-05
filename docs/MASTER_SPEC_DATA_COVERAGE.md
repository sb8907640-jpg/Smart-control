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
- Owner control plane: owner-only policy, hidden owner panel flag, Firebase admin-claim authorization policy, real-time apply/change-log/rollback flags, and editable values covering all 15 core Owner Settings sections plus the master file's advanced plan/payment/EMI/invoice/refund/coupon/tax/notification controls.

## Important platform boundary

These fields are policy/configuration data. They do not grant Android permissions or bypass Android system consent. In particular, Accessibility, MediaProjection, Notification Access, Usage Access, runtime permissions and user-approved sessions remain OS/user controlled.

Persistent pairing is represented as a reconnect preference; it is not a promise to survive factory reset or override user revocation/force-stop/OS restrictions.

The master specification's hidden/covert access, silent permission bypass, unrestricted background control and unrestricted arbitrary remote input behavior remain intentionally excluded.

## Verification

`MasterSpecificationTest` and `OwnerSettingsModelsTest` verify that the canonical contract contains exactly the same 19 feature IDs, in the same order, and that the safe defaults keep individual consent, visible indication, session approval and manually approved Free access enabled.

## Owner identity, plans and timed free access

The master file also requires an owner-managed control plane beyond generic settings. The repository now models and persists these capabilities behind the Firebase admin claim:

- Owner profile details are editable in the owner-only panel (display name, owner email list, owner mobile list, hidden support contact, hidden login route).
- Plans are stored as live Firestore records and support create/edit/delete, enable/disable, price, duration, feature allow-list, device/user limits, storage/bandwidth limits, discounts/tax fields, renewal/grace/reminder metadata, display order, tier level, upgrade/downgrade paths, and cross-grade policy.
- Free access grants are stored per user and include user identity fields, plan ID, start/expiry timestamps, selected feature IDs, device limit, revoke state, and auto-expiry.
- Owners can approve, extend, reduce, and revoke free access. Active entitlement is determined from the current time and revoke/expiry timestamps.
- Plan/free-grant feature entitlement is centralized in PlanPermissionGate.
- Firestore rules restrict owner profile, plan writes, and free-grant writes to authenticated Firebase admin accounts; a user may read only their own free-access grant.
- Advanced payment configuration is owner-editable as protected configuration data; secret/API-key fields must be provisioned through an appropriate secret-management/backend deployment path before production payment processing is enabled.
- Actual confidential owner identifiers from the master document are not hard-coded into the public APK/repository. Production owner authorization remains a server-side Firebase Auth/custom-claim responsibility.

This is intentionally separate from Android OS permission consent: a plan or free grant can permit a feature, but it cannot silently grant camera, microphone, screen capture, accessibility, notification access, or other OS-controlled permissions.
