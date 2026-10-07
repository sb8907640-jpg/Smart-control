# Smart Control

Consent-based family safety and remote support Android application.

Foundation: Kotlin, Jetpack Compose, Clean Architecture, MVVM, Hilt, Firebase Authentication.

All sensitive device capabilities will require explicit Android consent and visible session state.

## Android APK download

The repository includes a dedicated GitHub Actions workflow for APK generation:
- Open **Actions → Android APK Download**.
- Choose **Run workflow** and select **all**, **debug**, or **release**.
- After the run succeeds, download the **smart-control-apks** artifact.
- The artifact contains the generated Owner, Lite, and Full APKs requested by the selected build type.

The existing Android CI and Production Readiness workflows are unchanged; this workflow only adds a dedicated APK build/download path.
