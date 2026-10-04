plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
    id("org.jetbrains.kotlin.kapt")
    id("com.google.dagger.hilt.android")
}
if (file("google-services.json").exists()) apply(plugin="com.google.gms.google-services")
val googleWebClientId = providers.gradleProperty("SMARTCONTROL_GOOGLE_WEB_CLIENT_ID").orElse("").get()
val turnUrls = providers.gradleProperty("SMARTCONTROL_TURN_URLS").orElse("").get()
val turnUsername = providers.gradleProperty("SMARTCONTROL_TURN_USERNAME").orElse("").get()
val turnCredential = providers.gradleProperty("SMARTCONTROL_TURN_CREDENTIAL").orElse("").get()

android {
    namespace="com.smartcontrol"
    compileSdk=36
    defaultConfig {
        applicationId="com.smartcontrol"
        minSdk=26
        targetSdk=36
        versionCode=3
        versionName="0.3.0"
        testInstrumentationRunner="androidx.test.runner.AndroidJUnitRunner"
        buildConfigField("String","GOOGLE_WEB_CLIENT_ID","\"$googleWebClientId\"")
        buildConfigField("String","TURN_URLS","\"$turnUrls\"")
        buildConfigField("String","TURN_USERNAME","\"$turnUsername\"")
        buildConfigField("String","TURN_CREDENTIAL","\"$turnCredential\"")
    }
    buildFeatures { compose=true; buildConfig=true }
    compileOptions { sourceCompatibility=JavaVersion.VERSION_17; targetCompatibility=JavaVersion.VERSION_17 }
    kotlinOptions { jvmTarget="17" }
}
dependencies {
    implementation(platform("androidx.compose:compose-bom:2024.12.01"))
    implementation("androidx.activity:activity-compose:1.10.0")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.material3:material3")
    debugImplementation("androidx.compose.ui:ui-tooling")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.8.7")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.7")
    implementation("androidx.lifecycle:lifecycle-viewmodel-ktx:2.8.7")
    implementation("com.google.dagger:hilt-android:2.52")
    implementation("androidx.hilt:hilt-navigation-compose:1.2.0")
    kapt("com.google.dagger:hilt-compiler:2.52")
    implementation(platform("com.google.firebase:firebase-bom:33.7.0"))
    implementation("com.google.firebase:firebase-auth")
    implementation("com.google.firebase:firebase-firestore")
    implementation("com.google.firebase:firebase-functions")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-play-services:1.9.0")
    implementation("com.google.android.gms:play-services-auth:21.3.0")
    implementation("com.google.android.gms:play-services-location:21.3.0")
    implementation("com.google.firebase:firebase-storage")
    implementation("io.github.webrtc-sdk:android:150.7871.01")
    testImplementation("junit:junit:4.13.2")
}
