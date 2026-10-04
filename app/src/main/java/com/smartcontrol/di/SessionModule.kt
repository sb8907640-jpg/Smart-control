package com.smartcontrol.di
import com.smartcontrol.data.session.InMemorySessionRepository
import com.smartcontrol.domain.session.SessionRepository
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton
@Module @InstallIn(SingletonComponent::class) abstract class SessionModule { @Binds @Singleton abstract fun bindSessionRepository(impl:InMemorySessionRepository):SessionRepository }