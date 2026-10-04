# Configuration
Copy the Firebase example to app/google-services.json on a trusted machine; the real file is gitignored.
For CI, store its JSON in GitHub Actions secret FIREBASE_GOOGLE_SERVICES_JSON.
Keep release keystores, passwords, GitHub tokens and private keys out of source control.
