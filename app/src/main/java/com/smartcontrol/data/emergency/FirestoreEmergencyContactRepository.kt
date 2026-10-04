package com.smartcontrol.data.emergency

import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import com.smartcontrol.domain.emergency.EmergencyContact
import com.smartcontrol.domain.emergency.EmergencyContactRepository
import kotlinx.coroutines.tasks.await
import javax.inject.Inject

class FirestoreEmergencyContactRepository @Inject constructor(
    private val auth: FirebaseAuth,
    private val firestore: FirebaseFirestore
) : EmergencyContactRepository {
    override suspend fun list(ownerUid: String): List<EmergencyContact> {
        require(auth.currentUser?.uid == ownerUid) { "Authentication required." }
        return firestore.collection("users").document(ownerUid).collection("emergencyContacts")
            .get().await().documents.mapNotNull { d ->
                EmergencyContact(
                    contactId = d.id,
                    ownerUid = ownerUid,
                    name = d.getString("name") ?: return@mapNotNull null,
                    phoneNumber = d.getString("phoneNumber") ?: return@mapNotNull null,
                    enabled = d.getBoolean("enabled") ?: true
                )
            }
    }

    override suspend fun save(contact: EmergencyContact): Result<Unit> = runCatching {
        require(auth.currentUser?.uid == contact.ownerUid) { "Authentication required." }
        require(contact.name.isNotBlank() && contact.phoneNumber.isNotBlank()) { "Name and phone are required." }
        firestore.collection("users").document(contact.ownerUid)
            .collection("emergencyContacts").document(contact.contactId)
            .set(mapOf("name" to contact.name, "phoneNumber" to contact.phoneNumber, "enabled" to contact.enabled))
            .await()
    }

    override suspend fun delete(ownerUid: String, contactId: String): Result<Unit> = runCatching {
        require(auth.currentUser?.uid == ownerUid) { "Authentication required." }
        firestore.collection("users").document(ownerUid)
            .collection("emergencyContacts").document(contactId).delete().await()
    }
}
