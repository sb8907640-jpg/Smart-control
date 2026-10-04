package com.smartcontrol.di
import com.google.firebase.auth.FirebaseAuth
import com.smartcontrol.data.auth.FirebaseAuthRepository
import com.smartcontrol.domain.auth.AuthRepository
import dagger.*
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton
@Module @InstallIn(SingletonComponent::class)
abstract class AuthBindings{@Binds @Singleton abstract fun bindAuthRepository(impl:FirebaseAuthRepository):AuthRepository}
@Module @InstallIn(SingletonComponent::class)
object AppModule{@Provides @Singleton fun provideFirebaseAuth():FirebaseAuth=FirebaseAuth.getInstance()}
