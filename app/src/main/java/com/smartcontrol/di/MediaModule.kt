package com.smartcontrol.di

import com.smartcontrol.data.media.FirestoreMediaSignalingRepository
import com.smartcontrol.domain.media.MediaSignalingRepository
import dagger.Binds
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
abstract class MediaModule {
    @Binds
    @Singleton
    abstract fun bindMediaSignalingRepository(
        impl: FirestoreMediaSignalingRepository
    ): MediaSignalingRepository
}
