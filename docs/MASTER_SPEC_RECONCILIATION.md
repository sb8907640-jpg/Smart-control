# Master Specification Reconciliation

This document records the current implementation boundary for the supplied master specification.

## Data preservation

- The canonical 19-feature list is represented by `FeatureCatalog`.
- The full master configuration is represented by `MasterControlConfig`.
- `OwnerSettings` now carries the complete master configuration without breaking existing callers.
- Firestore owner settings persist the master configuration under `masterConfig`.
- Saves use Firestore merge semantics so fields not known to this version are not deleted.
- Existing feature overrides, permission copy, notification flags, SOS and privacy/data flags remain persisted.

## Live owner configuration

Implemented:
- Firestore snapshot listener for `ownerSettings/global`.
- Admin-only read/write enforcement in Firestore rules.
- Owner UI for the 19 feature toggles.
- Owner UI for permission mode.
- Owner UI for persistent pairing/reconnect/session-approval policy.
- Master configuration is decoded with defaults for missing fields.

Not falsely claimed:
- Firebase Remote Config is not yet the authoritative owner-write channel.
- Socket.IO is not yet wired because the repository does not contain a Socket.IO server URL/protocol contract.
- FCM is not yet claimed as a complete end-to-end owner notification pipeline because Firebase project credentials/backend notification triggers are not present in the repository.

## Consent and Android platform boundary

The app continues to require:
- explicit client consent;
- Android runtime/system permission approval;
- MediaProjection approval for screen capture;
- visible active-session indication;
- an explicit Stop/Disconnect path.

Persistent pairing is a configuration/data concept and does not bypass Android permission revocation, force-stop, factory reset, or OS background-execution limits.

Remote touch/keyboard injection remains intentionally gated rather than implemented as unrestricted arbitrary input.

## Verification

- Master specification has exactly 19 unique feature IDs.
- Owner settings model has regression coverage for the complete master configuration defaults.
- Changes are committed to `main`.
- Local Gradle execution could not be run in this environment because outbound DNS/network access is unavailable.
- GitHub Actions workflow is configured to run `gradle test assembleDebug assembleRelease` on pushes to `main`; a completed run must be checked in GitHub before declaring the build verified.
