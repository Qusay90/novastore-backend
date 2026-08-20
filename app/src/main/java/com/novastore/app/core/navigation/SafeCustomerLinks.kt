package com.novastore.app.core.navigation

import java.net.URI

private const val MAX_TRACKING_URL_LENGTH = 2048

fun safeHttpsTrackingUrl(
    rawValue: String?,
    allowedHosts: Set<String> = emptySet()
): String? {
    val value = rawValue?.trim()?.takeIf {
        it.isNotEmpty() && it.length <= MAX_TRACKING_URL_LENGTH && it.none(Char::isISOControl)
    } ?: return null
    val uri = runCatching { URI(value) }.getOrNull() ?: return null
    if (!uri.scheme.equals("https", ignoreCase = true)) return null
    if (uri.host.isNullOrBlank() || uri.userInfo != null) return null
    if (uri.port !in setOf(-1, 443)) return null
    val normalizedHosts = allowedHosts.map { it.trim().lowercase() }.filter { it.isNotEmpty() }.toSet()
    if (normalizedHosts.isEmpty() || uri.host.lowercase() !in normalizedHosts) return null
    return uri.toASCIIString()
}
