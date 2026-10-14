package com.smartcontrol.data.location

import com.google.firebase.firestore.FirebaseFirestore
import com.smartcontrol.domain.location.LocationSharingRepository
import com.smartcontrol.domain.location.SharedLocation
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.tasks.await

@Singleton
class FirestoreLocationSharingRepository @Inject constructor(
    private val firestore: FirebaseFirestore
) : LocationSharingRepository {
    override suspend fun publish(location: SharedLocation) {
        firestore.collection("devices").document(location.deviceId)
            .collection("sharedLocation").document("current")
            .set(
                mapOf(
                    "deviceId" to location.deviceId,
                    "latitude" to location.latitude,
                    "longitude" to location.longitude,
                    "accuracyMeters" to location.accuracyMeters,
                    "capturedAtEpochMs" to location.capturedAtEpochMs,
                    "sharingActive" to true
                )
            ).await()
    }

    override suspend fun stopSharing(deviceId: String) {
        firestore.collection("devices").document(deviceId)
            .collection("sharedLocation").document("current")
            .set(mapOf("sharingActive" to false, "stoppedAtEpochMs" to System.currentTimeMillis()))
            .await()
    }

    override fun observe(deviceId: String): Flow<SharedLocation?> = callbackFlow {
        val registration = firestore.collection("devices").document(deviceId)
            .collection("sharedLocation").document("current")
            .addSnapshotListener { snapshot, error ->
                if (error != null) {
                    close(error)
                    return@addSnapshotListener
                }
                val data = snapshot?.data
                val location = if (snapshot?.exists() == true && data?.get("sharingActive") == true) {
                    val latitude = (data["latitude"] as? Number)?.toDouble()
                    val longitude = (data["longitude"] as? Number)?.toDouble()
                    if (latitude != null && longitude != null) {
                        SharedLocation(
                            deviceId = deviceId,
                            latitude = latitude,
                            longitude = longitude,
                            accuracyMeters = (data["accuracyMeters"] as? Number)?.toFloat(),
                            capturedAtEpochMs = (data["capturedAtEpochMs"] as? Number)?.toLong() ?: 0L
                        )
                    } else null
                } else null
                trySend(location)
            }
        awaitClose { registration.remove() }
    }
}
