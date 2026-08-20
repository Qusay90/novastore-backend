package com.novastore.app.core.design

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable

private val CustomerColorScheme = lightColorScheme(
    primary = CustomerColors.Navy,
    onPrimary = CustomerColors.Surface,
    primaryContainer = CustomerColors.NavySoft,
    onPrimaryContainer = CustomerColors.Surface,
    secondary = CustomerColors.Orange,
    onSecondary = CustomerColors.Surface,
    secondaryContainer = CustomerColors.Orange.copy(alpha = 0.12f),
    onSecondaryContainer = CustomerColors.Navy,
    background = CustomerColors.Page,
    onBackground = CustomerColors.TextPrimary,
    surface = CustomerColors.Surface,
    onSurface = CustomerColors.TextPrimary,
    surfaceVariant = CustomerColors.SurfaceMuted,
    onSurfaceVariant = CustomerColors.TextSecondary,
    outline = CustomerColors.Outline,
    outlineVariant = CustomerColors.Divider,
    error = CustomerColors.Error,
    onError = CustomerColors.Surface
)

@Composable
fun NovaCustomerTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = CustomerColorScheme,
        typography = CustomerTypography,
        shapes = CustomerShapes,
        content = content
    )
}
