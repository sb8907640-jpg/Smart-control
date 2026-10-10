# family Suraksha

Consent-based family safety and remote support Android application.

Foundation: Kotlin, Jetpack Compose, Clean Architecture, MVVM, Hilt, Firebase Authentication.

All sensitive device capabilities will require explicit Android consent and visible session state.

## Android APK download

The repository includes a dedicated GitHub Actions workflow for APK generation:
- Open **Actions → Android APK Download**.
- Choose **Run workflow** and select **all**, **debug**, or **release**.
- After the run succeeds, download the **family-Suraksha-apks** artifact.
- The artifact contains the generated Owner, Lite, and Full APKs requested by the selected build type.

The existing Android CI and Production Readiness workflows are unchanged; this workflow only adds a dedicated APK build/download path.


## Permanent Gateway Permit (Owner-only)

The Owner panel includes **Permanent Gateway Permit**. The current working provider adapter is Razorpay; the display name is editable, but a new provider needs its own server adapter and verification tests before it can be activated.

### One-time secure server setup

1. Generate a 32-byte encryption key on a trusted machine, for example with `openssl rand -base64 32`.
2. Store it in Firebase Secret Manager (do not commit it or paste it into chat):
   ```sh
   firebase functions:secrets:set SMARTCONTROL_GATEWAY_ENCRYPTION_KEY
   ```
   Paste the generated value only into the secure terminal prompt.
3. Deploy the Functions:
   ```sh
   firebase deploy --only functions
   ```
4. Sign in to the app using the configured Owner account. Open **Owner / Admin Control Panel → Permanent Gateway Permit**, enter the Razorpay display name, Test/Live mode, Key ID, Key Secret and Webhook Secret, then save. The server encrypts the credentials with AES-256-GCM and never returns the secret values to the app.
5. In the Razorpay dashboard, configure a webhook to the deployed `razorpayWebhook` function URL and enable `payment.captured`, `payment.failed`, and `payment.refunded`. Use the same webhook secret in the Owner panel.

The Android checkout sends only the public Key ID and order details to Razorpay. The backend validates the checkout signature and then fetches the payment from Razorpay to verify order, amount, currency and captured status before activating a subscription. Credential revisions are retained so a pending order can still be verified after the Owner changes gateway credentials.

**Important:** changing the display name is not a provider integration. Only Razorpay is currently implemented end-to-end. Do not put live secrets in Android build files, the APK, GitHub, logs, or chat. A live transaction still needs to be tested after deployment with your Razorpay account.
