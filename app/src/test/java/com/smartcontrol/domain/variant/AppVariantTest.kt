package com.smartcontrol.domain.variant

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class AppVariantTest {
    @Test fun exposesFourMasterVariants() {
        assertEquals(setOf("OWNER","LITE","FULL","DESKTOP"), AppVariant.entries.map { it.key }.toSet())
        assertFalse(AppVariant.OWNER.desktop)
        assertFalse(AppVariant.LITE.desktop)
        assertFalse(AppVariant.FULL.desktop)
        assertTrue(AppVariant.DESKTOP.desktop)
    }

    @Test fun unknownAndroidBuildVariantFallsBackToFull() {
        assertEquals(AppVariant.FULL, AppVariant.fromBuildVariant("unknown"))
    }
}
