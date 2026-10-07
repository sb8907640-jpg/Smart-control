# Security, Consent and Safety Controls

- AES-256-GCM is available for server-side sensitive values through the private DATA_ENCRYPTION_KEY deployment secret.
- Google sign-in and Mobile OTP remain supported; deployment policy can require 2FA/MFA.
- Consent and activity logs are mandatory security controls.
- A persistent, user-visible foreground indicator remains active while the family-safety service runs.
- The user can stop the active service/session.
- Access/status notifications remain enabled.
- User data deletion is a required control.
- Compliance targets: GDPR, IT Act 2000 and DPDP Act 2023.
- Pairing/recovery remains persistent.

## SOS / Emergency

SOS is an emergency authorization path, not a permission bypass. An emergency request can activate capabilities that were already granted in an approved session. Android protected permissions that were not granted still require the device user and Android's permission system.

## Watchdog / Boot persistence

Automatic restart and boot persistence are allowed only after explicit user opt-in. Android/OEM Force Stop, Doze, battery optimization and background restrictions remain OS-controlled. No watchdog can silently grant permissions or defeat those restrictions.

Owner and support configuration remain private server-side configuration and are never hard-coded into the repository.
