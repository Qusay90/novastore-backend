package com.novastore.app.core.ui.components

import androidx.annotation.DrawableRes
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.border
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.requiredSize
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.sizeIn
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
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
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.RoundRect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.dropShadow
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.draw.BlurredEdgeTreatment
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Outline
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.Shadow as TextShadow
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.graphics.shadow.Shadow
import androidx.compose.ui.layout.LayoutCoordinates
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInRoot
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.DpOffset
import androidx.compose.ui.unit.LayoutDirection
import com.novastore.app.core.design.CustomerColors
import com.novastore.app.core.design.CustomerComponentTypography
import com.novastore.app.core.design.CustomerDimensions
import com.novastore.app.core.design.CustomerGlassState
import com.novastore.app.core.design.CustomerGlassTreatment
import com.novastore.app.core.design.CustomerIconography
import com.novastore.app.core.design.CustomerMotion
import com.novastore.app.core.design.CustomerOpacity
import com.novastore.app.core.design.CustomerRadii
import com.novastore.app.core.design.CustomerSpacing
import com.novastore.app.core.design.customerGlassEffect
import kotlin.math.abs
import kotlin.math.ceil
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sqrt

@Composable
fun CustomerTopBar(
    title: String,
    modifier: Modifier = Modifier,
    onBack: (() -> Unit)? = null,
    glassState: CustomerGlassState? = null,
    actions: @Composable RowScope.() -> Unit = {}
) {
    val shape = RoundedCornerShape(CustomerRadii.TopBar)
    Box(
        modifier = modifier
            .fillMaxWidth()
            .height(CustomerDimensions.TopBarHeight)
            .dropShadow(
                shape = shape,
                shadow = Shadow(
                    radius = 9.dp,
                    spread = (-1).dp,
                    color = CustomerColors.Navy.copy(alpha = 0.05f),
                    offset = DpOffset(x = 0.dp, y = 5.dp)
                )
            )
            .clip(shape)
            .customerGlassEffect(
                state = glassState,
                shape = shape,
                treatment = CustomerGlassTreatment.TOP_BAR
            )
            .border(1.dp, CustomerColors.GlassStroke, shape)
            .drawWithCache {
                onDrawBehind {
                    drawLine(
                        color = CustomerColors.GlassInnerHighlight,
                        start = Offset(size.width * 0.06f, 1.dp.toPx()),
                        end = Offset(size.width * 0.94f, 1.dp.toPx()),
                        strokeWidth = 1.dp.toPx()
                    )
                }
            }
    ) {
        if (onBack != null) {
            IconButton(
                onClick = onBack,
                modifier = Modifier.align(Alignment.CenterStart)
            ) {
                Icon(
                    painter = painterResource(CustomerIconography.Back),
                    contentDescription = "Geri",
                    // The source caret's visible height is two pixels taller at
                    // the controlled 1080 px density while its width is equal.
                    // Keep the source-bound path and compensate optically.
                    modifier = Modifier
                        .offset(
                            x = CustomerDimensions.TopBarBackOffsetX,
                            y = CustomerDimensions.TopBarBackOffsetY
                        )
                        .size(CustomerDimensions.TopBarIcon),
                    tint = CustomerColors.Navy
                )
            }
        }
        Text(
            text = title,
            modifier = Modifier
                .align(Alignment.Center)
                .offset(x = (-0.4).dp)
                .padding(horizontal = 56.dp),
            style = CustomerComponentTypography.TopBarTitle,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )
        Row(
            modifier = Modifier
                .align(Alignment.CenterEnd)
                .padding(end = CustomerSpacing.Xxs),
            verticalAlignment = Alignment.CenterVertically,
            content = actions
        )
    }
}

data class CustomerBottomDestination(
    val id: String,
    val label: String,
    @param:DrawableRes val selectedIcon: Int,
    @param:DrawableRes val unselectedIcon: Int,
    val badgeCount: Int = 0,
    val unselectedIconScaleX: Float = 1f,
    val unselectedIconScaleY: Float = 1f,
    val unselectedIconOffsetX: Dp = 0.dp,
    val unselectedIconOffsetY: Dp = 0.dp,
    val unselectedLabelScaleX: Float = 1f,
    val unselectedLabelOffsetX: Dp = 0.dp,
    val unselectedLabelOffsetY: Dp = 0.dp,
    val selectedBubbleOffsetX: Dp = 0.dp,
    val selectedIconScaleX: Float = 1f,
    val selectedIconScaleY: Float = 1f,
    val selectedIconOffsetX: Dp = 0.dp,
    val selectedIconOffsetY: Dp = 0.dp,
    val selectedIndicatorOffsetY: Dp = 0.dp,
    val selectedLabelOffsetY: Dp = 0.dp
)

/**
 * Canonical six-item customer navigation configuration.
 *
 * Keeping the production shell and the visual QA fixture on this single
 * source preserves the accepted icon paths and the source-measured optical
 * offsets from Tur 1.
 */
fun customerBottomDestinations(cartCount: Int) = listOf(
    CustomerBottomDestination(
        "home",
        "Ana Sayfa",
        CustomerIconography.HomeSelected,
        CustomerIconography.Home,
        selectedBubbleOffsetX = (-2.37).dp
    ),
    CustomerBottomDestination(
        "categories",
        "Kategoriler",
        CustomerIconography.CategoriesSelected,
        CustomerIconography.Categories,
        unselectedIconScaleX = 1.07f,
        unselectedIconScaleY = 1.07f,
        unselectedIconOffsetX = 0.38.dp,
        unselectedIconOffsetY = 0.38.dp,
        unselectedLabelOffsetX = 0.38.dp
    ),
    CustomerBottomDestination(
        "favorites",
        "Favoriler",
        CustomerIconography.FavoritesSelected,
        CustomerIconography.Favorites,
        unselectedIconScaleX = 0.914f,
        unselectedIconScaleY = 0.914f,
        unselectedIconOffsetX = 0.76.dp,
        unselectedIconOffsetY = 0.76.dp,
        unselectedLabelScaleX = 0.96f,
        unselectedLabelOffsetX = 1.14.dp
    ),
    CustomerBottomDestination(
        "cart",
        "Sepetim",
        CustomerIconography.CartSelected,
        CustomerIconography.Cart,
        cartCount,
        unselectedIconScaleX = 0.80f,
        unselectedIconScaleY = 1f,
        unselectedIconOffsetX = 1.5.dp,
        unselectedIconOffsetY = 1.51.dp,
        unselectedLabelScaleX = 0.986f,
        unselectedLabelOffsetX = 1.9.dp
    ),
    CustomerBottomDestination(
        "support",
        "Destek",
        CustomerIconography.SupportSelected,
        CustomerIconography.Support,
        unselectedIconOffsetX = 1.5.dp,
        unselectedIconOffsetY = 1.14.dp,
        unselectedLabelScaleX = 0.983f,
        unselectedLabelOffsetX = 1.33.dp
    ),
    CustomerBottomDestination(
        "account",
        "Hesabım",
        CustomerIconography.AccountSelected,
        CustomerIconography.Account,
        unselectedIconScaleX = 0.948f,
        unselectedIconScaleY = 0.948f,
        unselectedIconOffsetX = 1.5.dp,
        unselectedIconOffsetY = 0.76.dp,
        unselectedLabelScaleX = 0.986f,
        unselectedLabelOffsetX = 1.9.dp,
        selectedBubbleOffsetX = 5.dp,
        selectedIconScaleX = 1.1f,
        selectedIconOffsetY = (-1.36).dp,
        selectedIndicatorOffsetY = 1.34.dp,
        selectedLabelOffsetY = (-1.36).dp
    )
)

private const val CustomerBottomSelectedWeight = 1.2f
internal fun customerBottomBarSettledCenterX(
    selectedIndex: Int,
    itemCount: Int,
    barWidthPx: Float,
    horizontalInsetPx: Float
): Float {
    require(itemCount > 0) { "Customer bottom navigation must contain at least one destination" }
    val boundedIndex = selectedIndex.coerceIn(0, itemCount - 1)
    val contentWidth = (barWidthPx - (horizontalInsetPx * 2f)).coerceAtLeast(0f)
    val totalWeight = (itemCount - 1) + CustomerBottomSelectedWeight
    val selectedCenterWeight = boundedIndex + (CustomerBottomSelectedWeight / 2f)
    return horizontalInsetPx + (contentWidth * selectedCenterWeight / totalWeight)
}

internal data class CustomerBottomBarSurfaceGeometry(
    val baseBounds: Rect,
    val baseRadius: Float,
    val bulgeBounds: Rect?
)

internal data class CustomerBottomBarSurfaceVerticalInterval(
    val top: Float,
    val bottom: Float
)

internal fun customerBottomBarSurfaceGeometry(
    size: Size,
    density: Density,
    selectedCenterFraction: Float,
    bulgeProgress: Float
): CustomerBottomBarSurfaceGeometry {
    val progress = bulgeProgress.coerceIn(0f, 1f)
    val baseHeight = with(density) { CustomerDimensions.BottomBarBaseHeight.toPx() }
    val horizontalOverflow = with(density) {
        CustomerDimensions.BottomBarSurfaceHorizontalOverflow.toPx()
    }
    val baseTop = (size.height - baseHeight) / 2f
    val baseRadius = baseHeight / 2f
    val baseBounds = Rect(
        left = horizontalOverflow,
        top = baseTop,
        right = size.width - horizontalOverflow,
        bottom = baseTop + baseHeight
    )
    if (progress <= 0f) {
        return CustomerBottomBarSurfaceGeometry(
            baseBounds = baseBounds,
            baseRadius = baseRadius,
            bulgeBounds = null
        )
    }

    val targetRadius = with(density) {
        CustomerDimensions.BottomBarSelectedBulgeDiameter.toPx() / 2f
    }
    val radius = baseRadius + ((targetRadius - baseRadius) * progress)
    val center = Offset(
        x = size.width * selectedCenterFraction.coerceIn(0f, 1f),
        y = baseBounds.center.y
    )
    return CustomerBottomBarSurfaceGeometry(
        baseBounds = baseBounds,
        baseRadius = baseRadius,
        bulgeBounds = Rect(
            left = center.x - radius,
            top = center.y - radius,
            right = center.x + radius,
            bottom = center.y + radius
        )
    )
}

private fun capsuleVerticalInterval(
    bounds: Rect,
    radius: Float,
    x: Float
): CustomerBottomBarSurfaceVerticalInterval? {
    if (x < bounds.left - 0.5f || x > bounds.right + 0.5f) return null
    val safeX = x.coerceIn(bounds.left, bounds.right)
    val centerY = bounds.center.y
    val leftCenterX = bounds.left + radius
    val rightCenterX = bounds.right - radius
    val verticalRadius = when {
        safeX < leftCenterX -> sqrt(
            max(
                0f,
                (radius * radius) -
                    ((safeX - leftCenterX) * (safeX - leftCenterX))
            )
        )
        safeX > rightCenterX -> sqrt(
            max(
                0f,
                (radius * radius) -
                    ((safeX - rightCenterX) * (safeX - rightCenterX))
            )
        )
        else -> radius
    }
    return CustomerBottomBarSurfaceVerticalInterval(
        top = centerY - verticalRadius,
        bottom = centerY + verticalRadius
    )
}

private fun circleVerticalInterval(
    bounds: Rect,
    x: Float
): CustomerBottomBarSurfaceVerticalInterval? {
    if (x < bounds.left - 0.5f || x > bounds.right + 0.5f) return null
    val safeX = x.coerceIn(bounds.left, bounds.right)
    val radius = bounds.width / 2f
    if (radius <= 0f || abs(bounds.width - bounds.height) > 0.01f) return null
    val normalizedX = (safeX - bounds.center.x) / radius
    val verticalExtent = radius *
        sqrt(max(0f, 1f - (normalizedX * normalizedX)))
    return CustomerBottomBarSurfaceVerticalInterval(
        top = bounds.center.y - verticalExtent,
        bottom = bounds.center.y + verticalExtent
    )
}

internal fun customerBottomBarSmoothMaximum(
    first: Float,
    second: Float,
    blendRadius: Float
): Float {
    if (blendRadius <= 0f) return max(first, second)
    val distance = abs(first - second)
    if (distance >= blendRadius) return max(first, second)
    val blend = (blendRadius - distance) / blendRadius
    return max(first, second) + ((blend * blend * blendRadius) / 4f)
}

internal fun customerBottomBarSmoothMinimum(
    first: Float,
    second: Float,
    blendRadius: Float
): Float = -customerBottomBarSmoothMaximum(
    first = -first,
    second = -second,
    blendRadius = blendRadius
)

internal fun customerBottomBarSurfaceVerticalInterval(
    geometry: CustomerBottomBarSurfaceGeometry,
    x: Float,
    blendRadius: Float
): CustomerBottomBarSurfaceVerticalInterval? {
    val base = capsuleVerticalInterval(
        bounds = geometry.baseBounds,
        radius = geometry.baseRadius,
        x = x
    )
    val selectedCircle = geometry.bulgeBounds?.let {
        circleVerticalInterval(it, x)
    }
    if (base == null) return selectedCircle
    if (selectedCircle == null) return base
    return CustomerBottomBarSurfaceVerticalInterval(
        top = customerBottomBarSmoothMinimum(
            first = base.top,
            second = selectedCircle.top,
            blendRadius = blendRadius
        ),
        bottom = customerBottomBarSmoothMaximum(
            first = base.bottom,
            second = selectedCircle.bottom,
            blendRadius = blendRadius
        )
    )
}

/**
 * One authoritative mask for the bottom bar body and the selected-item bulge.
 *
 * The selected circle is a real, centered geometric operand only: it never
 * draws a separate disk, lens, fill, halo, or stroke. Its capsule intersections
 * receive the same narrow smooth-union fillet above and below so the one outer
 * silhouette stays radial, symmetric and free of hard Boolean shoulders.
 */
internal data class CustomerBottomBarSurfaceShape(
    val selectedCenterFraction: Float,
    val bulgeProgress: Float
) : Shape {
    override fun createOutline(
        size: Size,
        layoutDirection: LayoutDirection,
        density: Density
    ): Outline {
        val geometry = customerBottomBarSurfaceGeometry(
            size = size,
            density = density,
            selectedCenterFraction = selectedCenterFraction,
            bulgeProgress = bulgeProgress
        )
        val basePath = Path().apply {
            addRoundRect(
                RoundRect(
                    rect = geometry.baseBounds,
                    cornerRadius = CornerRadius(geometry.baseRadius, geometry.baseRadius)
                )
            )
        }

        val selectedCircleBounds = geometry.bulgeBounds
        if (selectedCircleBounds == null) {
            return Outline.Generic(basePath)
        }

        val contourLeft = min(geometry.baseBounds.left, selectedCircleBounds.left)
        val contourRight = max(geometry.baseBounds.right, selectedCircleBounds.right)
        val contourWidth = contourRight - contourLeft
        val segmentCount = ceil(contourWidth / 2f)
            .toInt()
            .coerceIn(96, 640)
        val topValues = FloatArray(segmentCount + 1)
        val bottomValues = FloatArray(segmentCount + 1)
        val blendRadius = with(density) {
            CustomerDimensions.BottomBarSelectedBulgeBlendRadius.toPx()
        } * bulgeProgress.coerceIn(0f, 1f)

        fun xAt(index: Int): Float = when (index) {
            0 -> contourLeft
            segmentCount -> contourRight
            else -> contourLeft + (contourWidth * index / segmentCount)
        }

        for (index in 0..segmentCount) {
            val interval = requireNotNull(
                customerBottomBarSurfaceVerticalInterval(
                    geometry = geometry,
                    x = xAt(index),
                    blendRadius = blendRadius
                )
            )
            topValues[index] = interval.top
            bottomValues[index] = interval.bottom
        }

        val contour = Path().apply {
            moveTo(contourLeft, topValues[0])
            for (index in 1..segmentCount) {
                lineTo(xAt(index), topValues[index])
            }
            for (index in segmentCount downTo 0) {
                lineTo(xAt(index), bottomValues[index])
            }
            close()
        }
        return Outline.Generic(contour)
    }
}

internal enum class CustomerBottomBarSurfaceLayer {
    FINAL_COMPOSITE,
    GLASS_FILL_ONLY,
    OUTER_STROKE_ONLY
}

private fun Modifier.customerBottomBarGlassMaterial(
    surfaceShape: Shape,
    glassState: CustomerGlassState?,
    includeOuterStroke: Boolean
): Modifier {
    val glassModifier = clip(surfaceShape)
        .customerGlassEffect(
            state = glassState,
            shape = surfaceShape,
            treatment = CustomerGlassTreatment.BOTTOM_BAR
        )
    val outlinedGlassModifier = if (includeOuterStroke) {
        glassModifier.border(1.dp, CustomerColors.GlassStroke, surfaceShape)
    } else {
        glassModifier
    }
    return outlinedGlassModifier.drawWithCache {
        val backdropTint = Brush.horizontalGradient(
            listOf(
                CustomerColors.Navy.copy(alpha = CustomerOpacity.GlassBackdropTint),
                Color.Transparent,
                CustomerColors.Orange.copy(alpha = CustomerOpacity.GlassBackdropTint * 0.55f)
            )
        )
        onDrawBehind {
            drawRect(backdropTint)
        }
    }
}

/**
 * Paints the bottom glass body from the same final union shape used by
 * production. Debug fixtures may isolate the production glass or outer-stroke
 * channels, but no branch draws the capsule or selected circle independently.
 */
@Composable
internal fun CustomerBottomBarSurface(
    surfaceShape: Shape,
    glassState: CustomerGlassState?,
    layer: CustomerBottomBarSurfaceLayer = CustomerBottomBarSurfaceLayer.FINAL_COMPOSITE,
    modifier: Modifier = Modifier
) {
    Box(modifier = modifier) {
        if (layer == CustomerBottomBarSurfaceLayer.FINAL_COMPOSITE) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .offset(y = 20.dp)
                    .blur(
                        radius = 16.dp,
                        edgeTreatment = BlurredEdgeTreatment.Unbounded
                    )
                    .background(
                        brush = Brush.verticalGradient(
                            colorStops = arrayOf(
                                0f to Color.Transparent,
                                0.18f to Color.White.copy(alpha = 0.45f),
                                0.48f to Color.White.copy(alpha = 0.82f),
                                1f to Color.White.copy(alpha = 0.96f)
                            )
                        ),
                        shape = surfaceShape
                    )
            )
        }

        val surfaceModifier = when (layer) {
            CustomerBottomBarSurfaceLayer.FINAL_COMPOSITE -> Modifier
                .fillMaxSize()
                .dropShadow(
                    shape = surfaceShape,
                    shadow = Shadow(
                        radius = 20.dp,
                        spread = 3.dp,
                        color = Color.White.copy(alpha = 0.72f),
                        offset = DpOffset(x = 0.dp, y = 18.dp)
                    )
                )
                .dropShadow(
                    shape = surfaceShape,
                    shadow = Shadow(
                        radius = 8.dp,
                        spread = (-1).dp,
                        color = CustomerColors.Navy.copy(alpha = 0.12f),
                        offset = DpOffset(x = 0.dp, y = 6.dp)
                    )
                )
                .customerBottomBarGlassMaterial(
                    surfaceShape = surfaceShape,
                    glassState = glassState,
                    includeOuterStroke = true
                )

            CustomerBottomBarSurfaceLayer.GLASS_FILL_ONLY -> Modifier
                .fillMaxSize()
                .customerBottomBarGlassMaterial(
                    surfaceShape = surfaceShape,
                    glassState = glassState,
                    includeOuterStroke = false
                )

            CustomerBottomBarSurfaceLayer.OUTER_STROKE_ONLY -> Modifier
                .fillMaxSize()
                .border(1.dp, CustomerColors.GlassStroke, surfaceShape)
        }
        Box(modifier = surfaceModifier)
    }
}

@Composable
fun CustomerBubbleBottomBar(
    destinations: List<CustomerBottomDestination>,
    selectedId: String,
    onSelect: (CustomerBottomDestination) -> Unit,
    modifier: Modifier = Modifier,
    reduceMotion: Boolean = false,
    glassState: CustomerGlassState? = null
) {
    require(destinations.size == 6) { "Customer bottom navigation must contain exactly six destinations" }
    val motion = CustomerMotion.resolve(reduceMotion)
    var displayedSelectedId by remember { mutableStateOf(selectedId) }
    var bubbleEntering by remember { mutableStateOf(true) }
    val bubbleProgress = remember { Animatable(1f) }

    LaunchedEffect(selectedId, motion) {
        if (selectedId != displayedSelectedId) {
            bubbleEntering = false
            bubbleProgress.animateTo(
                targetValue = 0f,
                animationSpec = tween(
                    durationMillis = motion.bubbleExitMillis,
                    easing = motion.easing
                )
            )
            displayedSelectedId = selectedId
            bubbleEntering = true
            bubbleProgress.snapTo(0f)
            bubbleProgress.animateTo(
                targetValue = 1f,
                animationSpec = tween(
                    durationMillis = motion.bubbleEnterMillis,
                    easing = motion.easing
                )
            )
        } else if (bubbleProgress.value < 1f) {
            bubbleEntering = true
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
    BoxWithConstraints(
        modifier = modifier
            .fillMaxWidth()
            .height(CustomerDimensions.BottomBarHeight)
            .onGloballyPositioned { coordinates ->
                val origin = coordinates.positionInRoot().x
                if (abs(barOriginXInRoot - origin) > 0.25f) {
                    barOriginXInRoot = origin
                }
            }
    ) {
        val displayedDestination = destinations.first { it.id == displayedSelectedId }
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
        CustomerBottomBarSurface(
            surfaceShape = surfaceShape,
            glassState = glassState,
            modifier = Modifier
                .requiredSize(
                    width = surfaceWidth,
                    height = CustomerDimensions.BottomBarSurfaceHeight
                )
                .align(Alignment.Center)
                .testTag("customer_bottom_surface")
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
                val interactionSource = remember(destination.id) { MutableInteractionSource() }
                val itemWeight by animateFloatAsState(
                    targetValue = if (isSelected) CustomerBottomSelectedWeight else 1f,
                    animationSpec = tween(motion.standardMillis, easing = motion.easing),
                    label = "customer-bottom-weight-${destination.id}"
                )
                Box(
                    modifier = Modifier
                        .weight(itemWeight)
                        .fillMaxHeight()
                        .sizeIn(minWidth = CustomerDimensions.MinimumTouchTarget)
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
                        .testTag("customer_bottom_item_${destination.id}")
                        .semantics {
                            selected = isSelected
                            role = Role.Tab
                        }
                        .clickable(
                            interactionSource = interactionSource,
                            indication = null,
                            onClick = { onSelect(destination) }
                        ),
                    contentAlignment = Alignment.Center
                ) {
                    if (destination.id == displayedSelectedId) {
                        val minimumScale = if (bubbleEntering) 0.78f else 0.82f
                        val bubbleScale =
                            minimumScale + ((1f - minimumScale) * bubbleProgress.value)
                        Box(
                            modifier = Modifier.graphicsLayer {
                                scaleX = bubbleScale
                                scaleY = bubbleScale
                                alpha = bubbleProgress.value
                            },
                            contentAlignment = Alignment.Center
                        ) {
                            CustomerSelectedBottomDestination(destination)
                        }
                    } else {
                        CustomerUnselectedBottomDestination(destination)
                    }
                }
            }
        }
    }
}

@Composable
private fun CustomerSelectedBottomDestination(destination: CustomerBottomDestination) {
    Box(
        modifier = Modifier
            .offset(
                x = destination.selectedBubbleOffsetX
            )
            .requiredSize(CustomerDimensions.BottomBarSelectedSlot)
            .testTag("customer_bottom_selected_${destination.id}"),
        contentAlignment = Alignment.Center
    ) {
        Box(
            modifier = Modifier
                .size(CustomerDimensions.BottomBarSelectedBubble)
                .testTag("customer_bottom_selected_core_${destination.id}")
                .dropShadow(
                    shape = CircleShape,
                    shadow = Shadow(
                        radius = 9.dp,
                        spread = (-1).dp,
                        color = CustomerColors.NavyDeep.copy(
                            alpha = CustomerOpacity.BubbleShadowAmbient
                        ),
                        offset = DpOffset(x = 0.dp, y = 3.dp)
                    )
                )
                .clip(CircleShape)
                .background(
                    brush = Brush.linearGradient(
                        colorStops = arrayOf(
                            0f to CustomerColors.BubbleHighlight,
                            0.22f to CustomerColors.BubbleMid,
                            0.72f to CustomerColors.BubbleMid,
                            1f to CustomerColors.BubbleDeep
                        ),
                        start = Offset.Zero,
                        end = Offset.Infinite
                    )
                )
                .border(
                    width = 1.dp,
                    brush = Brush.linearGradient(
                        colorStops = arrayOf(
                            0f to Color.White.copy(alpha = 0.62f),
                            0.34f to Color.White.copy(alpha = CustomerOpacity.BubbleRim),
                            1f to CustomerColors.NavyDeep.copy(alpha = 0.24f)
                        ),
                        start = Offset.Zero,
                        end = Offset.Infinite
                    ),
                    shape = CircleShape
                )
                .drawWithCache {
                    val glossCenter = Offset(size.width * 0.19f, size.height * 0.14f)
                    val glossRadius = size.width * 0.42f
                    val gloss = Brush.radialGradient(
                        colors = listOf(
                            Color.White.copy(alpha = CustomerOpacity.BubbleGloss),
                            Color.Transparent
                        ),
                        center = glossCenter,
                        radius = glossRadius
                    )
                    onDrawBehind {
                        scale(
                            scaleX = 1f,
                            scaleY = 0.58f,
                            pivot = glossCenter
                        ) {
                            drawCircle(
                                brush = gloss,
                                radius = glossRadius,
                                center = glossCenter
                            )
                        }
                    }
                }
        )
        Column(
            modifier = Modifier.offset(y = CustomerDimensions.BottomBarSelectedContentOffsetY),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            CustomerBottomIcon(destination, selected = true)
            Box(
                modifier = Modifier
                    .offset(y = destination.selectedIndicatorOffsetY)
                    .size(CustomerDimensions.BottomBarSelectedIndicator)
                    .dropShadow(
                        shape = CircleShape,
                        shadow = Shadow(
                            radius = 1.dp,
                            spread = 0.dp,
                            color = CustomerColors.Orange.copy(alpha = 0.45f),
                            offset = DpOffset(x = 0.dp, y = 0.5.dp)
                        )
                    )
                    .background(CustomerColors.Orange, CircleShape)
            )
            Spacer(Modifier.height(CustomerDimensions.BottomBarSelectedLabelGap))
            Text(
                text = destination.label,
                modifier = Modifier.offset(y = destination.selectedLabelOffsetY),
                style = CustomerComponentTypography.BottomBarLabel.copy(
                    shadow = TextShadow(
                        color = CustomerColors.NavyDeep.copy(alpha = 0.72f),
                        offset = Offset(x = 0f, y = 1f),
                        blurRadius = 1.4f
                    )
                ),
                color = Color.White,
                maxLines = 1
            )
        }
    }
}

@Composable
private fun CustomerUnselectedBottomDestination(destination: CustomerBottomDestination) {
    Column(
        modifier = Modifier.offset(y = CustomerDimensions.BottomBarUnselectedOffsetY),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        CustomerBottomIcon(destination, selected = false)
        Spacer(Modifier.height(CustomerDimensions.BottomBarUnselectedLabelGap))
        Text(
            text = destination.label,
            modifier = Modifier
                .offset(
                    x = destination.unselectedLabelOffsetX,
                    y = destination.unselectedLabelOffsetY
                )
                .graphicsLayer { scaleX = destination.unselectedLabelScaleX },
            style = CustomerComponentTypography.BottomBarLabel,
            color = CustomerColors.Navy,
            maxLines = 1
        )
    }
}

@Composable
private fun CustomerBottomIcon(destination: CustomerBottomDestination, selected: Boolean) {
    val iconSlotSize = if (selected) {
        CustomerDimensions.BottomBarSelectedIcon
    } else {
        CustomerDimensions.BottomBarIcon
    }
    val iconScaleX = if (selected) {
        destination.selectedIconScaleX
    } else {
        destination.unselectedIconScaleX
    }
    val iconScaleY = if (selected) {
        destination.selectedIconScaleY
    } else {
        destination.unselectedIconScaleY
    }
    Box(
        modifier = Modifier
            .size(iconSlotSize)
            .testTag("customer_bottom_icon_${destination.id}"),
        contentAlignment = Alignment.Center
    ) {
        val painter = painterResource(
            if (selected) destination.selectedIcon else destination.unselectedIcon
        )
        if (selected) {
            Icon(
                painter = painter,
                contentDescription = null,
                modifier = Modifier
                    .fillMaxSize()
                    .offset(
                        x = destination.selectedIconOffsetX,
                        y = destination.selectedIconOffsetY
                    )
                    .graphicsLayer {
                        scaleX = iconScaleX * 1.075f
                        scaleY = iconScaleY * 1.075f
                    }
                    .blur(
                        radius = 0.6.dp,
                        edgeTreatment = BlurredEdgeTreatment.Unbounded
                    ),
                tint = CustomerColors.NavyDeep.copy(alpha = 0.72f)
            )
        }
        Icon(
            painter = painter,
            contentDescription = destination.label,
            modifier = Modifier
                .fillMaxSize()
                .offset(
                    x = if (selected) {
                        destination.selectedIconOffsetX
                    } else {
                        destination.unselectedIconOffsetX
                    },
                    y = if (selected) {
                        destination.selectedIconOffsetY
                    } else {
                        destination.unselectedIconOffsetY
                    }
                )
                .graphicsLayer {
                    scaleX = iconScaleX
                    scaleY = iconScaleY
                },
            tint = if (selected) Color.White else CustomerColors.Navy
        )
        if (destination.badgeCount > 0) {
            val badgeText = if (destination.badgeCount > 99) "99+" else destination.badgeCount.toString()
            Box(
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .offset(
                        x = CustomerDimensions.BottomBarBadgeOffsetX,
                        y = CustomerDimensions.BottomBarBadgeOffsetY
                    )
                    .sizeIn(
                        minWidth = CustomerDimensions.BottomBarBadgeSize,
                        minHeight = CustomerDimensions.BottomBarBadgeSize
                    )
                    .testTag("customer_bottom_badge_${destination.id}")
                    .background(CustomerColors.Orange, CircleShape)
                    .padding(horizontal = 3.dp),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = badgeText,
                    color = Color.White,
                    style = CustomerComponentTypography.BottomBarBadge
                )
            }
        }
    }
}
