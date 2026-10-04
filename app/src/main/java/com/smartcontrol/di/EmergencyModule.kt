package com.smartcontrol.di

import com.smartcontrol.data.emergency.FirestoreEmergencyContactRepository
import com.smartcontrol.domain.emergency.EmergencyContactRepository
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
abstract class EmergencyModule {
    @Binds
    @Singleton
    abstract fun bindEmergencyContactRepository(impl: FirestoreEmergencyContactRepository): EmergencyContactRepository
}
