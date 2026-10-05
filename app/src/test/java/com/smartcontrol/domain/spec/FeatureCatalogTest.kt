package com.smartcontrol.domain.spec

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class FeatureCatalogTest {
    @Test fun containsExactlyNineteenFeatures() {
        assertEquals(19, FeatureCatalog.all.size)
        assertEquals(19, FeatureId.entries.size)
    }

    @Test fun everyFeatureRequiresVisibleSessionApproval() {
        assertTrue(FeatureCatalog.all.all { ConsentKind.USER_APPROVED_SESSION in it.consent })
        assertTrue(FeatureCatalog.all.all { it.visibleWhileActive })
    }
}
