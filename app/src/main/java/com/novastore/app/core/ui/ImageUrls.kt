package com.novastore.app.core.ui

fun optimizedImageUrl(url: String?, width: Int, height: Int): String? {
    if (url.isNullOrBlank()) return url
    if (!url.contains("res.cloudinary.com") || !url.contains("/upload/")) return url

    val transformation = "f_auto,q_auto:eco,c_fill,g_auto,w_$width,h_$height"
    val versionMatch = Regex("""/v\d+""").find(url, url.indexOf("/upload/") + "/upload/".length)

    return if (versionMatch != null) {
        val insertAt = versionMatch.range.first + 1
        url.substring(0, insertAt) + "$transformation/" + url.substring(insertAt)
    } else {
        url.replace("/upload/", "/upload/$transformation/")
    }
}
