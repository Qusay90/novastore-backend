package com.novastore.app.data.model

import com.google.gson.annotations.SerializedName
import kotlinx.serialization.Serializable

@Serializable
data class Notification(
    val id: Int,
    @SerializedName("user_id") val userId: Int?,
    val type: String,
    val message: String,
    @SerializedName("is_read") val isRead: Boolean,
    @SerializedName("created_at") val createdAt: String,
    @SerializedName(value = "entity_type", alternate = ["entityType"])
    val entityType: String? = null,
    @SerializedName(value = "entity_id", alternate = ["entityId"])
    val entityId: Long? = null
)
