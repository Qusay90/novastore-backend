package com.novastore.app.core.design

import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.novastore.app.R

/**
 * Screenshot-bound tokens for the customer theme.
 *
 * The 80 supplied references use a light, near-white canvas, a deep blue ink
 * cluster (roughly #0D2A49..#19305D), and repeated orange action pixels in the
 * #FE5802..#FE6203 range. These values deliberately live beside the legacy
 * theme until a later tour performs the production cut-over.
 */
object CustomerColors {
    val Navy = Color(0xFF0F2C4E)
    val NavyDeep = Color(0xFF061E45)
    val NavySoft = Color(0xFF24466F)
    val BubbleMid = Color(0xFF18304F)
    val BubbleHighlight = Color(0xFF536A87)
    val BubbleDeep = Color(0xFF061846)

    val Orange = Color(0xFFFE5A02)
    val OrangeStrong = Color(0xFFFF6102)
    val OrangeSoft = Color(0xFFFFF1E8)

    val Page = Color(0xFFF8F8F9)
    val Surface = Color(0xFFFFFFFF)
    val SurfaceMuted = Color(0xFFF3F5F8)
    val TextPrimary = Navy
    val TextSecondary = Color(0xFF666768)
    val Outline = Color(0xFFD8DDE6)
    val Divider = Color(0xFFE7E9EE)
    val Scrim = Color(0x99081226)

    val Success = Color(0xFF18A957)
    val SuccessSurface = Color(0xFFEAF8F0)
    val Warning = Color(0xFFF59E0B)
    val WarningSurface = Color(0xFFFFF6E8)
    val Error = Color(0xFFD71920)
    val ErrorSurface = Color(0xFFFFECEE)
    val Info = Color(0xFF2A67B1)
    val InfoSurface = Color(0xFFF1F6FD)
    val Disabled = Color(0xFFE1E4EA)

    val GlassStroke = Color(0xE6FFFFFF)
    val GlassInnerHighlight = Color(0xBFFFFFFF)
    val GlassBackdrop = Color(0xFFF1F2F3)
    val GlassFallback = Color(0xEAF7F7F6)
    val GlassCool = Color(0xFFE8F0F7)
    val GlassWarm = Color(0xFFFFF0E6)
}

object CustomerOpacity {
    const val GlassTop = 0.94f
    const val GlassBottom = 0.78f
    const val GlassBackdropTint = 0.07f
    const val GlassNoise = 0.025f
    const val BubbleRim = 0.10f
    const val BubbleGloss = 0.78f
    const val BubbleShadowAmbient = 0.16f
}

object CustomerSpacing {
    val Xxs = 4.dp
    val Xs = 8.dp
    val Sm = 12.dp
    val Md = 16.dp
    val Lg = 20.dp
    val Xl = 24.dp
    val Xxl = 32.dp
    val Xxxl = 40.dp

    val ScreenHorizontal = 18.dp
    val ScreenVertical = 16.dp
    val CardPadding = 18.dp
    val SectionGap = 20.dp
}

object CustomerRadii {
    val Small = 8.dp
    val Field = 12.dp
    val Button = 12.dp
    val Card = 20.dp
    val TopBar = 24.dp
    val Pill = 999.dp
    val BottomSheet = 28.dp
}

val CustomerShapes = Shapes(
    extraSmall = RoundedCornerShape(CustomerRadii.Small),
    small = RoundedCornerShape(CustomerRadii.Field),
    medium = RoundedCornerShape(CustomerRadii.Button),
    large = RoundedCornerShape(CustomerRadii.Card),
    extraLarge = RoundedCornerShape(CustomerRadii.BottomSheet)
)

object CustomerElevation {
    val Resting = 1.dp
    val Raised = 3.dp
    val Floating = 8.dp
    val Bubble = 7.dp
}

object CustomerDimensions {
    val MinimumTouchTarget = 48.dp
    val TopBarHeight = 47.5.dp
    val TopBarIcon = 22.dp
    val TopBarBackOffsetX = 1.25.dp
    val TopBarBackOffsetY = (-0.55).dp
    val GlassBlurRadius = 56.dp
    val ButtonHeight = 52.dp
    val FieldHeight = 56.dp
    val BottomBarHeight = 70.dp
    val BottomBarBaseHeight = 58.5.dp
    val BottomBarSurfaceHeight = 84.dp
    val BottomBarSurfaceHorizontalOverflow = 6.dp
    val BottomBarSelectedSlot = 74.dp
    val BottomBarSelectedBubble = 58.dp
    val BottomBarSelectedBulgeDiameter = 74.dp
    val BottomBarSelectedBulgeBlendRadius = 7.dp
    val BottomBarIcon = 22.dp
    val BottomBarSelectedIcon = 22.dp
    val BottomBarSelectedIndicator = 4.dp
    val BottomBarHorizontalInset = 8.dp
    val BottomBarUnselectedOffsetY = 5.dp
    val BottomBarUnselectedLabelGap = 4.dp
    val BottomBarSelectedContentOffsetY = 3.5.dp
    val BottomBarSelectedLabelGap = 4.dp
    val BottomBarBadgeSize = 15.dp
    val BottomBarBadgeOffsetX = 13.5.dp
    val BottomBarBadgeOffsetY = (-8.36).dp
    val OtpCellWidth = 48.dp
    val OtpCellHeight = 58.dp
    val ReadableContentMaxWidth = 680.dp
}

object CustomerComponentTypography {
    private val TopBarFontFamily = FontFamily(
        Font(R.font.lato_medium, FontWeight.Medium),
        Font(R.font.lato_semibold, FontWeight.SemiBold)
    )
    private val BottomBarFontFamily = FontFamily(
        Font(R.font.inter_regular, FontWeight.Normal),
        Font(R.font.inter_medium, FontWeight.Medium),
        Font(R.font.inter_semibold, FontWeight.SemiBold)
    )

    val TopBarTitle = TextStyle(
        fontFamily = TopBarFontFamily,
        fontWeight = FontWeight.SemiBold,
        fontSize = 17.8.sp,
        lineHeight = 22.sp,
        color = CustomerColors.TextPrimary
    )
    val BottomBarLabel = TextStyle(
        fontFamily = BottomBarFontFamily,
        fontWeight = FontWeight.Medium,
        fontSize = 7.05.sp,
        lineHeight = 9.sp,
        letterSpacing = 0.02.sp,
        color = CustomerColors.TextPrimary
    )
    val BottomBarBadge = TextStyle(
        fontFamily = BottomBarFontFamily,
        fontWeight = FontWeight.Normal,
        fontSize = 8.5.sp,
        lineHeight = 9.5.sp,
        color = Color.White
    )
}

object CustomerProductCardTokens {
    val Seller = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontSize = 11.sp,
        lineHeight = 14.sp,
        fontWeight = FontWeight.Normal,
        color = CustomerColors.TextSecondary
    )
    val Name = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontSize = 14.sp,
        lineHeight = 18.sp,
        fontWeight = FontWeight.SemiBold,
        color = CustomerColors.TextPrimary
    )
    val Price = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontSize = 18.sp,
        lineHeight = 22.sp,
        fontWeight = FontWeight.Bold,
        color = CustomerColors.TextPrimary
    )
    val PriceFraction = Price.copy(fontSize = 12.sp, lineHeight = 16.sp)
    val OldPrice = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontSize = 11.sp,
        lineHeight = 14.sp,
        fontWeight = FontWeight.Normal,
        color = CustomerColors.TextSecondary
    )
}

val CustomerTypography = Typography(
    headlineLarge = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Bold,
        fontSize = 28.sp,
        lineHeight = 34.sp,
        color = CustomerColors.TextPrimary
    ),
    headlineMedium = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Bold,
        fontSize = 22.sp,
        lineHeight = 28.sp,
        color = CustomerColors.TextPrimary
    ),
    titleLarge = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Bold,
        fontSize = 20.sp,
        lineHeight = 26.sp,
        color = CustomerColors.TextPrimary
    ),
    titleMedium = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.SemiBold,
        fontSize = 16.sp,
        lineHeight = 22.sp,
        color = CustomerColors.TextPrimary
    ),
    titleSmall = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.SemiBold,
        fontSize = 14.sp,
        lineHeight = 20.sp,
        color = CustomerColors.TextPrimary
    ),
    bodyLarge = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Normal,
        fontSize = 16.sp,
        lineHeight = 24.sp,
        color = CustomerColors.TextPrimary
    ),
    bodyMedium = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Normal,
        fontSize = 14.sp,
        lineHeight = 20.sp,
        color = CustomerColors.TextPrimary
    ),
    bodySmall = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Normal,
        fontSize = 12.sp,
        lineHeight = 16.sp,
        color = CustomerColors.TextSecondary
    ),
    labelLarge = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.SemiBold,
        fontSize = 14.sp,
        lineHeight = 18.sp,
        color = CustomerColors.TextPrimary
    ),
    labelMedium = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Medium,
        fontSize = 12.sp,
        lineHeight = 16.sp,
        color = CustomerColors.TextPrimary
    ),
    labelSmall = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Medium,
        fontSize = 10.sp,
        lineHeight = 13.sp,
        color = CustomerColors.TextPrimary
    )
)
