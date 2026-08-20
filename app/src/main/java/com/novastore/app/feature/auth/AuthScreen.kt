package com.novastore.app.feature.auth

import androidx.compose.foundation.background
import androidx.compose.foundation.Image
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.novastore.app.R
import com.novastore.app.core.design.CustomerColors
import com.novastore.app.core.design.CustomerGlassState
import com.novastore.app.core.design.CustomerRadii
import com.novastore.app.core.design.CustomerSpacing
import com.novastore.app.core.ui.components.CustomerButton
import com.novastore.app.core.ui.components.CustomerButtonStyle
import com.novastore.app.core.ui.components.CustomerCard
import com.novastore.app.core.ui.components.CustomerModalDialog
import com.novastore.app.core.ui.components.CustomerOtpInput
import com.novastore.app.core.ui.components.CustomerTabs
import com.novastore.app.core.ui.components.CustomerTextField
import com.novastore.app.core.ui.components.CustomerTopBar

@Composable
fun AuthScreen(
    onAuthSuccess: () -> Unit,
    modifier: Modifier = Modifier,
    glassState: CustomerGlassState? = null,
    viewModel: AuthViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()

    var isLoginMode by remember { mutableStateOf(true) }
    var fullName by remember { mutableStateOf("") }
    var phone by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var passwordConfirmation by remember { mutableStateOf("") }
    var passwordVisible by remember { mutableStateOf(false) }
    var localError by remember { mutableStateOf<String?>(null) }
    var showForgotDialog by remember { mutableStateOf(false) }
    var resetIdentifier by remember { mutableStateOf("") }
    var resetCode by remember { mutableStateOf("") }
    var newPassword by remember { mutableStateOf("") }
    var newPasswordConfirmation by remember { mutableStateOf("") }
    var resetLocalError by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(uiState.isSuccess) {
        if (uiState.isSuccess) {
            onAuthSuccess()
            viewModel.resetSuccess()
        }
    }

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(CustomerColors.Page)
            .padding(bottom = 92.dp)
    ) {
        CustomerTopBar(
            title = "Hesabım",
            glassState = glassState,
            modifier = Modifier.padding(
                horizontal = CustomerSpacing.ScreenHorizontal,
                vertical = CustomerSpacing.Xs
            )
        )

        BoxWithConstraints(
            modifier = Modifier.fillMaxSize(),
            contentAlignment = Alignment.TopCenter
        ) {
            val contentWidth = if (maxWidth >= 700.dp) 560.dp else maxWidth
            Column(
                modifier = Modifier
                    .widthIn(max = contentWidth)
                    .fillMaxWidth()
                    .verticalScroll(rememberScrollState())
                    .padding(
                        horizontal = CustomerSpacing.ScreenHorizontal,
                        vertical = CustomerSpacing.Lg
                    ),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Image(
                    painter = painterResource(R.drawable.app_icon_foreground),
                    contentDescription = "NovaStore",
                    contentScale = ContentScale.Fit,
                    modifier = Modifier.size(112.dp)
                )
                Spacer(Modifier.height(CustomerSpacing.Sm))
                Text(
                    text = "NovaStore'a hoş geldin",
                    style = MaterialTheme.typography.headlineMedium,
                    color = CustomerColors.Navy,
                    textAlign = TextAlign.Center
                )
                Spacer(Modifier.height(CustomerSpacing.Xs))
                Text(
                    text = "Siparişlerini, favorilerini ve hesap ayarlarını tek yerden yönet.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = CustomerColors.TextSecondary,
                    textAlign = TextAlign.Center
                )
                Spacer(Modifier.height(CustomerSpacing.Xl))

                CustomerTabs(
                    tabs = listOf("Giriş Yap", "Kayıt Ol"),
                    selectedIndex = if (isLoginMode) 0 else 1,
                    onSelected = { index ->
                        isLoginMode = index == 0
                        localError = null
                        viewModel.resetSuccess()
                        viewModel.clearMessages()
                    }
                )
                Spacer(Modifier.height(CustomerSpacing.Md))

                CustomerCard {
                    Text(
                        text = if (isLoginMode) "Hesabına giriş yap" else "Yeni hesap oluştur",
                        style = MaterialTheme.typography.titleLarge,
                        color = CustomerColors.Navy
                    )
                    Spacer(Modifier.height(CustomerSpacing.Md))

                    if (!isLoginMode) {
                        CustomerTextField(
                            value = fullName,
                            onValueChange = { fullName = it },
                            label = "Ad Soyad"
                        )
                        Spacer(Modifier.height(CustomerSpacing.Sm))
                        CustomerTextField(
                            value = phone,
                            onValueChange = { phone = it },
                            label = "Telefon (isteğe bağlı)",
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone)
                        )
                        Spacer(Modifier.height(CustomerSpacing.Sm))
                    }

                    CustomerTextField(
                        value = email,
                        onValueChange = { email = it },
                        label = "E-posta veya telefon",
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email)
                    )
                    Spacer(Modifier.height(CustomerSpacing.Sm))
                    CustomerTextField(
                        value = password,
                        onValueChange = { password = it },
                        label = "Şifre",
                        visualTransformation = if (passwordVisible) {
                            VisualTransformation.None
                        } else {
                            PasswordVisualTransformation()
                        },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                        trailingIcon = {
                            IconButton(onClick = { passwordVisible = !passwordVisible }) {
                                Icon(
                                    imageVector = if (passwordVisible) {
                                        Icons.Default.VisibilityOff
                                    } else {
                                        Icons.Default.Visibility
                                    },
                                    contentDescription = if (passwordVisible) "Şifreyi gizle" else "Şifreyi göster"
                                )
                            }
                        }
                    )

                    if (!isLoginMode) {
                        Spacer(Modifier.height(CustomerSpacing.Sm))
                        CustomerTextField(
                            value = passwordConfirmation,
                            onValueChange = { passwordConfirmation = it },
                            label = "Şifre Tekrar",
                            visualTransformation = PasswordVisualTransformation(),
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password)
                        )
                    }

                    if (isLoginMode) {
                        Text(
                            text = "Şifremi unuttum",
                            modifier = Modifier
                                .align(Alignment.End)
                                .clickable {
                                    resetIdentifier = email
                                    resetCode = ""
                                    newPassword = ""
                                    newPasswordConfirmation = ""
                                    resetLocalError = null
                                    viewModel.restartPasswordReset()
                                    showForgotDialog = true
                                }
                                .padding(vertical = CustomerSpacing.Sm),
                            style = MaterialTheme.typography.labelLarge,
                            color = CustomerColors.Orange
                        )
                    } else {
                        Spacer(Modifier.height(CustomerSpacing.Md))
                    }

                    val message = localError ?: uiState.error
                    message?.let {
                        Surface(
                            modifier = Modifier.fillMaxWidth(),
                            color = CustomerColors.ErrorSurface,
                            shape = androidx.compose.foundation.shape.RoundedCornerShape(CustomerRadii.Field)
                        ) {
                            Text(
                                text = it,
                                modifier = Modifier.padding(CustomerSpacing.Sm),
                                style = MaterialTheme.typography.bodySmall,
                                color = CustomerColors.Error
                            )
                        }
                        Spacer(Modifier.height(CustomerSpacing.Md))
                    }

                    CustomerButton(
                        text = if (isLoginMode) "Giriş Yap" else "Kayıt Ol",
                        onClick = {
                            localError = null
                            if (isLoginMode) {
                                viewModel.login(email, password)
                            } else if (password != passwordConfirmation) {
                                localError = "Şifreler birbiriyle aynı olmalıdır."
                            } else {
                                viewModel.register(
                                    fullName = fullName,
                                    email = email,
                                    password = password,
                                    phone = phone.takeIf(String::isNotBlank)
                                )
                            }
                        },
                        enabled = !uiState.isLoading,
                        modifier = Modifier.fillMaxWidth()
                    )

                    if (uiState.isLoading) {
                        Spacer(Modifier.height(CustomerSpacing.Sm))
                        CircularProgressIndicator(
                            color = CustomerColors.Orange,
                            modifier = Modifier
                                .size(22.dp)
                                .align(Alignment.CenterHorizontally),
                            strokeWidth = 2.dp
                        )
                    }
                }

                Spacer(Modifier.height(CustomerSpacing.Md))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.Center
                ) {
                    Text(
                        text = if (isLoginMode) {
                            "Hesabın yok mu? Kayıt Ol"
                        } else {
                            "Zaten üye misin? Giriş Yap"
                        },
                        modifier = Modifier
                            .clickable {
                                isLoginMode = !isLoginMode
                                localError = null
                                viewModel.clearMessages()
                            }
                            .padding(CustomerSpacing.Xs),
                        style = MaterialTheme.typography.labelLarge,
                        color = CustomerColors.Orange,
                        fontWeight = FontWeight.SemiBold
                    )
                }
            }
        }
    }

    if (showForgotDialog) {
        CustomerModalDialog(
            title = "Şifremi Sıfırla",
            message = when (uiState.resetStep) {
                PasswordResetStep.IDENTIFIER -> "Hesabındaki e-posta veya telefonu yaz."
                PasswordResetStep.CODE -> "Gönderilen 6 haneli kodu gir."
                PasswordResetStep.NEW_PASSWORD -> "Hesabın için yeni bir şifre belirle."
            },
            onDismissRequest = {
                showForgotDialog = false
                viewModel.restartPasswordReset()
            }
        ) {
            when {
                uiState.resetComplete -> {
                    ResetMessage(uiState.resetMessage.orEmpty(), success = true)
                    Spacer(Modifier.height(CustomerSpacing.Md))
                    CustomerButton(
                        text = "Girişe dön",
                        onClick = {
                            showForgotDialog = false
                            email = resetIdentifier
                            password = ""
                            viewModel.restartPasswordReset()
                        },
                        style = CustomerButtonStyle.NAVY,
                        modifier = Modifier.fillMaxWidth()
                    )
                }

                uiState.resetStep == PasswordResetStep.IDENTIFIER -> {
                    CustomerTextField(
                        value = resetIdentifier,
                        onValueChange = { resetIdentifier = it },
                        label = "E-posta veya telefon",
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email)
                    )
                    ResetMessage(uiState.resetMessage, success = false)
                    Spacer(Modifier.height(CustomerSpacing.Md))
                    CustomerButton(
                        text = "Kod Gönder",
                        onClick = { viewModel.sendPasswordReset(resetIdentifier) },
                        enabled = !uiState.resetLoading,
                        modifier = Modifier.fillMaxWidth()
                    )
                }

                uiState.resetStep == PasswordResetStep.CODE -> {
                    CustomerOtpInput(
                        value = resetCode,
                        onValueChange = { resetCode = it },
                        enabled = !uiState.resetLoading
                    )
                    ResetMessage(uiState.resetMessage, success = false)
                    Spacer(Modifier.height(CustomerSpacing.Md))
                    CustomerButton(
                        text = "Kodu Doğrula",
                        onClick = { viewModel.verifyPasswordResetCode(resetIdentifier, resetCode) },
                        enabled = !uiState.resetLoading && resetCode.length == 6,
                        modifier = Modifier.fillMaxWidth()
                    )
                }

                else -> {
                    CustomerTextField(
                        value = newPassword,
                        onValueChange = { newPassword = it },
                        label = "Yeni şifre",
                        visualTransformation = PasswordVisualTransformation(),
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password)
                    )
                    Spacer(Modifier.height(CustomerSpacing.Sm))
                    CustomerTextField(
                        value = newPasswordConfirmation,
                        onValueChange = { newPasswordConfirmation = it },
                        label = "Yeni şifre tekrar",
                        visualTransformation = PasswordVisualTransformation(),
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password)
                    )
                    ResetMessage(resetLocalError ?: uiState.resetMessage, success = false)
                    Spacer(Modifier.height(CustomerSpacing.Md))
                    CustomerButton(
                        text = "Şifreyi Güncelle",
                        onClick = {
                            resetLocalError = if (newPassword != newPasswordConfirmation) {
                                "Şifreler birbiriyle aynı olmalıdır."
                            } else {
                                null
                            }
                            if (resetLocalError == null) {
                                viewModel.completePasswordReset(
                                    identifier = resetIdentifier,
                                    code = resetCode,
                                    newPassword = newPassword
                                )
                            }
                        },
                        enabled = !uiState.resetLoading,
                        modifier = Modifier.fillMaxWidth()
                    )
                }
            }

            if (uiState.resetLoading) {
                Spacer(Modifier.height(CustomerSpacing.Md))
                CircularProgressIndicator(
                    color = CustomerColors.Orange,
                    modifier = Modifier.size(22.dp),
                    strokeWidth = 2.dp
                )
            }
        }
    }
}

@Composable
private fun ResetMessage(message: String?, success: Boolean) {
    if (message.isNullOrBlank()) return
    Spacer(Modifier.height(CustomerSpacing.Sm))
    Surface(
        modifier = Modifier.fillMaxWidth(),
        color = if (success) CustomerColors.SuccessSurface else CustomerColors.WarningSurface,
        shape = androidx.compose.foundation.shape.RoundedCornerShape(CustomerRadii.Field)
    ) {
        Text(
            text = message,
            modifier = Modifier.padding(CustomerSpacing.Sm),
            style = MaterialTheme.typography.bodySmall,
            color = if (success) CustomerColors.Success else CustomerColors.Navy
        )
    }
}
