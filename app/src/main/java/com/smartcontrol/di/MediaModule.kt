package com.smartcontrol.di

import android.content.Context
import com.smartcontrol.data.media.FirestoreMediaSignalingRepository
import com.smartcontrol.data.media.WebRtcMediaEngine
import com.smartcontrol.domain.media.MediaSignalingRepository
import dagger.Binds
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob

@Module
@InstallIn(SingletonComponent::class)
abstract class MediaModule {
    @Binds
    @Singleton
    abstract fun bindMediaSignalingRepository(impl: FirestoreMediaSignalingRepository): MediaSignalingRepository

    companion object {
        @Provides
        @Singleton
        fun provideMediaEngine(
            @ApplicationContext context: Context,
            signaling: MediaSignalingRepository
        ): WebRtcMediaEngine = WebRtcMediaEngine(
            context, signaling, CoroutineScope(SupervisorJob() + Dispatchers.Default)
        )
    }
}
