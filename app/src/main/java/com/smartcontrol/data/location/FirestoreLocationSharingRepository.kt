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
            .set(mapOf("sharingActive" to false, "stoppedAtEpochMs" to System.currentTimeMillis()), com.google.firebase.firestore.SetOptions.merge())
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
                val active = data?.get("sharingActive") as? Boolean ?: false
                val latitude = (data?.get("latitude") as? Number)?.toDouble()
                val longitude = (data?.get("longitude") as? Number)?.toDouble()
                if (snapshot?.exists() == true && active && latitude != null && longitude != null &&
                    latitude in -90.0..90.0 && longitude in -180.0..180.0
                ) {
                    trySend(
                        SharedLocation(
                            deviceId = deviceId,
                            latitude = latitude,
                            longitude = longitude,
                            accuracyMeters = (data?.get("accuracyMeters") as? Number)?.toFloat(),
                            capturedAtEpochMs = (data?.get("capturedAtEpochMs") as? Number)?.toLong() ?: 0L
                        )
                    )
                } else {
                    trySend(null)
                }
            }
        awaitClose { registration.remove() }
    }
}
