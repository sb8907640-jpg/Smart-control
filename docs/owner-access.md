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
