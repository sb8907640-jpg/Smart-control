package com.smartcontrol.domain.spec

/**
 * Owner-only control-plane configuration mirrored from the supplied master
 * specification. Values are configuration data; Android OS consent and
 * authenticated session gates remain authoritative for sensitive features.
 *
 * Owner identities are deliberately not embedded in the APK. Production
 * authorization is enforced with Firebase Auth admin claims.
 */
data class OwnerControlConfig(
    val ownerRole: String = "OWNER",
    val ownerPanelHiddenFromNormalUsers: Boolean = true,
    val requireFirebaseAdminClaim: Boolean = true,
    val separateOwnerRoute: Boolean = true,
    val realtimeApply: Boolean = true,
    val changeLogEnabled: Boolean = true,
    val rollbackEnabled: Boolean = true,
    val editableValues: Map<String, String> = defaultEditableValues()
) {
    companion object {
        fun defaultEditableValues(): Map<String, String> = linkedMapOf(
            // 1. App branding
            "branding.appName" to "Smart Control",
            "branding.shortName" to "Smart Control",
            "branding.logoResource" to "",
            "branding.appIcon" to "",
            "branding.splash" to "",
            "branding.theme" to "default",
            "branding.primaryColor" to "",
            "branding.secondaryColor" to "",
            "branding.font" to "",
            "branding.background" to "",

            // 2. Feature control
            "features.globalEnabled" to "true",
            "features.perUserEnabled" to "true",
            "features.defaultMaxDurationSeconds" to "",
            "features.defaultPriority" to "0",

            // 3. Permission settings
            "permissions.allowAllButton" to "true",
            "permissions.oneByOneMode" to "true",
            "permissions.autoAllow" to "false",
            "permissions.showExplanation" to "true",
            "permissions.showLiveIndicator" to "true",
            "permissions.allowIndividualDeny" to "true",

            // 4. Plans and subscriptions
            "plans.freeVisiblePublicly" to "false",
            "plans.freeManualApproval" to "true",
            "plans.freeDurationSeconds" to "",
            "plans.defaultPlan" to "",
            "plans.currency" to "INR",

            // 5. User management
            "users.allowAdd" to "true",
            "users.allowRemove" to "true",
            "users.allowBlock" to "true",
            "users.allowRoleChange" to "true",
            "users.allowAccessGrant" to "true",
            "users.allowAccessRevoke" to "true",
            "users.defaultTimeLimitSeconds" to "",

            // 6. Text and content
            "content.supportText" to "WhatsApp Support",
            "content.privacyText" to "Privacy and consent controls",
            "content.termsText" to "Terms and conditions",
            "content.permissionIntroText" to "Choose which features you want to allow.",
            "content.stopText" to "Stop / Disconnect",
            "content.defaultLanguage" to "en",

            // 7. Links and URLs
            "links.support" to "",
            "links.whatsapp" to "",
            "links.privacy" to "",
            "links.terms" to "",
            "links.website" to "",
            "links.apiEndpoint" to "",

            // 8. Control settings
            "control.touchEnabled" to "false",
            "control.keyboardEnabled" to "false",
            "control.screenShareEnabled" to "true",
            "control.screenRecordEnabled" to "true",
            "control.fileTransferEnabled" to "true",
            "control.clipboardSyncEnabled" to "false",

            // 9. Connection settings
            "connection.autoLink" to "true",
            "connection.persistentPairing" to "true",
            "connection.autoReconnect" to "true",
            "connection.groupPairingLimit" to "100",
            "connection.p2pFallback" to "true",
            "connection.offlineMode" to "true",
            "connection.sessionApprovalRequired" to "true",
            "connection.sessionExpirySeconds" to "3600",

            // 10. Notifications
            "notifications.push" to "true",
            "notifications.sms" to "false",
            "notifications.email" to "false",
            "notifications.whatsapp" to "false",
            "notifications.sound" to "",
            "notifications.icon" to "",

            // 11. UI/UX
            "ui.layout" to "default",
            "ui.buttonStyle" to "default",
            "ui.animationSpeed" to "1.0",
            "ui.iconPack" to "default",
            "ui.darkMode" to "system",
            "ui.languageDefault" to "en",

            // 12. Security
            "security.twoFactorRequired" to "true",
            "security.otpLength" to "6",
            "security.sessionTimeoutSeconds" to "3600",
            "security.encryptionLevel" to "AES-256-GCM",
            "security.ipWhitelist" to "",
            "security.deviceLimit" to "100",

            // 13. Data
            "data.autoCapture" to "false",
            "data.retentionDays" to "30",
            "data.downloadAllowed" to "true",
            "data.shareAllowed" to "false",
            "data.deleteAllowed" to "true",
            "data.backupFrequency" to "daily",

            // 14. SOS
            "sos.buttonEnabled" to "true",
            "sos.autoTrigger" to "false",
            "sos.contacts" to "",
            "sos.message" to "",
            "sos.priority" to "high",

            // 15. Languages
            "language.multiLanguage" to "true",
            "language.default" to "en",
            "language.switchButton" to "true",
            "language.autoTranslate" to "false",
            "language.regionalSupport" to "en-IN",

            // 16-20. Advanced plan/payment controls from the master specification
            "payment.gatewayList" to "",
            "payment.gatewayEnabled" to "true",
            "payment.gatewayOrder" to "",
            "payment.gatewayPriority" to "0",
            "payment.gatewayMode" to "TEST",
            "payment.apiKey" to "",
            "payment.secretKey" to "",
            "payment.merchantId" to "",
            "payment.webhookUrl" to "",
            "payment.callbackUrl" to "",
            "payment.encryptionKey" to "",
            "payment.upiEnabled" to "true",
            "payment.cardEnabled" to "true",
            "payment.netBankingEnabled" to "true",
            "payment.walletEnabled" to "false",
            "payment.emiEnabled" to "true",
            "payment.cashOnDeliveryEnabled" to "false",
            "payment.cryptoEnabled" to "false",
            "payment.bankTransferEnabled" to "true",
            "payment.emiTenuresMonths" to "3,6,9,12",
            "payment.emiInterestRatePercent" to "0",
            "payment.emiProcessingFeeMinor" to "0",
            "payment.emiDownPaymentPercent" to "0",
            "payment.emiAutoDebit" to "false",
            "payment.invoiceTemplate" to "default",
            "payment.invoiceLogo" to "",
            "payment.invoiceFooter" to "",
            "payment.gstNumber" to "",
            "payment.companyDetails" to "",
            "payment.autoInvoice" to "true",
            "payment.autoEmailReceipt" to "false",
            "payment.refundEnabled" to "true",
            "payment.refundWindowDays" to "7",
            "payment.refundPercent" to "100",
            "payment.refundAutoApprove" to "false",
            "payment.refundProcessingDays" to "5",
            "payment.couponEnabled" to "true",
            "payment.couponCode" to "",
            "payment.couponDiscountPercent" to "0",
            "payment.couponDiscountMinor" to "0",
            "payment.couponValidityDays" to "0",
            "payment.couponUsageLimit" to "0",
            "payment.gstPercent" to "0",
            "payment.vatPercent" to "0",
            "payment.serviceTaxPercent" to "0",
            "payment.taxInclusive" to "true",
            "payment.taxDisplay" to "true",
            "payment.paymentSuccessNotification" to "true",
            "payment.paymentFailureNotification" to "true",
            "payment.paymentPendingNotification" to "true",
            "payment.renewalReminderNotification" to "true",
            "payment.expiryReminderNotification" to "true",
            "payment.refundNotification" to "true",
            "payment.notificationChannel" to "PUSH",
            "payment.reportAutoEmail" to "false",
            "payment.payoutAccountLabel" to "",
            "payment.payoutAccountReference" to "",
            "payment.payoutSchedule" to "MONTHLY",
            "payment.payoutThresholdMinor" to "0",
            "payment.payoutMethod" to "BANK_TRANSFER",
            "payment.payoutEnabled" to "false"
        )
    }
}
