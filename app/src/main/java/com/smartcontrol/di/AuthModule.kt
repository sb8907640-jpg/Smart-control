package com.smartcontrol.di

import com.smartcontrol.data.auth.FirebaseAuthRepository
import com.smartcontrol.domain.auth.AuthRepository
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
abstract class AuthModule {
    @Binds @Singleton abstract fun bindAuthRepository(impl: FirebaseAuthRepository): AuthRepository
}
