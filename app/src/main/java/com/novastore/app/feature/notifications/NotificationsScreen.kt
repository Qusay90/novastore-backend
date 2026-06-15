package com.novastore.app.feature.notifications

import androidx.activity.compose.BackHandler
import androidx.annotation.StringRes
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.animation.togetherWith
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
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Article
import androidx.compose.material.icons.filled.AssignmentReturn
import androidx.compose.material.icons.filled.Campaign
import androidx.compose.material.icons.filled.ChatBubble
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.CreditCard
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.ExitToApp
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.Gavel
import androidx.compose.material.icons.filled.Help
import androidx.compose.material.icons.filled.Inventory2
import androidx.compose.material.icons.filled.KeyboardArrowLeft
import androidx.compose.material.icons.filled.Language
import androidx.compose.material.icons.filled.LocalOffer
import androidx.compose.material.icons.filled.LocalShipping
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.MarkEmailRead
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Payment
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Policy
import androidx.compose.material.icons.filled.ReceiptLong
import androidx.compose.material.icons.filled.Reviews
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Security
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Shield
import androidx.compose.material.icons.filled.ShoppingCart
import androidx.compose.material.icons.filled.SupportAgent
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Badge
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Divider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.novastore.app.R
import com.novastore.app.data.model.AccountCoupon
import com.novastore.app.data.model.AccountMessage
import com.novastore.app.data.model.AccountOrder
import com.novastore.app.data.model.CustomerAddress
import com.novastore.app.data.model.Notification
import com.novastore.app.data.model.ProductQuestion
import coil3.compose.AsyncImage
import java.text.NumberFormat
import java.time.OffsetDateTime
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlinx.coroutines.delay

private val PrimaryBlue = Color(0xFF0D4B7A)
private val DarkBlue = Color(0xFF08365C)
private val OrangeAccent = Color(0xFFF28C18)
private val LightBackground = Color(0xFFF7F8FA)
private val BorderColor = Color(0xFFEEF0F3)
private val SuccessGreen = Color(0xFF28C76F)
private val ErrorRed = Color(0xFFEA5455)
private val MutedText = Color(0xFF6B7280)

private enum class AccountPage(@StringRes val titleRes: Int) {
    Center(R.string.account_center),
    Orders(R.string.account_orders),
    OrderDetail(R.string.account_order_detail),
    Addresses(R.string.account_addresses),
    Payments(R.string.account_payments),
    Coupons(R.string.account_coupons),
    Security(R.string.account_security),
    Profile(R.string.account_profile),
    Tickets(R.string.account_tickets),
    Questions(R.string.account_questions),
    TicketDetail(R.string.account_ticket_detail),
    HelpCenter(R.string.account_help_center),
    Article(R.string.account_help_detail),
    Notifications(R.string.account_notifications),
    Returns(R.string.account_returns),
    Reviews(R.string.account_reviews),
    Invoices(R.string.account_invoices),
    NotificationSettings(R.string.account_notification_settings),
    Language(R.string.account_language_region),
    Privacy(R.string.account_privacy),
    Terms(R.string.account_terms)
}

private enum class HelpArticle(
    val title: String,
    val summary: String,
    val icon: ImageVector
) {
    Orders(
        title = "Sipariş takibi",
        summary = "Aktif siparişini, kargo bilgisini ve teslimat adımlarını kontrol et.",
        icon = Icons.Default.Inventory2
    ),
    Returns(
        title = "İade ve iptal",
        summary = "Teslim edilen siparişten iade talebi aç veya hazırlanan siparişi iptal et.",
        icon = Icons.Default.AssignmentReturn
    ),
    Tickets(
        title = "Destek talepleri",
        summary = "Müşteri hizmetlerine kayıtlı mesaj gönder ve önceki taleplerini takip et.",
        icon = Icons.Default.Article
    ),
    NovaBot(
        title = "NovaBot ve canlı destek",
        summary = "NovaBot ile ürün, sipariş ve destek sorularını çöz; gerekirse canlı desteğe aktar.",
        icon = Icons.Default.SupportAgent
    ),
    PaymentShipping(
        title = "Ödeme ve teslimat",
        summary = "Ödeme, fatura, kargo ve takip numarası konularında doğru ekrana ilerle.",
        icon = Icons.Default.Payment
    ),
    Account(
        title = "Hesap ve güvenlik",
        summary = "Profil, adres, güvenlik ve bildirim ayarlarını Hesabım içinden yönet.",
        icon = Icons.Default.Security
    )
}

@Composable
fun NotificationsScreen(
    onLogoutClick: () -> Unit,
    modifier: Modifier = Modifier,
    initialSection: String = AccountPage.Center.name,
    resetRootToken: Int = 0,
    onNavigateHome: () -> Unit = {},
    onNavigateFavorites: () -> Unit = {},
    onNavigateCart: () -> Unit = {},
    onNavigateSupport: () -> Unit = {},
    viewModel: NotificationsViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()
    val favoriteIds by viewModel.favoriteIds.collectAsState()
    val addresses by viewModel.addresses.collectAsState()
    var page by rememberSaveable {
        mutableStateOf(if (initialSection == AccountPage.Notifications.name) AccountPage.Notifications else AccountPage.Center)
    }
    var selectedOrder by remember { mutableStateOf<AccountOrder?>(null) }
    var selectedMessage by remember { mutableStateOf<AccountMessage?>(null) }
    var selectedArticle by rememberSaveable { mutableStateOf(HelpArticle.Orders) }
    var selectedCoupon by remember { mutableStateOf<AccountCoupon?>(null) }

    LaunchedEffect(Unit) {
        viewModel.loadAccount()
    }
    LaunchedEffect(resetRootToken) {
        if (resetRootToken > 0) {
            page = AccountPage.Center
            selectedOrder = null
            selectedMessage = null
            selectedCoupon = null
            viewModel.clearProfileSaveState()
            viewModel.clearSecurityActionMessage()
        }
    }
    LaunchedEffect(page) {
        when (page) {
            AccountPage.Tickets, AccountPage.TicketDetail -> viewModel.loadMessages()
            AccountPage.Questions -> viewModel.loadProductQuestions()
            AccountPage.Reviews -> viewModel.loadReviews()
            AccountPage.Security -> viewModel.loadSecurityStatus()
            else -> Unit
        }
    }
    LaunchedEffect(uiState.actionMessage) {
        if (uiState.actionMessage != null) {
            delay(1800)
            viewModel.clearActionMessage()
        }
    }
    LaunchedEffect(uiState.securityActionMessage) {
        if (uiState.securityActionMessage != null) {
            delay(2600)
            viewModel.clearSecurityActionMessage()
        }
    }

    val name = viewModel.currentUserName ?: "NovaStore Kullanıcısı"
    val email = viewModel.currentUserEmail ?: "novastore@hesap.com"
    val phone = viewModel.currentUserPhone ?: "05XXXXXXXXX"
    val activeOrder = uiState.orders.firstOrNull { it.isActiveOrder() } ?: uiState.orders.firstOrNull()
    val canGoBack = page != AccountPage.Center

    BackHandler(enabled = page != AccountPage.Center) {
        page = AccountPage.Center
    }

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(LightBackground)
    ) {
        AccountHeader(
            title = stringResource(page.titleRes),
            canGoBack = canGoBack,
            onBack = { page = AccountPage.Center },
            onNotificationsClick = { page = AccountPage.Notifications },
            onLogoutClick = {
                viewModel.logout()
                onLogoutClick()
            }
        )
        LazyColumn(
            modifier = Modifier.weight(1f),
            contentPadding = PaddingValues(bottom = 96.dp)
        ) {
        item {
            ActionMessageBanner(uiState.actionMessage)
        }
        item {
            when (page) {
                AccountPage.Center -> AccountCenterContent(
                    name = name,
                    email = email,
                    phone = phone,
                    favoriteCount = favoriteIds.size,
                    addressCount = addresses.size,
                    unreadCount = uiState.notifications.count { !it.isRead },
                    ordersLoading = uiState.ordersLoading,
                    activeOrder = activeOrder,
                    couponCount = uiState.coupons.size,
                    onPage = { page = it },
                    onNavigateFavorites = onNavigateFavorites,
                    onNavigateCart = onNavigateCart,
                    onNavigateSupport = onNavigateSupport
                )
                AccountPage.Orders -> OrdersPage(
                    state = uiState,
                    onOrderClick = { selectedOrder = it; page = AccountPage.OrderDetail },
                    onShop = onNavigateHome
                )
                AccountPage.OrderDetail -> OrderDetailPage(
                    order = selectedOrder ?: uiState.orders.firstOrNull(),
                    onRepeat = viewModel::repeatOrder,
                    onCancel = { viewModel.cancelOrder(it.id) },
                    onReturn = { viewModel.requestReturn(it.id) },
                    onSupport = onNavigateSupport,
                    onReview = { page = AccountPage.Reviews }
                )
                AccountPage.Addresses -> AddressesPage(
                    addresses = addresses,
                    sessionPhone = viewModel.currentUserPhone.orEmpty(),
                    onSave = viewModel::saveAddress,
                    onDelete = viewModel::deleteAddress,
                    onSelect = viewModel::selectAddress
                )
                AccountPage.Payments -> PaymentMethodsPage()
                AccountPage.Coupons -> CouponsComingSoonPage()
                AccountPage.Security -> SecurityPage(
                    state = uiState,
                    email = email,
                    phone = phone,
                    onRefresh = viewModel::loadSecurityStatus,
                    onChangePassword = viewModel::changePassword,
                    onForgotPassword = viewModel::sendPasswordReset,
                    onPhoneVerify = viewModel::sendPhoneVerification,
                    onEmailVerify = viewModel::sendEmailVerification,
                    onTwoFactor = viewModel::setupTwoFactor,
                    onDismissMessage = viewModel::clearSecurityActionMessage
                )
                AccountPage.Profile -> ProfilePageV2(
                    name = name,
                    email = email,
                    phone = phone,
                    saving = uiState.profileSaving,
                    saved = uiState.profileSaved,
                    error = uiState.profileError,
                    onClearState = viewModel::clearProfileSaveState,
                    onSave = viewModel::updateProfile
                )
                AccountPage.Tickets -> SupportTicketsPage(
                    state = uiState,
                    currentUserId = viewModel.currentUserId,
                    onTicketClick = { selectedMessage = it; page = AccountPage.TicketDetail },
                    onSend = viewModel::sendSupportMessage,
                    onSupport = onNavigateSupport
                )
                AccountPage.TicketDetail -> TicketDetailPage(
                    message = selectedMessage,
                    currentUserId = viewModel.currentUserId,
                    onSend = viewModel::sendSupportMessage
                )
                AccountPage.Questions -> ProductQuestionsPage(state = uiState)
                AccountPage.HelpCenter -> HelpCenterPage(
                    state = uiState,
                    onArticle = { selectedArticle = it; page = AccountPage.Article },
                    onOrders = { page = AccountPage.Orders },
                    onReturns = { page = AccountPage.Returns },
                    onTickets = { page = AccountPage.Tickets },
                    onSupport = onNavigateSupport
                )
                AccountPage.Article -> ArticlePage(
                    article = selectedArticle,
                    state = uiState,
                    onOrders = { page = AccountPage.Orders },
                    onReturns = { page = AccountPage.Returns },
                    onTickets = { page = AccountPage.Tickets },
                    onOrderClick = { selectedOrder = it; page = AccountPage.OrderDetail },
                    onSupport = onNavigateSupport
                )
                AccountPage.Notifications -> NotificationsPage(
                    state = uiState,
                    onMarkRead = viewModel::markAsRead,
                    onReadAll = viewModel::markAllAsRead
                )
                AccountPage.Returns -> ReturnsPage(
                    orders = uiState.orders,
                    onOrderClick = { selectedOrder = it; page = AccountPage.OrderDetail }
                )
                AccountPage.Reviews -> ReviewsPage(state = uiState)
                AccountPage.Invoices -> InvoicesPage(orders = uiState.orders)
                AccountPage.NotificationSettings -> NotificationSettingsPage()
                AccountPage.Language -> LegalPage(
                    "Dil ve Bölge",
                    "Uygulama dili Türkçe, bölge Türkiye ve para birimi TL olarak ayarlı."
                )
                AccountPage.Privacy -> LegalPage(
                    "Gizlilik Politikası",
                    "NovaStore hesap, sipariş ve ödeme verilerini güvenli alışveriş deneyimi sunmak için işler. Kişisel veriler izin verilen amaçlar dışında paylaşılmaz."
                )
                AccountPage.Terms -> LegalPage(
                    "Kullanım Şartları",
                    "NovaStore hesabını kullanarak sipariş, iade, kupon ve destek hizmetlerinin uygulama koşullarını kabul etmiş olursun."
                )
            }
        }
        }
    }

    selectedCoupon?.let { coupon ->
        AlertDialog(
            onDismissRequest = { selectedCoupon = null },
            title = { Text(coupon.code, color = DarkBlue, fontWeight = FontWeight.Bold) },
            text = { Text(coupon.description(), color = MutedText) },
            confirmButton = {
                Button(onClick = { selectedCoupon = null }, colors = ButtonDefaults.buttonColors(containerColor = OrangeAccent)) {
                    Text("Tamam")
                }
            }
        )
    }
}

@Composable
private fun AccountHeader(
    title: String,
    canGoBack: Boolean,
    onBack: () -> Unit,
    onNotificationsClick: () -> Unit,
    onLogoutClick: () -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(120.dp)
            .background(PrimaryBlue)
            .statusBarsPadding()
            .padding(horizontal = 16.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        if (canGoBack) {
            IconButton(onClick = onBack, modifier = Modifier.size(40.dp)) {
                Icon(Icons.Default.KeyboardArrowLeft, contentDescription = "Geri", tint = Color.White, modifier = Modifier.size(30.dp))
            }
        } else {
            Icon(painterResource(id = R.drawable.support_novastore), contentDescription = "NovaStore", tint = Color.Unspecified, modifier = Modifier.size(42.dp))
        }
        Spacer(modifier = Modifier.width(12.dp))
        Text(
            title,
            modifier = Modifier.weight(1f),
            color = Color.White,
            fontWeight = FontWeight.ExtraBold,
            fontSize = if (title.length > 16) 21.sp else 26.sp,
            lineHeight = 23.sp,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis
        )
        IconButton(onClick = onNotificationsClick) {
            Icon(Icons.Default.Notifications, contentDescription = "Bildirimler", tint = Color.White, modifier = Modifier.size(25.dp))
        }
        IconButton(onClick = onLogoutClick) {
            Icon(Icons.Default.ExitToApp, contentDescription = "Çıkış Yap", tint = Color.White, modifier = Modifier.size(25.dp))
        }
    }
}

@Composable
private fun ActionMessageBanner(message: String?) {
    AnimatedVisibility(
        visible = message != null,
        enter = fadeIn() + scaleIn(initialScale = 0.96f),
        exit = fadeOut() + scaleOut(targetScale = 0.96f)
    ) {
        Card(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 10.dp),
            shape = RoundedCornerShape(12.dp),
            colors = CardDefaults.cardColors(containerColor = Color(0xFFEAFBF1)),
            border = BorderStroke(1.dp, SuccessGreen.copy(alpha = 0.35f))
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 14.dp, vertical = 12.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(Icons.Default.CheckCircle, contentDescription = null, tint = SuccessGreen, modifier = Modifier.size(22.dp))
                Spacer(modifier = Modifier.width(10.dp))
                Text(message.orEmpty(), color = DarkBlue, fontWeight = FontWeight.Bold)
            }
        }
    }
}

@Composable
private fun AccountCenterContent(
    name: String,
    email: String,
    phone: String,
    favoriteCount: Int,
    addressCount: Int,
    unreadCount: Int,
    ordersLoading: Boolean,
    activeOrder: AccountOrder?,
    couponCount: Int,
    onPage: (AccountPage) -> Unit,
    onNavigateFavorites: () -> Unit,
    onNavigateCart: () -> Unit,
    onNavigateSupport: () -> Unit
) {
    Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        ProfileCard(name, email, phone, onEdit = { onPage(AccountPage.Profile) })
        QuickActions(
            favoriteCount = favoriteCount,
            addressCount = addressCount,
            onOrders = { onPage(AccountPage.Orders) },
            onFavorites = onNavigateFavorites,
            onCoupons = { onPage(AccountPage.Coupons) },
            onAddresses = { onPage(AccountPage.Addresses) }
        )
        when {
            ordersLoading -> LoadingCard("Siparişlerin yükleniyor")
            activeOrder != null -> OrderSummaryCard(activeOrder, onOrders = { onPage(AccountPage.Orders) })
            else -> StateCard(Icons.Default.Inventory2, "Henüz sipariş yok", "Alışveriş yaptığında sipariş durumun burada görünecek.")
        }
        CouponHighlightCard(couponCount = couponCount, onClick = { onPage(AccountPage.Coupons) })
        SecuritySummaryCard(onClick = { onPage(AccountPage.Security) })
        MenuSection(
            title = stringResource(R.string.account_menu_shopping),
            items = listOf(
                MenuItemSpec(Icons.Default.Inventory2, stringResource(R.string.account_orders)) { onPage(AccountPage.Orders) },
                MenuItemSpec(Icons.Default.AssignmentReturn, stringResource(R.string.account_returns)) { onPage(AccountPage.Returns) },
                MenuItemSpec(Icons.Default.Favorite, stringResource(R.string.tab_favorites), badge = favoriteCount.takeIf { it > 0 }) { onNavigateFavorites() },
                MenuItemSpec(Icons.Default.ShoppingCart, stringResource(R.string.tab_cart)) { onNavigateCart() },
                MenuItemSpec(Icons.Default.Reviews, stringResource(R.string.account_reviews)) { onPage(AccountPage.Reviews) }
            )
        )
        MenuSection(
            title = stringResource(R.string.account_menu_info),
            items = listOf(
                MenuItemSpec(Icons.Default.Person, stringResource(R.string.account_profile)) { onPage(AccountPage.Profile) },
                MenuItemSpec(Icons.Default.LocationOn, stringResource(R.string.account_addresses), badge = addressCount.takeIf { it > 0 }) { onPage(AccountPage.Addresses) },
                MenuItemSpec(Icons.Default.Payment, stringResource(R.string.account_payments)) { onPage(AccountPage.Payments) },
                MenuItemSpec(Icons.Default.ReceiptLong, stringResource(R.string.account_invoices)) { onPage(AccountPage.Invoices) },
                MenuItemSpec(Icons.Default.Lock, stringResource(R.string.account_security)) { onPage(AccountPage.Security) }
            )
        )
        MenuSection(
            title = stringResource(R.string.account_menu_support),
            items = listOf(
                MenuItemSpec(Icons.Default.SupportAgent, stringResource(R.string.account_customer_service)) { onNavigateSupport() },
                MenuItemSpec(Icons.Default.ChatBubble, stringResource(R.string.account_live_support)) { onNavigateSupport() },
                MenuItemSpec(Icons.Default.Article, stringResource(R.string.account_tickets)) { onPage(AccountPage.Tickets) },
                MenuItemSpec(Icons.Default.Help, stringResource(R.string.account_questions)) { onPage(AccountPage.Questions) },
                MenuItemSpec(Icons.Default.Help, stringResource(R.string.account_faq)) { onPage(AccountPage.HelpCenter) }
            )
        )
        MenuSection(
            title = stringResource(R.string.account_menu_settings),
            items = listOf(
                MenuItemSpec(Icons.Default.Notifications, stringResource(R.string.account_notification_settings), badge = unreadCount.takeIf { it > 0 }) { onPage(AccountPage.NotificationSettings) },
                MenuItemSpec(Icons.Default.Language, stringResource(R.string.account_language_region)) { onPage(AccountPage.Language) },
                MenuItemSpec(Icons.Default.Policy, stringResource(R.string.account_privacy)) { onPage(AccountPage.Privacy) },
                MenuItemSpec(Icons.Default.Gavel, stringResource(R.string.account_terms)) { onPage(AccountPage.Terms) }
            )
        )
        HelpShortcutCard(onLiveSupport = onNavigateSupport, onHelp = { onPage(AccountPage.HelpCenter) })
    }
}

@Composable
private fun ProfileCard(name: String, email: String, phone: String, onEdit: () -> Unit) {
    AccountCard {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(modifier = Modifier.size(64.dp).clip(CircleShape).background(OrangeAccent.copy(alpha = 0.12f)), contentAlignment = Alignment.Center) {
                Text(name.firstOrNull()?.uppercaseChar()?.toString() ?: "N", color = OrangeAccent, fontWeight = FontWeight.ExtraBold, fontSize = 26.sp)
            }
            Spacer(modifier = Modifier.width(14.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(name, color = DarkBlue, fontWeight = FontWeight.ExtraBold, fontSize = 19.sp)
                Text(email, color = MutedText, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(phone, color = MutedText)
            }
        }
        Button(onClick = onEdit, colors = ButtonDefaults.buttonColors(containerColor = PrimaryBlue), shape = RoundedCornerShape(12.dp), modifier = Modifier.fillMaxWidth().height(44.dp).padding(top = 8.dp)) {
            Text("Profili Düzenle", fontWeight = FontWeight.Bold)
        }
    }
}

@Composable
private fun QuickActions(
    favoriteCount: Int,
    addressCount: Int,
    onOrders: () -> Unit,
    onFavorites: () -> Unit,
    onCoupons: () -> Unit,
    onAddresses: () -> Unit
) {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            QuickActionCard(Icons.Default.Inventory2, "Siparişlerim", Modifier.weight(1f), onOrders)
            QuickActionCard(Icons.Default.Favorite, "Favorilerim${if (favoriteCount > 0) " ($favoriteCount)" else ""}", Modifier.weight(1f), onFavorites)
        }
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            QuickActionCard(Icons.Default.LocalOffer, "Kuponlarım", Modifier.weight(1f), onCoupons)
            QuickActionCard(Icons.Default.LocationOn, "Adreslerim${if (addressCount > 0) " ($addressCount)" else ""}", Modifier.weight(1f), onAddresses)
        }
    }
}

@Composable
private fun QuickActionCard(icon: ImageVector, label: String, modifier: Modifier, onClick: () -> Unit) {
    AccountCard(modifier = modifier.clickable(onClick = onClick)) {
        Icon(icon, contentDescription = label, tint = OrangeAccent, modifier = Modifier.size(28.dp))
        Spacer(modifier = Modifier.height(8.dp))
        Text(label, color = DarkBlue, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

@Composable
private fun OrderSummaryCard(order: AccountOrder, onOrders: () -> Unit) {
    AccountCard {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(modifier = Modifier.weight(1f)) {
                Text("Hızlı Sipariş Durumu", color = DarkBlue, fontWeight = FontWeight.ExtraBold, fontSize = 18.sp)
                Text(order.displayNo(), color = DarkBlue, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 8.dp))
                Text("${order.formatDate()} • ${order.formatAmount()}", color = MutedText)
            }
            Badge(containerColor = order.statusColor(), contentColor = Color.White) {
                Text(order.displayStatus(), modifier = Modifier.padding(horizontal = 4.dp))
            }
        }
        if (order.isPendingPaymentOrder() || order.isFailedPaymentOrder()) {
            Text(
                order.statusNote ?: if (order.isPendingPaymentOrder()) {
                    "Ödeme tamamlanmadan sipariş kesinleşmez."
                } else {
                    "Ödeme tamamlanmadığı için sipariş kesinleşmedi."
                },
                color = MutedText,
                fontSize = 12.sp,
                modifier = Modifier.padding(top = 10.dp)
            )
        } else {
            ProgressTimeline(activeStage = order.stage())
        }
        Button(onClick = onOrders, colors = ButtonDefaults.buttonColors(containerColor = PrimaryBlue), shape = RoundedCornerShape(12.dp), modifier = Modifier.fillMaxWidth().height(44.dp).padding(top = 8.dp)) {
            Text("Siparişlerimi Gör", fontWeight = FontWeight.Bold)
        }
    }
}

@Composable
private fun ProgressTimeline(activeStage: Int) {
    val steps = listOf("Hazırlanıyor", "Kargoya Verildi", "Dağıtımda", "Teslim Edildi")
    Row(modifier = Modifier.fillMaxWidth().padding(top = 14.dp), horizontalArrangement = Arrangement.SpaceBetween) {
        steps.forEachIndexed { index, step ->
            Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.weight(1f)) {
                Box(
                    modifier = Modifier.size(28.dp).clip(CircleShape).background(if (index <= activeStage) OrangeAccent else BorderColor),
                    contentAlignment = Alignment.Center
                ) {
                    if (index <= activeStage) Icon(Icons.Default.CheckCircle, contentDescription = null, tint = Color.White, modifier = Modifier.size(16.dp))
                }
                Text(step, color = if (index <= activeStage) DarkBlue else MutedText, fontSize = 11.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
    }
}

@Composable
private fun CouponHighlightCard(couponCount: Int, onClick: () -> Unit) {
    AccountCard(modifier = Modifier.clickable(onClick = onClick)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Default.LocalOffer, contentDescription = null, tint = OrangeAccent, modifier = Modifier.size(34.dp))
            Spacer(modifier = Modifier.width(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(if (couponCount > 0) "$couponCount aktif kuponun var" else "Aktif kupon yok", color = DarkBlue, fontWeight = FontWeight.ExtraBold)
                Text(if (couponCount > 0) "Geçerli indirimlerini görüntüle." else "Yeni kampanyalar burada görünecek.", color = MutedText)
            }
            Icon(Icons.Default.ChevronRight, contentDescription = null, tint = MutedText)
        }
    }
}

@Composable
private fun SecuritySummaryCard(onClick: () -> Unit) {
    AccountCard(modifier = Modifier.clickable(onClick = onClick)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Default.Security, contentDescription = null, tint = SuccessGreen, modifier = Modifier.size(32.dp))
            Spacer(modifier = Modifier.width(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text("Hesap Güvenliği", color = DarkBlue, fontWeight = FontWeight.ExtraBold)
                Text("E-posta doğrulaması ve güvenlik önerilerini gör.", color = MutedText)
            }
            Icon(Icons.Default.ChevronRight, contentDescription = null, tint = MutedText)
        }
    }
}

private data class MenuItemSpec(
    val icon: ImageVector,
    val title: String,
    val badge: Int? = null,
    val destructive: Boolean = false,
    val onClick: () -> Unit
)

@Composable
private fun MenuSection(title: String, items: List<MenuItemSpec>) {
    AccountCard(contentPadding = 0.dp) {
        Text(title, color = MutedText, fontWeight = FontWeight.Bold, modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp))
        items.forEachIndexed { index, item ->
            Row(
                modifier = Modifier.fillMaxWidth().clickable(onClick = item.onClick).padding(horizontal = 16.dp, vertical = 14.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(item.icon, contentDescription = null, tint = if (item.destructive) ErrorRed else OrangeAccent, modifier = Modifier.size(24.dp))
                Spacer(modifier = Modifier.width(12.dp))
                Text(item.title, color = if (item.destructive) ErrorRed else DarkBlue, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                item.badge?.let { Badge(containerColor = OrangeAccent, contentColor = Color.White) { Text(it.toString()) } }
                Icon(Icons.Default.ChevronRight, contentDescription = null, tint = MutedText)
            }
            if (index < items.lastIndex) Divider(color = BorderColor)
        }
    }
}

@Composable
private fun HelpShortcutCard(onLiveSupport: () -> Unit, onHelp: () -> Unit) {
    AccountCard {
        Text("Yardıma mı ihtiyacın var?", color = DarkBlue, fontWeight = FontWeight.ExtraBold)
        Text(stringResource(R.string.account_help_shortcut_text), color = MutedText, modifier = Modifier.padding(top = 4.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.padding(top = 12.dp)) {
            Button(onClick = onLiveSupport, colors = ButtonDefaults.buttonColors(containerColor = OrangeAccent), shape = RoundedCornerShape(12.dp), modifier = Modifier.weight(1f).height(44.dp)) {
                Text(stringResource(R.string.account_live_support), fontWeight = FontWeight.Bold)
            }
            OutlinedButton(onClick = onHelp, border = BorderStroke(1.dp, PrimaryBlue), shape = RoundedCornerShape(12.dp), modifier = Modifier.weight(1f).height(44.dp)) {
                Text(stringResource(R.string.account_help_center), color = PrimaryBlue, fontWeight = FontWeight.Bold)
            }
        }
    }
}

@Composable
private fun OrdersPage(state: NotificationsUiState, onOrderClick: (AccountOrder) -> Unit, onShop: () -> Unit) {
    Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        SegmentHeader(listOf("Aktif", "Tamamlanan", "İptal/İade"))
        when {
            state.ordersLoading -> LoadingCard("Siparişler yükleniyor")
            state.ordersError != null -> StateCard(Icons.Default.Warning, "Siparişler yüklenemedi", state.ordersError, danger = true)
            state.orders.isEmpty() -> StateCard(Icons.Default.Inventory2, "Henüz sipariş yok", "Alışveriş yaptığında siparişlerin burada listelenecek.")
            else -> state.orders.forEach { order -> OrderCard(order, onClick = { onOrderClick(order) }) }
        }
        Button(onClick = onShop, colors = ButtonDefaults.buttonColors(containerColor = OrangeAccent), shape = RoundedCornerShape(12.dp), modifier = Modifier.fillMaxWidth().height(44.dp)) {
            Text("Alışverişe Başla", fontWeight = FontWeight.Bold)
        }
    }
}

@Composable
private fun OrderCard(order: AccountOrder, onClick: () -> Unit) {
    AccountCard(modifier = Modifier.clickable(onClick = onClick)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Default.Inventory2, contentDescription = null, tint = OrangeAccent, modifier = Modifier.size(34.dp))
            Spacer(modifier = Modifier.width(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(order.displayNo(), color = DarkBlue, fontWeight = FontWeight.Bold)
                Text(order.formatDate(), color = MutedText, fontSize = 13.sp)
                Text(order.formatAmount(), color = DarkBlue, fontWeight = FontWeight.ExtraBold)
            }
            Text(order.displayStatus(), color = order.statusColor(), fontWeight = FontWeight.Bold, fontSize = 12.sp)
        }
    }
}

@Composable
private fun OrderDetailPage(
    order: AccountOrder?,
    onRepeat: (AccountOrder) -> Unit,
    onCancel: (AccountOrder) -> Unit,
    onReturn: (AccountOrder) -> Unit,
    onSupport: () -> Unit,
    onReview: () -> Unit
) {
    if (order == null) {
        Column(modifier = Modifier.padding(16.dp)) {
            StateCard(Icons.Default.Inventory2, "Sipariş seçilmedi", "Siparişlerim ekranından bir sipariş seçebilirsin.")
        }
        return
    }

    Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        AccountCard {
            Text(order.displayNo(), color = DarkBlue, fontWeight = FontWeight.ExtraBold, fontSize = 20.sp)
            Text("${order.formatDate()} • ${order.formatAmount()}", color = MutedText)
            Spacer(modifier = Modifier.height(12.dp))
            if (order.isPendingPaymentOrder() || order.isFailedPaymentOrder()) {
                Text(
                    order.statusNote ?: if (order.isPendingPaymentOrder()) {
                        "Ödeme tamamlanmadan sipariş kesinleşmez."
                    } else {
                        "Ödeme tamamlanmadığı için sipariş kesinleşmedi."
                    },
                    color = MutedText,
                    modifier = Modifier.padding(top = 8.dp)
                )
            } else {
                ProgressTimeline(activeStage = order.stage())
            }
        }
        AccountCard {
            Text("Ürünler", color = DarkBlue, fontWeight = FontWeight.ExtraBold)
            order.items.orEmpty().forEach { item ->
                Text("${item.quantity ?: 1} x ${item.name ?: "NovaStore Ürünü"}", color = DarkBlue, modifier = Modifier.padding(top = 8.dp))
                Text(formatCurrency(item.lineTotal ?: ((item.price ?: 0.0) * (item.quantity ?: 1))), color = MutedText)
            }
        }
        InfoCard("Ödeme", "${order.paymentStatus ?: "Bilinmiyor"} • ${order.paymentMethod ?: "Yöntem yok"}", Icons.Default.Payment, success = order.paymentStatus == "PAID")
        InfoCard("Teslimat", order.shipmentText(), Icons.Default.LocalShipping, warning = order.trackingNo.isNullOrBlank().not())
        InfoCard("Fatura", if (order.paymentStatus == "PAID") "Fatura ödeme tamamlandıktan sonra yönetim panelinde oluşturulur." else "Fatura ödeme tamamlanınca hazırlanır.", Icons.Default.ReceiptLong)
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Button(onClick = { onRepeat(order) }, colors = ButtonDefaults.buttonColors(containerColor = PrimaryBlue), shape = RoundedCornerShape(12.dp), modifier = Modifier.weight(1f).height(44.dp)) {
                Text("Tekrar Sipariş Ver", fontSize = 12.sp)
            }
            Button(onClick = onReview, enabled = order.isDelivered(), colors = ButtonDefaults.buttonColors(containerColor = OrangeAccent), shape = RoundedCornerShape(12.dp), modifier = Modifier.weight(1f).height(44.dp)) {
                Text("Değerlendir", fontSize = 12.sp)
            }
        }
        if (order.canCancel()) {
            OutlinedButton(onClick = { onCancel(order) }, border = BorderStroke(1.dp, ErrorRed), shape = RoundedCornerShape(12.dp), modifier = Modifier.fillMaxWidth().height(44.dp)) {
                Text("Siparişi İptal Et", color = ErrorRed, fontWeight = FontWeight.Bold)
            }
        }
        if (order.isDelivered()) {
            OutlinedButton(onClick = { onReturn(order) }, border = BorderStroke(1.dp, OrangeAccent), shape = RoundedCornerShape(12.dp), modifier = Modifier.fillMaxWidth().height(44.dp)) {
                Text("İade Talebi Oluştur", color = OrangeAccent, fontWeight = FontWeight.Bold)
            }
        }
        OutlinedButton(onClick = onSupport, border = BorderStroke(1.dp, PrimaryBlue), shape = RoundedCornerShape(12.dp), modifier = Modifier.fillMaxWidth().height(44.dp)) {
            Text("Destek Al", color = PrimaryBlue, fontWeight = FontWeight.Bold)
        }
    }
}

@Composable
private fun AddressesPage(
    addresses: List<CustomerAddress>,
    sessionPhone: String = "",
    onSave: (CustomerAddress) -> Unit,
    onDelete: (Long) -> Unit,
    onSelect: (Long) -> Unit
) {
    var editing by remember { mutableStateOf<CustomerAddress?>(null) }
    var showForm by remember { mutableStateOf(addresses.isEmpty()) }
    Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        if (addresses.isEmpty() && !showForm) {
            StateCard(Icons.Default.LocationOn, "Kayıtlı adres yok", "Teslimat adresini eklediğinde Home ve Checkout ekranlarında da kullanılacak.")
        }
        addresses.forEach { address ->
            AccountCard {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Default.LocationOn, contentDescription = null, tint = OrangeAccent, modifier = Modifier.size(28.dp))
                    Spacer(modifier = Modifier.width(12.dp))
                    Column(modifier = Modifier.weight(1f)) {
                        Text(address.title, color = DarkBlue, fontWeight = FontWeight.ExtraBold)
                        Text(address.singleLine, color = MutedText, maxLines = 2)
                        Text(address.fullName, color = MutedText, fontSize = 12.sp)
                    }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(top = 12.dp)) {
                    SmallActionButton("Düzenle", Icons.Default.Edit) { editing = address; showForm = true }
                    SmallActionButton("Varsayılan", Icons.Default.CheckCircle) { onSelect(address.id) }
                    SmallActionButton("Sil", Icons.Default.Delete, danger = true) { onDelete(address.id) }
                }
            }
        }
        if (showForm) {
            AddressForm(
                initial = editing,
                sessionPhone = sessionPhone,
                onCancel = { showForm = false; editing = null },
                onSave = {
                    onSave(it)
                    showForm = false
                    editing = null
                }
            )
        } else {
            Button(onClick = { editing = null; showForm = true }, colors = ButtonDefaults.buttonColors(containerColor = OrangeAccent), shape = RoundedCornerShape(12.dp), modifier = Modifier.fillMaxWidth().height(44.dp)) {
                Icon(Icons.Default.Add, contentDescription = null)
                Spacer(modifier = Modifier.width(8.dp))
                Text("Adres Ekle", fontWeight = FontWeight.Bold)
            }
        }
    }
}

@Composable
private fun AddressForm(initial: CustomerAddress?, sessionPhone: String = "", onCancel: () -> Unit, onSave: (CustomerAddress) -> Unit) {
    var title by remember(initial) { mutableStateOf(initial?.title ?: "") }
    var fullName by remember(initial) { mutableStateOf(initial?.fullName ?: "") }
    // Pre-fill phone from: existing address phone > session phone > empty
    var phone by remember(initial) { mutableStateOf(initial?.phone?.ifBlank { sessionPhone } ?: sessionPhone) }
    var city by remember(initial) { mutableStateOf(initial?.city ?: "") }
    var district by remember(initial) { mutableStateOf(initial?.district ?: "") }
    var detail by remember(initial) { mutableStateOf(initial?.detail ?: "") }
    AccountCard {
        OutlinedTextField(title, { title = it }, label = { Text("Başlık") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
        OutlinedTextField(fullName, { fullName = it }, label = { Text("Alıcı Ad Soyad") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
        OutlinedTextField(phone, { phone = it.filter(Char::isDigit).take(11) }, label = { Text("Telefon") }, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone), modifier = Modifier.fillMaxWidth(), singleLine = true)
        OutlinedTextField(city, { city = it }, label = { Text("İl") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
        OutlinedTextField(district, { district = it }, label = { Text("İlçe") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
        OutlinedTextField(detail, { detail = it }, label = { Text("Açık Adres") }, modifier = Modifier.fillMaxWidth())
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(top = 10.dp)) {
            OutlinedButton(onClick = onCancel, modifier = Modifier.weight(1f).height(44.dp)) { Text("Vazgeç") }
            Button(
                onClick = {
                    onSave(
                        CustomerAddress(
                            id = initial?.id ?: 0L,
                            title = title.ifBlank { "Adres" },
                            fullName = fullName,
                            phone = phone,
                            city = city,
                            district = district,
                            detail = detail
                        )
                    )
                },
                colors = ButtonDefaults.buttonColors(containerColor = OrangeAccent),
                modifier = Modifier.weight(1f).height(44.dp)
            ) { Text("Kaydet") }
        }
    }
}

@Composable
private fun PaymentMethodsPage() {
    Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        StateCard(Icons.Default.CreditCard, "Kayıtlı kart yok", "Güvenliğiniz için kart bilgileri uygulamada saklanmaz. Ödeme sırasında kart bilgilerini girerek işlemi tamamlarsınız.")
        InfoCard("Güvenli Ödeme", "Kart bilgileri yalnızca ödeme sağlayıcısı üzerinden işlenir.", Icons.Default.Security, success = true)
    }
}

@Composable
private fun CouponsComingSoonPage() {
    Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        AccountCard {
            Box(
                modifier = Modifier
                    .size(76.dp)
                    .clip(CircleShape)
                    .background(OrangeAccent.copy(alpha = 0.12f))
                    .align(Alignment.CenterHorizontally),
                contentAlignment = Alignment.Center
            ) {
                Icon(Icons.Default.LocalOffer, contentDescription = null, tint = OrangeAccent, modifier = Modifier.size(42.dp))
            }
            Spacer(modifier = Modifier.height(14.dp))
            Text("Kuponlar yakında aktif olacak.", color = DarkBlue, fontWeight = FontWeight.ExtraBold, fontSize = 20.sp, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
            Text(
                "Yeni indirim ve kupon özellikleri çok yakında burada. Kampanyalar hazır olduğunda bildirimlerden takip edebileceksin.",
                color = MutedText,
                lineHeight = 22.sp,
                textAlign = TextAlign.Center,
                modifier = Modifier.padding(top = 8.dp)
            )
        }
        InfoCard("Bildirimleri açık tut", "Kupon ve kampanya duyuruları aktif olduğunda burada ve bildirim ekranında görünecek.", Icons.Default.Notifications, warning = true)
    }
}

@Composable
private fun CouponsPage(state: NotificationsUiState, onCouponClick: (AccountCoupon) -> Unit) {
    Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        SegmentHeader(listOf("Aktif", "Kullanılmış", "Süresi Dolmuş"))
        when {
            state.couponsLoading -> LoadingCard("Kuponlar yükleniyor")
            state.couponsError != null -> StateCard(Icons.Default.Warning, "Kuponlar yüklenemedi", state.couponsError, danger = true)
            state.coupons.isEmpty() -> StateCard(Icons.Default.LocalOffer, "Aktif kupon yok", "Geçerli kampanyalar burada görünecek.")
            else -> state.coupons.forEach { coupon ->
                Card(modifier = Modifier.fillMaxWidth().clickable { onCouponClick(coupon) }, shape = RoundedCornerShape(12.dp), colors = CardDefaults.cardColors(containerColor = Color(0xFFFFF4E5)), border = BorderStroke(1.dp, OrangeAccent)) {
                    Row(modifier = Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Default.LocalOffer, contentDescription = null, tint = OrangeAccent, modifier = Modifier.size(30.dp))
                        Spacer(modifier = Modifier.width(12.dp))
                        Column(modifier = Modifier.weight(1f)) {
                            Text(coupon.code, color = DarkBlue, fontWeight = FontWeight.ExtraBold)
                            Text(coupon.shortDescription(), color = MutedText)
                        }
                        Text("Detay", color = OrangeAccent, fontWeight = FontWeight.Bold)
                    }
                }
            }
        }
    }
}

private enum class SecurityDialog {
    Password,
    Phone,
    Email,
    TwoFactor
}

@Composable
private fun SecurityPage(
    state: NotificationsUiState,
    email: String,
    phone: String,
    onRefresh: () -> Unit,
    onChangePassword: (String, String, String) -> Unit,
    onForgotPassword: (String?) -> Unit,
    onPhoneVerify: (String?) -> Unit,
    onEmailVerify: () -> Unit,
    onTwoFactor: () -> Unit,
    onDismissMessage: () -> Unit
) {
    var dialog by remember { mutableStateOf<SecurityDialog?>(null) }
    val status = state.securityStatus
    val statusPhone = status?.phone ?: phone.takeIf { !it.contains("X") }
    val statusEmail = status?.email ?: email

    LaunchedEffect(state.securityActionMessage) {
        if (dialog != SecurityDialog.Password && !state.securityActionMessage.isNullOrBlank() && !state.passwordChanged) {
            delay(3200)
            onDismissMessage()
        }
    }

    Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        if (state.securityLoading) {
            AccountCard {
                Text("Güvenlik durumu hazırlanıyor", color = DarkBlue, fontWeight = FontWeight.ExtraBold)
                LinearProgressIndicator(
                    modifier = Modifier.fillMaxWidth().padding(top = 12.dp),
                    color = OrangeAccent,
                    trackColor = BorderColor
                )
            }
        }
        state.securityError?.let {
            CompactSecurityErrorCard(message = it, onRefresh = onRefresh)
        }
        if (dialog != SecurityDialog.Password) state.securityActionMessage?.let { message ->
            SecurityNoticeBar(message = message, success = state.passwordChanged, onDismiss = onDismissMessage)
        }
        SecurityActionCard(
            icon = Icons.Default.Lock,
            title = "Şifre Değiştir",
            description = "Hesabının güvenliği için şifreni düzenli olarak güncelle.",
            status = if (status?.hasPassword == false) "Eksik" else "Hazır",
            statusColor = if (status?.hasPassword == false) ErrorRed else SuccessGreen,
            onClick = { dialog = SecurityDialog.Password }
        )
        SecurityActionCard(
            icon = Icons.Default.CheckCircle,
            title = "Telefon Doğrulama",
            description = if (statusPhone.isNullOrBlank()) "Telefon numarası eklenmemiş." else "Teslimat iletişimi için telefon numaranı doğrula.",
            status = if (status?.phoneVerified == true) "Doğrulandı" else if (statusPhone.isNullOrBlank()) "Eksik" else "Doğrulanmadı",
            statusColor = if (status?.phoneVerified == true) SuccessGreen else OrangeAccent,
            onClick = { dialog = SecurityDialog.Phone }
        )
        SecurityActionCard(
            icon = Icons.Default.MarkEmailRead,
            title = "E-posta Doğrulama",
            description = "Sipariş ve güvenlik bildirimleri için e-posta adresini doğrula.",
            status = if (status?.emailVerified == true) "Doğrulandı" else "Doğrulanmadı",
            statusColor = if (status?.emailVerified == true) SuccessGreen else OrangeAccent,
            onClick = { dialog = SecurityDialog.Email }
        )
        SecurityActionCard(
            icon = Icons.Default.Shield,
            title = "İki Adımlı Doğrulama",
            description = "Hesabına ekstra güvenlik katmanı ekle.",
            status = if (status?.twoFactorEnabled == true) "Aktif" else "Pasif",
            statusColor = if (status?.twoFactorEnabled == true) SuccessGreen else MutedText,
            onClick = { dialog = SecurityDialog.TwoFactor }
        )
    }

    when (dialog) {
        SecurityDialog.Password -> ChangePasswordDialog(
            loading = state.securityActionLoading,
            changed = state.passwordChanged,
            message = state.securityActionMessage,
            onDismiss = { dialog = null; onDismissMessage() },
            onSubmit = onChangePassword,
            onForgot = { onForgotPassword(statusEmail) }
        )
        SecurityDialog.Phone -> ServiceActionDialog(
            title = "Telefon Doğrulama",
            description = if (statusPhone.isNullOrBlank()) "Telefon numaranı profil bilgilerinden ekledikten sonra doğrulama kodu isteyebilirsin." else "$statusPhone numarası için doğrulama kodu gönderilecek.",
            action = "Doğrulama Kodu Gönder",
            loading = state.securityActionLoading,
            onDismiss = { dialog = null },
            onAction = {
                dialog = null
                onPhoneVerify(statusPhone)
            }
        )
        SecurityDialog.Email -> ServiceActionDialog(
            title = "E-posta Doğrulama",
            description = "$statusEmail adresine doğrulama bağlantısı gönderilecek.",
            action = "Doğrulama E-postası Gönder",
            loading = state.securityActionLoading,
            onDismiss = { dialog = null },
            onAction = {
                dialog = null
                onEmailVerify()
            }
        )
        SecurityDialog.TwoFactor -> ServiceActionDialog(
            title = "İki Adımlı Doğrulama",
            description = "Authenticator uygulamasıyla giriş güvenliğini artırmak için kurulum başlatılacak.",
            action = "Kurulumu Başlat",
            loading = state.securityActionLoading,
            onDismiss = { dialog = null },
            onAction = {
                dialog = null
                onTwoFactor()
            }
        )
        null -> Unit
    }
}

@Composable
private fun CompactSecurityErrorCard(message: String, onRefresh: () -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(Icons.Default.Warning, contentDescription = null, tint = ErrorRed, modifier = Modifier.size(26.dp))
            Spacer(modifier = Modifier.width(10.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text("Güvenlik durumu alınamadı", color = DarkBlue, fontWeight = FontWeight.ExtraBold, fontSize = 15.sp)
                Text(message, color = MutedText, fontSize = 12.sp, lineHeight = 15.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
            }
            TextButton(onClick = onRefresh) {
                Text("Tekrar Dene", color = PrimaryBlue, fontWeight = FontWeight.Bold, fontSize = 12.sp)
            }
        }
    }
}

@Composable
private fun SecurityNoticeBar(message: String, success: Boolean, onDismiss: () -> Unit) {
    AnimatedVisibility(
        visible = message.isNotBlank(),
        enter = fadeIn(animationSpec = tween(180)) + scaleIn(initialScale = 0.98f),
        exit = fadeOut(animationSpec = tween(160)) + scaleOut(targetScale = 0.98f)
    ) {
        Card(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(10.dp),
            colors = CardDefaults.cardColors(containerColor = if (success) Color(0xFFEAFBF1) else Color(0xFFFFF4E5)),
            border = BorderStroke(1.dp, (if (success) SuccessGreen else OrangeAccent).copy(alpha = 0.22f))
        ) {
            Row(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 9.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(
                    if (success) Icons.Default.CheckCircle else Icons.Default.Security,
                    contentDescription = null,
                    tint = if (success) SuccessGreen else OrangeAccent,
                    modifier = Modifier.size(20.dp)
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text(
                    message,
                    color = DarkBlue,
                    fontWeight = FontWeight.Bold,
                    fontSize = 13.sp,
                    lineHeight = 16.sp,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f)
                )
                TextButton(onClick = onDismiss, modifier = Modifier.height(32.dp)) {
                    Text("Kapat", color = PrimaryBlue, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                }
            }
        }
    }
}

@Composable
private fun SecurityActionCard(
    icon: ImageVector,
    title: String,
    description: String,
    status: String,
    statusColor: Color,
    onClick: () -> Unit
) {
    AccountCard(modifier = Modifier.clickable(onClick = onClick)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(modifier = Modifier.size(44.dp).clip(CircleShape).background(OrangeAccent.copy(alpha = 0.12f)), contentAlignment = Alignment.Center) {
                Icon(icon, contentDescription = null, tint = OrangeAccent, modifier = Modifier.size(24.dp))
            }
            Spacer(modifier = Modifier.width(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(title, color = DarkBlue, fontWeight = FontWeight.ExtraBold)
                Text(description, color = MutedText, fontSize = 13.sp, lineHeight = 17.sp)
            }
            Column(horizontalAlignment = Alignment.End) {
                Badge(containerColor = statusColor.copy(alpha = 0.12f), contentColor = statusColor) {
                    Text(status, modifier = Modifier.padding(horizontal = 4.dp), fontSize = 11.sp, fontWeight = FontWeight.Bold)
                }
                Icon(Icons.Default.ChevronRight, contentDescription = null, tint = MutedText, modifier = Modifier.padding(top = 8.dp))
            }
        }
    }
}

@Composable
private fun ChangePasswordDialog(
    loading: Boolean,
    changed: Boolean,
    message: String?,
    onDismiss: () -> Unit,
    onSubmit: (String, String, String) -> Unit,
    onForgot: () -> Unit
) {
    var current by remember { mutableStateOf("") }
    var next by remember { mutableStateOf("") }
    var repeat by remember { mutableStateOf("") }
    var showCurrent by remember { mutableStateOf(false) }
    var showNext by remember { mutableStateOf(false) }
    var showRepeat by remember { mutableStateOf(false) }
    LaunchedEffect(changed) {
        if (changed) {
            current = ""
            next = ""
            repeat = ""
        }
    }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Şifre Değiştir", color = DarkBlue, fontWeight = FontWeight.ExtraBold) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                AnimatedVisibility(
                    visible = changed || !message.isNullOrBlank(),
                    enter = fadeIn(animationSpec = tween(180)) + scaleIn(initialScale = 0.98f),
                    exit = fadeOut(animationSpec = tween(140)) + scaleOut(targetScale = 0.98f)
                ) {
                    val noticeSuccess = changed
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(12.dp))
                            .background((if (noticeSuccess) SuccessGreen else OrangeAccent).copy(alpha = 0.12f))
                            .border(
                                width = 1.dp,
                                color = (if (noticeSuccess) SuccessGreen else OrangeAccent).copy(alpha = 0.24f),
                                shape = RoundedCornerShape(12.dp)
                            )
                            .padding(horizontal = 12.dp, vertical = 10.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(
                            if (noticeSuccess) Icons.Default.CheckCircle else Icons.Default.Security,
                            contentDescription = null,
                            tint = if (noticeSuccess) SuccessGreen else OrangeAccent,
                            modifier = Modifier.size(20.dp)
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            if (noticeSuccess) "Şifre başarıyla güncellendi." else message.orEmpty(),
                            color = DarkBlue,
                            fontWeight = FontWeight.ExtraBold,
                            fontSize = 13.sp,
                            lineHeight = 16.sp
                        )
                    }
                }
                PasswordField("Mevcut Şifre", current, { current = it }, showCurrent, { showCurrent = !showCurrent })
                PasswordField("Yeni Şifre", next, { next = it }, showNext, { showNext = !showNext })
                PasswordField("Yeni Şifre Tekrar", repeat, { repeat = it }, showRepeat, { showRepeat = !showRepeat })
                PasswordStrengthBar(next)
                TextButton(onClick = onForgot, enabled = !loading) {
                    Text("Mevcut şifreni hatırlamıyor musun? Sıfırlama bağlantısı gönder", color = PrimaryBlue)
                }
            }
        },
        confirmButton = {
            Button(
                onClick = { onSubmit(current, next, repeat) },
                enabled = !loading && !changed,
                colors = ButtonDefaults.buttonColors(containerColor = if (changed) SuccessGreen else OrangeAccent),
                shape = RoundedCornerShape(12.dp)
            ) {
                if (loading) {
                    CircularProgressIndicator(color = Color.White, modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
                } else if (changed) {
                    Icon(Icons.Default.CheckCircle, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(modifier = Modifier.width(6.dp))
                    Text("Şifre başarıyla güncellendi", fontWeight = FontWeight.Bold)
                } else {
                    Text("Güncelle", fontWeight = FontWeight.Bold)
                }
            }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Kapat", color = MutedText) } },
        containerColor = Color.White,
        shape = RoundedCornerShape(18.dp)
    )
}

@Composable
private fun PasswordField(
    label: String,
    value: String,
    onValueChange: (String) -> Unit,
    visible: Boolean,
    onToggle: () -> Unit
) {
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        label = { Text(label) },
        modifier = Modifier.fillMaxWidth(),
        singleLine = true,
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
        visualTransformation = if (visible) VisualTransformation.None else PasswordVisualTransformation(),
        trailingIcon = {
            IconButton(onClick = onToggle) {
                Icon(if (visible) Icons.Default.VisibilityOff else Icons.Default.Visibility, contentDescription = "Şifreyi göster")
            }
        }
    )
}

@Composable
private fun PasswordStrengthBar(password: String) {
    val score = listOf(
        password.length >= 8,
        password.any(Char::isDigit),
        password.any(Char::isLetter),
        password.any { !it.isLetterOrDigit() }
    ).count { it }
    val label = when {
        password.isBlank() -> "Şifre gücü"
        score <= 2 -> "Zayıf"
        score == 3 -> "Orta"
        else -> "Güçlü"
    }
    val color = when {
        password.isBlank() -> BorderColor
        score <= 2 -> ErrorRed
        score == 3 -> OrangeAccent
        else -> SuccessGreen
    }
    Column {
        LinearProgressIndicator(
            progress = { if (password.isBlank()) 0f else score / 4f },
            modifier = Modifier.fillMaxWidth().height(6.dp).clip(RoundedCornerShape(999.dp)),
            color = color,
            trackColor = BorderColor
        )
        Text(label, color = color, fontSize = 12.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 4.dp))
    }
}

@Composable
private fun ServiceActionDialog(
    title: String,
    description: String,
    action: String,
    loading: Boolean,
    onDismiss: () -> Unit,
    onAction: () -> Unit
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title, color = DarkBlue, fontWeight = FontWeight.ExtraBold) },
        text = { Text(description, color = MutedText) },
        confirmButton = {
            Button(
                onClick = onAction,
                enabled = !loading,
                colors = ButtonDefaults.buttonColors(containerColor = OrangeAccent),
                shape = RoundedCornerShape(12.dp)
            ) {
                if (loading) {
                    CircularProgressIndicator(color = Color.White, modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
                } else {
                    Text(action, fontWeight = FontWeight.Bold)
                }
            }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Kapat", color = MutedText) } },
        containerColor = Color.White,
        shape = RoundedCornerShape(18.dp)
    )
}

@Composable
private fun SecurityPage() {
    Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        InfoCard("Şifre Değiştir", "Şifre yenileme işlemi için giriş ekranındaki şifre sıfırlama akışını kullanabilirsin.", Icons.Default.Lock)
        InfoCard("Telefon Doğrulama", "Telefon numaran profilinde saklanır ve teslimat iletişimi için kullanılır.", Icons.Default.CheckCircle, success = true)
        InfoCard("E-posta Doğrulama", "E-posta adresin sipariş ve bildirim akışlarında kullanılır.", Icons.Default.MarkEmailRead, success = true)
        InfoCard("İki Adımlı Doğrulama", "Bu güvenlik özelliği henüz aktif değil; hazır olduğunda burada açılacak.", Icons.Default.Shield, warning = true)
    }
}

@Composable
private fun ProfilePageV2(
    name: String,
    email: String,
    phone: String,
    saving: Boolean,
    saved: Boolean,
    error: String?,
    onClearState: () -> Unit,
    onSave: (String, String?) -> Unit
) {
    var fullName by remember(name) { mutableStateOf(name) }
    var phoneValue by remember(phone) { mutableStateOf(phone.filter(Char::isDigit).take(11)) }
    var editing by rememberSaveable { mutableStateOf(false) }
    LaunchedEffect(saved) {
        if (saved) {
            editing = false
            delay(2000)
            onClearState()
        }
    }
    Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        AccountCard {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("Hesap Bilgileri", color = DarkBlue, fontWeight = FontWeight.ExtraBold, fontSize = 18.sp, modifier = Modifier.weight(1f))
                if (!editing) {
                    TextButton(onClick = { editing = true; onClearState() }) {
                        Icon(Icons.Default.Edit, contentDescription = null, tint = PrimaryBlue, modifier = Modifier.size(18.dp))
                        Spacer(modifier = Modifier.width(4.dp))
                        Text("Düzenle", color = PrimaryBlue, fontWeight = FontWeight.Bold)
                    }
                }
            }
            OutlinedTextField(value = fullName, onValueChange = { fullName = it }, label = { Text("Ad Soyad") }, modifier = Modifier.fillMaxWidth(), singleLine = true, enabled = editing)
            OutlinedTextField(value = phoneValue, onValueChange = { phoneValue = it.filter(Char::isDigit).take(11) }, label = { Text("Telefon") }, placeholder = { Text("05XXXXXXXXX") }, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone), modifier = Modifier.fillMaxWidth(), singleLine = true, enabled = editing)
            OutlinedTextField(value = email, onValueChange = {}, label = { Text("E-posta") }, modifier = Modifier.fillMaxWidth(), singleLine = true, enabled = false)
            error?.let { SecurityNoticeBar(message = it, success = false, onDismiss = onClearState) }
            if (editing) {
                ProfileSaveButton(
                    loading = saving,
                    saved = saved,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(52.dp)
                        .padding(top = 8.dp),
                    onClick = {
                        if (!saving && !saved) {
                            onSave(fullName, phoneValue.ifBlank { null })
                        }
                    }
                )
            }
        }
    }
}

@Composable
private fun ProfilePage(name: String, email: String, phone: String, onSave: (String, String?) -> Unit) {
    var fullName by remember(name) { mutableStateOf(name) }
    var phoneValue by remember(phone) { mutableStateOf(phone.filter(Char::isDigit).take(11)) }
    var saved by remember { mutableStateOf(false) }
    LaunchedEffect(saved) {
        if (saved) {
            delay(2000)
            saved = false
        }
    }
    Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        AccountCard {
            OutlinedTextField(value = fullName, onValueChange = { fullName = it }, label = { Text("Ad Soyad") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
            OutlinedTextField(value = phoneValue, onValueChange = { phoneValue = it.filter(Char::isDigit).take(11) }, label = { Text("Telefon") }, placeholder = { Text("05XXXXXXXXX") }, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone), modifier = Modifier.fillMaxWidth(), singleLine = true)
            OutlinedTextField(value = email, onValueChange = {}, label = { Text("E-posta") }, modifier = Modifier.fillMaxWidth(), singleLine = true, enabled = false)
            AnimatedSaveButton(
                saved = saved,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(52.dp)
                    .padding(top = 8.dp),
                onClick = {
                    if (!saved) {
                        saved = true
                        onSave(fullName, phoneValue.ifBlank { null })
                    }
                }
            )
        }
    }
}

@Composable
private fun AnimatedSaveButton(saved: Boolean, modifier: Modifier = Modifier, onClick: () -> Unit) {
    Button(
        onClick = onClick,
        colors = ButtonDefaults.buttonColors(containerColor = OrangeAccent),
        shape = RoundedCornerShape(12.dp),
        modifier = modifier
    ) {
        AnimatedContent(
            targetState = saved,
            transitionSpec = {
                (scaleIn(animationSpec = tween(250)) + fadeIn(animationSpec = tween(200))) togetherWith
                    (scaleOut(animationSpec = tween(200)) + fadeOut(animationSpec = tween(180)))
            },
            label = "save_btn_anim"
        ) { isSaved ->
            if (isSaved) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Default.CheckCircle, contentDescription = null, modifier = Modifier.size(20.dp))
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Kayıt başarılı", fontWeight = FontWeight.Bold)
                }
            } else {
                Text("Kaydet", fontWeight = FontWeight.Bold)
            }
        }
    }
}

@Composable
private fun ProfileSaveButton(loading: Boolean, saved: Boolean, modifier: Modifier = Modifier, onClick: () -> Unit) {
    Button(
        onClick = onClick,
        enabled = !loading && !saved,
        colors = ButtonDefaults.buttonColors(containerColor = if (saved) SuccessGreen else OrangeAccent),
        shape = RoundedCornerShape(12.dp),
        modifier = modifier
    ) {
        AnimatedContent(
            targetState = when {
                loading -> "loading"
                saved -> "saved"
                else -> "idle"
            },
            transitionSpec = {
                (scaleIn(animationSpec = tween(250)) + fadeIn(animationSpec = tween(200))) togetherWith
                    (scaleOut(animationSpec = tween(200)) + fadeOut(animationSpec = tween(180)))
            },
            label = "profile_save_btn_anim"
        ) { state ->
            when (state) {
                "loading" -> {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        CircularProgressIndicator(color = Color.White, modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
                        Spacer(modifier = Modifier.width(8.dp))
                        Text("Kaydediliyor", fontWeight = FontWeight.Bold)
                    }
                }
                "saved" -> {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Default.CheckCircle, contentDescription = null, modifier = Modifier.size(20.dp))
                        Spacer(modifier = Modifier.width(8.dp))
                        Text("Kayıt başarılı", fontWeight = FontWeight.Bold)
                    }
                }
                else -> Text("Kaydet", fontWeight = FontWeight.Bold)
            }
        }
    }
}

@Composable
private fun ProductQuestionsPage(state: NotificationsUiState) {
    Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        when {
            state.productQuestionsLoading -> LoadingCard("Soruların yükleniyor")
            state.productQuestionsError != null -> StateCard(Icons.Default.Warning, "Sorular yüklenemedi", state.productQuestionsError, danger = true)
            state.productQuestions.isEmpty() -> StateCard(Icons.Default.Help, "Henüz ürün sorusu yok", "Ürün detayından satıcıya soru sorduğunda yanıtları burada takip edebilirsin.")
            else -> state.productQuestions.forEach { question ->
                AccountProductQuestionCard(question)
            }
        }
    }
}

@Composable
private fun AccountProductQuestionCard(question: ProductQuestion) {
    val answered = !question.answer.isNullOrBlank()
    AccountCard {
        Row(verticalAlignment = Alignment.Top) {
            AsyncImage(
                model = question.productImage,
                contentDescription = question.productName ?: "Ürün",
                contentScale = ContentScale.Fit,
                modifier = Modifier
                    .size(54.dp)
                    .clip(RoundedCornerShape(10.dp))
                    .background(Color(0xFFF3F4F6))
            )
            Spacer(modifier = Modifier.width(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(question.productName ?: "NovaStore ürünü", color = DarkBlue, fontWeight = FontWeight.ExtraBold, maxLines = 2, overflow = TextOverflow.Ellipsis)
                Text(formatDate(question.createdAt), color = MutedText, fontSize = 12.sp)
            }
            Surface(color = if (answered) SuccessGreen.copy(alpha = 0.12f) else OrangeAccent.copy(alpha = 0.12f), shape = RoundedCornerShape(999.dp)) {
                Text(
                    if (answered) "Yanıtlandı" else "Bekliyor",
                    color = if (answered) SuccessGreen else OrangeAccent,
                    fontWeight = FontWeight.Bold,
                    fontSize = 11.sp,
                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                )
            }
        }
        Spacer(modifier = Modifier.height(12.dp))
        Text("Soru", color = MutedText, fontWeight = FontWeight.Bold, fontSize = 12.sp)
        Text(question.question, color = DarkBlue, lineHeight = 21.sp, modifier = Modifier.padding(top = 3.dp))
        Spacer(modifier = Modifier.height(10.dp))
        Surface(color = Color(0xFFF8FAFC), border = BorderStroke(1.dp, BorderColor), shape = RoundedCornerShape(12.dp), modifier = Modifier.fillMaxWidth()) {
            Column(modifier = Modifier.padding(12.dp)) {
                Text("NovaStore Yanıtı", color = DarkBlue, fontWeight = FontWeight.ExtraBold)
                Text(question.answer ?: "Satıcı henüz yanıtlamadı.", color = if (answered) DarkBlue else MutedText, lineHeight = 21.sp, modifier = Modifier.padding(top = 4.dp))
            }
        }
    }
}

@Composable
private fun SupportTicketsPage(
    state: NotificationsUiState,
    currentUserId: Int,
    onTicketClick: (AccountMessage) -> Unit,
    onSend: (String) -> Unit,
    onSupport: () -> Unit
) {
    var message by remember { mutableStateOf("") }
    Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        SegmentHeader(listOf("Mesajlar", "Açık Talep", "Çözülen"))
        when {
            state.messagesLoading -> LoadingCard("Destek mesajları yükleniyor")
            state.messagesError != null -> StateCard(Icons.Default.Warning, "Mesajlar yüklenemedi", state.messagesError, danger = true)
            state.messages.isEmpty() -> StateCard(Icons.Default.Article, "Destek talebin yok", "Mesaj göndererek müşteri hizmetleriyle gerçek bir destek kaydı başlatabilirsin.")
            else -> state.messages.asReversed().take(10).forEach { msg ->
                AccountCard(modifier = Modifier.clickable { onTicketClick(msg) }) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Default.Article, contentDescription = null, tint = OrangeAccent, modifier = Modifier.size(28.dp))
                        Spacer(modifier = Modifier.width(12.dp))
                        Column(modifier = Modifier.weight(1f)) {
                            Text(if (msg.senderId == currentUserId) "Sen" else "NovaStore Destek", color = DarkBlue, fontWeight = FontWeight.ExtraBold)
                            Text(msg.message, color = MutedText, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            Text(formatDate(msg.createdAt), color = MutedText, fontSize = 12.sp)
                        }
                    }
                }
            }
        }
        AccountCard {
            OutlinedTextField(value = message, onValueChange = { message = it }, label = { Text("Destek mesajı") }, modifier = Modifier.fillMaxWidth())
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(top = 8.dp)) {
                OutlinedButton(onClick = onSupport, modifier = Modifier.weight(1f).height(44.dp)) { Text("NovaBot") }
                Button(onClick = { onSend(message); message = "" }, colors = ButtonDefaults.buttonColors(containerColor = OrangeAccent), modifier = Modifier.weight(1f).height(44.dp)) {
                    Text("Gönder")
                }
            }
        }
    }
}

@Composable
private fun TicketDetailPage(message: AccountMessage?, currentUserId: Int, onSend: (String) -> Unit) {
    var reply by remember { mutableStateOf("") }
    Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("Destek Mesajı", color = DarkBlue, fontWeight = FontWeight.ExtraBold, fontSize = 20.sp)
        if (message == null) {
            StateCard(Icons.Default.Article, "Mesaj seçilmedi", "Destek taleplerinden bir mesaj seçebilirsin.")
        } else {
            ChatBubble(message.message, bot = message.senderId != currentUserId)
            Text(formatDate(message.createdAt), color = MutedText, fontSize = 12.sp)
        }
        AccountCard {
            OutlinedTextField(value = reply, onValueChange = { reply = it }, label = { Text("Yanıt yaz") }, modifier = Modifier.fillMaxWidth())
            Button(onClick = { onSend(reply); reply = "" }, colors = ButtonDefaults.buttonColors(containerColor = OrangeAccent), shape = RoundedCornerShape(12.dp), modifier = Modifier.fillMaxWidth().height(44.dp).padding(top = 8.dp)) {
                Text("Gönder")
            }
        }
    }
}

@Composable
private fun HelpCenterPage(
    state: NotificationsUiState,
    onArticle: (HelpArticle) -> Unit,
    onOrders: () -> Unit,
    onReturns: () -> Unit,
    onTickets: () -> Unit,
    onSupport: () -> Unit
) {
    val activeOrder = state.orders.firstOrNull { it.isActiveOrder() } ?: state.orders.firstOrNull()
    Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        AccountCard {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.Search, contentDescription = null, tint = OrangeAccent, modifier = Modifier.size(28.dp))
                Spacer(modifier = Modifier.width(10.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Text("Yardım Merkezi", color = DarkBlue, fontWeight = FontWeight.ExtraBold, fontSize = 18.sp)
                    Text("Sorunu seç, doğrudan ilgili Hesabım ekranına veya NovaBot'a ilerle.", color = MutedText)
                }
            }
        }
        if (activeOrder != null) {
            AccountCard(modifier = Modifier.clickable(onClick = onOrders)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Default.LocalShipping, contentDescription = null, tint = OrangeAccent, modifier = Modifier.size(30.dp))
                    Spacer(modifier = Modifier.width(12.dp))
                    Column(modifier = Modifier.weight(1f)) {
                        Text("Son sipariş: ${activeOrder.displayNo()}", color = DarkBlue, fontWeight = FontWeight.ExtraBold)
                        Text("${activeOrder.displayStatus()} • ${activeOrder.shipmentText()}", color = MutedText, maxLines = 2, overflow = TextOverflow.Ellipsis)
                    }
                    Icon(Icons.Default.ChevronRight, contentDescription = null, tint = MutedText)
                }
            }
        } else {
            StateCard(Icons.Default.Inventory2, "Sipariş bulunamadı", "Sipariş verdikten sonra takip, iade ve fatura yardımını buradan başlatabilirsin.")
        }
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Button(onClick = onOrders, colors = ButtonDefaults.buttonColors(containerColor = PrimaryBlue), shape = RoundedCornerShape(12.dp), modifier = Modifier.weight(1f).height(48.dp)) {
                Text("Siparişler", fontWeight = FontWeight.Bold)
            }
            OutlinedButton(onClick = onReturns, border = BorderStroke(1.dp, OrangeAccent), shape = RoundedCornerShape(12.dp), modifier = Modifier.weight(1f).height(48.dp)) {
                Text("İadeler", color = OrangeAccent, fontWeight = FontWeight.Bold)
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            OutlinedButton(onClick = onTickets, border = BorderStroke(1.dp, PrimaryBlue), shape = RoundedCornerShape(12.dp), modifier = Modifier.weight(1f).height(48.dp)) {
                Text("Talepler", color = PrimaryBlue, fontWeight = FontWeight.Bold)
            }
            Button(onClick = onSupport, colors = ButtonDefaults.buttonColors(containerColor = OrangeAccent), shape = RoundedCornerShape(12.dp), modifier = Modifier.weight(1f).height(48.dp)) {
                Text("NovaBot", fontWeight = FontWeight.Bold)
            }
        }
        HelpArticle.entries.forEach { article ->
            InfoCard(
                title = article.title,
                text = article.summary,
                icon = article.icon,
                onClick = { onArticle(article) }
            )
        }
    }
}

@Composable
private fun ArticlePage(
    article: HelpArticle,
    state: NotificationsUiState,
    onOrders: () -> Unit,
    onReturns: () -> Unit,
    onTickets: () -> Unit,
    onOrderClick: (AccountOrder) -> Unit,
    onSupport: () -> Unit
) {
    val latestOrder = state.orders.firstOrNull { it.isActiveOrder() } ?: state.orders.firstOrNull()
    Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        AccountCard {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(article.icon, contentDescription = null, tint = OrangeAccent, modifier = Modifier.size(34.dp))
                Spacer(modifier = Modifier.width(12.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Text(article.title, color = DarkBlue, fontWeight = FontWeight.ExtraBold, fontSize = 20.sp)
                    Text(article.summary, color = MutedText, lineHeight = 21.sp)
                }
            }
        }
        when (article) {
            HelpArticle.Orders -> {
                HelpStepCard("1", "Siparişlerim ekranında siparişini seç.", "Kargo, ödeme, fatura ve ürün kalemlerini aynı detay ekranında görürsün.")
                HelpStepCard("2", "Detaydan işlem başlat.", "Hazırlanan siparişi iptal edebilir, teslim edilen siparişi değerlendirebilir veya iade talebi açabilirsin.")
                latestOrder?.let { order ->
                    InfoCard(
                        title = "Son siparişi aç: ${order.displayNo()}",
                        text = "${order.displayStatus()} • ${order.formatAmount()}",
                        icon = Icons.Default.ReceiptLong,
                        onClick = { onOrderClick(order) }
                    )
                }
                HelpPrimaryButton("Siparişlerime Git", Icons.Default.Inventory2, onOrders)
            }
            HelpArticle.Returns -> {
                HelpStepCard("1", "Teslim edilen siparişi aç.", "İade talebi butonu yalnızca teslim edilen siparişlerde görünür.")
                HelpStepCard("2", "İade talebini gönder.", "Talep oluşturulduğunda durumunu İadeler ve Sipariş Detayı ekranlarında takip edebilirsin.")
                HelpPrimaryButton("İade Ekranını Aç", Icons.Default.AssignmentReturn, onReturns)
                latestOrder?.takeIf { it.isDelivered() }?.let { order ->
                    InfoCard("İadeye uygun sipariş: ${order.displayNo()}", order.displayStatus(), Icons.Default.AssignmentReturn, onClick = { onOrderClick(order) })
                }
            }
            HelpArticle.Tickets -> {
                HelpStepCard("1", "Destek taleplerini aç.", "Mevcut mesajlarını görebilir ve müşteri hizmetlerine yeni kayıtlı mesaj gönderebilirsin.")
                HelpStepCard("2", "Net bilgi ekle.", "Sipariş numarası, ürün adı ve beklediğin sonucu yazarsan ekip daha hızlı çözer.")
                HelpPrimaryButton("Destek Taleplerine Git", Icons.Default.Article, onTickets)
                OutlinedButton(onClick = onSupport, border = BorderStroke(1.dp, OrangeAccent), shape = RoundedCornerShape(12.dp), modifier = Modifier.fillMaxWidth().height(48.dp)) {
                    Text("NovaBot ile Önce Kontrol Et", color = OrangeAccent, fontWeight = FontWeight.Bold)
                }
            }
            HelpArticle.NovaBot -> {
                HelpStepCard("1", "NovaBot'a sorunu yaz.", "Ürün arama, sepet, sipariş ve destek sorularında aynı ekrandan ilerler.")
                HelpStepCard("2", "Gerekirse canlı destek devri iste.", "NovaBot konuşma özetini canlı destek ekibine aktarabilir.")
                HelpPrimaryButton("NovaBot'u Aç", Icons.Default.SupportAgent, onSupport)
                OutlinedButton(onClick = onTickets, border = BorderStroke(1.dp, PrimaryBlue), shape = RoundedCornerShape(12.dp), modifier = Modifier.fillMaxWidth().height(48.dp)) {
                    Text("Kayıtlı Talep Yaz", color = PrimaryBlue, fontWeight = FontWeight.Bold)
                }
            }
            HelpArticle.PaymentShipping -> {
                HelpStepCard("1", "Ödeme durumunu sipariş detayında kontrol et.", "Ödeme başarılıysa fatura bilgisi ve sipariş toplamı aynı yerde görünür.")
                HelpStepCard("2", "Kargo bilgisini takip et.", "Takip numarası oluştuğunda teslimat kartında gösterilir.")
                latestOrder?.let { order ->
                    InfoCard("Ödeme: ${order.paymentStatus ?: "Bilinmiyor"}", order.shipmentText(), Icons.Default.LocalShipping, onClick = { onOrderClick(order) })
                }
                HelpPrimaryButton("Sipariş Detayına Git", Icons.Default.ReceiptLong) {
                    latestOrder?.let(onOrderClick) ?: onOrders()
                }
            }
            HelpArticle.Account -> {
                HelpStepCard("1", "Profil ve adreslerini Hesabım'dan yönet.", "Teslimat ve iletişim bilgileri checkout akışında da kullanılır.")
                HelpStepCard("2", "Güvenlik ve bildirimleri kontrol et.", "E-posta, telefon ve bildirim tercihlerini Hesabım içindeki ilgili kartlardan açabilirsin.")
                HelpPrimaryButton("NovaBot'tan Hesap Yardımı Al", Icons.Default.SupportAgent, onSupport)
            }
        }
    }
}

@Composable
private fun HelpStepCard(step: String, title: String, text: String) {
    AccountCard {
        Row(verticalAlignment = Alignment.Top) {
            Box(
                modifier = Modifier
                    .size(30.dp)
                    .clip(CircleShape)
                    .background(OrangeAccent.copy(alpha = 0.14f)),
                contentAlignment = Alignment.Center
            ) {
                Text(step, color = OrangeAccent, fontWeight = FontWeight.ExtraBold)
            }
            Spacer(modifier = Modifier.width(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(title, color = DarkBlue, fontWeight = FontWeight.ExtraBold)
                Text(text, color = MutedText, lineHeight = 21.sp, modifier = Modifier.padding(top = 2.dp))
            }
        }
    }
}

@Composable
private fun HelpPrimaryButton(text: String, icon: ImageVector, onClick: () -> Unit) {
    Button(
        onClick = onClick,
        colors = ButtonDefaults.buttonColors(containerColor = OrangeAccent),
        shape = RoundedCornerShape(12.dp),
        modifier = Modifier.fillMaxWidth().height(48.dp)
    ) {
        Icon(icon, contentDescription = null, modifier = Modifier.size(18.dp))
        Spacer(modifier = Modifier.width(8.dp))
        Text(text, fontWeight = FontWeight.Bold)
    }
}

@Composable
private fun NotificationsPage(state: NotificationsUiState, onMarkRead: (Int) -> Unit, onReadAll: () -> Unit) {
    Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        SegmentHeader(listOf("Sipariş", "Kampanya", "Sistem"))
        Button(onClick = onReadAll, colors = ButtonDefaults.buttonColors(containerColor = PrimaryBlue), shape = RoundedCornerShape(12.dp), modifier = Modifier.fillMaxWidth().height(44.dp)) {
            Text("Tümünü Okundu Yap", fontWeight = FontWeight.Bold)
        }
        when {
            state.isLoading -> LoadingCard("Bildirimler yükleniyor")
            state.error != null -> StateCard(Icons.Default.Warning, "Bildirimler yüklenemedi", state.error, danger = true)
            state.notifications.isEmpty() -> StateCard(Icons.Default.Notifications, "Henüz bildirimin yok", "Sipariş ve kampanya güncellemeleri burada görünecek.")
            else -> state.notifications.forEach { NotificationCard(it, onClick = { onMarkRead(it.id) }) }
        }
    }
}

@Composable
private fun NotificationCard(notification: Notification, onClick: () -> Unit) {
    val meta = notificationMeta(notification.type)
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = if (notification.isRead) Color.White else meta.color.copy(alpha = 0.08f)),
        border = BorderStroke(1.dp, if (notification.isRead) BorderColor else meta.color.copy(alpha = 0.35f)),
        elevation = CardDefaults.cardElevation(defaultElevation = if (notification.isRead) 2.dp else 4.dp)
    ) {
        Row(modifier = Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(meta.icon, contentDescription = null, tint = meta.color, modifier = Modifier.size(28.dp))
            Spacer(modifier = Modifier.width(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(meta.title, color = DarkBlue, fontWeight = FontWeight.ExtraBold)
                Text(notification.message, color = MutedText, maxLines = 2, overflow = TextOverflow.Ellipsis)
                Text(formatDate(notification.createdAt), color = MutedText, fontSize = 12.sp)
            }
            if (!notification.isRead) Badge(containerColor = OrangeAccent, contentColor = Color.White) { Text("Yeni") }
        }
    }
}

private data class NotificationMeta(val title: String, val icon: ImageVector, val color: Color)

private fun notificationMeta(type: String): NotificationMeta = when (type) {
    "order_update", "new_order" -> NotificationMeta("Sipariş Bildirimi", Icons.Default.Inventory2, PrimaryBlue)
    "question_answered", "new_question" -> NotificationMeta("Ürün Sorusu", Icons.Default.Help, SuccessGreen)
    "ai_handoff" -> NotificationMeta("Canlı Destek", Icons.Default.SupportAgent, OrangeAccent)
    "new_review" -> NotificationMeta("Değerlendirme", Icons.Default.Reviews, Color(0xFF7C3AED))
    "low_stock" -> NotificationMeta("Stok Uyarısı", Icons.Default.Warning, ErrorRed)
    "campaign", "coupon", "campaign_soon" -> NotificationMeta("Kampanya", Icons.Default.LocalOffer, OrangeAccent)
    else -> NotificationMeta("NovaStore Bildirimi", Icons.Default.Notifications, OrangeAccent)
}

@Composable
private fun ReturnsPage(orders: List<AccountOrder>, onOrderClick: (AccountOrder) -> Unit) {
    val returnOrders = orders.filter { it.refundStatus != null && it.refundStatus != "NONE" || it.displayStatus().contains("İade", true) }
    Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        if (returnOrders.isEmpty()) {
            StateCard(Icons.Default.AssignmentReturn, "Aktif iade yok", "Teslim edilen sipariş detayından iade talebi oluşturabilirsin.")
        } else {
            returnOrders.forEach { order -> OrderCard(order, onClick = { onOrderClick(order) }) }
        }
    }
}

@Composable
private fun ReviewsPage(state: NotificationsUiState) {
    Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        when {
            state.reviewsLoading -> LoadingCard("Değerlendirmeler yükleniyor")
            state.reviewsError != null -> StateCard(Icons.Default.Warning, "Değerlendirmeler yüklenemedi", state.reviewsError, danger = true)
            state.reviews.isEmpty() -> StateCard(Icons.Default.Reviews, "Değerlendirme yok", "Teslim edilen ürünlerin için sipariş detayından değerlendirme akışını başlatabilirsin.")
            else -> state.reviews.forEach { review ->
                AccountCard {
                    Text(review.productName ?: "Ürün #${review.productId ?: "-"}", color = DarkBlue, fontWeight = FontWeight.ExtraBold)
                    Text("${review.rating ?: 0}/5", color = OrangeAccent, fontWeight = FontWeight.Bold)
                    Text(review.comment ?: "Yorum eklenmemiş.", color = MutedText)
                    Text(formatDate(review.createdAt), color = MutedText, fontSize = 12.sp)
                }
            }
        }
    }
}

@Composable
private fun InvoicesPage(orders: List<AccountOrder>) {
    Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        val paidOrders = orders.filter { it.paymentStatus == "PAID" }
        if (paidOrders.isEmpty()) {
            StateCard(Icons.Default.ReceiptLong, "Fatura yok", "Ödemesi tamamlanan siparişlerin fatura durumu burada görünecek.")
        } else {
            paidOrders.forEach { order ->
                InfoCard(order.displayNo(), "Ödeme alındı. Fatura yönetim panelinde oluşturulduğunda indirilebilir hale gelir.", Icons.Default.ReceiptLong, success = true)
            }
        }
    }
}

@Composable
private fun NotificationSettingsPage() {
    Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        InfoCard("Sipariş Bildirimleri", "Kargo, teslimat ve ödeme durumlarını anında al.", Icons.Default.Notifications, success = true)
        InfoCard("Kampanya Bildirimleri", "Kupon ve indirim fırsatlarından haberdar ol.", Icons.Default.Campaign, success = true)
        InfoCard("Sistem Bildirimleri", "Güvenlik ve hesap güncellemelerini takip et.", Icons.Default.Settings, success = true)
    }
}

@Composable
private fun LegalPage(title: String, text: String) {
    AccountCard {
        Text(title, color = DarkBlue, fontWeight = FontWeight.ExtraBold, fontSize = 20.sp)
        Spacer(modifier = Modifier.height(8.dp))
        Text(text, color = MutedText, lineHeight = 22.sp)
    }
}

@Composable
private fun SegmentHeader(labels: List<String>, modifier: Modifier = Modifier) {
    Row(modifier = modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        labels.forEachIndexed { index, label ->
            Surface(
                shape = RoundedCornerShape(999.dp),
                color = if (index == 0) OrangeAccent else Color.White,
                border = BorderStroke(1.dp, if (index == 0) OrangeAccent else BorderColor),
                modifier = Modifier.weight(1f)
            ) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(40.dp)
                        .padding(horizontal = 4.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        label,
                        color = if (index == 0) Color.White else DarkBlue,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                        textAlign = TextAlign.Center,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }
            }
        }
    }
}

@Composable
private fun InfoCard(title: String, text: String, icon: ImageVector, success: Boolean = false, warning: Boolean = false, onClick: (() -> Unit)? = null) {
    AccountCard(modifier = if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(icon, contentDescription = null, tint = when {
                success -> SuccessGreen
                warning -> OrangeAccent
                else -> OrangeAccent
            }, modifier = Modifier.size(28.dp))
            Spacer(modifier = Modifier.width(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(title, color = DarkBlue, fontWeight = FontWeight.ExtraBold)
                Text(text, color = MutedText)
            }
            if (onClick != null) Icon(Icons.Default.ChevronRight, contentDescription = null, tint = Color(0xFF8A94A6))
        }
    }
}

@Composable
private fun StateCard(icon: ImageVector, title: String, text: String?, danger: Boolean = false) {
    AccountCard {
        Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth()) {
            Icon(icon, contentDescription = null, tint = if (danger) ErrorRed else OrangeAccent, modifier = Modifier.size(54.dp))
            Spacer(modifier = Modifier.height(10.dp))
            Text(title, color = DarkBlue, fontWeight = FontWeight.ExtraBold, fontSize = 18.sp)
            Text(text.orEmpty(), color = MutedText, modifier = Modifier.padding(top = 4.dp))
        }
    }
}

@Composable
private fun LoadingCard(text: String) {
    AccountCard {
        Row(verticalAlignment = Alignment.CenterVertically) {
            CircularProgressIndicator(color = OrangeAccent, modifier = Modifier.size(28.dp))
            Spacer(modifier = Modifier.width(12.dp))
            Text(text, color = DarkBlue, fontWeight = FontWeight.Bold)
        }
    }
}

@Composable
private fun ChatBubble(text: String, bot: Boolean) {
    Box(modifier = Modifier.fillMaxWidth(), contentAlignment = if (bot) Alignment.CenterStart else Alignment.CenterEnd) {
        Surface(shape = RoundedCornerShape(18.dp), color = if (bot) Color.White else OrangeAccent, shadowElevation = 2.dp, modifier = Modifier.fillMaxWidth(0.82f)) {
            Text(text, color = if (bot) DarkBlue else Color.White, modifier = Modifier.padding(14.dp))
        }
    }
}

@Composable
private fun SmallActionButton(text: String, icon: ImageVector, danger: Boolean = false, onClick: () -> Unit) {
    OutlinedButton(onClick = onClick, border = BorderStroke(1.dp, if (danger) ErrorRed else OrangeAccent), shape = RoundedCornerShape(10.dp), contentPadding = PaddingValues(horizontal = 10.dp, vertical = 4.dp)) {
        Icon(icon, contentDescription = null, tint = if (danger) ErrorRed else OrangeAccent, modifier = Modifier.size(16.dp))
        Spacer(modifier = Modifier.width(5.dp))
        Text(text, color = if (danger) ErrorRed else OrangeAccent, fontSize = 12.sp)
    }
}

@Composable
private fun AccountCard(
    modifier: Modifier = Modifier,
    contentPadding: Dp = 16.dp,
    content: @Composable ColumnScope.() -> Unit
) {
    Card(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        elevation = CardDefaults.cardElevation(defaultElevation = 3.dp)
    ) {
        Column(modifier = Modifier.padding(contentPadding), content = content)
    }
}

private fun AccountOrder.displayNo(): String = "#$id"

private fun AccountOrder.displayStatus(): String = displayStatusText?.ifBlank { null } ?: status?.ifBlank { null } ?: "Durum yok"

private fun AccountOrder.formatAmount(): String = formatCurrency(totalAmount?.toDoubleOrNull() ?: 0.0)

private fun AccountOrder.formatDate(): String = formatDate(createdAt)

private fun AccountOrder.stage(): Int {
    if (isPendingPaymentOrder() || isFailedPaymentOrder()) return -1
    val normalized = displayStatus().lowercase(Locale("tr", "TR"))
    return when {
        normalized.contains("teslim") -> 3
        normalized.contains("dağıt") || normalized.contains("dagit") -> 2
        normalized.contains("kargo") -> 1
        else -> 0
    }
}

private fun AccountOrder.isDelivered(): Boolean = displayStatus().contains("Teslim", ignoreCase = true)

private fun AccountOrder.isActiveOrder(): Boolean {
    val normalized = displayStatus().lowercase(Locale("tr", "TR"))
    return !isFailedPaymentOrder() && !normalized.contains("iptal") && !normalized.contains("iade") && !normalized.contains("teslim")
}

private fun AccountOrder.canCancel(): Boolean {
    val normalized = displayStatus().lowercase(Locale("tr", "TR"))
    return !isPendingPaymentOrder() && !isFailedPaymentOrder() && !normalized.contains("iptal") && !normalized.contains("iade") && !normalized.contains("teslim")
}

private fun AccountOrder.statusColor(): Color {
    val normalized = displayStatus().lowercase(Locale("tr", "TR"))
    return when {
        isFailedPaymentOrder() -> ErrorRed
        isPendingPaymentOrder() -> OrangeAccent
        normalized.contains("iptal") || normalized.contains("iade") -> ErrorRed
        normalized.contains("teslim") -> SuccessGreen
        else -> OrangeAccent
    }
}

private fun AccountOrder.isPendingPaymentOrder(): Boolean {
    val normalized = displayStatus().lowercase(Locale("tr", "TR"))
    return isPendingPayment == true || normalized.contains("ödeme bekliyor") || paymentStatus == "REQUIRES_ACTION"
}

private fun AccountOrder.isFailedPaymentOrder(): Boolean {
    val normalized = displayStatus().lowercase(Locale("tr", "TR"))
    return isPaymentFailed == true || normalized.contains("ödeme başarısız") || paymentStatus == "FAILED"
}

private fun AccountOrder.shipmentText(): String {
    val parts = listOfNotNull(
        shipmentStatus?.takeIf { it.isNotBlank() && it != "NONE" },
        shipmentProvider?.takeIf { it.isNotBlank() },
        trackingNo?.takeIf { it.isNotBlank() }?.let { "Takip No: $it" },
        etaDate?.takeIf { it.isNotBlank() }?.let { "Tahmini teslim: ${formatDate(it)}" }
    )
    return parts.takeIf { it.isNotEmpty() }?.joinToString(" • ") ?: "Kargo kaydı henüz oluşmadı."
}

private fun AccountCoupon.shortDescription(): String {
    val value = discountValue ?: 0.0
    return if (discountType == "PERCENT") {
        "%${value.toInt()} indirim"
    } else {
        "${formatCurrency(value)} indirim"
    }
}

private fun AccountCoupon.description(): String {
    val min = minOrderAmount?.takeIf { it > 0 }?.let { "Minimum sepet: ${formatCurrency(it)}. " }.orEmpty()
    val max = maxDiscountAmount?.takeIf { it > 0 }?.let { "Maksimum indirim: ${formatCurrency(it)}. " }.orEmpty()
    val end = endsAt?.let { "Son kullanım: ${formatDate(it)}." }.orEmpty()
    return "${shortDescription()}. $min$max$end".trim()
}

private fun formatCurrency(value: Double): String {
    return NumberFormat.getCurrencyInstance(Locale("tr", "TR")).format(value)
}

private fun formatDate(raw: String?): String {
    if (raw.isNullOrBlank()) return "Tarih yok"
    return runCatching {
        OffsetDateTime.parse(raw).format(DateTimeFormatter.ofPattern("dd.MM.yyyy HH:mm", Locale("tr", "TR")))
    }.getOrElse {
        raw.take(16).replace("T", " ")
    }
}
