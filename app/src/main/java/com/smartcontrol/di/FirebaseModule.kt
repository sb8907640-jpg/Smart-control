package com.smartcontrol.di

import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.functions.FirebaseFunctions
import com.google.firebase.storage.FirebaseStorage
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object FirebaseModule {
    @Provides @Singleton fun firestore(): FirebaseFirestore = FirebaseFirestore.getInstance()
    @Provides @Singleton fun functions(): FirebaseFunctions = FirebaseFunctions.getInstance()
    @Provides @Singleton fun storage(): FirebaseStorage = FirebaseStorage.getInstance()
}
