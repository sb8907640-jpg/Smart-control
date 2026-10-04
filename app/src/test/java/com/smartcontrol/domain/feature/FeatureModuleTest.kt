package com.smartcontrol.domain.feature
import org.junit.Assert.assertEquals
import org.junit.Test
class FeatureModuleTest{@Test fun registersAllRequestedModules(){assertEquals(19,FeatureModule.entries.size)}}
