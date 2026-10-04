package com.smartcontrol.data.location

import com.google.firebase.firestore.FirebaseFirestore
import com.smartcontrol.domain.location.LocationSharingRepository
import com.smartcontrol.domain.location.SharedLocation
import javax.inject.Inject
import javax.inject.Singleton
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
}
