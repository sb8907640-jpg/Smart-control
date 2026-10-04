package com.smartcontrol.di

import com.smartcontrol.data.pairing.FirestorePairingRepository
import com.smartcontrol.domain.pairing.PairingRepository
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
abstract class PairingModule {
    @Binds
    @Singleton
    abstract fun bindPairingRepository(impl: FirestorePairingRepository): PairingRepository
}
