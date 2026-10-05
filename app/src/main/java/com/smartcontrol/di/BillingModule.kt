package com.smartcontrol.di

import com.smartcontrol.data.billing.FirebaseBillingRepository
import com.smartcontrol.domain.billing.BillingRepository
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
abstract class BillingModule {
    @Binds
    @Singleton
    abstract fun bindBillingRepository(impl: FirebaseBillingRepository): BillingRepository
}
