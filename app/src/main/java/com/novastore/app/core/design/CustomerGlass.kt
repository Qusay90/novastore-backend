package com.novastore.app.core.design

import androidx.compose.foundation.background
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Stable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.BlurredEdgeTreatment
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import dev.chrisbanes.haze.HazeInputScale
import dev.chrisbanes.haze.HazeState
import dev.chrisbanes.haze.blur.HazeColorEffect
import dev.chrisbanes.haze.blur.blurEffect
import dev.chrisbanes.haze.hazeEffect
import dev.chrisbanes.haze.hazeSource
import dev.chrisbanes.haze.rememberHazeState

/**
 * NovaStore-owned wrapper around the live backdrop capture used by the shared
 * customer chrome. Callers mark real screen content with [customerGlassSource]
 * and pass the same state to the top or bottom bar.
 */
@Stable
class CustomerGlassState internal constructor(
    internal val hazeState: HazeState
)

@Composable
fun rememberCustomerGlassState(): CustomerGlassState {
    val hazeState = rememberHazeState()
    return remember(hazeState) { CustomerGlassState(hazeState) }
}

fun Modifier.customerGlassSource(
    state: CustomerGlassState,
    key: Any? = null
): Modifier = hazeSource(
    state = state.hazeState,
    key = key
)

internal enum class CustomerGlassTreatment {
    TOP_BAR,
    BOTTOM_BAR
}

internal fun Modifier.customerGlassEffect(
    state: CustomerGlassState?,
    shape: Shape,
    treatment: CustomerGlassTreatment
): Modifier {
    val coolWarmTint = Brush.horizontalGradient(
        colorStops = arrayOf(
            0f to CustomerColors.GlassCool.copy(alpha = 0.08f),
            0.48f to Color.White.copy(alpha = 0.05f),
            1f to CustomerColors.GlassWarm.copy(alpha = 0.06f)
        )
    )
    val milkyOverlay = when (treatment) {
        CustomerGlassTreatment.TOP_BAR -> Brush.verticalGradient(
            colorStops = arrayOf(
                0f to Color(0xFFFDF9F6).copy(alpha = if (state == null) 0.92f else 0.60f),
                0.50f to Color(0xFFFDF9F8).copy(alpha = if (state == null) 0.92f else 0.70f),
                1f to Color(0xFFFCFAF9).copy(alpha = if (state == null) 0.94f else 0.72f)
            )
        )
        CustomerGlassTreatment.BOTTOM_BAR -> Brush.verticalGradient(
            colorStops = arrayOf(
                0f to Color.White.copy(alpha = if (state == null) 0.90f else 0.30f),
                0.46f to Color.White.copy(alpha = if (state == null) 0.88f else 0.52f),
                1f to Color.White.copy(alpha = if (state == null) 0.94f else 0.82f)
            )
        )
    }

    return if (state == null) {
        background(milkyOverlay)
    } else {
        hazeEffect(state = state.hazeState) {
            inputScale = HazeInputScale.None
            expandLayerBounds = true
            forceInvalidateOnPreDraw = true
            blurEffect {
                blurRadius = CustomerDimensions.GlassBlurRadius
                backgroundColor = CustomerColors.GlassBackdrop
                colorEffects = listOf(
                    HazeColorEffect.tint(coolWarmTint),
                    HazeColorEffect.tint(milkyOverlay)
                )
                fallbackTint = HazeColorEffect.tint(CustomerColors.GlassFallback)
                noiseFactor = CustomerOpacity.GlassNoise
                blurredEdgeTreatment = BlurredEdgeTreatment(shape)
            }
        }
    }
}
