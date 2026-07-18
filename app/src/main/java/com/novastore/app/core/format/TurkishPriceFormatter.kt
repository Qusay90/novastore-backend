package com.novastore.app.core.format

import java.math.BigDecimal
import java.math.RoundingMode
import java.text.DecimalFormat
import java.text.DecimalFormatSymbols
import java.util.Locale

internal data class TurkishPriceParts(
    val whole: String,
    val fraction: String,
) {
    fun asText(): String = "$whole,$fraction TL"
}

internal fun turkishPriceParts(value: Double): TurkishPriceParts? {
    if (!value.isFinite() || value < 0.0) return null

    val formatter = DecimalFormat(
        "#,##0.00",
        DecimalFormatSymbols(Locale.forLanguageTag("tr-TR")),
    ).apply {
        roundingMode = RoundingMode.HALF_UP
        isGroupingUsed = true
    }
    val formatted = formatter.format(
        BigDecimal.valueOf(value).setScale(2, RoundingMode.HALF_UP),
    )
    val separatorIndex = formatted.lastIndexOf(',')
    if (separatorIndex < 0) return null

    return TurkishPriceParts(
        whole = formatted.substring(0, separatorIndex),
        fraction = formatted.substring(separatorIndex + 1),
    )
}
