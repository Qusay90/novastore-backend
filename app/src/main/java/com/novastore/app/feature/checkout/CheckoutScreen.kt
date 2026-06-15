package com.novastore.app.feature.checkout

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateContentSize
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.CreditCard
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.VerifiedUser
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.OffsetMapping
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.text.input.TransformedText
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.novastore.app.core.theme.BorderLight
import com.novastore.app.core.theme.CardBackground
import com.novastore.app.core.theme.DiscountGreen
import com.novastore.app.core.theme.Error
import com.novastore.app.core.theme.NavyDark
import com.novastore.app.core.theme.Orange
import com.novastore.app.core.theme.PageBackground
import com.novastore.app.core.theme.PaymentCardGradientEnd
import com.novastore.app.core.theme.PaymentCardGradientMid
import com.novastore.app.core.theme.PaymentCardGradientStart
import com.novastore.app.core.theme.PaymentCardPanel
import com.novastore.app.core.theme.PaymentCardStripe
import com.novastore.app.core.theme.StoreBlue
import com.novastore.app.core.theme.TextSecondary
import com.novastore.app.data.model.CartItem
import com.novastore.app.data.model.CustomerAddress
import java.util.Calendar
import java.util.Locale

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CheckoutScreen(
    onBackClick: () -> Unit,
    onNavigateToHome: () -> Unit,
    buyNowItem: CartItem? = null,
    modifier: Modifier = Modifier,
    viewModel: CheckoutViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()
    val cartTotal by viewModel.cartTotal.collectAsState()
    val cartItems by viewModel.cartItems.collectAsState()
    val addresses by viewModel.addresses.collectAsState()
    val selectedAddressId by viewModel.selectedAddressId.collectAsState()
    val selectedAddress = addresses.firstOrNull { it.id == selectedAddressId } ?: addresses.firstOrNull()
    val uriHandler = LocalUriHandler.current

    var fullName by remember { mutableStateOf(viewModel.currentUserName) }
    var email by remember { mutableStateOf(viewModel.currentUserEmail) }
    var phone by remember { mutableStateOf(viewModel.currentUserPhone) }
    var address by remember { mutableStateOf("") }
    val paymentMethod = "card"
    var isCardSectionExpanded by remember { mutableStateOf(false) }
    var cardHolder by remember { mutableStateOf("") }
    var cardNumber by remember { mutableStateOf("") }
    var expiry by remember { mutableStateOf(TextFieldValue("")) }
    var cvc by remember { mutableStateOf("") }
    var isCardBackVisible by remember { mutableStateOf(false) }
    var attemptedSubmit by remember { mutableStateOf(false) }
    var localError by remember { mutableStateOf<String?>(null) }

    val checkoutItems = remember(buyNowItem, cartItems) { buyNowItem?.let(::listOf) ?: cartItems }
    val checkoutTotal = remember(checkoutItems, cartTotal, buyNowItem) {
        buyNowItem?.let { it.price * it.quantity } ?: cartTotal
    }
    val cardType by remember { derivedStateOf { detectCardType(cardNumber.digitsOnly()) } }
    val cvcMaxLength = if (cardType == CardType.AMEX) 4 else 3
    val cardValidation by remember { derivedStateOf { validateCardForm(cardHolder, cardNumber, expiry.text, cvc, cardType) } }
    val canPressSubmit = !uiState.isLoading

    val expiryFocusRequester = remember { FocusRequester() }
    val cvcFocusRequester = remember { FocusRequester() }

    LaunchedEffect(selectedAddress?.id) {
        selectedAddress?.let {
            if (fullName.isBlank()) fullName = it.fullName
            if (it.phone.isNotBlank()) phone = it.phone
            address = it.singleLine
        }
    }

    LaunchedEffect(cvc, cvcMaxLength) {
        if (cvc.digitsOnly().length >= cvcMaxLength) {
            isCardBackVisible = false
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        if (buyNowItem == null) "Ödeme" else "Hemen Al",
                        fontWeight = FontWeight.Bold,
                        color = NavyDark
                    )
                },
                navigationIcon = {
                    IconButton(onClick = onBackClick) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Geri", tint = NavyDark)
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = PageBackground)
            )
        },
        modifier = modifier
    ) { paddingValues ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .background(PageBackground)
        ) {
            when {
                uiState.isLoading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = Orange)
                }
                uiState.successResponse != null -> SuccessState(
                    response = uiState.successResponse!!,
                    onNavigateToHome = onNavigateToHome
                )
                else -> Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .verticalScroll(rememberScrollState())
                        .padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(14.dp)
                ) {
                    CheckoutSection(title = "Teslimat ve İletişim") {
                        if (addresses.isNotEmpty()) {
                            AddressSelector(
                                addresses = addresses,
                                selectedAddressId = selectedAddress?.id,
                                onSelect = { id ->
                                    viewModel.selectAddress(id)
                                    addresses.firstOrNull { it.id == id }?.let {
                                        fullName = it.fullName
                                        phone = it.phone
                                        address = it.singleLine
                                    }
                                }
                            )
                        }

                        NovaTextField(value = fullName, onValueChange = { fullName = it }, label = "Ad Soyad")
                        NovaTextField(value = email, onValueChange = { email = it }, label = "E-posta", keyboardType = KeyboardType.Email)
                        NovaTextField(
                            value = phone,
                            onValueChange = { phone = it.filter(Char::isDigit).take(11) },
                            label = "Telefon",
                            placeholder = "05XXXXXXXXX",
                            keyboardType = KeyboardType.Phone,
                            isError = phone.isNotEmpty() && !phone.matches(Regex("^05\\d{9}$"))
                        )
                        NovaTextField(value = address, onValueChange = { address = it }, label = "Teslimat Adresi", minLines = 2)
                    }

                    CheckoutSection(title = "Ödeme Yöntemi") {
                        CardPaymentPanel(
                            expanded = isCardSectionExpanded,
                            cardHolder = cardHolder,
                            cardNumber = cardNumber,
                            expiry = expiry,
                            cvc = cvc,
                            cardType = cardType,
                            cvcMaxLength = cvcMaxLength,
                            isCardBackVisible = isCardBackVisible,
                            errors = cardValidation,
                            showErrors = attemptedSubmit,
                            expiryFocusRequester = expiryFocusRequester,
                            cvcFocusRequester = cvcFocusRequester,
                            onExpand = { isCardSectionExpanded = true },
                            onCardHolderChange = { cardHolder = it.take(40) },
                            onCardNumberChange = {
                                val digits = it.digitsOnly()
                                val detectedType = detectCardType(digits)
                                val sanitized = digits.take(expectedCardLength(detectedType))
                                cardNumber = sanitized
                                if (sanitized.length == expectedCardLength(detectedType)) {
                                    expiryFocusRequester.requestFocus()
                                }
                            },
                            onExpiryChange = {
                                val formatted = formatExpiry(it.text)
                                expiry = TextFieldValue(
                                    text = formatted,
                                    selection = TextRange(formatted.length)
                                )
                                if (formatted.length == 5) cvcFocusRequester.requestFocus()
                            },
                            onCvcChange = { cvc = it.filter(Char::isDigit).take(cvcMaxLength) },
                            onSensitiveFocus = { isCardBackVisible = false },
                            onCvcFocus = { focused -> if (focused) isCardBackVisible = true }
                        )
                    }

                    CheckoutSection(title = "Sipariş Özeti") {
                        buyNowItem?.let {
                            SummaryRow("Ürün", "${it.quantity} adet")
                        }
                        SummaryRow("Ürün toplamı", formatMoney(checkoutTotal))
                        SummaryRow("Kargo", "Ücretsiz")
                        HorizontalDivider(color = BorderLight)
                        SummaryRow("Ödenecek Tutar", formatMoney(checkoutTotal), highlighted = true)
                    }

                    val errorText = localError ?: uiState.error
                    if (!errorText.isNullOrBlank()) {
                        Text(errorText, color = Error, style = MaterialTheme.typography.bodyMedium)
                    }

                    Button(
                        onClick = {
                            attemptedSubmit = true
                            localError = validateCheckout(
                                fullName = fullName,
                                email = email,
                                phone = phone,
                                address = address,
                                checkoutItems = checkoutItems,
                                checkoutTotal = checkoutTotal,
                                cardErrors = cardValidation
                            )
                            if (localError == null) {
                                viewModel.initializePayment(
                                    fullName = fullName,
                                    email = email,
                                    phone = phone,
                                    address = address,
                                    paymentMethod = paymentMethod,
                                    checkoutItems = checkoutItems,
                                    clearCartOnSuccess = buyNowItem == null,
                                    onRedirectionRequested = { url -> uriHandler.openUri(url) }
                                )
                            }
                        },
                        enabled = canPressSubmit,
                        colors = ButtonDefaults.buttonColors(
                            containerColor = Orange,
                            disabledContainerColor = BorderLight,
                            disabledContentColor = TextSecondary
                        ),
                        shape = RoundedCornerShape(12.dp),
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(52.dp)
                    ) {
                        Text("Kart ile Ödemeyi Tamamla", fontWeight = FontWeight.Bold, fontSize = 16.sp)
                    }
                }
            }
        }
    }
}

@Composable
private fun CardPaymentPanel(
    expanded: Boolean,
    cardHolder: String,
    cardNumber: String,
    expiry: TextFieldValue,
    cvc: String,
    cardType: CardType,
    cvcMaxLength: Int,
    isCardBackVisible: Boolean,
    errors: CardValidation,
    showErrors: Boolean,
    expiryFocusRequester: FocusRequester,
    cvcFocusRequester: FocusRequester,
    onExpand: () -> Unit,
    onCardHolderChange: (String) -> Unit,
    onCardNumberChange: (String) -> Unit,
    onExpiryChange: (TextFieldValue) -> Unit,
    onCvcChange: (String) -> Unit,
    onSensitiveFocus: () -> Unit,
    onCvcFocus: (Boolean) -> Unit
) {
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .animateContentSize(animationSpec = spring())
            .clickable(onClick = onExpand),
        shape = RoundedCornerShape(16.dp),
        color = if (expanded) Orange.copy(alpha = 0.05f) else CardBackground,
        border = BorderStroke(1.5.dp, Orange)
    ) {
        Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Surface(color = Orange.copy(alpha = 0.12f), shape = CircleShape, modifier = Modifier.size(44.dp)) {
                    Box(contentAlignment = Alignment.Center) {
                        Icon(Icons.Default.CreditCard, contentDescription = null, tint = Orange)
                    }
                }
                Spacer(Modifier.width(10.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Text("Kart", color = NavyDark, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium)
                    Text("Kredi/Banka kartı", color = TextSecondary, style = MaterialTheme.typography.bodySmall)
                }
                Text(cardType.label, color = StoreBlue, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.labelLarge)
            }

            AnimatedVisibility(
                visible = expanded,
                enter = expandVertically(animationSpec = tween(320)) + fadeIn(tween(280)) + scaleIn(initialScale = 0.96f),
                exit = shrinkVertically(animationSpec = tween(220)) + fadeOut(tween(180))
            ) {
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    HorizontalDivider(color = BorderLight)
                    NovaPaymentCard(
                        cardHolder = cardHolder,
                        cardNumber = cardNumber,
                        expiry = expiry.text,
                        cvc = cvc,
                        cardType = cardType,
                        showBack = isCardBackVisible
                    )
                    NovaTextField(
                        value = cardHolder,
                        onValueChange = onCardHolderChange,
                        label = "Kart Üzerindeki İsim",
                        placeholder = "Kart Üzerindeki İsim",
                        isError = showErrors && errors.holderError != null,
                        supportingText = if (showErrors) errors.holderError else null,
                        modifier = Modifier.onFocusChanged { if (it.isFocused) onSensitiveFocus() }
                    )
                    NovaTextField(
                        value = cardNumber,
                        onValueChange = onCardNumberChange,
                        label = "Kart Numarası",
                        placeholder = "0000 0000 0000 0000",
                        keyboardType = KeyboardType.Number,
                        visualTransformation = CardNumberVisualTransformation(cardType),
                        isError = showErrors && errors.numberError != null,
                        supportingText = if (showErrors) errors.numberError else null,
                        modifier = Modifier.onFocusChanged { if (it.isFocused) onSensitiveFocus() }
                    )
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        NovaTextFieldValue(
                            value = expiry,
                            onValueChange = onExpiryChange,
                            label = "Son Kullanma",
                            placeholder = "AA/YY",
                            keyboardType = KeyboardType.Number,
                            modifier = Modifier
                                .weight(1f)
                                .focusRequester(expiryFocusRequester)
                                .onFocusChanged { if (it.isFocused) onSensitiveFocus() },
                            isError = showErrors && errors.expiryError != null,
                            supportingText = if (showErrors) errors.expiryError else null
                        )
                        NovaTextField(
                            value = cvc,
                            onValueChange = onCvcChange,
                            label = "CVC",
                            placeholder = "CVC",
                            keyboardType = KeyboardType.NumberPassword,
                            modifier = Modifier
                                .weight(1f)
                                .focusRequester(cvcFocusRequester)
                                .onFocusChanged { onCvcFocus(it.isFocused) },
                            isError = showErrors && errors.cvcError != null,
                            supportingText = if (showErrors) errors.cvcError else null
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun NovaPaymentCard(
    cardHolder: String,
    cardNumber: String,
    expiry: String,
    cvc: String,
    cardType: CardType,
    showBack: Boolean
) {
    val rotation by animateFloatAsState(
        targetValue = if (showBack) 180f else 0f,
        animationSpec = tween(650),
        label = "nova_card_flip"
    )
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .aspectRatio(1.586f)
    ) {
        PaymentCardFace(
            modifier = Modifier.graphicsLayer {
                rotationY = rotation
                cameraDistance = 16 * density
                alpha = if (rotation <= 90f) 1f else 0f
            },
            cardHolder = cardHolder,
            cardNumber = cardNumber,
            expiry = expiry,
            cardType = cardType
        )
        PaymentCardBack(
            modifier = Modifier.graphicsLayer {
                rotationY = rotation + 180f
                cameraDistance = 16 * density
                alpha = if (rotation > 90f) 1f else 0f
            },
            cvc = cvc
        )
    }
}

@Composable
private fun PaymentCardFace(
    modifier: Modifier,
    cardHolder: String,
    cardNumber: String,
    expiry: String,
    cardType: CardType
) {
    Card(
        modifier = modifier.fillMaxSize(),
        shape = RoundedCornerShape(22.dp),
        elevation = CardDefaults.cardElevation(defaultElevation = 10.dp)
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(
                    Brush.linearGradient(
                        colors = listOf(PaymentCardGradientStart, PaymentCardGradientMid, PaymentCardGradientEnd),
                        start = Offset.Zero,
                        end = Offset.Infinite
                    )
                )
                .padding(horizontal = 20.dp, vertical = 18.dp)
        ) {
            Row(
                modifier = Modifier
                    .align(Alignment.TopStart)
                    .fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.Top
            ) {
                ChipVisual()
                Text(
                    "NOVA CARD",
                    color = Color.White,
                    fontWeight = FontWeight.ExtraBold,
                    fontSize = 14.sp,
                    letterSpacing = 0.8.sp
                )
            }
            Text(
                displayCardNumber(cardNumber, cardType),
                modifier = Modifier
                    .align(Alignment.CenterStart)
                    .padding(top = 30.dp)
                    .fillMaxWidth(),
                color = Color.White,
                fontWeight = FontWeight.Bold,
                fontSize = if (cardType == CardType.AMEX) 18.sp else 17.sp,
                letterSpacing = 0.55.sp,
                textAlign = TextAlign.Start,
                maxLines = 1
            )
            Row(
                modifier = Modifier
                    .align(Alignment.BottomStart)
                    .fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.Bottom
            ) {
                CardLabel(
                    label = "KART SAHİBİ",
                    value = cardHolder.ifBlank { "AD SOYAD" }.uppercase(Locale("tr", "TR")),
                    modifier = Modifier.weight(1f)
                )
                Spacer(Modifier.width(18.dp))
                Column(horizontalAlignment = Alignment.End) {
                    CardLabel("SKT", expiry.ifBlank { "AA/YY" })
                    if (cardType != CardType.UNKNOWN) {
                        Text(
                            cardType.label,
                            color = Color.White.copy(alpha = 0.78f),
                            fontSize = 10.sp,
                            fontWeight = FontWeight.Bold,
                            maxLines = 1
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun PaymentCardBack(modifier: Modifier, cvc: String) {
    Card(
        modifier = modifier.fillMaxSize(),
        shape = RoundedCornerShape(22.dp),
        elevation = CardDefaults.cardElevation(defaultElevation = 10.dp)
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(
                    Brush.linearGradient(
                        colors = listOf(PaymentCardGradientEnd, PaymentCardGradientMid, PaymentCardGradientStart),
                        start = Offset.Zero,
                        end = Offset.Infinite
                    )
                )
                .padding(vertical = 18.dp)
        ) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(48.dp)
                    .align(Alignment.TopCenter)
                    .padding(top = 8.dp)
                    .background(PaymentCardStripe)
            )
            Row(
                modifier = Modifier
                    .align(Alignment.Center)
                    .fillMaxWidth()
                    .padding(horizontal = 22.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .height(44.dp)
                        .background(PaymentCardPanel, RoundedCornerShape(6.dp))
                )
                Spacer(Modifier.width(10.dp))
                Surface(shape = RoundedCornerShape(8.dp), color = Color.White) {
                    Text(
                        cvc.ifBlank { "•••" },
                        modifier = Modifier.padding(horizontal = 16.dp, vertical = 11.dp),
                        color = NavyDark,
                        fontWeight = FontWeight.Bold,
                        fontSize = 14.sp,
                        letterSpacing = 1.sp
                    )
                }
            }
            Row(
                modifier = Modifier
                    .align(Alignment.BottomStart)
                    .padding(horizontal = 20.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(Icons.Default.Lock, contentDescription = null, tint = Color.White.copy(alpha = 0.8f), modifier = Modifier.size(16.dp))
                Spacer(Modifier.width(6.dp))
                Text("Güvenli ödeme", color = Color.White.copy(alpha = 0.82f), style = MaterialTheme.typography.labelMedium)
            }
            Text(
                "NOVA CARD",
                modifier = Modifier
                    .align(Alignment.BottomEnd)
                    .padding(horizontal = 20.dp),
                color = Color.White.copy(alpha = 0.82f),
                fontWeight = FontWeight.Bold,
                fontSize = 12.sp
            )
        }
    }
}

@Composable
private fun ChipVisual(modifier: Modifier = Modifier) {
    Box(
        modifier = modifier
            .size(width = 44.dp, height = 32.dp)
            .background(Brush.linearGradient(listOf(Color.White.copy(alpha = 0.9f), Orange.copy(alpha = 0.75f))), RoundedCornerShape(9.dp))
            .border(1.dp, Color.White.copy(alpha = 0.55f), RoundedCornerShape(9.dp))
    )
}

@Composable
private fun CardLabel(label: String, value: String, modifier: Modifier = Modifier) {
    Column(modifier = modifier) {
        Text(label, color = Color.White.copy(alpha = 0.64f), fontSize = 8.sp, fontWeight = FontWeight.Bold, maxLines = 1)
        val valueFontSize = when {
            value.length > 30 -> 9.sp
            value.length > 22 -> 10.sp
            value.length > 16 -> 11.sp
            else -> 12.sp
        }
        Text(
            value,
            color = Color.White,
            fontWeight = FontWeight.Bold,
            fontSize = valueFontSize,
            letterSpacing = 0.sp,
            maxLines = 1,
            overflow = TextOverflow.Clip
        )
    }
}

@Composable
private fun CheckoutSection(title: String, content: @Composable ColumnScope.() -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = CardBackground),
        border = BorderStroke(1.dp, BorderLight),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
    ) {
        Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = NavyDark)
            content()
        }
    }
}

@Composable
private fun NovaTextField(
    value: String,
    onValueChange: (String) -> Unit,
    label: String,
    modifier: Modifier = Modifier,
    placeholder: String? = null,
    keyboardType: KeyboardType = KeyboardType.Text,
    isError: Boolean = false,
    supportingText: String? = null,
    minLines: Int = 1,
    visualTransformation: VisualTransformation = VisualTransformation.None
) {
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        label = { Text(label) },
        placeholder = placeholder?.let { { Text(it, color = TextSecondary) } },
        keyboardOptions = KeyboardOptions(keyboardType = keyboardType),
        modifier = modifier.fillMaxWidth(),
        singleLine = minLines == 1,
        minLines = minLines,
        visualTransformation = visualTransformation,
        isError = isError,
        supportingText = supportingText?.let { { Text(it) } },
        shape = RoundedCornerShape(12.dp),
        colors = OutlinedTextFieldDefaults.colors(
            focusedBorderColor = Orange,
            focusedLabelColor = Orange,
            errorBorderColor = Error,
            focusedContainerColor = CardBackground,
            unfocusedContainerColor = CardBackground
        )
    )
}

@Composable
private fun NovaTextFieldValue(
    value: TextFieldValue,
    onValueChange: (TextFieldValue) -> Unit,
    label: String,
    modifier: Modifier = Modifier,
    placeholder: String? = null,
    keyboardType: KeyboardType = KeyboardType.Text,
    isError: Boolean = false,
    supportingText: String? = null,
    minLines: Int = 1,
    visualTransformation: VisualTransformation = VisualTransformation.None
) {
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        label = { Text(label) },
        placeholder = placeholder?.let { { Text(it, color = TextSecondary) } },
        keyboardOptions = KeyboardOptions(keyboardType = keyboardType),
        modifier = modifier.fillMaxWidth(),
        singleLine = minLines == 1,
        minLines = minLines,
        visualTransformation = visualTransformation,
        isError = isError,
        supportingText = supportingText?.let { { Text(it) } },
        shape = RoundedCornerShape(12.dp),
        colors = OutlinedTextFieldDefaults.colors(
            focusedBorderColor = Orange,
            focusedLabelColor = Orange,
            errorBorderColor = Error,
            focusedContainerColor = CardBackground,
            unfocusedContainerColor = CardBackground
        )
    )
}

@Composable
private fun AddressSelector(
    addresses: List<CustomerAddress>,
    selectedAddressId: Long?,
    onSelect: (Long) -> Unit
) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        addresses.forEach { address ->
            Surface(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable { onSelect(address.id) },
                shape = RoundedCornerShape(12.dp),
                color = if (address.id == selectedAddressId) Orange.copy(alpha = 0.08f) else PageBackground,
                border = BorderStroke(1.dp, if (address.id == selectedAddressId) Orange else BorderLight)
            ) {
                Row(modifier = Modifier.padding(10.dp), verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Default.LocationOn, contentDescription = null, tint = Orange, modifier = Modifier.size(18.dp))
                    Spacer(modifier = Modifier.width(8.dp))
                    Column {
                        Text(address.title, fontWeight = FontWeight.Bold, color = NavyDark)
                        Text(address.singleLine, color = TextSecondary, style = MaterialTheme.typography.bodySmall)
                    }
                }
            }
        }
    }
}

@Composable
private fun SummaryRow(label: String, value: String, highlighted: Boolean = false) {
    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(
            label,
            color = if (highlighted) NavyDark else TextSecondary,
            fontWeight = if (highlighted) FontWeight.Bold else FontWeight.Normal
        )
        Text(
            value,
            color = if (highlighted) StoreBlue else NavyDark,
            fontWeight = FontWeight.Bold
        )
    }
}

@Composable
private fun SuccessState(
    response: com.novastore.app.data.model.PaymentResponse,
    onNavigateToHome: () -> Unit
) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp),
        contentAlignment = Alignment.Center
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            modifier = Modifier.verticalScroll(rememberScrollState())
        ) {
            Icon(Icons.Default.CheckCircle, contentDescription = "Başarılı", tint = DiscountGreen, modifier = Modifier.size(80.dp))
            Spacer(modifier = Modifier.height(16.dp))
            Text("Siparişiniz Alındı!", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold, color = NavyDark)
            Spacer(modifier = Modifier.height(4.dp))
            Text("Sipariş Numarası: #${response.orderId}", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = Orange)
            Spacer(modifier = Modifier.height(16.dp))

            Card(shape = RoundedCornerShape(14.dp), colors = CardDefaults.cardColors(containerColor = CardBackground)) {
                Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Default.VerifiedUser, contentDescription = null, tint = DiscountGreen)
                        Spacer(modifier = Modifier.width(8.dp))
                        Text("Kart ödemeniz alındı.", fontWeight = FontWeight.Bold, color = NavyDark)
                    }
                    Text("3D Secure doğrulaması gerekiyorsa bankanızın yönlendirme sayfası açılır.", color = TextSecondary)
                }
            }

            Spacer(modifier = Modifier.height(24.dp))
            Button(
                onClick = onNavigateToHome,
                colors = ButtonDefaults.buttonColors(containerColor = Orange),
                shape = RoundedCornerShape(12.dp),
                contentPadding = PaddingValues(horizontal = 32.dp, vertical = 12.dp)
            ) {
                Text("Alışverişe Devam Et", fontWeight = FontWeight.Bold)
            }
        }
    }
}

private enum class CardType(val label: String) {
    VISA("VISA"),
    MASTERCARD("MASTERCARD"),
    TROY("TROY"),
    AMEX("AMEX"),
    UNKNOWN("KART")
}

private data class CardValidation(
    val holderError: String? = null,
    val numberError: String? = null,
    val expiryError: String? = null,
    val cvcError: String? = null
) {
    val isValid: Boolean
        get() = holderError == null && numberError == null && expiryError == null && cvcError == null
}

private fun String.digitsOnly(): String = filter(Char::isDigit)

private class CardNumberVisualTransformation(private val type: CardType) : VisualTransformation {
    override fun filter(text: AnnotatedString): TransformedText {
        val digits = text.text.digitsOnly().take(expectedCardLength(type))
        val formatted = formatCardNumber(digits, type)
        return TransformedText(
            text = AnnotatedString(formatted),
            offsetMapping = object : OffsetMapping {
                override fun originalToTransformed(offset: Int): Int {
                    if (offset <= 0) return 0
                    if (offset >= digits.length) return formatted.length
                    var seenDigits = 0
                    formatted.forEachIndexed { index, char ->
                        if (char.isDigit()) {
                            seenDigits += 1
                            if (seenDigits == offset) {
                                return index + 1
                            }
                        }
                    }
                    return formatted.length
                }

                override fun transformedToOriginal(offset: Int): Int {
                    if (offset <= 0) return 0
                    return formatted
                        .take(offset.coerceAtMost(formatted.length))
                        .count(Char::isDigit)
                        .coerceIn(0, digits.length)
                }
            }
        )
    }
}

private fun detectCardType(digits: String): CardType {
    if (digits.startsWith("9792")) return CardType.TROY
    if (digits.startsWith("4")) return CardType.VISA
    if (digits.startsWith("34") || digits.startsWith("37")) return CardType.AMEX
    val prefix2 = digits.take(2).toIntOrNull()
    val prefix4 = digits.take(4).toIntOrNull()
    if (prefix2 in 51..55 || prefix4 in 2221..2720) return CardType.MASTERCARD
    return CardType.UNKNOWN
}

private fun expectedCardLength(type: CardType): Int = if (type == CardType.AMEX) 15 else 16

private fun formatCardNumber(input: String, type: CardType): String {
    val digits = input.digitsOnly().take(expectedCardLength(type))
    return if (type == CardType.AMEX) {
        listOf(digits.take(4), digits.drop(4).take(6), digits.drop(10).take(5))
            .filter { it.isNotEmpty() }
            .joinToString(" ")
    } else {
        digits.chunked(4).joinToString(" ")
    }
}

private fun displayCardNumber(input: String, type: CardType): String {
    val digits = input.digitsOnly()
    val expected = expectedCardLength(type)
    val padded = digits.padEnd(expected, '•')
    return if (type == CardType.AMEX) {
        listOf(padded.take(4), padded.drop(4).take(6), padded.drop(10).take(5))
            .filter { it.isNotEmpty() }
            .joinToString(" ")
    } else {
        padded.chunked(4).joinToString(" ")
    }
}

private fun formatExpiry(input: String): String {
    val digits = input.digitsOnly().take(4)
    return if (digits.length <= 2) digits else digits.take(2) + "/" + digits.drop(2)
}

private fun validateCardForm(holder: String, cardNumber: String, expiry: String, cvc: String, cardType: CardType): CardValidation {
    val digits = cardNumber.digitsOnly()
    val expectedLength = expectedCardLength(cardType)
    val cvcLength = if (cardType == CardType.AMEX) 4 else 3
    return CardValidation(
        holderError = if (holder.trim().length < 3) "Kart üzerindeki isim zorunlu." else null,
        numberError = when {
            digits.length != expectedLength -> "Kart numarası geçersiz."
            !passesLuhn(digits) -> "Kart numarası geçersiz."
            else -> null
        },
        expiryError = if (!isValidExpiry(expiry)) "Son kullanma tarihi geçersiz." else null,
        cvcError = if (cvc.digitsOnly().length != cvcLength) "CVC eksik." else null
    )
}

private fun validateCheckout(
    fullName: String,
    email: String,
    phone: String,
    address: String,
    checkoutItems: List<CartItem>,
    checkoutTotal: Double,
    cardErrors: CardValidation
): String? {
    if (checkoutItems.isEmpty() || checkoutTotal <= 0.0) return "Ödeme başlatmak için sepetinde ürün olmalı."
    if (fullName.trim().length < 2) return "Alıcı ad soyad bilgisini gir."
    if (!email.trim().matches(Regex("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$"))) return "Geçerli bir e-posta adresi gir."
    if (address.trim().length < 10) return "Teslimat adresini eksiksiz gir."
    if (!phone.matches(Regex("^05\\d{9}$"))) return "Telefon numarası 05 ile başlamalı ve 11 hane olmalı."
    if (!cardErrors.isValid) return "Kart bilgilerini kontrol et."
    return null
}

private fun passesLuhn(number: String): Boolean {
    var sum = 0
    var alternate = false
    for (i in number.length - 1 downTo 0) {
        var digit = number[i].digitToIntOrNull() ?: return false
        if (alternate) {
            digit *= 2
            if (digit > 9) digit -= 9
        }
        sum += digit
        alternate = !alternate
    }
    return sum % 10 == 0
}

private fun isValidExpiry(expiry: String): Boolean {
    if (!expiry.matches(Regex("^\\d{2}/\\d{2}$"))) return false
    val month = expiry.take(2).toIntOrNull() ?: return false
    val year = expiry.takeLast(2).toIntOrNull() ?: return false
    if (month !in 1..12) return false
    val now = Calendar.getInstance()
    val expiryYear = 2000 + year
    val currentYear = now.get(Calendar.YEAR)
    val currentMonth = now.get(Calendar.MONTH) + 1
    return expiryYear > currentYear || (expiryYear == currentYear && month >= currentMonth)
}

private fun formatMoney(value: Double): String {
    return java.text.NumberFormat.getNumberInstance(Locale("tr", "TR")).apply {
        minimumFractionDigits = 2
        maximumFractionDigits = 2
    }.format(value) + " TL"
}
