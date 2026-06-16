package com.novastore.app.data.model

import com.google.gson.annotations.SerializedName
import kotlinx.serialization.Serializable

@Serializable
data class LoginRequest(
    val email: String,
    val password: String
)

@Serializable
data class LoginResponse(
    val mesaj: String,
    val token: String,
    val user: UserInfo
)

@Serializable
data class RegisterRequest(
    val fullName: String,
    val email: String,
    val password: String
)

@Serializable
data class RegisterResponse(
    val mesaj: String,
    val user: UserInfo
)

@Serializable
data class UserInfo(
    val id: Int,
    val fullName: String,
    val email: String,
    val role: String? = "customer",
    val phone: String? = null
)
