# FAMILY SURAKSHA — COMPLETE BLUEPRINT (Updated)

## Purpose
Build a consent-based Android device-linking app with secure pairing, resilient low-bandwidth synchronization, and transparent connection status.

## Important network guarantees
- Support devices connected through 2G/3G/4G/5G, Wi-Fi, and mobile hotspots when the underlying network provides a route to the service.
- Do not claim 100% real-time operation on a slow, unavailable, captive-portal, or disconnected network. Queue permitted work locally and synchronize when connectivity returns.
- Pairing links may be configured not to expire, but long-lived links must be high-entropy, revocable, rate-limited, and single-use where appropriate. Never treat possession of a public code alone as sufficient authorization.
- Background work and screen-off behavior depend on Android version, user-granted permissions, battery settings, and OS restrictions. Use WorkManager for deferrable synchronization and a foreground service only for user-visible ongoing work that qualifies under Android policy.

## Screen flow

### Screen 1: Home / Dashboard
- App logo and welcome text with user name.
- Linked-device count and list.
- Generate Link button.
- Honest network state: Online, Limited, Offline, or Sync pending; low signal alone does not guarantee connectivity.
- Bottom navigation.

### Screen 2: Generate Link
- Back button.
- Cryptographically random pairing code and deep link, for example `https://familysuraksha.app/link/{CODE}`.
- Copy Link and Share Link actions.
- Show link policy and revocation controls. If the product requires links that never expire, clearly warn users and provide immediate revocation; prefer an expiring invitation plus a persistent device relationship after successful pairing.
- Show supported network types without promising uninterrupted service.

### Screen 3: Link Received
- Handle the verified Android App Link from WhatsApp, SMS, or another app.
- Validate the code with the backend; do not link a device merely because a URL was opened.

### Screen 4: Installation
- Open the official Play Store listing or a verified installation source.
- Resume the pending link after installation through a verified App Link or a secure, user-confirmed code-recovery flow. Do not promise installation will complete at a particular speed.

### Screen 5: Auto Code Fill / Link Device
- Pre-fill the code from the verified deep link when available.
- Require the user to review and confirm pairing on both devices as appropriate.
- Show progress, retry, and offline states. Avoid claiming 100% success on low network.

### Screen 6: Permissions
- Explain each permission in context and request only permissions required for an explicitly described feature.
- No blanket “allow all” bypass: Android permissions must be granted through the OS's individual runtime/system flows. Provide a checklist and allow users to decline optional permissions.

### Screen 7: Success
- Show the linked device name, active/revoked status, last successful sync, and pairing date.
- Explain that future connectivity depends on network availability and OS settings.
- Go to Home button and an unlink/revoke option.

## Resilient network implementation
1. Adaptive sync: small payloads, pagination, idempotency keys, bounded retries, and exponential backoff with jitter.
2. Compression: enable GZIP or protocol-level compression where payload size and CPU trade-offs justify it.
3. Offline queue: persist only necessary, encrypted, user-authorized operations; define retention and conflict-resolution rules.
4. Background execution: WorkManager for deferrable jobs; foreground service only for eligible ongoing, user-visible tasks and with required notification.
5. Connectivity changes: observe validated network connectivity and retry safely after restoration. Do not assume the app can force Wi-Fi/mobile switching; Android and the user control routing.
6. Low-data mode: cap payload sizes, avoid polling loops, batch updates, and expose a manual sync option.
7. Security: TLS, Firebase Authentication or equivalent identity, backend authorization, rate limiting, audit events, secure token storage, and no credentials or payment secrets in the app.
8. Pairing safety: high-entropy one-time challenge, short pairing window where feasible, explicit consent on both devices, abuse throttling, and revocation. Persistent linked-device records do not require a permanently valid invitation URL.
9. Device management: owner-only gateway configuration changes enforced by server-side authorization, not only by hiding UI controls.
10. Payment verification (if applicable): verify provider signatures and payment state on the server; never trust client-reported success.

## Compatibility and validation
- Test supported Android API levels, representative low-memory devices, 2G/3G/4G/5G, Wi-Fi, hotspots, intermittent connectivity, airplane mode, captive portals, battery saver, Doze, app process death, force-stop, reboot, and permission denial.
- Test retries, duplicate requests, revoked links, expired/replayed challenges, account switching, unauthorized owner actions, and offline queue recovery.
- Report measured results by device/API/network scenario. Do not label any scenario “100% working” until reproducible test evidence supports the specific claim.
- Keep dependencies updated and run automated unit, integration, security-rule, and Android build checks.

## Acceptance criteria
- Pairing is authenticated, consent-based, rate-limited, and revocable.
- The dashboard accurately distinguishes online, limited, offline, and pending-sync states.
- Work queued offline synchronizes safely when a usable connection returns.
- Retry behavior is bounded and does not create duplicate actions.
- Permissions are minimal, explained, and requested through Android's supported mechanisms.
- Owner-only actions and payment verification are enforced by trusted server-side code.
- No UI or documentation promises guaranteed operation without connectivity or against Android background restrictions.