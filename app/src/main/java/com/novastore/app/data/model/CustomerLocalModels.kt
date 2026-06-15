package com.novastore.app.data.model

data class CustomerAddress(
    val id: Long,
    val title: String,
    val fullName: String,
    val phone: String,
    val city: String,
    val district: String,
    val detail: String,
    val isDefault: Boolean = false
) {
    val singleLine: String
        get() = listOf(detail, district, city)
            .map { it.trim() }
            .filter { it.isNotEmpty() }
            .joinToString(", ")
}
