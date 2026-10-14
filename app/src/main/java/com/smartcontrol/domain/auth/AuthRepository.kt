package com.smartcontrol.domain.auth
import android.app.Activity
import android.content.Intent
import com.google.firebase.auth.FirebaseUser
import com.google.firebase.auth.PhoneAuthCredential
import kotlinx.coroutines.flow.Flow
interface AuthRepository{
 val currentUser:Flow<FirebaseUser?>
 fun googleSignInIntent(activity:Activity):Intent
 suspend fun signInWithGoogle(activity:Activity,intent:Intent):Result<FirebaseUser>
 fun sendOtp(activity:Activity,phoneNumber:String,onCodeSent:(String)->Unit,onFailure:(Exception)->Unit,onAutoVerified:(PhoneAuthCredential)->Unit)
 suspend fun verifyOtp(verificationId:String,code:String):Result<FirebaseUser>
 suspend fun signInWithPhoneCredential(credential:PhoneAuthCredential):Result<FirebaseUser>
 fun signOut()
}
