package com.smartcontrol.di

import com.smartcontrol.data.audit.FirestoreAuditRepository
import com.smartcontrol.data.safety.FirestoreSafetyAlertRepository
import com.smartcontrol.data.security.FirestoreParentPinRepository
import com.smartcontrol.domain.audit.AuditRepository
import com.smartcontrol.domain.safety.SafetyAlertRepository
import com.smartcontrol.domain.security.ParentPinRepository
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
abstract class SecurityModule {
    @Binds @Singleton
    abstract fun bindParentPinRepository(impl: FirestoreParentPinRepository): ParentPinRepository

    @Binds @Singleton
    abstract fun bindAuditRepository(impl: FirestoreAuditRepository): AuditRepository

    @Binds @Singleton
    abstract fun bindSafetyAlertRepository(impl: FirestoreSafetyAlertRepository): SafetyAlertRepository
}
