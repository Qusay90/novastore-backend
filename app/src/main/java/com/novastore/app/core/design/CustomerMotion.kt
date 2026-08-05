package com.novastore.app.core.design

import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.Easing

data class CustomerMotionSpec(
    val quickMillis: Int,
    val standardMillis: Int,
    val emphasizedMillis: Int,
    val bubbleExitMillis: Int,
    val bubbleEnterMillis: Int,
    val easing: Easing
)

enum class CustomerBubbleMotionPhase {
    EXITING_OLD,
    ENTERING_NEW
}

data class CustomerBubbleMotionFrame(
    val elapsedMillis: Float,
    val phase: CustomerBubbleMotionPhase,
    val scale: Float,
    val alpha: Float
)

object CustomerMotion {
    private val StandardEasing = CubicBezierEasing(0.2f, 0f, 0f, 1f)

    val Standard = CustomerMotionSpec(
        quickMillis = 120,
        standardMillis = 220,
        emphasizedMillis = 320,
        bubbleExitMillis = 110,
        bubbleEnterMillis = 240,
        easing = StandardEasing
    )

    val Reduced = CustomerMotionSpec(
        quickMillis = 60,
        standardMillis = 90,
        emphasizedMillis = 120,
        bubbleExitMillis = 45,
        bubbleEnterMillis = 75,
        easing = StandardEasing
    )

    fun resolve(reduceMotion: Boolean): CustomerMotionSpec =
        if (reduceMotion) Reduced else Standard

    /**
     * Deterministic telemetry for the single-bubble transition used by the
     * debug proof. Exit and enter are sequential, so two selected bubbles can
     * never be visible in the same frame.
     */
    fun sampleBubbleTransition(
        fraction: Float,
        reduceMotion: Boolean = false
    ): CustomerBubbleMotionFrame {
        val motion = resolve(reduceMotion)
        val clampedFraction = fraction.coerceIn(0f, 1f)
        val totalMillis = motion.bubbleExitMillis + motion.bubbleEnterMillis
        val elapsedMillis = clampedFraction * totalMillis

        return if (elapsedMillis <= motion.bubbleExitMillis) {
            val phaseFraction = if (motion.bubbleExitMillis == 0) {
                1f
            } else {
                elapsedMillis / motion.bubbleExitMillis
            }
            val progress = 1f - motion.easing.transform(phaseFraction)
            CustomerBubbleMotionFrame(
                elapsedMillis = elapsedMillis,
                phase = CustomerBubbleMotionPhase.EXITING_OLD,
                scale = 0.82f + (0.18f * progress),
                alpha = progress
            )
        } else {
            val phaseFraction = if (motion.bubbleEnterMillis == 0) {
                1f
            } else {
                (elapsedMillis - motion.bubbleExitMillis) / motion.bubbleEnterMillis
            }
            val progress = motion.easing.transform(phaseFraction)
            CustomerBubbleMotionFrame(
                elapsedMillis = elapsedMillis,
                phase = CustomerBubbleMotionPhase.ENTERING_NEW,
                scale = 0.78f + (0.22f * progress),
                alpha = progress
            )
        }
    }
}
