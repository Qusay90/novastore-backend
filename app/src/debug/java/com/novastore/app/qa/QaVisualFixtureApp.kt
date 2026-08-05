package com.novastore.app.qa

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.Image
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.requiredSize
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInRoot
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.novastore.app.R
import com.novastore.app.core.design.CustomerColors
import com.novastore.app.core.design.CustomerDimensions
import com.novastore.app.core.design.CustomerMotion
import com.novastore.app.core.design.CustomerSpacing
import com.novastore.app.core.design.customerGlassSource
import com.novastore.app.core.design.rememberCustomerGlassState
import com.novastore.app.core.ui.components.customerBottomDestinations
import com.novastore.app.core.ui.components.CustomerBottomBarSurfaceShape
import com.novastore.app.core.ui.components.CustomerBottomBarSurface
import com.novastore.app.core.ui.components.CustomerBottomBarSurfaceLayer
import com.novastore.app.core.ui.components.CustomerBubbleBottomBar
import com.novastore.app.core.ui.components.CustomerTopBar
import com.novastore.app.core.ui.components.customerBottomBarSettledCenterX
import com.novastore.app.core.ui.components.customerBottomBarSurfaceGeometry
import kotlin.math.abs

enum class QaVisualFixtureMode(val wireValue: String) {
    TOP_BAR("top_bar"),
    BOTTOM_BAR("bottom_bar"),
    BOTTOM_BAR_FIDELITY("bottom_bar_fidelity"),
    BOTTOM_BAR_ALPHA_MASK("bottom_bar_alpha_mask"),
    BOTTOM_BAR_SELECTED_CIRCLE_MASK("bottom_bar_selected_circle_mask"),
    BOTTOM_BAR_SELECTED_CORE_MASK("bottom_bar_selected_core_mask"),
    BOTTOM_BAR_ALPHA_MASK_TRANSITION("bottom_bar_alpha_mask_transition"),
    BOTTOM_BAR_FINAL_GLASS_NO_CORE("bottom_bar_final_glass_no_core"),
    BOTTOM_BAR_GLASS_FILL_ONLY("bottom_bar_glass_fill_only"),
    BOTTOM_BAR_OUTER_STROKE_ONLY("bottom_bar_outer_stroke_only"),
    FONT_BAKEOFF("font_bakeoff");

    val isMaskChannel: Boolean
        get() = when (this) {
            BOTTOM_BAR_ALPHA_MASK,
            BOTTOM_BAR_SELECTED_CIRCLE_MASK,
            BOTTOM_BAR_SELECTED_CORE_MASK,
            BOTTOM_BAR_ALPHA_MASK_TRANSITION -> true
            else -> false
        }

    companion object {
        fun fromWireValue(value: String?): QaVisualFixtureMode? =
            entries.firstOrNull { it.wireValue == value }
    }
}

@Composable
fun QaVisualFixtureApp(
    mode: QaVisualFixtureMode,
    cartCount: Int,
    initialSelectedId: String = "home",
    modifier: Modifier = Modifier
) {
    Box(
        modifier = modifier
            .fillMaxSize()
            .background(
                if (mode.isMaskChannel) {
                    Color.Black
                } else {
                    CustomerColors.Page
                }
            )
            .statusBarsPadding()
            .navigationBarsPadding()
            .testTag("qa_visual_fixture_root")
    ) {
        when (mode) {
            QaVisualFixtureMode.TOP_BAR -> QaTopBarFixture()
            QaVisualFixtureMode.BOTTOM_BAR -> QaBottomBarFixture(
                cartCount = cartCount,
                initialSelectedId = initialSelectedId,
                backdrop = QaBottomBackdrop.MEASUREMENT
            )
            QaVisualFixtureMode.BOTTOM_BAR_FIDELITY -> QaBottomBarFixture(
                cartCount = cartCount,
                initialSelectedId = initialSelectedId,
                backdrop = QaBottomBackdrop.SOURCE_PRODUCT
            )
            QaVisualFixtureMode.BOTTOM_BAR_ALPHA_MASK ->
                QaBottomBarAlphaMaskFixture(
                    cartCount = cartCount,
                    initialSelectedId = initialSelectedId
                )
            QaVisualFixtureMode.BOTTOM_BAR_SELECTED_CIRCLE_MASK ->
                QaBottomBarPrimitiveMaskFixture(
                    cartCount = cartCount,
                    initialSelectedId = initialSelectedId,
                    primitive = QaBottomMaskPrimitive.SELECTED_CIRCLE
                )
            QaVisualFixtureMode.BOTTOM_BAR_SELECTED_CORE_MASK ->
                QaBottomBarPrimitiveMaskFixture(
                    cartCount = cartCount,
                    initialSelectedId = initialSelectedId,
                    primitive = QaBottomMaskPrimitive.SELECTED_CORE
                )
            QaVisualFixtureMode.BOTTOM_BAR_ALPHA_MASK_TRANSITION ->
                QaBottomBarAlphaMaskTransitionFixture(
                    cartCount = cartCount,
                    initialSelectedId = initialSelectedId
                )
            QaVisualFixtureMode.BOTTOM_BAR_FINAL_GLASS_NO_CORE ->
                QaBottomBarSurfaceLayerFixture(
                    cartCount = cartCount,
                    initialSelectedId = initialSelectedId,
                    layer = CustomerBottomBarSurfaceLayer.FINAL_COMPOSITE
                )
            QaVisualFixtureMode.BOTTOM_BAR_GLASS_FILL_ONLY ->
                QaBottomBarSurfaceLayerFixture(
                    cartCount = cartCount,
                    initialSelectedId = initialSelectedId,
                    layer = CustomerBottomBarSurfaceLayer.GLASS_FILL_ONLY
                )
            QaVisualFixtureMode.BOTTOM_BAR_OUTER_STROKE_ONLY ->
                QaBottomBarSurfaceLayerFixture(
                    cartCount = cartCount,
                    initialSelectedId = initialSelectedId,
                    layer = CustomerBottomBarSurfaceLayer.OUTER_STROKE_ONLY
                )
            QaVisualFixtureMode.FONT_BAKEOFF -> QaFontBakeoffFixture()
        }
    }
}

private data class QaFontCandidate(
    val name: String,
    val family: FontFamily
)

@Composable
private fun QaFontBakeoffFixture() {
    val poppins = FontFamily(
        Font(R.font.poppins_regular, FontWeight.Normal),
        Font(R.font.poppins_medium, FontWeight.Medium),
        Font(R.font.poppins_semibold, FontWeight.SemiBold)
    )
    val lato = FontFamily(
        Font(R.font.lato_regular, FontWeight.Normal),
        Font(R.font.lato_medium, FontWeight.Medium),
        Font(R.font.lato_semibold, FontWeight.SemiBold)
    )
    val inter = FontFamily(
        Font(R.font.inter_static_regular, FontWeight.Normal),
        Font(R.font.inter_static_medium, FontWeight.Medium),
        Font(R.font.inter_static_semibold, FontWeight.SemiBold)
    )
    val roboto = FontFamily(
        Font(R.font.roboto_regular, FontWeight.Normal),
        Font(R.font.roboto_medium, FontWeight.Medium),
        Font(R.font.roboto_medium, FontWeight.SemiBold)
    )
    val manrope = FontFamily(
        Font(R.font.manrope_variable, FontWeight.Normal),
        Font(R.font.manrope_variable, FontWeight.Medium),
        Font(R.font.manrope_variable, FontWeight.SemiBold)
    )
    val candidates = listOf(
        QaFontCandidate("Platform Sans", FontFamily.SansSerif),
        QaFontCandidate("Poppins", poppins),
        QaFontCandidate("Inter", inter),
        QaFontCandidate("Roboto", roboto),
        QaFontCandidate("Lato", lato),
        QaFontCandidate("Manrope", manrope)
    )
    val labels = listOf(
        "Ana Sayfa",
        "Kategoriler",
        "Favoriler",
        "Sepetim",
        "Destek",
        "Hesabım"
    )

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.White)
            .padding(horizontal = 18.dp, vertical = 12.dp)
            .testTag("qa_font_bakeoff"),
        verticalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        candidates.forEachIndexed { index, candidate ->
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(if (index % 2 == 0) Color(0xFFF5F6F8) else Color.White)
                    .padding(vertical = 8.dp)
                    .testTag("qa_font_candidate_${candidate.name.lowercase().replace(' ', '_')}"),
                verticalArrangement = Arrangement.spacedBy(5.dp)
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(30.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = candidate.name,
                        modifier = Modifier.width(76.dp),
                        style = TextStyle(
                            fontFamily = FontFamily.SansSerif,
                            fontSize = 8.sp,
                            lineHeight = 10.sp,
                            fontWeight = FontWeight.Medium,
                            color = Color(0xFF6B7280)
                        )
                    )
                    Text(
                        text = "Siparişlerim",
                        style = TextStyle(
                            fontFamily = candidate.family,
                            fontSize = 16.85.sp,
                            lineHeight = 22.sp,
                            fontWeight = FontWeight.Medium,
                            color = CustomerColors.Navy
                        )
                    )
                    Text(
                        text = "Siparişlerim",
                        modifier = Modifier.padding(start = 20.dp),
                        style = TextStyle(
                            fontFamily = candidate.family,
                            fontSize = 16.85.sp,
                            lineHeight = 22.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = CustomerColors.Navy
                        )
                    )
                    Box(
                        modifier = Modifier
                            .padding(start = 20.dp)
                            .width(15.dp)
                            .height(15.dp)
                            .background(CustomerColors.Orange, androidx.compose.foundation.shape.CircleShape),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = "3",
                            style = TextStyle(
                                fontFamily = candidate.family,
                                fontSize = 8.5.sp,
                                lineHeight = 9.5.sp,
                                fontWeight = FontWeight.Normal,
                                color = Color.White
                            )
                        )
                    }
                }
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(22.dp),
                    horizontalArrangement = Arrangement.SpaceEvenly,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    labels.forEach { label ->
                        Box(
                            modifier = Modifier.weight(1f),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(
                                text = label,
                                style = TextStyle(
                                    fontFamily = candidate.family,
                                    fontSize = 7.6.sp,
                                    lineHeight = 9.sp,
                                    letterSpacing = 0.05.sp,
                                    fontWeight = FontWeight.Normal,
                                    color = CustomerColors.Navy
                                ),
                                maxLines = 1
                            )
                        }
                    }
                }
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(22.dp),
                    horizontalArrangement = Arrangement.SpaceEvenly,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    labels.forEach { label ->
                        Box(
                            modifier = Modifier.weight(1f),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(
                                text = label,
                                style = TextStyle(
                                    fontFamily = candidate.family,
                                    fontSize = 7.6.sp,
                                    lineHeight = 9.sp,
                                    letterSpacing = 0.05.sp,
                                    fontWeight = FontWeight.Medium,
                                    color = CustomerColors.Navy
                                ),
                                maxLines = 1
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun QaTopBarFixture() {
    val glassState = rememberCustomerGlassState()
    Box(
        modifier = Modifier
            .fillMaxSize()
            .testTag("qa_visual_top_fixture")
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .customerGlassSource(glassState, key = "qa_top_backdrop")
                .background(
                    Brush.linearGradient(
                        colorStops = arrayOf(
                            0f to Color(0xFFF5F5F5),
                            0.52f to Color(0xFFF5F4F4),
                            1f to Color(0xFFF5F4F3)
                        ),
                        start = Offset.Zero,
                        end = Offset.Infinite
                    )
                )
                .testTag("fixture_top_glass_backdrop")
        )
        CustomerTopBar(
            title = "Siparişlerim",
            onBack = {},
            glassState = glassState,
            modifier = Modifier
                .padding(horizontal = CustomerSpacing.ScreenHorizontal, vertical = CustomerSpacing.Sm)
                .testTag("fixture_top_bar")
        )
    }
}

@Composable
private fun QaBottomBarFixture(
    cartCount: Int,
    initialSelectedId: String,
    backdrop: QaBottomBackdrop
) {
    val glassState = rememberCustomerGlassState()
    val destinations = remember(cartCount) { qaBottomDestinations(cartCount) }
    val resolvedInitialId = initialSelectedId.takeIf { requested ->
        destinations.any { it.id == requested }
    } ?: "home"
    var selectedDestination by remember(resolvedInitialId) { mutableStateOf(resolvedInitialId) }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .testTag("qa_visual_bottom_fixture")
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .customerGlassSource(glassState, key = "qa_bottom_backdrop")
        ) {
            when (backdrop) {
                QaBottomBackdrop.MEASUREMENT -> QaGlassMeasurementBackdrop(
                    modifier = Modifier
                        .align(Alignment.BottomCenter)
                        .padding(bottom = 6.dp)
                )
                QaBottomBackdrop.SOURCE_PRODUCT -> QaSourceProductBackdrop(
                    modifier = Modifier.align(Alignment.BottomCenter)
                )
            }
        }
        CustomerBubbleBottomBar(
            destinations = destinations,
            selectedId = selectedDestination,
            onSelect = { selectedDestination = it.id },
            glassState = glassState,
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .padding(horizontal = CustomerSpacing.ScreenHorizontal, vertical = CustomerSpacing.Sm)
                .testTag("fixture_bottom_bar")
        )
    }
}

@Composable
private fun QaBottomBarAlphaMaskFixture(
    cartCount: Int,
    initialSelectedId: String
) {
    val destinations = remember(cartCount) { qaBottomDestinations(cartCount) }
    val selectedIndex = destinations.indexOfFirst { it.id == initialSelectedId }
        .takeIf { it >= 0 } ?: 0
    val selectedDestination = destinations[selectedIndex]
    val density = LocalDensity.current

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black)
            .testTag("qa_visual_bottom_alpha_mask_fixture")
    ) {
        BoxWithConstraints(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .padding(
                    horizontal = CustomerSpacing.ScreenHorizontal,
                    vertical = CustomerSpacing.Sm
                )
                .fillMaxWidth()
                .height(CustomerDimensions.BottomBarHeight)
        ) {
            val barWidthPx = with(density) { maxWidth.toPx() }
            val horizontalInsetPx = with(density) {
                CustomerDimensions.BottomBarHorizontalInset.toPx()
            }
            val horizontalOverflowPx = with(density) {
                CustomerDimensions.BottomBarSurfaceHorizontalOverflow.toPx()
            }
            val selectedCenterInBar = customerBottomBarSettledCenterX(
                selectedIndex = selectedIndex,
                itemCount = destinations.size,
                barWidthPx = barWidthPx,
                horizontalInsetPx = horizontalInsetPx
            ) + with(density) {
                selectedDestination.selectedBubbleOffsetX.toPx()
            }
            val surfaceWidth = maxWidth +
                (CustomerDimensions.BottomBarSurfaceHorizontalOverflow * 2f)
            val surfaceWidthPx = barWidthPx + (horizontalOverflowPx * 2f)
            val surfaceShape = CustomerBottomBarSurfaceShape(
                selectedCenterFraction =
                    (selectedCenterInBar + horizontalOverflowPx) / surfaceWidthPx,
                bulgeProgress = 1f
            )

            Box(
                modifier = Modifier
                    .requiredSize(
                        width = surfaceWidth,
                        height = CustomerDimensions.BottomBarSurfaceHeight
                    )
                    .align(Alignment.Center)
                    .background(Color.White, surfaceShape)
                    .testTag("fixture_bottom_bar_alpha_mask")
            )
        }
    }
}

/**
 * Debug-only decomposition of the exact production surface renderer.
 *
 * The selected circle remains a geometry operand inside
 * CustomerBottomBarSurfaceShape. All three channels call the same production
 * surface painter; no debug branch reconstructs a capsule or selected disk.
 */
@Composable
private fun QaBottomBarSurfaceLayerFixture(
    cartCount: Int,
    initialSelectedId: String,
    layer: CustomerBottomBarSurfaceLayer
) {
    val glassState = rememberCustomerGlassState()
    val destinations = remember(cartCount) { qaBottomDestinations(cartCount) }
    val selectedIndex = destinations.indexOfFirst { it.id == initialSelectedId }
        .takeIf { it >= 0 } ?: 0
    val selectedDestination = destinations[selectedIndex]
    val density = LocalDensity.current
    val layerName = when (layer) {
        CustomerBottomBarSurfaceLayer.FINAL_COMPOSITE -> "final_glass_no_core"
        CustomerBottomBarSurfaceLayer.GLASS_FILL_ONLY -> "glass_fill_only"
        CustomerBottomBarSurfaceLayer.OUTER_STROKE_ONLY -> "outer_stroke_only"
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(
                if (layer == CustomerBottomBarSurfaceLayer.OUTER_STROKE_ONLY) {
                    Color.Black
                } else {
                    CustomerColors.Page
                }
            )
            .testTag("qa_visual_bottom_${layerName}_fixture")
    ) {
        if (layer != CustomerBottomBarSurfaceLayer.OUTER_STROKE_ONLY) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .customerGlassSource(
                        glassState,
                        key = "qa_bottom_surface_layer_backdrop"
                    )
            ) {
                QaSeamInspectionBackdrop(
                    modifier = Modifier.align(Alignment.BottomCenter)
                )
            }
        }

        BoxWithConstraints(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .padding(
                    horizontal = CustomerSpacing.ScreenHorizontal,
                    vertical = CustomerSpacing.Sm
                )
                .fillMaxWidth()
                .height(CustomerDimensions.BottomBarHeight)
        ) {
            val barWidthPx = with(density) { maxWidth.toPx() }
            val horizontalInsetPx = with(density) {
                CustomerDimensions.BottomBarHorizontalInset.toPx()
            }
            val horizontalOverflowPx = with(density) {
                CustomerDimensions.BottomBarSurfaceHorizontalOverflow.toPx()
            }
            val selectedCenterInBar = customerBottomBarSettledCenterX(
                selectedIndex = selectedIndex,
                itemCount = destinations.size,
                barWidthPx = barWidthPx,
                horizontalInsetPx = horizontalInsetPx
            ) + with(density) {
                selectedDestination.selectedBubbleOffsetX.toPx()
            }
            val surfaceWidth = maxWidth +
                (CustomerDimensions.BottomBarSurfaceHorizontalOverflow * 2f)
            val surfaceWidthPx = barWidthPx + (horizontalOverflowPx * 2f)
            val surfaceShape = CustomerBottomBarSurfaceShape(
                selectedCenterFraction =
                    (selectedCenterInBar + horizontalOverflowPx) / surfaceWidthPx,
                bulgeProgress = 1f
            )

            CustomerBottomBarSurface(
                surfaceShape = surfaceShape,
                glassState = glassState,
                layer = layer,
                modifier = Modifier
                    .requiredSize(
                        width = surfaceWidth,
                        height = CustomerDimensions.BottomBarSurfaceHeight
                    )
                    .align(Alignment.Center)
                    .testTag("fixture_bottom_bar_$layerName")
            )
        }
    }
}

private enum class QaBottomMaskPrimitive {
    SELECTED_CIRCLE,
    SELECTED_CORE
}

/**
 * Debug-only measurement channel for the two primitives that are otherwise
 * consumed by the production bottom-bar composition.
 *
 * SELECTED_CIRCLE is the exact bulgeBounds circle returned by the production
 * geometry helper. SELECTED_CORE uses the same authoritative center and the
 * production dark-core diameter token. Neither branch is a production layer.
 */
@Composable
private fun QaBottomBarPrimitiveMaskFixture(
    cartCount: Int,
    initialSelectedId: String,
    primitive: QaBottomMaskPrimitive
) {
    val destinations = remember(cartCount) { qaBottomDestinations(cartCount) }
    val selectedIndex = destinations.indexOfFirst { it.id == initialSelectedId }
        .takeIf { it >= 0 } ?: 0
    val selectedDestination = destinations[selectedIndex]
    val density = LocalDensity.current
    val channelName = when (primitive) {
        QaBottomMaskPrimitive.SELECTED_CIRCLE -> "selected_circle"
        QaBottomMaskPrimitive.SELECTED_CORE -> "selected_core"
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black)
            .testTag("qa_visual_bottom_${channelName}_mask_fixture")
    ) {
        BoxWithConstraints(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .padding(
                    horizontal = CustomerSpacing.ScreenHorizontal,
                    vertical = CustomerSpacing.Sm
                )
                .fillMaxWidth()
                .height(CustomerDimensions.BottomBarHeight)
        ) {
            val barWidthPx = with(density) { maxWidth.toPx() }
            val horizontalInsetPx = with(density) {
                CustomerDimensions.BottomBarHorizontalInset.toPx()
            }
            val horizontalOverflowPx = with(density) {
                CustomerDimensions.BottomBarSurfaceHorizontalOverflow.toPx()
            }
            val selectedCenterInBar = customerBottomBarSettledCenterX(
                selectedIndex = selectedIndex,
                itemCount = destinations.size,
                barWidthPx = barWidthPx,
                horizontalInsetPx = horizontalInsetPx
            ) + with(density) {
                selectedDestination.selectedBubbleOffsetX.toPx()
            }
            val surfaceWidth = maxWidth +
                (CustomerDimensions.BottomBarSurfaceHorizontalOverflow * 2f)
            val surfaceWidthPx = barWidthPx + (horizontalOverflowPx * 2f)
            val surfaceHeightPx = with(density) {
                CustomerDimensions.BottomBarSurfaceHeight.toPx()
            }
            val geometry = customerBottomBarSurfaceGeometry(
                size = Size(surfaceWidthPx, surfaceHeightPx),
                density = density,
                selectedCenterFraction =
                    (selectedCenterInBar + horizontalOverflowPx) / surfaceWidthPx,
                bulgeProgress = 1f
            )
            val selectedCircleBounds = requireNotNull(geometry.bulgeBounds)
            val primitiveRadius = when (primitive) {
                QaBottomMaskPrimitive.SELECTED_CIRCLE ->
                    selectedCircleBounds.width / 2f
                QaBottomMaskPrimitive.SELECTED_CORE -> with(density) {
                    CustomerDimensions.BottomBarSelectedBubble.toPx() / 2f
                }
            }

            Canvas(
                modifier = Modifier
                    .requiredSize(
                        width = surfaceWidth,
                        height = CustomerDimensions.BottomBarSurfaceHeight
                    )
                    .align(Alignment.Center)
                    .testTag("fixture_bottom_bar_${channelName}_mask")
            ) {
                drawCircle(
                    color = Color.White,
                    radius = primitiveRadius,
                    center = selectedCircleBounds.center
                )
            }
        }
    }
}

/**
 * Debug-only alpha-mask transition. It mirrors the production authoritative
 * selection, sequential 110 ms exit + 240 ms enter progress, and weighted item
 * centers, while drawing only the production surface Shape in white.
 *
 * Tap the Account hit target after launching with initialSelectedId=home to
 * capture a real Home-to-Account mask transition and its settled p100 frame.
 */
@Composable
private fun QaBottomBarAlphaMaskTransitionFixture(
    cartCount: Int,
    initialSelectedId: String
) {
    val destinations = remember(cartCount) { qaBottomDestinations(cartCount) }
    val resolvedInitialId = initialSelectedId.takeIf { requested ->
        destinations.any { it.id == requested }
    } ?: "home"
    var selectedId by remember(resolvedInitialId) { mutableStateOf(resolvedInitialId) }
    var displayedSelectedId by remember(resolvedInitialId) {
        mutableStateOf(resolvedInitialId)
    }
    val bubbleProgress = remember(resolvedInitialId) { Animatable(1f) }
    val motion = CustomerMotion.resolve(reduceMotion = false)

    LaunchedEffect(selectedId, motion) {
        if (selectedId != displayedSelectedId) {
            bubbleProgress.animateTo(
                targetValue = 0f,
                animationSpec = tween(
                    durationMillis = motion.bubbleExitMillis,
                    easing = motion.easing
                )
            )
            displayedSelectedId = selectedId
            bubbleProgress.snapTo(0f)
            bubbleProgress.animateTo(
                targetValue = 1f,
                animationSpec = tween(
                    durationMillis = motion.bubbleEnterMillis,
                    easing = motion.easing
                )
            )
        } else if (bubbleProgress.value < 1f) {
            bubbleProgress.animateTo(
                targetValue = 1f,
                animationSpec = tween(
                    durationMillis = motion.bubbleEnterMillis,
                    easing = motion.easing
                )
            )
        }
    }

    val density = LocalDensity.current
    var barOriginXInRoot by remember { mutableStateOf(0f) }
    val itemCenters = remember { mutableStateMapOf<String, Float>() }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black)
            .testTag("qa_visual_bottom_alpha_mask_transition_fixture")
    ) {
        BoxWithConstraints(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .padding(
                    horizontal = CustomerSpacing.ScreenHorizontal,
                    vertical = CustomerSpacing.Sm
                )
                .fillMaxWidth()
                .height(CustomerDimensions.BottomBarHeight)
                .onGloballyPositioned { coordinates ->
                    val origin = coordinates.positionInRoot().x
                    if (abs(barOriginXInRoot - origin) > 0.25f) {
                        barOriginXInRoot = origin
                    }
                }
        ) {
            val displayedDestination =
                destinations.first { it.id == displayedSelectedId }
            val displayedIndex = destinations.indexOf(displayedDestination)
            val barWidthPx = with(density) { maxWidth.toPx() }
            val horizontalInsetPx = with(density) {
                CustomerDimensions.BottomBarHorizontalInset.toPx()
            }
            val horizontalOverflowPx = with(density) {
                CustomerDimensions.BottomBarSurfaceHorizontalOverflow.toPx()
            }
            val selectedOffsetXPx = with(density) {
                displayedDestination.selectedBubbleOffsetX.toPx()
            }
            val fallbackCenter = customerBottomBarSettledCenterX(
                selectedIndex = displayedIndex,
                itemCount = destinations.size,
                barWidthPx = barWidthPx,
                horizontalInsetPx = horizontalInsetPx
            )
            val selectedCenterInBar =
                (itemCenters[displayedSelectedId] ?: fallbackCenter) + selectedOffsetXPx
            val surfaceWidth = maxWidth +
                (CustomerDimensions.BottomBarSurfaceHorizontalOverflow * 2f)
            val surfaceWidthPx = barWidthPx + (horizontalOverflowPx * 2f)
            val surfaceShape = CustomerBottomBarSurfaceShape(
                selectedCenterFraction =
                    (selectedCenterInBar + horizontalOverflowPx) / surfaceWidthPx,
                bulgeProgress = bubbleProgress.value
            )

            Box(
                modifier = Modifier
                    .requiredSize(
                        width = surfaceWidth,
                        height = CustomerDimensions.BottomBarSurfaceHeight
                    )
                    .align(Alignment.Center)
                    .background(Color.White, surfaceShape)
                    .testTag("fixture_bottom_bar_alpha_mask_transition")
            )

            Row(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(horizontal = CustomerDimensions.BottomBarHorizontalInset),
                horizontalArrangement = Arrangement.SpaceEvenly,
                verticalAlignment = Alignment.CenterVertically
            ) {
                destinations.forEach { destination ->
                    val isSelected = destination.id == selectedId
                    val interactionSource = remember(destination.id) {
                        MutableInteractionSource()
                    }
                    val itemWeight by animateFloatAsState(
                        targetValue = if (isSelected) 1.2f else 1f,
                        animationSpec = tween(
                            durationMillis = motion.standardMillis,
                            easing = motion.easing
                        ),
                        label = "qa-bottom-mask-weight-${destination.id}"
                    )
                    Box(
                        modifier = Modifier
                            .weight(itemWeight)
                            .fillMaxHeight()
                            .onGloballyPositioned { coordinates ->
                                val center =
                                    coordinates.positionInRoot().x -
                                        barOriginXInRoot +
                                        (coordinates.size.width / 2f)
                                val previous = itemCenters[destination.id]
                                if (previous == null || abs(previous - center) > 0.25f) {
                                    itemCenters[destination.id] = center
                                }
                            }
                            .testTag("qa_bottom_mask_transition_item_${destination.id}")
                            .clickable(
                                interactionSource = interactionSource,
                                indication = null,
                                onClick = { selectedId = destination.id }
                            )
                    )
                }
            }
        }
    }
}

private enum class QaBottomBackdrop {
    MEASUREMENT,
    SOURCE_PRODUCT
}

@Composable
private fun QaSourceProductBackdrop(modifier: Modifier = Modifier) {
    Box(
        modifier = modifier
            .fillMaxWidth()
            .height(132.dp)
            .testTag("fixture_source_product_backdrop")
    ) {
        Image(
            painter = painterResource(R.drawable.qa_home_product_backdrop_source),
            contentDescription = null,
            modifier = Modifier.fillMaxSize(),
            alignment = Alignment.BottomCenter,
            contentScale = ContentScale.FillWidth
        )
        // This is only the unobscured 46 px product-ground strip above the
        // source component, not any source UI. At the locked 420 dpi proof
        // density it lands at y=0..45 of the 1080x250 comparison crop with no
        // scaling, so pixels outside the component share one exact bitmap.
        Image(
            painter = painterResource(
                R.drawable.qa_home_product_backdrop_source_visible_strip
            ),
            contentDescription = null,
            modifier = Modifier
                .fillMaxWidth()
                .height(17.5238.dp)
                .align(Alignment.BottomCenter)
                .offset(y = (-77.7143).dp),
            alignment = Alignment.Center,
            contentScale = ContentScale.FillBounds
        )
    }
}

@Composable
private fun QaGlassMeasurementBackdrop(modifier: Modifier = Modifier) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .height(132.dp)
            .testTag("fixture_glass_measurement_backdrop"),
        verticalArrangement = Arrangement.Bottom
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .height(66.dp)
        ) {
            listOf(
                CustomerColors.NavyDeep,
                CustomerColors.Page,
                CustomerColors.Orange,
                CustomerColors.SurfaceMuted,
                CustomerColors.NavySoft,
                CustomerColors.Surface
            ).forEach { color ->
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxHeight()
                        .background(color)
                )
            }
        }
    }
}

@Composable
private fun QaSeamInspectionBackdrop(modifier: Modifier = Modifier) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .height(132.dp)
            .testTag("fixture_seam_inspection_backdrop")
    ) {
        listOf(
            CustomerColors.NavyDeep,
            CustomerColors.Page,
            CustomerColors.Orange,
            CustomerColors.SurfaceMuted,
            CustomerColors.NavySoft,
            CustomerColors.Surface
        ).forEach { color ->
            Box(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxHeight()
                    .background(color)
            )
        }
    }
}

internal fun qaBottomDestinations(cartCount: Int) = customerBottomDestinations(cartCount)
