# Owner access configuration

Owner identities are intentionally **not stored in the public repository**.

The backend assigns the privileged `OWNER` role only after Firebase authentication has verified the caller's identity and the identity matches the server-side allowlists:

- `OWNER_EMAILS`
- `OWNER_MOBILE_NUMBERS`

Values are comma-separated. Emails are normalized case-insensitively. Mobile numbers are normalized to digits/E.164-style values.

Example deployment configuration (use the real values only in a private secret manager or deployment environment):

```
OWNER_EMAILS=owner-one@example.com,owner-two@example.com
OWNER_MOBILE_NUMBERS=+911234567890,+919876543210
```

Do **not** put real owner email addresses or mobile numbers in source code, README files, public issues, CI logs, or client bundles.

The resulting authenticated request has `role=OWNER`, `owner=true`, and `admin=true`, so existing privileged routes can use the same authorization gate. Authentication remains required; this does not create a hidden or bypass account.


## OWNER control panel

The web OWNER panel is intentionally **unlisted** from the normal public navigation at `/owner`; it is not a security boundary. Access is enforced server-side and requires an authenticated Firebase session whose verified email/phone matches the private OWNER allowlist.

The OWNER panel exposes authenticated management surfaces for:

- Users: view/edit/delete/ban
- Features and feature flags: enable/disable/configure
- Plans: create/edit/delete
- Global settings
- Full audit trail
- Free access grants and custom durations
- Payments and EMI records
- Legal/compliance templates
- Support tickets
- System health

Owner name, email, mobile and owner identity details are never returned by the OWNER panel API. Owner actions are recorded in the private audit trail for authenticated OWNER access.

The panel does **not** bypass user consent, Android/iOS OS permission dialogs, or approved remote-control sessions. Existing safety and consent gates remain authoritative.


## WhatsApp support

The support WhatsApp destination is intentionally **not stored in public source code or public documentation**. Configure it only in the private deployment environment:

`SUPPORT_WHATSAPP_NUMBER`

The authenticated support button calls `POST /api/support/whatsapp/initiate`. The backend creates the support session/audit record and returns a WhatsApp deep link containing the configured private destination plus the pre-filled message:

`Hello, I need support for Total Control System`

The web UI renders only **💬 WhatsApp Support** and **Click → Talk to Support**; it does not render the direct number. The number is never returned as a standalone field.

Run `npm run verify:support` in the backend deployment environment to verify that the private number is configured without printing the number. Do not place the real number in source code, README files, public issues, CI logs, or client bundles.


## Owner-controlled Free Plan

The public `/api/plans` catalog excludes plans marked as free/owner-only, and direct lookup/self-subscription for such plans returns **404**. Free access is granted separately through OWNER-authorized free-access controls.

Only an authenticated server-side OWNER session can grant, edit, or revoke free access. A grant may carry a custom `endsAt` timestamp; when the OWNER free-access list is read after that timestamp, an ACTIVE grant is automatically normalized to `EXPIRED`. Editing a grant requires a future expiry timestamp when one is supplied.

The FREE plan is therefore not a public subscription option and is not intended to appear in public pricing/catalog UI.

## Paid plan duration and device-link validity

Each paid plan stores its own independent commercial and link settings. Owner edits are scoped to the selected plan document, so changing Basic does not change Standard, Premium, Pro, Business, Enterprise, or Lifetime.

Supported independent plan controls include:

- durationValue + durationUnit: MINUTES, HOURS, DAYS, or MONTHS
- linkValidityValue + linkValidityUnit: MINUTES, HOURS, or DAYS
- price, features/permissions, enabled state, and other plan metadata

Subscription activation snapshots the selected plan duration and calculates startsAt/expiresAt. Lifetime is represented by durationUnit=LIFETIME (or lifetime=true) and has no expiry. Device-link validity is separate from subscription duration; link generation calculates its own expiresAt from the selected plan's link-validity setting.

An expired or revoked pairing code is rejected by the link-join path, so it cannot create a new device connection. Owner-only device-link controls are available for generate, regenerate, and revoke, and every such action is audited.

The existing OWNER plan CRUD endpoint accepts per-plan values, allowing price, duration, features, link validity, enable/disable, and custom-plan fields to be edited independently. Plan upgrade/downgrade, special offers, and EMI metadata remain management data and do not alter another plan automatically.

## Owner manual Free Access approval

Free access is not a public plan and cannot be self-subscribed. Only an authenticated server-side OWNER can approve it.

The approval record supports:

- user name
- email or mobile
- optional user ID
- preset duration such as 1 day, 7 days, or 30 days, or CUSTOM
- explicit start and end timestamps
- all 19 permissions or a selected feature list
- approval timestamp and OWNER audit record

After approval the access record is ACTIVE. Owner can edit it to extend or reduce the end time, change the selected features, or revoke/cancel it. Expired records are normalized to EXPIRED and the user access-status endpoint also enforces expiry, so access does not remain active after the end time.

Every approval/edit/revoke action is recorded in the private owner audit trail. A notification-before-expiry workflow still requires the notification scheduler/provider runtime integration; source-level free-access expiry enforcement does not by itself constitute delivery evidence.

## Web OWNER panel operations

Open the unlisted route `/owner` on the deployed web application. The web app must be configured with `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID`, `NEXT_PUBLIC_FIREBASE_APP_ID`, and `NEXT_PUBLIC_SMARTCONTROL_API_BASE_URL`. Configure `OWNER_EMAILS` and/or `OWNER_MOBILE_NUMBERS` only in the backend deployment environment. Google sign-in and Firebase phone OTP are supported by the panel; a successful sign-in alone does not grant OWNER access.

The panel provides these sections: Overview, Users, Plans, Feature flags, All settings, Free access, Device links, Subscriptions, Payments, EMI, Legal templates, Support tickets, Audit trail, and System health. Record editors accept JSON matching the relevant API schema, so fields added to a record can be managed without a separate form for each field. Destructive actions ask for confirmation. Changes are sent to OWNER-protected API routes and recorded in the audit trail.

The All settings editor reads and writes the canonical `ownerSettings/global` document used by the Android app, rather than a separate web-only settings document. It also refreshes the client-readable global feature-policy fields and per-user feature-policy documents. Sensitive payment credential keys are redacted from the response and preserved server-side when the settings document is saved. Never use the JSON editor to paste credentials into browser-visible fields.

Generated device-link codes are displayed once in the authenticated OWNER session so they can be shared with the intended recipient. The code itself is not included in audit metadata. Treat the code as a secret. Existing consent, Android permission, and approved-session controls continue to apply.

The web panel is source-controlled but is not automatically deployed by committing code. Run the web CI type-check/build and backend tests, deploy the backend and web app through your configured hosting pipeline, then verify with an OWNER account that is present in the server-side allowlist. A successful build is not proof that production environment variables or allowlists are configured correctly.
