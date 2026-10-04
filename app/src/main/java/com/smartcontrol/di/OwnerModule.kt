package com.smartcontrol.di

import com.smartcontrol.data.owner.FirestoreOwnerSettingsRepository
import com.smartcontrol.domain.owner.OwnerSettingsRepository
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
abstract class OwnerModule {
    @Binds
    @Singleton
    abstract fun bindOwnerSettingsRepository(impl: FirestoreOwnerSettingsRepository): OwnerSettingsRepository
}
