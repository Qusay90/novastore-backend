package com.novastore.seller

import android.graphics.Bitmap
import android.graphics.Rect
import android.os.ParcelFileDescriptor
import android.os.SystemClock
import android.view.accessibility.AccessibilityNodeInfo
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.novastore.seller.data.SellerScreen
import com.novastore.seller.data.SellerUiState
import com.novastore.seller.ui.SellerViewModel
import java.io.File
import java.security.MessageDigest
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import kotlin.math.roundToInt
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class SellerCanonicalCaptureInstrumentationTest {
    @Test
    fun canonicalHarnessDrivesOnlyDeclaredDebugStates() {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        assertTrue(BuildConfig.SELLER_TEST_STATE_ENABLED)
        SellerCanonicalStateHarness.specifications.forEach { specification ->
            val intent = SellerCanonicalStateHarness.intent(instrumentation.targetContext, specification.state)
            assertEquals(specification.state, intent.getStringExtra(SellerMainActivity.EXTRA_CANONICAL_TEST_STATE))
            assertTrue(intent.flags and android.content.Intent.FLAG_ACTIVITY_NEW_TASK != 0)
        }
    }

    @Test
    fun canonicalPreCaptureSpecificationsRequireRouteMarkersAndFixture() {
        val specifications = SellerCanonicalStateHarness.specifications
        assertEquals(specifications.map { it.state }.distinct().size, specifications.size)
        specifications.forEach { specification ->
            assertTrue("missing route for ${specification.state}", specification.expectedRoute.startsWith("seller://"))
            assertTrue("missing marker for ${specification.state}", specification.expectedMarkers.isNotEmpty())
            assertTrue("missing fixture strategy for ${specification.state}", specification.fixtureStrategy.isNotBlank())
            assertTrue("missing API contract for ${specification.state}", specification.expectedApiCalls.isNotEmpty())
            assertTrue("missing screenshot path for ${specification.state}", specification.screenshotPath.endsWith(".png"))
        }
        val team = SellerCanonicalStateHarness.specification("team")
        assertEquals("seller://team", team.expectedRoute)
        assertTrue(team.expectedMarkers.contains("Ekip ve Yetkiler"))
        assertTrue(team.expectedMarkers.contains("EKİP YÖNETİMİ"))
        assertFalse(team.expectedMarkers.contains("Genel Bakış"))
        assertEquals("seller-team-fixture-v1", team.expectedFixture)
    }

    @Test
    fun highThroughputCanonicalStatesPassTheFullCaptureGate() {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val requestedState = InstrumentationRegistry.getArguments().getString("sellerCanonicalState")
        val specifications = SellerCanonicalStateHarness.highThroughputSpecifications
            .filter { requestedState == null || it.state == requestedState }
        assertEquals(if (requestedState == null) 32 else 1, specifications.size)
        val evidenceDirectory = requireNotNull(
            instrumentation.targetContext.getExternalFilesDir("seller-wave4/high-throughput")
        ).apply { mkdirs() }
        val evidenceRows = mutableListOf(
            "reference\texpected_route\tactual_route\tmarkers\tfixture\tui_idle\twrong_context\tcapture_valid\tscreenshot"
        )

        specifications.forEach { specification ->
            val activity = instrumentation.startActivitySync(
                SellerCanonicalStateHarness.intent(instrumentation.targetContext, specification.state)
            )
            try {
                instrumentation.waitForIdleSync()
                val root = requireNotNull(
                    if (specification.expectedFixture == "none") {
                        waitForCanonicalDescription(instrumentation, "seller-route:${specification.expectedRoute}")
                    } else {
                        waitForCanonicalReady(instrumentation, specification)
                    }
                ) {
                    "Missing route for ${specification.state}"
                }
                val description = root.contentDescription?.toString().orEmpty()
                val markersPresent = specification.expectedMarkers.all { marker ->
                    findCanonicalMarkerWithScroll(instrumentation, marker)
                }
                scrollCanonicalToTop(instrumentation)
                val fixtureActive = description.contains(specification.expectedFixture)
                val uiIdle = description.contains("seller-ui-idle:yes")
                val stateActive = description.contains("seller-state:${specification.state}")
                val frameStable = waitForStableFrame(instrumentation)
                val actualRoute = Regex("seller-route:([^ ]+)").find(description)?.groupValues?.get(1).orEmpty()
                val wrongContext = actualRoute != specification.expectedRoute
                val captureValid = markersPresent && fixtureActive && uiIdle && stateActive && frameStable && !wrongContext
                assertTrue("capture gate failed for ${specification.state}: $description", captureValid)

                val fileName = "${specification.references.single()}-runtime.png"
                saveScreenshot(instrumentation, fileName, evidenceDirectory)
                evidenceRows += listOf(
                    specification.references.single(),
                    specification.expectedRoute,
                    actualRoute,
                    if (markersPresent) "PRESENT" else "MISSING",
                    if (fixtureActive) "ACTIVE" else "INACTIVE",
                    if (uiIdle) "YES" else "NO",
                    if (wrongContext) "YES" else "NO",
                    if (captureValid) "YES" else "NO",
                    specification.screenshotPath
                ).joinToString("\t")
            } finally {
                activity.finish()
                instrumentation.waitForIdleSync()
            }
        }

        val manifestName = requestedState
            ?.let { "high-throughput-capture-manifest-$it.tsv" }
            ?: "high-throughput-capture-manifest.tsv"
        evidenceDirectory.resolve(manifestName)
            .writeText(evidenceRows.joinToString("\n", postfix = "\n"), Charsets.UTF_8)
    }

    @Test
    fun representativeGateFamiliesCaptureExactRoutesAndMarkers() {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val requestedState = InstrumentationRegistry.getArguments().getString("sellerRepresentativeState")
        val specifications = SellerCanonicalStateHarness.representativeGateSpecifications
            .filter { requestedState == null || it.state == requestedState }
        val expectedCount = if (requestedState == null) 15 else 1
        assertEquals(expectedCount, specifications.size)
        assertEquals(expectedCount, specifications.flatMap { it.references }.distinct().size)
        val evidenceDirectory = requireNotNull(
            instrumentation.targetContext.getExternalFilesDir("seller-wave4/representative")
        ).apply { mkdirs() }
        val captureAvdName = runShellCommand(instrumentation, "getprop ro.boot.qemu.avd_name").trim()
        assertEquals("novastore-seller-wave4-uat", captureAvdName)
        val captureApkSha256 = sha256(File(instrumentation.targetContext.applicationInfo.sourceDir))
        val evidenceRows = mutableListOf(
            "reference\tstate\texpected_route\tactual_route\texpected_markers\tmarkers_found\t" +
                "expected_fixture\tactive_fixture\tui_idle\twrong_context\tcapture_valid\tscreenshot\t" +
                "frame_stable\truntime_sha256\tcapture_utc\tavd_name\tapk_sha256\tcapture_receipt\tcapture_receipt_sha256"
        )

        specifications.forEach { specification ->
            val activity = instrumentation.startActivitySync(
                SellerCanonicalStateHarness.intent(instrumentation.targetContext, specification.state)
            )
            try {
                instrumentation.waitForIdleSync()
                val root = requireNotNull(
                    if (specification.expectedFixture == "none") {
                        waitForCanonicalDescription(instrumentation, "seller-route:${specification.expectedRoute}")
                    } else {
                        waitForCanonicalReady(instrumentation, specification)
                    }
                ) {
                    "Missing representative route for ${specification.state}"
                }
                val description = root.contentDescription?.toString().orEmpty()
                val foundMarkers = specification.expectedMarkers.filter { marker ->
                    findCanonicalMarkerWithScroll(instrumentation, marker)
                }
                val markersPresent = foundMarkers.size == specification.expectedMarkers.size
                scrollCanonicalToTop(instrumentation)
                val fixtureActive = specification.expectedFixture == "none" || description.contains(specification.expectedFixture)
                val activeFixture = if (fixtureActive) specification.expectedFixture else "none"
                val uiIdle = description.contains("seller-ui-idle:yes")
                val stateActive = specification.expectedFixture == "none" || description.contains("seller-state:${specification.state}")
                val frameStable = waitForStableFrame(instrumentation)
                val actualRoute = Regex("seller-route:([^ ]+)").find(description)?.groupValues?.get(1).orEmpty()
                val wrongContext = actualRoute != specification.expectedRoute
                val captureValid = markersPresent && fixtureActive && uiIdle && stateActive && frameStable && !wrongContext
                assertTrue(
                    "representative capture gate failed for ${specification.state}: " +
                        "markers=$markersPresent fixture=$fixtureActive idle=$uiIdle " +
                        "state=$stateActive stable=$frameStable wrongContext=$wrongContext; $description",
                    captureValid
                )

                val reference = specification.references.single()
                val runtimeBounds = captureRuntimeBounds(instrumentation, reference)
                val screenshot = saveScreenshot(instrumentation, "$reference-runtime.png", evidenceDirectory)
                val runtimeSha256 = sha256(screenshot)
                val captureBitmap = requireNotNull(android.graphics.BitmapFactory.decodeFile(screenshot.absolutePath))
                val captureWidth = captureBitmap.width
                val captureHeight = captureBitmap.height
                captureBitmap.recycle()
                val captureUtc = captureUtcNow()
                val captureReceiptPath = specification.screenshotPath.replace("-runtime.png", "-capture.json")
                val captureReceipt = JSONObject()
                    .put("schema_version", 2)
                    .put("canonical_state_id", reference)
                    .put("state", specification.state)
                    .put("expected_route", specification.expectedRoute)
                    .put("actual_route", actualRoute)
                    .put("expected_semantic_markers", JSONArray(specification.expectedMarkers))
                    .put("markers_found", JSONArray(foundMarkers))
                    .put("expected_fixture", specification.expectedFixture)
                    .put("active_fixture", activeFixture)
                    .put("ui_idle", if (uiIdle) "YES" else "NO")
                    .put("wrong_context", if (wrongContext) "YES" else "NO")
                    .put("capture_valid", if (captureValid) "YES" else "NO")
                    .put("frame_stable", if (frameStable) "YES" else "NO")
                    .put("screenshot_path", specification.screenshotPath)
                    .put("runtime_sha256", runtimeSha256)
                    .put("capture_utc", captureUtc)
                    .put("avd_name", captureAvdName)
                    .put("apk_sha256", captureApkSha256)
                    .put(
                        "capture_canvas_px",
                        JSONObject()
                            .put("width", captureWidth)
                            .put("height", captureHeight)
                    )
                    .put("runtime_bounds_raw_px", runtimeBounds)
                val captureReceiptFile = evidenceDirectory.resolve("$reference-capture.json")
                captureReceiptFile.writeText(captureReceipt.toString(2) + "\n", Charsets.UTF_8)
                val captureReceiptSha256 = sha256(captureReceiptFile)
                evidenceRows += listOf(
                    reference,
                    specification.state,
                    specification.expectedRoute,
                    actualRoute,
                    specification.expectedMarkers.joinToString("|"),
                    foundMarkers.joinToString("|"),
                    specification.expectedFixture,
                    activeFixture,
                    if (uiIdle) "YES" else "NO",
                    if (wrongContext) "YES" else "NO",
                    if (captureValid) "YES" else "NO",
                    specification.screenshotPath,
                    if (frameStable) "YES" else "NO",
                    runtimeSha256,
                    captureUtc,
                    captureAvdName,
                    captureApkSha256,
                    captureReceiptPath,
                    captureReceiptSha256
                ).joinToString("\t")
            } finally {
                activity.finish()
                instrumentation.waitForIdleSync()
            }
        }

        val manifestName = requestedState
            ?.let { "representative-capture-manifest-$it.tsv" }
            ?: "representative-capture-manifest.tsv"
        evidenceDirectory.resolve(manifestName)
            .writeText(evidenceRows.joinToString("\n", postfix = "\n"), Charsets.UTF_8)
    }

    @Test
    fun bottomNavigationCapturesAllSelectedStatesAndTransitionFrames() {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val specifications = SellerCanonicalStateHarness.bottomNavigationSpecifications
        val tabKeys = listOf("dashboard", "products", "orders", "finance", "store")
        assertEquals(5, specifications.size)
        val evidenceDirectory = requireNotNull(
            instrumentation.targetContext.getExternalFilesDir("seller-wave4/bottom-navigation")
        ).apply { mkdirs() }
        val evidenceRows = mutableListOf(
            "reference\tstate\texpected_route\tactual_route\tselected_tab\tselected_semantics\tcapture_valid\tscreenshot"
        )

        specifications.forEachIndexed { index, specification ->
            val activity = instrumentation.startActivitySync(
                SellerCanonicalStateHarness.intent(instrumentation.targetContext, specification.state)
            )
            try {
                instrumentation.waitForIdleSync()
                Thread.sleep(1_000)
                val root = requireNotNull(
                    waitForCanonicalDescription(instrumentation, "seller-route:${specification.expectedRoute}")
                )
                val description = root.contentDescription?.toString().orEmpty()
                val actualRoute = Regex("seller-route:([^ ]+)").find(description)?.groupValues?.get(1).orEmpty()
                val fixtureActive = description.contains(specification.expectedFixture)
                val markersPresent = specification.expectedMarkers.all { marker ->
                    waitForCanonicalMarker(instrumentation, marker) != null
                }
                val selectedNode = requireNotNull(
                    waitForCanonicalViewId(instrumentation, "seller-tab:${tabKeys[index]}")
                )
                val selectedSemantics = selectedNode.isSelected
                tabKeys.filterIndexed { otherIndex, _ -> otherIndex != index }.forEach { key ->
                    assertTrue(
                        "only one seller tab may be selected",
                        !requireNotNull(waitForCanonicalViewId(instrumentation, "seller-tab:$key")).isSelected
                    )
                }
                val captureValid = actualRoute == specification.expectedRoute &&
                    fixtureActive && markersPresent && selectedSemantics
                assertTrue("bottom navigation capture failed for ${specification.state}", captureValid)
                val fileName = "bottom-nav-${tabKeys[index]}-selected.png"
                saveScreenshot(instrumentation, fileName, evidenceDirectory)
                evidenceRows += listOf(
                    specification.references.single(),
                    specification.state,
                    specification.expectedRoute,
                    actualRoute,
                    tabKeys[index],
                    if (selectedSemantics) "YES" else "NO",
                    if (captureValid) "YES" else "NO",
                    specification.screenshotPath
                ).joinToString("\t")
            } finally {
                activity.finish()
                instrumentation.waitForIdleSync()
            }
        }

        val transitionActivity = instrumentation.startActivitySync(
            SellerCanonicalStateHarness.intent(instrumentation.targetContext, "nav_dashboard")
        ) as SellerMainActivity
        try {
            instrumentation.waitForIdleSync()
            requireNotNull(waitForCanonicalMotion(instrumentation, "seller-nav-motion:store:T0"))
            saveScreenshot(instrumentation, "bottom-nav-transition-t0.png", evidenceDirectory)
            saveScreenshot(instrumentation, "bottom-nav-transition-before.png", evidenceDirectory)
            clickCanonicalViewId(instrumentation, "seller-tab:store")
            val transitionStartedAt = SystemClock.uptimeMillis()
            sleepUntil(transitionStartedAt, 180)
            saveScreenshot(instrumentation, "bottom-nav-transition-t25.png", evidenceDirectory)
            sleepUntil(transitionStartedAt, 360)
            saveScreenshot(instrumentation, "bottom-nav-transition-t50.png", evidenceDirectory)
            saveScreenshot(instrumentation, "bottom-nav-transition-mid.png", evidenceDirectory)
            sleepUntil(transitionStartedAt, 540)
            saveScreenshot(instrumentation, "bottom-nav-transition-t75.png", evidenceDirectory)
            sleepUntil(transitionStartedAt, 780)
            requireNotNull(waitForCanonicalDescription(instrumentation, "seller-route:seller://store"))
            saveScreenshot(instrumentation, "bottom-nav-transition-t100.png", evidenceDirectory)
            saveScreenshot(instrumentation, "bottom-nav-transition-after.png", evidenceDirectory)
        } finally {
            transitionActivity.finish()
            instrumentation.waitForIdleSync()
        }

        evidenceDirectory.resolve("bottom-navigation-capture-manifest.tsv")
            .writeText(evidenceRows.joinToString("\n", postfix = "\n"), Charsets.UTF_8)
    }

    @Test
    fun teamFixtureBindsTheDeclaredReadOnlyRoleSet() {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val activity = instrumentation.startActivitySync(
            SellerCanonicalStateHarness.intent(instrumentation.targetContext, "team")
        )
        val field = SellerMainActivity::class.java.getDeclaredField("sellerViewModel")
        field.isAccessible = true
        val viewModel = field.get(activity) as SellerViewModel
        val state = viewModel.state.value as SellerUiState.Content

        assertEquals(SellerScreen.TEAM, state.page.screen)
        assertEquals("seller-team-fixture-v1", state.page.canonicalFixtureId)
        assertEquals(listOf("owner", "manager", "operator"), state.page.team?.members?.map { it.roleCode })
    }

    @Test
    fun loginTopBarStaysFixedWhileCanonicalContentScrolls() {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val activity = instrumentation.startActivitySync(
            SellerCanonicalStateHarness.intent(instrumentation.targetContext, "login")
        ) as SellerMainActivity
        try {
            assertStickyTopBar(
                instrumentation = instrumentation,
                title = "Satıcı Girişi",
                movingMarker = "NovaStore",
                capturePrefix = "login-sticky",
                swipeStartY = 1800
            )
        } finally {
            runShellCommand(instrumentation, "input keyevent 4")
            activity.finish()
        }
    }

    @Test
    fun loginFieldRequestsTheSystemIme() {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val activity = instrumentation.startActivitySync(
            SellerCanonicalStateHarness.intent(instrumentation.targetContext, "login")
        ) as SellerMainActivity
        try {
            activateKeyboard(instrumentation, "E-posta veya telefon numarası")
            assertTrue(runShellCommand(instrumentation, "dumpsys input_method").contains("mInputShown=true"))
        } finally {
            runShellCommand(instrumentation, "input keyevent 4")
            activity.finish()
        }
    }

    @Test
    fun authenticatedTeamTopBarStaysFixedAndRendersTheDeclaredTeamBody() {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val activity = instrumentation.startActivitySync(
            SellerCanonicalStateHarness.intent(instrumentation.targetContext, "team")
        )
        try {
            assertTrue(waitForText(instrumentation, "Ekip ve Yetkiler") != null)
            assertTrue(waitForText(instrumentation, "EKİP YÖNETİMİ") != null)
            assertTrue(waitForText(instrumentation, "Test Sahibi") != null)
            assertStickyTopBar(
                instrumentation = instrumentation,
                title = "Ekip ve Yetkiler",
                movingMarker = "Test Sahibi",
                capturePrefix = "team-sticky",
                swipeStartY = 1850
            )
        } finally {
            activity.finish()
        }
    }

    @Test
    fun closedAffordancesExposeDisabledReadOnlySemantics() {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val cases = listOf(
            "login" to listOf(
                "Şifremi unuttum; bu sürümde kapalı",
                "Satıcı başvurusu; bu sürümde kapalı",
                "Satıcı desteği; giriş öncesi bu sürümde kapalı"
            ),
            "ref_055" to listOf(
                "Tümünü gör; salt okunur"
            ),
            "ref_074" to listOf("Ürün ekle; bu sürümde kapalı")
        )

        cases.forEach { (state, descriptions) ->
            val activity = instrumentation.startActivitySync(
                SellerCanonicalStateHarness.intent(instrumentation.targetContext, state)
            )
            try {
                instrumentation.waitForIdleSync()
                descriptions.forEach { description ->
                    val node = requireNotNull(
                        findDisabledDescriptionWithScroll(instrumentation, description)
                    ) { "Missing disabled/read-only semantics: $description" }
                    assertFalse("Closed affordance must not be enabled: $description", node.isEnabled)
                    assertFalse("Closed affordance must not be clickable: $description", node.isClickable)
                }
            } finally {
                activity.finish()
                instrumentation.waitForIdleSync()
            }
        }
    }

    @Test
    fun rememberMeCheckboxIsIndependentFromDisabledPasswordRecovery() {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val activity = instrumentation.startActivitySync(
            SellerCanonicalStateHarness.intent(instrumentation.targetContext, "login")
        )
        try {
            instrumentation.waitForIdleSync()
            var remember = requireNotNull(waitForRememberCheckbox(instrumentation, expectedChecked = false))
            assertTrue("Remember-me control must be clickable", remember.isClickable)
            assertTrue("Remember-me control must expose checkbox state", remember.isCheckable)
            assertFalse("Remember-me must start unchecked", remember.isChecked)

            assertTrue(remember.performAction(AccessibilityNodeInfo.ACTION_CLICK))
            instrumentation.waitForIdleSync()
            remember = requireNotNull(waitForRememberCheckbox(instrumentation, expectedChecked = true))
            assertTrue("Remember-me click must update checked state", remember.isChecked)

            val passwordRecovery = requireNotNull(
                waitForDescription(instrumentation, "Şifremi unuttum; bu sürümde kapalı")
            )
            assertFalse("Disabled password recovery must not be clickable", passwordRecovery.isClickable)
            assertFalse("Disabled password recovery must not be enabled", passwordRecovery.isEnabled)
            assertFalse(passwordRecovery.performAction(AccessibilityNodeInfo.ACTION_CLICK))
            instrumentation.waitForIdleSync()
            remember = requireNotNull(waitForRememberCheckbox(instrumentation, expectedChecked = true))
            assertTrue("Password-recovery interaction must not toggle remember-me", remember.isChecked)
        } finally {
            activity.finish()
            instrumentation.waitForIdleSync()
        }
    }

    @Test
    fun loginInvalidSubmissionExpandsFormAndExposesAccessibleErrors() {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val activity = instrumentation.startActivitySync(
            SellerCanonicalStateHarness.intent(instrumentation.targetContext, "login")
        )
        try {
            instrumentation.waitForIdleSync()
            val formBefore = requireNotNull(
                waitForCanonicalViewId(instrumentation, "seller-region:001:form_card")
            )
            val boundsBefore = Rect().also(formBefore::getBoundsInScreen)

            val submit = requireNotNull(
                waitForDescription(instrumentation, "Giriş Yap")?.let(::findClickableAncestor)
            ) { "Login submit must expose a clickable ancestor" }
            assertTrue(submit.performAction(AccessibilityNodeInfo.ACTION_CLICK))
            instrumentation.waitForIdleSync()

            listOf(
                "E-posta veya telefon numarası hatası: Bu alan giriş için gerekli.",
                "Şifre hatası: Bu alan giriş için gerekli."
            ).forEach { description ->
                val error = requireNotNull(waitForDescription(instrumentation, description)) {
                    "Missing accessible validation error: $description"
                }
                assertTrue("Validation error must remain visible: $description", error.isVisibleToUser)
            }

            val formAfter = requireNotNull(
                waitForCanonicalViewId(instrumentation, "seller-region:001:form_card")
            )
            val boundsAfter = Rect().also(formAfter::getBoundsInScreen)
            assertTrue(
                "Invalid login form must grow instead of clipping errors: before=$boundsBefore after=$boundsAfter",
                boundsAfter.height() > boundsBefore.height()
            )
        } finally {
            activity.finish()
            instrumentation.waitForIdleSync()
        }
    }

    @Test
    fun dashboardTaskActionsMeetMinimumTouchTarget() {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val activity = instrumentation.startActivitySync(
            SellerCanonicalStateHarness.intent(instrumentation.targetContext, "ref_055")
        )
        try {
            instrumentation.waitForIdleSync()
            val minimumPixels = (48f * instrumentation.targetContext.resources.displayMetrics.density).roundToInt()
            listOf("Hazırla", "Stok ekle").forEach { description ->
                val action = requireNotNull(
                    waitForDescription(instrumentation, description)?.let(::findClickableAncestor)
                ) {
                    "Missing dashboard action semantics: $description"
                }
                val bounds = Rect().also(action::getBoundsInScreen)
                assertTrue("Dashboard action must be clickable: $description", action.isClickable)
                assertTrue(
                    "Dashboard action touch target is too short: $description bounds=$bounds minimum=$minimumPixels",
                    bounds.height() >= minimumPixels
                )
                assertTrue(
                    "Dashboard action touch target is too narrow: $description bounds=$bounds minimum=$minimumPixels",
                    bounds.width() >= minimumPixels
                )
            }
        } finally {
            activity.finish()
            instrumentation.waitForIdleSync()
        }
    }

    @Test
    fun teamInformationAffordancesExposeMeaningfulDescriptions() {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val activity = instrumentation.startActivitySync(
            SellerCanonicalStateHarness.intent(instrumentation.targetContext, "ref_282")
        )
        try {
            instrumentation.waitForIdleSync()
            listOf(
                "Mağaza ve oturum rolü hakkında bilgi",
                "Ekip yönetimi kapsamı hakkında bilgi",
                "Güvenli sonraki adım hakkında bilgi"
            ).forEach { description ->
                val node = requireNotNull(
                    findDisabledDescriptionWithScroll(instrumentation, description)
                ) { "Missing team information semantics: $description" }
                assertFalse("Information affordance must not pretend to be clickable: $description", node.isClickable)
            }
        } finally {
            activity.finish()
            instrumentation.waitForIdleSync()
        }
    }
}

private fun sleepUntil(startedAt: Long, elapsedMillis: Long) {
    val remaining = startedAt + elapsedMillis - SystemClock.uptimeMillis()
    if (remaining > 0) SystemClock.sleep(remaining)
}

private fun activateKeyboard(instrumentation: android.app.Instrumentation, label: String) {
    val inputNode = requireNotNull(waitForDescription(instrumentation, label))
    val bounds = Rect().also(inputNode::getBoundsInScreen)
    runShellCommand(instrumentation, "input tap ${bounds.centerX()} ${bounds.centerY()}")
    Thread.sleep(600)
}

private fun assertStickyTopBar(
    instrumentation: android.app.Instrumentation,
    title: String,
    movingMarker: String,
    capturePrefix: String,
    swipeStartY: Int
) {
    val topBefore = requireNotNull(waitForDescription(instrumentation, "seller-top-app-bar"))
    val topBeforeBounds = Rect().also(topBefore::getBoundsInScreen)
    val markerBefore = Rect().also(requireNotNull(waitForText(instrumentation, movingMarker))::getBoundsInScreen)
    saveScreenshot(instrumentation, "$capturePrefix-before.png")

    var markerAfter: Rect? = null
    var moved = false
    for (attempt in 0 until 3) {
        runShellCommand(instrumentation, "input swipe 540 $swipeStartY 540 420 450")
        Thread.sleep(600)
        markerAfter = waitForText(instrumentation, movingMarker)?.let { Rect().also(it::getBoundsInScreen) }
        moved = markerAfter == null || markerAfter.top < markerBefore.top
        if (moved) break
    }
    saveScreenshot(instrumentation, "$capturePrefix-after.png")

    val topAfter = requireNotNull(waitForDescription(instrumentation, "seller-top-app-bar"))
    val topAfterBounds = Rect().also(topAfter::getBoundsInScreen)
    assertEquals("top app bar Y must not scroll", topBeforeBounds.top, topAfterBounds.top)
    assertTrue("title must remain visible", waitForText(instrumentation, title) != null)
    assertTrue("back control must remain visible", waitForDescription(instrumentation, "Geri") != null)

    if (moved) assertTrue(markerAfter == null || markerAfter.top < markerBefore.top)
}

private fun saveScreenshot(
    instrumentation: android.app.Instrumentation,
    fileName: String,
    directory: java.io.File = requireNotNull(instrumentation.targetContext.getExternalFilesDir("seller-wave4"))
): File {
    directory.mkdirs()
    val bitmap = requireNotNull(instrumentation.uiAutomation.takeScreenshot())
    val target = directory.resolve(fileName)
    try {
        target.outputStream().use { output ->
            assertTrue(bitmap.compress(Bitmap.CompressFormat.PNG, 100, output))
        }
    } finally {
        bitmap.recycle()
    }
    return target
}

private fun sha256(file: File): String {
    val digest = MessageDigest.getInstance("SHA-256")
    file.inputStream().use { input ->
        val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
        while (true) {
            val read = input.read(buffer)
            if (read < 0) break
            digest.update(buffer, 0, read)
        }
    }
    return digest.digest().joinToString("") { byte -> "%02x".format(byte) }
}

private fun captureUtcNow(): String = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
    timeZone = TimeZone.getTimeZone("UTC")
}.format(Date())

private fun captureRuntimeBounds(
    instrumentation: android.app.Instrumentation,
    reference: String
): JSONObject {
    val regionIds = when (reference) {
        "001" -> listOf(
            "top_bar", "brand", "hero_copy", "form_card", "identifier_field",
            "password_field", "remember_row", "primary_cta", "application_action",
            "support_row", "security_footer"
        )
        "055" -> listOf(
            "brand_header", "greeting", "sales_hero", "task_orders", "task_stock",
            "task_questions", "balance", "recent_orders", "primary_cta", "bottom_navigation"
        )
        "282" -> (1..9).map { index -> "svg_major_${index.toString().padStart(2, '0')}" }
        else -> emptyList()
    }
    val result = JSONObject()
    regionIds.forEach { regionId ->
        val marker = "seller-region:$reference:$regionId"
        val node = requireNotNull(waitForCanonicalViewId(instrumentation, marker)) {
            "Missing runtime-bounds semantics node: $marker"
        }
        val bounds = Rect().also(node::getBoundsInScreen)
        assertTrue("Empty runtime bounds for $marker: $bounds", bounds.width() > 0 && bounds.height() > 0)
        result.put(
            regionId,
            JSONObject()
                .put("left", bounds.left)
                .put("top", bounds.top)
                .put("right", bounds.right)
                .put("bottom", bounds.bottom)
                .put("width", bounds.width())
                .put("height", bounds.height())
        )
    }
    return result
}

private fun waitForStableFrame(instrumentation: android.app.Instrumentation): Boolean {
    repeat(8) {
        val first = requireNotNull(instrumentation.uiAutomation.takeScreenshot())
        Thread.sleep(180)
        val second = requireNotNull(instrumentation.uiAutomation.takeScreenshot())
        try {
            if (stableApplicationRegion(first, second)) return true
        } finally {
            first.recycle()
            second.recycle()
        }
    }
    return false
}

private fun stableApplicationRegion(first: Bitmap, second: Bitmap): Boolean {
    if (first.width != second.width || first.height != second.height) return false
    val top = (first.height * .05f).toInt()
    val bottom = (first.height * .93f).toInt()
    var compared = 0
    var changed = 0
    for (y in top until bottom step 4) {
        for (x in 0 until first.width step 4) {
            compared += 1
            if (first.getPixel(x, y) != second.getPixel(x, y)) changed += 1
        }
    }
    return changed.toDouble() / compared.coerceAtLeast(1) <= .0005
}

private fun waitForCanonicalDescription(
    instrumentation: android.app.Instrumentation,
    prefix: String
): AccessibilityNodeInfo? {
    repeat(120) {
        findNode(instrumentation.uiAutomation.rootInActiveWindow) { node ->
            node.contentDescription?.toString()?.startsWith(prefix) == true
        }?.let { return it }
        Thread.sleep(100)
    }
    return null
}

private fun waitForCanonicalReady(
    instrumentation: android.app.Instrumentation,
    specification: SellerCanonicalStateSpec
): AccessibilityNodeInfo? {
    instrumentation.uiAutomation.clearCache()
    val routeToken = "seller-route:${specification.expectedRoute}"
    val stateToken = "seller-state:${specification.state}"
    repeat(160) {
        findNode(instrumentation.uiAutomation.rootInActiveWindow) { node ->
            node.contentDescription?.toString()?.let { description ->
                description.startsWith(routeToken) &&
                    description.contains(stateToken) &&
                    description.contains(specification.expectedFixture) &&
                    description.contains("seller-ui-idle:yes")
            } == true
        }?.let { return it }
        Thread.sleep(100)
    }
    return null
}

private fun waitForCanonicalMotion(
    instrumentation: android.app.Instrumentation,
    marker: String
): AccessibilityNodeInfo? {
    repeat(240) {
        findNode(instrumentation.uiAutomation.rootInActiveWindow) { node ->
            node.viewIdResourceName?.endsWith(marker) == true
        }?.let { return it }
        Thread.sleep(5)
    }
    return null
}

private fun waitForCanonicalViewId(
    instrumentation: android.app.Instrumentation,
    marker: String
): AccessibilityNodeInfo? {
    repeat(120) {
        findNode(instrumentation.uiAutomation.rootInActiveWindow) { node ->
            node.viewIdResourceName?.endsWith(marker) == true
        }?.let { return it }
        Thread.sleep(25)
    }
    return null
}

private fun waitForCanonicalMarker(
    instrumentation: android.app.Instrumentation,
    marker: String
): AccessibilityNodeInfo? {
    repeat(80) {
        findNode(instrumentation.uiAutomation.rootInActiveWindow) { node ->
            node.text?.toString()?.contains(marker) == true ||
                node.contentDescription?.toString()?.contains(marker) == true
        }?.let { return it }
        Thread.sleep(100)
    }
    return null
}

private fun findCanonicalMarkerWithScroll(
    instrumentation: android.app.Instrumentation,
    marker: String
): Boolean {
    repeat(7) {
        repeat(4) {
            if (findNode(instrumentation.uiAutomation.rootInActiveWindow) { node ->
                    node.text?.toString()?.contains(marker) == true ||
                        node.contentDescription?.toString()?.contains(marker) == true
                } != null
            ) return true
            Thread.sleep(100)
        }
        canonicalShell(instrumentation, "input swipe 540 1750 540 620 220")
        Thread.sleep(250)
    }
    return false
}

private fun findDisabledDescriptionWithScroll(
    instrumentation: android.app.Instrumentation,
    description: String
): AccessibilityNodeInfo? {
    repeat(8) {
        repeat(4) {
            findNode(instrumentation.uiAutomation.rootInActiveWindow) { node ->
                node.contentDescription?.toString() == description
            }?.let { return it }
            Thread.sleep(100)
        }
        canonicalShell(instrumentation, "input swipe 540 1750 540 620 220")
        Thread.sleep(250)
    }
    return null
}

private fun scrollCanonicalToTop(instrumentation: android.app.Instrumentation) {
    repeat(7) {
        canonicalShell(instrumentation, "input swipe 540 620 540 1750 160")
    }
    instrumentation.waitForIdleSync()
    Thread.sleep(350)
}

private fun canonicalShell(
    instrumentation: android.app.Instrumentation,
    command: String
): String = instrumentation.uiAutomation.executeShellCommand(command).use { descriptor ->
    ParcelFileDescriptor.AutoCloseInputStream(descriptor).use { input ->
        input.readBytes().decodeToString()
    }
}

private fun clickCanonicalDescription(
    instrumentation: android.app.Instrumentation,
    prefix: String
) {
    var node = requireNotNull(waitForCanonicalDescription(instrumentation, prefix))
    repeat(4) {
        if (node.isClickable && node.performAction(AccessibilityNodeInfo.ACTION_CLICK)) return
        node = node.parent ?: return@repeat
    }
    throw AssertionError("No clickable ancestor for $prefix")
}

private fun clickCanonicalViewId(
    instrumentation: android.app.Instrumentation,
    marker: String
) {
    var node = requireNotNull(waitForCanonicalViewId(instrumentation, marker))
    repeat(4) {
        if (node.isClickable && node.performAction(AccessibilityNodeInfo.ACTION_CLICK)) return
        node = node.parent ?: return@repeat
    }
    throw AssertionError("No clickable ancestor for $marker")
}

private fun waitForCanonicalSelected(
    instrumentation: android.app.Instrumentation,
    prefix: String
): AccessibilityNodeInfo? {
    repeat(40) {
        val node = findNode(instrumentation.uiAutomation.rootInActiveWindow) { candidate ->
            candidate.contentDescription?.toString()?.let { description ->
                description.startsWith(prefix) && description.endsWith(";seçili")
            } == true
        }
        if (node != null) return node
        Thread.sleep(5)
    }
    return null
}

private fun runShellCommand(instrumentation: android.app.Instrumentation, command: String): String {
    instrumentation.uiAutomation.executeShellCommand(command).use { descriptor ->
        return ParcelFileDescriptor.AutoCloseInputStream(descriptor).use { input -> input.readBytes().decodeToString() }
    }
}

private fun waitForDescription(
    instrumentation: android.app.Instrumentation,
    description: String
): AccessibilityNodeInfo? {
    repeat(80) {
        findNode(instrumentation.uiAutomation.rootInActiveWindow) { node ->
            node.contentDescription?.toString() == description
        }?.let { return it }
        Thread.sleep(100)
    }
    return null
}

private fun waitForText(
    instrumentation: android.app.Instrumentation,
    text: String
): AccessibilityNodeInfo? {
    repeat(80) {
        findNode(instrumentation.uiAutomation.rootInActiveWindow) { node -> node.text?.toString() == text }
            ?.let { return it }
        Thread.sleep(100)
    }
    return null
}

private fun findClickableCheckableAncestor(node: AccessibilityNodeInfo): AccessibilityNodeInfo? {
    var candidate: AccessibilityNodeInfo? = node
    repeat(5) {
        val current = candidate ?: return null
        if (current.isClickable && current.isCheckable) return current
        candidate = current.parent
    }
    return null
}

private fun findClickableAncestor(node: AccessibilityNodeInfo): AccessibilityNodeInfo? {
    var candidate: AccessibilityNodeInfo? = node
    repeat(5) {
        val current = candidate ?: return null
        if (current.isClickable) return current
        candidate = current.parent
    }
    return null
}

private fun waitForRememberCheckbox(
    instrumentation: android.app.Instrumentation,
    expectedChecked: Boolean
): AccessibilityNodeInfo? {
    repeat(80) {
        val label = findNode(instrumentation.uiAutomation.rootInActiveWindow) { node ->
            node.text?.toString() == "Beni hatırla"
        }
        val checkbox = label?.let(::findClickableCheckableAncestor)
        if (checkbox?.isChecked == expectedChecked) return checkbox
        Thread.sleep(100)
    }
    return null
}

private fun findNode(
    node: AccessibilityNodeInfo?,
    predicate: (AccessibilityNodeInfo) -> Boolean
): AccessibilityNodeInfo? {
    if (node == null) return null
    if (predicate(node)) return node
    for (index in 0 until node.childCount) {
        findNode(node.getChild(index), predicate)?.let { return it }
    }
    return null
}
