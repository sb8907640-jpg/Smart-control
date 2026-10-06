package com.smartcontrol.domain.spec

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class FeatureCatalogTest {
    @Test fun containsExactlyNineteenFeaturesWithoutDuplicates() {
        assertEquals(19, FeatureCatalog.all.size)
        assertEquals(19, FeatureId.entries.size)
        assertEquals(19, FeatureCatalog.all.map { it.id }.distinct().size)
    }

    @Test fun matchesMasterFeatureOrder() {
        assertEquals(
            listOf(
                FeatureId.LOCATION,
                FeatureId.NOTIFICATIONS,
                FeatureId.BATTERY_NETWORK,
                FeatureId.CAMERA,
                FeatureId.MICROPHONE,
                FeatureId.GALLERY,
                FeatureId.SCREEN_SHARE,
                FeatureId.SCREEN_RECORDING,
                FeatureId.TOUCH_CONTROL,
                FeatureId.KEYBOARD_INPUT,
                FeatureId.APP_INSTALL,
                FeatureId.FILE_TRANSFER,
                FeatureId.CLIPBOARD_SYNC,
                FeatureId.FILES_ACCESS,
                FeatureId.CONTACTS,
                FeatureId.SMS,
                FeatureId.CALL_LOGS,
                FeatureId.APP_USAGE,
                FeatureId.SOS_ALERTS
            ),
            FeatureCatalog.all.map { it.id }
        )
    }

    @Test fun matchesMasterOfflineCoverage() {
        assertEquals(16, FeatureCatalog.all.count { it.offline })
        assertTrue(FeatureCatalog.all.first { it.id == FeatureId.SCREEN_SHARE }.offline.not())
        assertTrue(FeatureCatalog.all.filter { it.id != FeatureId.SCREEN_SHARE && it.id != FeatureId.CAMERA && it.id != FeatureId.MICROPHONE }.all { it.offline })
    }

    @Test fun everyFeatureRequiresVisibleSessionApproval() {
        assertTrue(FeatureCatalog.all.all { ConsentKind.USER_APPROVED_SESSION in it.consent })
        assertTrue(FeatureCatalog.all.all { it.visibleWhileActive })
    }
}
