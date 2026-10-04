package com.smartcontrol.data.auth
import android.app.Activity
import android.content.Intent
import com.google.android.gms.auth.api.signin.GoogleSignIn
import com.google.android.gms.auth.api.signin.GoogleSignInOptions
import com.google.firebase.auth.*
import com.smartcontrol.domain.auth.AuthRepository
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.tasks.await
import java.util.concurrent.TimeUnit
import javax.inject.Inject
import javax.inject.Singleton
@Singleton
class FirebaseAuthRepository @Inject constructor(private val auth:FirebaseAuth):AuthRepository{
 override val currentUser:Flow<FirebaseUser?>=callbackFlow{
  val l=FirebaseAuth.AuthStateListener{trySend(it.currentUser)}
  auth.addAuthStateListener(l);awaitClose{auth.removeAuthStateListener(l)}
 }
 override fun googleSignInIntent(activity:Activity):Intent=
  GoogleSignIn.getClient(activity,GoogleSignInOptions.Builder(GoogleSignInOptions.DEFAULT_SIGN_IN)
   .requestIdToken(activity.getString(com.smartcontrol.R.string.default_web_client_id)).requestEmail().build()).signInIntent
 override suspend fun signInWithGoogle(activity:Activity,intent:Intent):Result<FirebaseUser>=runCatching{
  val a=GoogleSignIn.getSignedInAccountFromIntent(intent).await()
  val c=GoogleAuthProvider.getCredential(a.idToken,null)
  auth.signInWithCredential(c).await().user?:error("Firebase returned no user.")
 }
 override fun sendOtp(activity:Activity,phoneNumber:String,onCodeSent:(String)->Unit,onFailure:(Exception)->Unit){
  val cb=object:PhoneAuthProvider.OnVerificationStateChangedCallbacks(){
   override fun onVerificationCompleted(c:PhoneAuthCredential)=Unit
   override fun onVerificationFailed(e:FirebaseException)=onFailure(e)
   override fun onCodeSent(id:String,t:PhoneAuthProvider.ForceResendingToken)=onCodeSent(id)
  }
  PhoneAuthProvider.getInstance().verifyPhoneNumber(PhoneAuthProvider.Options.newBuilder(auth)
   .setPhoneNumber(phoneNumber).setTimeout(60L,TimeUnit.SECONDS).setActivity(activity).setCallbacks(cb).build())
 }
 override suspend fun verifyOtp(verificationId:String,code:String):Result<FirebaseUser>=runCatching{
  auth.signInWithCredential(PhoneAuthProvider.getCredential(verificationId,code)).await().user?:error("Firebase returned no user.")
 }
 override fun signOut()=auth.signOut()
}
