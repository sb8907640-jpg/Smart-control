package com.smartcontrol.data.auth

import android.app.Activity
import android.content.Intent
import com.google.android.gms.auth.api.signin.GoogleSignIn
import com.google.android.gms.auth.api.signin.GoogleSignInOptions
import com.google.firebase.FirebaseException
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.FirebaseUser
import com.google.firebase.auth.GoogleAuthProvider
import com.google.firebase.auth.PhoneAuthCredential
import com.google.firebase.auth.PhoneAuthOptions
import com.google.firebase.auth.PhoneAuthProvider
import com.smartcontrol.BuildConfig
import com.smartcontrol.domain.auth.AuthRepository
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.tasks.await
import java.util.concurrent.TimeUnit
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class FirebaseAuthRepository @Inject constructor(private val auth: FirebaseAuth) : AuthRepository {
    override val currentUser: Flow<FirebaseUser?> = callbackFlow {
        val listener = FirebaseAuth.AuthStateListener { trySend(it.currentUser) }
        auth.addAuthStateListener(listener)
        awaitClose { auth.removeAuthStateListener(listener) }
    }
    override fun googleSignInIntent(activity: Activity): Intent {
        check(BuildConfig.GOOGLE_WEB_CLIENT_ID.isNotBlank()) { "SMARTCONTROL_GOOGLE_WEB_CLIENT_ID is not configured." }
        return GoogleSignIn.getClient(activity, GoogleSignInOptions.Builder(GoogleSignInOptions.DEFAULT_SIGN_IN)
            .requestIdToken(BuildConfig.GOOGLE_WEB_CLIENT_ID).requestEmail().build()).signInIntent
    }
    override suspend fun signInWithGoogle(activity: Activity, intent: Intent): Result<FirebaseUser> = runCatching {
        val account = GoogleSignIn.getSignedInAccountFromIntent(intent).await()
        auth.signInWithCredential(GoogleAuthProvider.getCredential(account.idToken, null)).await().user
            ?: error("Firebase returned no user.")
    }
    override fun sendOtp(activity: Activity, phoneNumber: String, onCodeSent: (String) -> Unit, onFailure: (Exception) -> Unit) {
        val callbacks = object : PhoneAuthProvider.OnVerificationStateChangedCallbacks() {
            override fun onVerificationCompleted(credential: PhoneAuthCredential) = Unit
            override fun onVerificationFailed(e: FirebaseException) = onFailure(e)
            override fun onCodeSent(id: String, token: PhoneAuthProvider.ForceResendingToken) = onCodeSent(id)
        }
        PhoneAuthProvider.verifyPhoneNumber(PhoneAuthOptions.newBuilder(auth)
            .setPhoneNumber(phoneNumber).setTimeout(60L, TimeUnit.SECONDS).setActivity(activity).setCallbacks(callbacks).build())
    }
    override suspend fun verifyOtp(verificationId: String, code: String): Result<FirebaseUser> = runCatching {
        auth.signInWithCredential(PhoneAuthProvider.getCredential(verificationId, code)).await().user
            ?: error("Firebase returned no user.")
    }
    override fun signOut() = auth.signOut()
}
