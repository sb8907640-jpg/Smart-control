package com.smartcontrol.data.security
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import com.smartcontrol.domain.security.ParentPinRepository
import java.security.MessageDigest
import java.security.SecureRandom
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.tasks.await
@Singleton class FirestoreParentPinRepository @Inject constructor(private val auth:FirebaseAuth,private val firestore:FirebaseFirestore):ParentPinRepository{
 override suspend fun verifyPin(pin:String):Boolean{if(pin.length!=4||!pin.all(Char::isDigit))return false;val uid=auth.currentUser?.uid?:return false;val d=firestore.collection("parentSecurity").document(uid).get().await();val salt=d.getString("salt")?:return false;val hash=d.getString("pinHash")?:return false;return hashPin(pin,salt)==hash}
 override suspend fun changePin(newPin:String):Result<Unit>=runCatching{require(newPin.length==4&&newPin.all(Char::isDigit)){"PIN must be 4 digits."};val uid=auth.currentUser?.uid?:error("Not signed in.");val bytes=ByteArray(16).also{SecureRandom().nextBytes(it)};val salt=bytes.joinToString(""){"%02x".format(it)};firestore.collection("parentSecurity").document(uid).set(mapOf("salt" to salt,"pinHash" to hashPin(newPin,salt),"updatedAt" to System.currentTimeMillis())).await()}
 private fun hashPin(pin:String,salt:String)=MessageDigest.getInstance("SHA-256").digest("${salt}:${pin}".toByteArray()).joinToString(""){"%02x".format(it)}
}