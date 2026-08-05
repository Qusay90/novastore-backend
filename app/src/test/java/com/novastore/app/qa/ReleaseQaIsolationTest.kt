package com.novastore.app.qa

import com.novastore.app.BuildConfig
import java.nio.file.Files
import java.nio.file.Path
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ReleaseQaIsolationTest {
    @Test
    fun qaLauncherAndFixturesStayOutOfMainAndReleaseSources() {
        val appRoot = locateAppRoot()
        val forbidden = listOf(
            "QaScenarioActivity",
            "QaFixtureDataSource",
            "QaVisualFixture",
            "qa_home_product_backdrop_source",
            "qa_app_name",
            "debug_network_security_config",
            "QA_BUILD_LABEL",
            "GÖRSEL QA"
        )
        val leaked = mutableListOf<String>()

        listOf(appRoot.resolve("src/main"), appRoot.resolve("src/release")).forEach { sourceRoot ->
            Files.walk(sourceRoot).use { paths ->
                paths.filter(Files::isRegularFile)
                    .filter { it.fileName.toString().endsWith(".kt") || it.fileName.toString().endsWith(".xml") }
                    .forEach { path ->
                        val content = readUtf8(path)
                        forbidden.filter(content::contains).forEach { marker ->
                            leaked += "${appRoot.relativize(path)} contains $marker"
                        }
                    }
            }
        }

        assertTrue("Release-visible QA markers: $leaked", leaked.isEmpty())
    }

    @Test
    fun launcherAndCleartextPoliciesAreSeparatedByBuildType() {
        val appRoot = locateAppRoot()
        val main = readUtf8(appRoot.resolve("src/main/AndroidManifest.xml"))
        val debug = readUtf8(appRoot.resolve("src/debug/AndroidManifest.xml"))
        val release = readUtf8(appRoot.resolve("src/release/AndroidManifest.xml"))

        assertFalse(main.contains("android.intent.category.LAUNCHER"))
        assertTrue(main.contains("android:usesCleartextTraffic=\"false\""))
        assertTrue(debug.contains(".qa.QaScenarioActivity"))
        assertTrue(debug.contains("debug_network_security_config"))
        assertTrue(release.contains(".MainActivity"))
        assertTrue(release.contains("android.intent.category.LAUNCHER"))
        assertFalse(release.contains("QaScenarioActivity"))
        assertFalse(release.contains("networkSecurityConfig"))
    }

    @Test
    fun releaseBuildConfigDoesNotExposeQaLabel() {
        if (!BuildConfig.DEBUG) {
            val fieldNames = BuildConfig::class.java.declaredFields.map { it.name }.toSet()
            assertFalse(fieldNames.contains("QA_BUILD_LABEL"))
        }
    }

    private fun locateAppRoot(): Path {
        val workingDirectory = Path.of("").toAbsolutePath().normalize()
        return listOf(workingDirectory, workingDirectory.resolve("app"))
            .firstOrNull { Files.isDirectory(it.resolve("src/main")) }
            ?: error("Could not locate app/src/main from $workingDirectory")
    }

    private fun readUtf8(path: Path): String = String(Files.readAllBytes(path), Charsets.UTF_8)
}
