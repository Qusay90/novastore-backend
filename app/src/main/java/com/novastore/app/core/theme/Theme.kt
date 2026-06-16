package com.novastore.app.core.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

// ── NovaStore Brand Colors ──────────────────────────────────────────────────────

val NavyDark = Color(0xFF0F2A43)
val NavyMid = Color(0xFF1E4E79)
val NavyLight = Color(0xFF2A6BA6)
val Orange = Color(0xFFF7941D)
val OrangeLight = Color(0xFFFDB84B)
val BackgroundLight = Color(0xFFF5F7FA)
val SurfaceWhite = Color(0xFFFFFFFF)
val TextPrimary = Color(0xFF1A1A2E)
val TextSecondary = Color(0xFF6B7280)
val Success = Color(0xFF10B981)
val Error = Color(0xFFEF4444)
val DividerColor = Color(0xFFE5E7EB)

// Semantic tokens used by commerce screens.
val PrimaryOrange = Orange
val StoreBlue = NavyMid
val DiscountGreen = Success
val PageBackground = BackgroundLight
val CardBackground = SurfaceWhite
val BorderLight = DividerColor
val DisabledBackground = Color(0xFFEEF1F4)
val PaymentCardGradientStart = Color(0xFF06273E)
val PaymentCardGradientMid = Color(0xFF0D4B7A)
val PaymentCardGradientEnd = Color(0xFF123F3B)
val PaymentCardStripe = Color(0xFF06111D)
val PaymentCardPanel = Color(0xFFEFF4F7)

// ── Color Scheme ────────────────────────────────────────────────────────────────

private val NovaStoreColorScheme = lightColorScheme(
    primary = NavyDark,
    onPrimary = Color.White,
    primaryContainer = NavyMid,
    onPrimaryContainer = Color.White,
    secondary = Orange,
    onSecondary = Color.White,
    secondaryContainer = OrangeLight,
    onSecondaryContainer = NavyDark,
    background = BackgroundLight,
    onBackground = TextPrimary,
    surface = SurfaceWhite,
    onSurface = TextPrimary,
    surfaceVariant = Color(0xFFEEF1F6),
    onSurfaceVariant = TextSecondary,
    error = Error,
    onError = Color.White,
    outline = DividerColor
)

// ── Typography ──────────────────────────────────────────────────────────────────

private val NovaStoreTypography = Typography(
    headlineLarge = TextStyle(
        fontWeight = FontWeight.Bold,
        fontSize = 28.sp,
        lineHeight = 34.sp
    ),
    headlineMedium = TextStyle(
        fontWeight = FontWeight.Bold,
        fontSize = 22.sp,
        lineHeight = 28.sp
    ),
    titleLarge = TextStyle(
        fontWeight = FontWeight.SemiBold,
        fontSize = 18.sp,
        lineHeight = 24.sp
    ),
    titleMedium = TextStyle(
        fontWeight = FontWeight.SemiBold,
        fontSize = 16.sp,
        lineHeight = 22.sp
    ),
    bodyLarge = TextStyle(
        fontWeight = FontWeight.Normal,
        fontSize = 16.sp,
        lineHeight = 24.sp
    ),
    bodyMedium = TextStyle(
        fontWeight = FontWeight.Normal,
        fontSize = 14.sp,
        lineHeight = 20.sp
    ),
    bodySmall = TextStyle(
        fontWeight = FontWeight.Normal,
        fontSize = 12.sp,
        lineHeight = 16.sp
    ),
    labelLarge = TextStyle(
        fontWeight = FontWeight.SemiBold,
        fontSize = 14.sp,
        lineHeight = 20.sp
    ),
    labelMedium = TextStyle(
        fontWeight = FontWeight.Medium,
        fontSize = 12.sp,
        lineHeight = 16.sp
    )
)

// ── Theme ───────────────────────────────────────────────────────────────────────

@Composable
fun NovaStoreTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = NovaStoreColorScheme,
        typography = NovaStoreTypography,
        content = content
    )
}
