package com.novastore.seller.ui

import androidx.annotation.DrawableRes
import java.util.Locale
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.automirrored.outlined.ContactSupport
import androidx.compose.material.icons.automirrored.outlined.KeyboardArrowRight
import androidx.compose.material.icons.outlined.AccountBalanceWallet
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.ArrowUpward
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.ErrorOutline
import androidx.compose.material.icons.outlined.FilterAlt
import androidx.compose.material.icons.outlined.HeadsetMic
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material.icons.outlined.Inventory2
import androidx.compose.material.icons.outlined.LocalShipping
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material.icons.outlined.Payments
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material.icons.outlined.Shield
import androidx.compose.material.icons.outlined.ShoppingBag
import androidx.compose.material.icons.outlined.Storefront
import androidx.compose.material.icons.outlined.Tune
import androidx.compose.material.icons.outlined.WarningAmber
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.disabled
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.novastore.seller.R
import com.novastore.seller.data.SellerPage
import com.novastore.seller.data.SellerPageSource
import com.novastore.seller.data.SellerDashboardData
import com.novastore.seller.data.SellerFinanceData
import com.novastore.seller.data.SellerInventoryData
import com.novastore.seller.data.SellerOfferListData
import com.novastore.seller.data.SellerOrderListData
import com.novastore.seller.data.SellerScreen
import com.novastore.seller.data.SellerSecurityData
import com.novastore.seller.data.SellerStoreData
import com.novastore.seller.data.SellerSupportData

/**
 * Binding-derived screen families for the Wave 4 representative gate.
 *
 * Production pages consume server-backed [SellerPage] values. Canonical fixture copy is reachable
 * only through the debug-only test-state boundary in SellerMainActivity; it is never a release data
 * source. Families that do not have a live capability use [CapabilityUnavailableFamily] and never
 * invent analytics, campaign, notification, onboarding, or customer-conversation data.
 */
internal object SellerScreens {
    val representativeReferences = setOf(
        "055", "057", "066", "069", "074", "089", "124", "142", "156", "185",
        "243", "276", "282", "292"
    )

    fun familyReference(page: SellerPage): String? = page.canonicalReferenceId ?: when (page.screen) {
        SellerScreen.DASHBOARD -> "055"
        SellerScreen.PRODUCTS -> "074"
        SellerScreen.INVENTORY -> "124"
        SellerScreen.ORDERS -> "142"
        SellerScreen.FINANCE -> "185"
        SellerScreen.STORE -> "243"
        SellerScreen.TEAM -> "282"
        SellerScreen.SUPPORT -> "support-live"
        SellerScreen.SECURITY -> "292"
        else -> null
    }

    fun usesFamilyRenderer(page: SellerPage): Boolean = page.canonicalReferenceId
        ?.let(representativeReferences::contains)
        ?: (familyReference(page) != null)
}

private object FamilyTokens {
    val Navy = Color(0xFF12345B)
    val Orange = Color(0xFFFF5A00)
    val OrangeTextAccessible = Color(0xFFF04400)
    val OrangeDeepAccessible = Color(0xFFB13200)
    val Canvas = Color(0xFFF7F7F8)
    val Peach = Color(0xFFFFF3EB)
    val PeachLight = Color(0xFFFFF8EE)
    val Blue = Color(0xFFEDF5FF)
    val Green = Color(0xFF219653)
    val GreenTint = Color(0xFFEAF8F0)
    val Purple = Color(0xFF6D45D6)
    val PurpleTint = Color(0xFFF2EDFF)
    val Muted = Color(0xFF708096)
    val Outline = Color(0xFFD9DFE7)
    val White = Color.White
}

private val BindingCondensedFontFamily: FontFamily by lazy(LazyThreadSafetyMode.NONE) {
    FontFamily(android.graphics.Typeface.create("sans-serif-condensed", android.graphics.Typeface.NORMAL))
}
private val BindingCondensedBoldFontFamily: FontFamily by lazy(LazyThreadSafetyMode.NONE) {
    FontFamily(android.graphics.Typeface.create("sans-serif-condensed", android.graphics.Typeface.BOLD))
}

private operator fun Int.times(value: androidx.compose.ui.unit.Dp): androidx.compose.ui.unit.Dp =
    value * toFloat()

@Composable
internal fun SellerRepresentativeFamilyScreen(
    page: SellerPage,
    onBack: () -> Unit,
    onOpen: (SellerScreen) -> Unit,
    onRefresh: () -> Unit,
    onLogout: () -> Unit,
    onLogoutAll: () -> Unit
) {
    val reference = requireNotNull(SellerScreens.familyReference(page))
    when (reference) {
        "055" -> DashboardFamily(page, onOpen, onRefresh, onLogout)
        "057", "066", "069" -> CanonicalDashboardVariant(page, onOpen, onRefresh)
        "074", "089" -> OfferListFamily(page, onOpen, onRefresh)
        "124" -> InventoryFamily(page, onOpen, onRefresh)
        "142" -> OrderListFamily(page, onRefresh)
        "156" -> OrderDetailFamily(page, onBack)
        "185" -> FinanceFamily(page, onRefresh)
        "243" -> StoreFamily(page, onOpen, onRefresh, onBack)
        "276", "support-live" -> SupportFamily(page, onBack, onRefresh)
        "282" -> TeamFamily(page, onBack)
        "292" -> SecurityFamily(page, onBack, onOpen, onLogout, onLogoutAll)
    }
}

@Composable
private fun CanonicalDashboardVariant(
    page: SellerPage,
    onOpen: (SellerScreen) -> Unit,
    onRefresh: () -> Unit
) {
    FamilyList {
        item { BrandHeader("Nova Teknoloji") }
        item { FamilyTopBar(page.title, context = "Genel Bakış") }
        page.rows.forEach { (label, value) ->
            item { DisclosureRow(label, value, Icons.Outlined.Info) }
        }
        item { Guardrail("Canlı seller sınırı", "Bu kanonik durum yalnız debug fixture ile açılır; üretim verisi sunucudan gelir.") }
        item { PrimaryAction("Genel Bakışı Yenile", onClick = onRefresh) }
        item { PrimaryAction("Siparişlere Git", onClick = { onOpen(SellerScreen.ORDERS) }) }
    }
}

private val SellerPage.isCanonicalFixture: Boolean
    get() = source == SellerPageSource.CANONICAL_FIXTURE

@Composable
private fun FamilyTopBar(title: String, onBack: (() -> Unit)? = null, context: String? = null) {
    Surface(
        modifier = Modifier.fillMaxWidth().semantics { contentDescription = "seller-top-app-bar" },
        color = FamilyTokens.White,
        shape = RoundedCornerShape(27.dp),
        shadowElevation = 3.dp,
        border = BorderStroke(1.dp, FamilyTokens.Outline)
    ) {
        Row(
            modifier = Modifier.height(54.dp).padding(horizontal = 10.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            if (onBack != null) {
                IconButton(
                    onClick = onBack,
                    modifier = Modifier.size(42.dp).semantics { contentDescription = "Geri" }
                ) {
                    Icon(Icons.AutoMirrored.Outlined.ArrowBack, contentDescription = null, tint = FamilyTokens.Navy)
                }
            } else {
                Surface(shape = CircleShape, color = FamilyTokens.Peach, modifier = Modifier.size(38.dp)) {
                    Icon(Icons.Outlined.Storefront, contentDescription = null, tint = FamilyTokens.OrangeTextAccessible, modifier = Modifier.padding(8.dp))
                }
            }
            Column(modifier = Modifier.weight(1f).padding(horizontal = 8.dp)) {
                Text(title, color = FamilyTokens.Navy, fontSize = 17.sp, fontWeight = FontWeight.ExtraBold, maxLines = 1)
                context?.let { Text(it, color = FamilyTokens.Muted, fontSize = 10.sp, fontWeight = FontWeight.SemiBold, maxLines = 1) }
            }
            Icon(Icons.Outlined.Shield, contentDescription = "Güvenli seller oturumu", tint = FamilyTokens.Navy, modifier = Modifier.size(22.dp))
        }
    }
}

@Composable
private fun BrandHeader(storeName: String, onNotifications: (() -> Unit)? = null) {
    Row(modifier = Modifier.fillMaxWidth().height(58.dp), verticalAlignment = Alignment.CenterVertically) {
        Image(
            painter = painterResource(R.drawable.novastore_logo),
            contentDescription = "NovaStore",
            contentScale = ContentScale.Fit,
            modifier = Modifier.size(46.dp)
        )
        Column(modifier = Modifier.weight(1f).padding(start = 8.dp)) {
            Text("NovaStore Seller", color = FamilyTokens.Navy, fontSize = 13.sp, fontWeight = FontWeight.ExtraBold)
            Text(storeName, color = FamilyTokens.Green, fontSize = 10.sp, fontWeight = FontWeight.Bold)
        }
        IconButton(
            onClick = onNotifications ?: {},
            enabled = onNotifications != null,
            modifier = Modifier.semantics {
                contentDescription = if (onNotifications == null) "Bildirimler; bu sürümde kapalı" else "Bildirimleri aç"
                if (onNotifications == null) disabled()
            }
        ) {
            Icon(Icons.Outlined.Notifications, contentDescription = null, tint = FamilyTokens.Navy)
        }
        Surface(shape = CircleShape, color = FamilyTokens.Navy, modifier = Modifier.size(34.dp)) {
            Box(contentAlignment = Alignment.Center) {
                Text("KS", color = FamilyTokens.White, fontSize = 10.sp, fontWeight = FontWeight.ExtraBold)
            }
        }
    }
}

@Composable
private fun ContextCard(leftLabel: String, leftValue: String, rightLabel: String, rightValue: String) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(14.dp),
        color = FamilyTokens.White,
        border = BorderStroke(1.dp, FamilyTokens.Outline),
        shadowElevation = 1.dp
    ) {
        Row(modifier = Modifier.heightIn(min = 68.dp).padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            LabeledValue(leftLabel, leftValue, Modifier.weight(1f))
            Spacer(Modifier.width(1.dp).height(42.dp).background(FamilyTokens.Outline))
            LabeledValue(rightLabel, rightValue, Modifier.weight(1f).padding(start = 12.dp))
        }
    }
}

@Composable
private fun LabeledValue(label: String, value: String, modifier: Modifier = Modifier) {
    Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(3.dp)) {
        Text(label.uppercase(Locale.forLanguageTag("tr-TR")), color = FamilyTokens.Muted, fontSize = 9.sp, fontWeight = FontWeight.ExtraBold)
        Text(value, color = FamilyTokens.Navy, fontSize = 12.sp, fontWeight = FontWeight.ExtraBold, maxLines = 2)
    }
}

@Composable
private fun SplitHero(
    eyebrow: String,
    title: String,
    body: String,
    @DrawableRes illustration: Int,
    dark: Boolean = false
) {
    val background = if (dark) FamilyTokens.Navy else FamilyTokens.PeachLight
    val foreground = if (dark) FamilyTokens.White else FamilyTokens.Navy
    Card(
        shape = RoundedCornerShape(15.dp),
        colors = CardDefaults.cardColors(containerColor = background),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Row(modifier = Modifier.fillMaxWidth().heightIn(min = 132.dp).padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(modifier = Modifier.weight(1.15f), verticalArrangement = Arrangement.spacedBy(5.dp)) {
                Text(eyebrow, color = if (dark) FamilyTokens.White.copy(alpha = .82f) else FamilyTokens.OrangeTextAccessible, fontSize = 9.sp, fontWeight = FontWeight.ExtraBold)
                Text(title, color = foreground, fontSize = 17.sp, fontWeight = FontWeight.ExtraBold)
                Text(body, color = if (dark) FamilyTokens.White.copy(alpha = .82f) else FamilyTokens.Muted, fontSize = 10.sp, lineHeight = 13.sp)
            }
            Image(
                painter = painterResource(illustration),
                contentDescription = null,
                contentScale = ContentScale.Fit,
                modifier = Modifier.weight(.85f).height(108.dp)
            )
        }
    }
}

@Composable
private fun MetricTile(label: String, value: String, modifier: Modifier = Modifier, tint: Color = FamilyTokens.Blue) {
    Surface(modifier = modifier.heightIn(min = 62.dp), shape = RoundedCornerShape(13.dp), color = tint) {
        Column(modifier = Modifier.padding(horizontal = 10.dp, vertical = 9.dp), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Text(label, color = FamilyTokens.Muted, fontSize = 9.sp, fontWeight = FontWeight.Bold, maxLines = 1)
            Text(value, color = FamilyTokens.Navy, fontSize = 15.sp, fontWeight = FontWeight.ExtraBold, maxLines = 1)
        }
    }
}

@Composable
private fun SectionTitle(title: String, action: String? = null) {
    Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Text(title, color = FamilyTokens.Navy, fontSize = 14.sp, fontWeight = FontWeight.ExtraBold, modifier = Modifier.weight(1f))
        action?.let {
            Text(
                it,
                color = FamilyTokens.OrangeTextAccessible,
                fontSize = 10.sp,
                fontWeight = FontWeight.ExtraBold,
                modifier = Modifier.semantics {
                    contentDescription = "$it; salt okunur"
                    disabled()
                }
            )
        }
    }
}

@Composable
private fun DisclosureRow(
    title: String,
    subtitle: String,
    icon: ImageVector,
    status: String? = null,
    onClick: (() -> Unit)? = null
) {
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 66.dp)
            .then(
                if (onClick != null) Modifier.clickable(role = Role.Button, onClick = onClick)
                else Modifier.semantics {
                    contentDescription = "$title; $subtitle; salt okunur"
                }
            ),
        shape = RoundedCornerShape(14.dp),
        color = FamilyTokens.White,
        border = BorderStroke(1.dp, FamilyTokens.Outline)
    ) {
        Row(modifier = Modifier.padding(10.dp), verticalAlignment = Alignment.CenterVertically) {
            Surface(shape = RoundedCornerShape(11.dp), color = FamilyTokens.Peach, modifier = Modifier.size(38.dp)) {
                Icon(icon, contentDescription = null, tint = FamilyTokens.OrangeTextAccessible, modifier = Modifier.padding(8.dp))
            }
            Column(modifier = Modifier.weight(1f).padding(horizontal = 10.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(title, color = FamilyTokens.Navy, fontSize = 11.sp, fontWeight = FontWeight.ExtraBold)
                Text(subtitle, color = FamilyTokens.Muted, fontSize = 9.sp, maxLines = 2)
            }
            status?.let {
                Surface(shape = RoundedCornerShape(10.dp), color = FamilyTokens.GreenTint) {
                    Text(it, color = FamilyTokens.Green, fontSize = 8.sp, fontWeight = FontWeight.ExtraBold, modifier = Modifier.padding(horizontal = 7.dp, vertical = 4.dp))
                }
            }
            if (onClick != null) Icon(Icons.AutoMirrored.Outlined.KeyboardArrowRight, contentDescription = null, tint = FamilyTokens.Navy)
        }
    }
}

@Composable
private fun Guardrail(title: String, body: String, warning: Boolean = false) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        color = if (warning) FamilyTokens.Peach else FamilyTokens.Blue,
        border = BorderStroke(1.dp, if (warning) FamilyTokens.Orange.copy(alpha = .55f) else FamilyTokens.Outline)
    ) {
        Row(modifier = Modifier.padding(11.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(if (warning) Icons.Outlined.WarningAmber else Icons.Outlined.Shield, contentDescription = null, tint = if (warning) FamilyTokens.OrangeTextAccessible else FamilyTokens.Navy, modifier = Modifier.size(21.dp))
            Column(modifier = Modifier.padding(start = 9.dp)) {
                Text(title, color = FamilyTokens.Navy, fontSize = 10.sp, fontWeight = FontWeight.ExtraBold)
                Text(body, color = FamilyTokens.Muted, fontSize = 9.sp, lineHeight = 12.sp)
            }
        }
    }
}

@Composable
private fun PrimaryAction(label: String, onClick: (() -> Unit)?, enabled: Boolean = onClick != null) {
    Button(
        onClick = onClick ?: {},
        enabled = enabled,
        modifier = Modifier.fillMaxWidth().height(48.dp).semantics {
            contentDescription = if (enabled) label else "$label; bu sürümde kapalı"
            if (!enabled) disabled()
        },
        shape = RoundedCornerShape(12.dp),
        colors = ButtonDefaults.buttonColors(
            containerColor = FamilyTokens.OrangeDeepAccessible,
            contentColor = FamilyTokens.White,
            disabledContainerColor = FamilyTokens.Outline,
            disabledContentColor = FamilyTokens.Muted
        )
    ) {
        Text(label, fontSize = 13.sp, fontWeight = FontWeight.ExtraBold)
    }
}

@Composable
private fun FamilyList(content: androidx.compose.foundation.lazy.LazyListScope.() -> Unit) {
    LazyColumn(
        modifier = Modifier.fillMaxSize().padding(horizontal = 18.dp),
        verticalArrangement = Arrangement.spacedBy(9.dp),
        contentPadding = PaddingValues(top = 8.dp, bottom = 14.dp),
        content = content
    )
}

@Composable
private fun DashboardFamily(
    page: SellerPage,
    onOpen: (SellerScreen) -> Unit,
    onRefresh: () -> Unit,
    @Suppress("UNUSED_PARAMETER") onLogout: () -> Unit
) {
    val data = page.familyData as? SellerDashboardData
    val fixture = page.isCanonicalFixture
    val storeName = data?.storeName
        ?: page.rows.firstOrNull()?.second
        ?: if (fixture) "Nova Teknoloji" else "Yetkili mağaza kapsamı"
    val gross = data?.grossMinor?.money(data.currency) ?: if (fixture) "₺12.480,50" else "—"
    val available = data?.availableMinor?.money(data.currency) ?: if (fixture) "₺38.240,00" else "—"
    val pending = data?.ordersByStatus?.filter { it.first in setOf("new", "preparing") }?.sumOf { it.second }
        ?: if (fixture) 6 else 0
    val lowStock = data?.lowStockCount ?: if (fixture) 3 else 0
    GoldenDashboard055(
        fixture = fixture,
        storeName = storeName,
        gross = gross,
        available = available,
        pending = pending,
        lowStock = lowStock,
        currency = data?.currency ?: "TRY",
        recentStatus = data?.ordersByStatus?.firstOrNull(),
        onOpen = onOpen,
        onRefresh = onRefresh,
        onLogout = onLogout
    )
}

@Composable
private fun GoldenDashboard055(
    fixture: Boolean,
    storeName: String,
    gross: String,
    available: String,
    pending: Int,
    lowStock: Int,
    currency: String,
    recentStatus: Pair<String, Int>?,
    onOpen: (SellerScreen) -> Unit,
    @Suppress("UNUSED_PARAMETER") onRefresh: () -> Unit,
    onLogout: () -> Unit
) {
    CompositionLocalProvider(
        androidx.compose.material3.LocalTextStyle provides
            androidx.compose.material3.LocalTextStyle.current.copy(fontFamily = FontFamily.Default)
    ) {
    BoxWithConstraints(modifier = Modifier.fillMaxSize()) {
        val unit = maxWidth / 852f
        Column(modifier = Modifier.fillMaxSize().background(FamilyTokens.Canvas).statusBarsPadding()) {
            Spacer(Modifier.height(9.5.dp))
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(108 * unit)
                    .padding(start = 42 * unit, end = 32 * unit)
                    .testTag("seller-region:055:brand_header"),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Image(
                    painter = painterResource(R.drawable.novastore_logo),
                    contentDescription = "NovaStore",
                    contentScale = ContentScale.Fit,
                    modifier = Modifier.size(92 * unit)
                )
                Column(modifier = Modifier.weight(1f).padding(start = 27 * unit), verticalArrangement = Arrangement.spacedBy(4 * unit)) {
                    Text(
                        if (fixture) "Nova Teknoloji" else storeName,
                        color = FamilyTokens.Navy,
                        fontSize = 16.sp,
                        fontWeight = FontWeight.SemiBold
                    )
                    if (fixture) {
                        Text("●  Mağaza açık",
                            color = Color(0xFF00B965),
                            fontSize = 11.5.sp,
                            fontWeight = FontWeight.Medium
                        )
                    }
                }
                IconButton(
                    onClick = {},
                    enabled = false,
                    modifier = Modifier.size(54 * unit).semantics { contentDescription = "Bildirimler; bu sürümde kapalı"; disabled() }
                ) { Icon(Icons.Outlined.Notifications, contentDescription = null, tint = FamilyTokens.Navy, modifier = Modifier.size(31 * unit)) }
                Spacer(Modifier.width(18 * unit))
                Surface(shape = CircleShape, color = FamilyTokens.Navy, modifier = Modifier.size(68 * unit)) {
                    Box(contentAlignment = Alignment.Center) {
                        if (fixture) {
                            Text("KS", color = Color.White, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                        } else {
                            Icon(
                                Icons.Outlined.Person,
                                contentDescription = "Doğrulanmış satıcı oturumu",
                                tint = Color.White,
                                modifier = Modifier.size(30 * unit)
                            )
                        }
                    }
                }
            }
            Spacer(Modifier.height(39 * unit))
            Column(
                modifier = Modifier
                    .padding(horizontal = 42 * unit)
                    .height(94 * unit)
                    .testTag("seller-region:055:greeting")
            ) {
                Text(
                    if (fixture) "Günaydın, Kuşay" else "Genel Bakış",
                    color = FamilyTokens.Navy,
                    fontSize = 21.sp,
                    fontWeight = FontWeight.SemiBold
                )
                Text(
                    if (fixture) "22 Temmuz Çarşamba" else "Yetkili mağaza özeti",
                    color = FamilyTokens.Muted,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Normal
                )
            }
            Spacer(Modifier.height(30 * unit))
            val inventoryMetric = dashboardInventoryMetric(fixture, lowStock)
            DashboardSalesHero(
                gross = gross,
                pending = if (fixture) 24 else pending,
                inventoryValue = inventoryMetric.first,
                inventoryLabel = inventoryMetric.second,
                fixture = fixture,
                unit = unit
            )
            Spacer(Modifier.height(24 * unit))
            Row(modifier = Modifier.fillMaxWidth().height(312 * unit).padding(horizontal = 30 * unit)) {
                if (fixture) {
                    DashboardTaskCard("$pending", dashboardPendingOrderLabel(true), "Hazırla", Icons.Outlined.ShoppingBag, unit, "task_orders", Modifier.width(247 * unit)) { onOpen(SellerScreen.ORDERS) }
                    Spacer(Modifier.width(24 * unit))
                    DashboardTaskCard("$lowStock", "düşük stok", "Stok ekle", Icons.Outlined.Inventory2, unit, "task_stock", Modifier.width(248 * unit)) { onOpen(SellerScreen.INVENTORY) }
                    Spacer(Modifier.width(24 * unit))
                    DashboardTaskCard(
                        "2",
                        "müşteri sorusu",
                        "Kapalı",
                        Icons.AutoMirrored.Outlined.ContactSupport,
                        unit,
                        "task_questions",
                        Modifier.width(249 * unit),
                        "Müşteri soruları; bu sürümde kapalı",
                        enabled = false
                    ) {}
                } else {
                    DashboardTaskCard("$pending", dashboardPendingOrderLabel(false), "Hazırla", Icons.Outlined.ShoppingBag, unit, "task_orders", Modifier.weight(1f)) { onOpen(SellerScreen.ORDERS) }
                    Spacer(Modifier.width(24 * unit))
                    DashboardTaskCard("$lowStock", "düşük stok", "Stok ekle", Icons.Outlined.Inventory2, unit, "task_stock", Modifier.weight(1f)) { onOpen(SellerScreen.INVENTORY) }
                }
            }
            Spacer(Modifier.height(24 * unit))
            DashboardBalanceCard(available, currency, fixture, unit) { onOpen(SellerScreen.FINANCE) }
            Spacer(Modifier.height(42 * unit))
            Row(modifier = Modifier.fillMaxWidth().height(46 * unit).padding(horizontal = 30 * unit), verticalAlignment = Alignment.CenterVertically) {
                Text(
                    "Son siparişler",
                    color = FamilyTokens.Navy,
                    fontSize = 17.sp,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.weight(1f)
                )
                Text(
                    "Tümünü gör",
                    color = Color(0xFF005DE8),
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Medium,
                    modifier = Modifier.semantics {
                        contentDescription = "Tümünü gör; salt okunur"
                        disabled()
                    }
                )
            }
            DashboardRecentOrders(fixture, recentStatus, unit) { onOpen(SellerScreen.ORDERS) }
            Spacer(Modifier.height(15 * unit))
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(maxOf(48.dp, 64 * unit))
                    .padding(start = 30 * unit, end = 31 * unit)
                    .testTag("seller-region:055:primary_cta"),
                contentAlignment = Alignment.Center
            ) {
                val actionShape = RoundedCornerShape(16.dp)
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(maxOf(48.dp, 64 * unit))
                        .shadow(6.dp, actionShape, clip = false, ambientColor = Color.Transparent, spotColor = FamilyTokens.Orange.copy(alpha = .52f))
                        .clip(actionShape)
                        .background(Brush.horizontalGradient(listOf(Color(0xFFFF6D18), Color(0xFFFF4B00))))
                        .clickable(role = Role.Button) { onOpen(SellerScreen.PRODUCTS) }
                        .semantics { contentDescription = "Ürün ekle" },
                    contentAlignment = Alignment.Center
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(9 * unit)) {
                        Icon(Icons.Outlined.Add, contentDescription = null, tint = Color.White, modifier = Modifier.size(38 * unit))
                        Text("Ürün ekle", color = Color.White, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
                    }
                }
            }
        }
    }
    }
}

internal fun dashboardInventoryMetric(fixture: Boolean, lowStockCount: Int): Pair<Int, String> =
    if (fixture) 18 to "ürün" else lowStockCount to "düşük stok"

internal fun dashboardShowsTrend(fixture: Boolean): Boolean = fixture

internal fun dashboardSalesLabel(fixture: Boolean): String = if (fixture) "Bugünkü satış" else "Brüt satış"

internal fun dashboardPendingOrderLabel(fixture: Boolean): String =
    if (fixture) "yeni sipariş" else "yeni veya hazırlanan sipariş"

internal fun dashboardBalanceSubtitle(fixture: Boolean, currency: String): String =
    if (fixture) "Sonraki ödeme:  24 Temmuz" else "Para birimi: $currency"

@Composable
private fun DashboardSalesHero(
    gross: String,
    pending: Int,
    inventoryValue: Int,
    inventoryLabel: String,
    fixture: Boolean,
    unit: androidx.compose.ui.unit.Dp
) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(460 * unit)
            .padding(start = 30 * unit, end = 31 * unit)
            .testTag("seller-region:055:sales_hero")
    ) {
        val heroShape = RoundedCornerShape(22.dp)
        Surface(
            modifier = Modifier
                .fillMaxSize()
                .padding(start = unit, end = 2 * unit, bottom = 2 * unit)
                .shadow(4.dp, heroShape, clip = false),
            shape = heroShape,
            color = Color.Transparent,
            shadowElevation = 0.dp
        ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .background(Brush.linearGradient(listOf(Color(0xFF12345B), Color(0xFF052A60))))
                .padding(start = 43 * unit, end = 40 * unit, top = 22 * unit, bottom = 28 * unit)
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(modifier = Modifier.weight(1f)) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8 * unit)
                    ) {
                        Text(
                            dashboardSalesLabel(fixture),
                            color = Color.White,
                            fontSize = 16.sp,
                            fontWeight = FontWeight.SemiBold
                        )
                        Icon(
                            Icons.Outlined.Info,
                            contentDescription = null,
                            tint = Color.White,
                            modifier = Modifier.size(24 * unit)
                        )
                    }
                    Spacer(Modifier.height(25 * unit))
                    Text(
                        gross,
                        color = Color.White,
                        fontSize = 36.sp,
                        fontWeight = FontWeight.Bold,
                        maxLines = 1
                    )
                    Spacer(Modifier.height(17 * unit))
                    if (fixture) {
                        Surface(
                            modifier = Modifier.offset(x = 7 * unit, y = (-2.5).dp),
                            shape = RoundedCornerShape(30 * unit),
                            color = Color.White.copy(alpha = .13f)
                        ) {
                            Row(modifier = Modifier.padding(horizontal = 18 * unit, vertical = 10 * unit), verticalAlignment = Alignment.CenterVertically) {
                                Icon(Icons.Outlined.ArrowUpward, contentDescription = null, tint = Color(0xFF00E66B), modifier = Modifier.size(23 * unit))
                                Spacer(Modifier.width(6 * unit))
                                Text(
                                    "%18 dünden",
                                    color = Color.White,
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.Medium
                                )
                            }
                        }
                    }
                }
                if (dashboardShowsTrend(fixture)) {
                    Canvas(modifier = Modifier.width(297 * unit).height(155 * unit).offset(x = -25 * unit, y = 22 * unit)) {
                        val chart = Path().apply {
                            moveTo(size.width * .02f, size.height * .94f)
                            cubicTo(size.width * .10f, size.height * .72f, size.width * .15f, size.height * .80f, size.width * .23f, size.height * .68f)
                            cubicTo(size.width * .31f, size.height * .48f, size.width * .36f, size.height * .66f, size.width * .43f, size.height * .51f)
                            cubicTo(size.width * .51f, size.height * .34f, size.width * .56f, size.height * .53f, size.width * .63f, size.height * .36f)
                            cubicTo(size.width * .70f, size.height * .20f, size.width * .76f, size.height * .30f, size.width * .82f, size.height * .19f)
                            cubicTo(size.width * .88f, size.height * .10f, size.width * .93f, size.height * .16f, size.width * .98f, size.height * .04f)
                        }
                        drawPath(chart, color = Color(0xFFC9E0FF), style = Stroke(width = 4 * unit.toPx()))
                        drawCircle(color = Color(0xFF4B9BFF), radius = 6 * unit.toPx(), center = Offset(size.width * .98f, size.height * .04f))
                    }
                }
            }
            Spacer(Modifier.weight(1f))
            Spacer(Modifier.fillMaxWidth().height(1.dp).background(Color.White.copy(alpha = .24f)))
            Row(modifier = Modifier.fillMaxWidth().height(126 * unit).offset(y = 22 * unit), verticalAlignment = Alignment.CenterVertically) {
                DashboardHeroMetric(Icons.Outlined.ShoppingBag, pending.toString(), "sipariş", unit, Modifier.weight(1f))
                Spacer(Modifier.width(1.dp).height(88 * unit).background(Color.White.copy(alpha = .25f)))
                DashboardHeroMetric(Icons.Outlined.Inventory2, inventoryValue.toString(), inventoryLabel, unit, Modifier.weight(1f))
            }
        }
        }
    }
}

@Composable
private fun DashboardHeroMetric(icon: ImageVector, value: String, label: String, unit: androidx.compose.ui.unit.Dp, modifier: Modifier) {
    Row(modifier = modifier, horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) {
        Surface(shape = CircleShape, color = Color.White.copy(alpha = .12f), modifier = Modifier.size(72 * unit)) {
            Icon(icon, contentDescription = null, tint = Color.White, modifier = Modifier.padding(17 * unit))
        }
        Spacer(Modifier.width(10.dp))
        Column {
            Text(value, color = Color.White, fontSize = 17.sp, fontWeight = FontWeight.Bold)
            Text(label, color = Color.White, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
        }
        Spacer(Modifier.width(12 * unit))
        Icon(Icons.Outlined.Info, contentDescription = null, tint = Color.White, modifier = Modifier.size(36 * unit))
    }
}

@Composable
private fun DashboardTaskCard(label: String, subtitle: String, action: String, icon: ImageVector, unit: androidx.compose.ui.unit.Dp, regionId: String, modifier: Modifier, accessibilityLabel: String? = null, enabled: Boolean = true, onClick: () -> Unit) {
    Surface(
        modifier = modifier.fillMaxSize().testTag("seller-region:055:$regionId"),
        shape = RoundedCornerShape(18.dp),
        color = FamilyTokens.White,
        border = BorderStroke(1.dp, FamilyTokens.Outline),
        shadowElevation = 2.dp
    ) {
        Column(modifier = Modifier.padding(17 * unit)) {
            Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Surface(shape = CircleShape, color = FamilyTokens.Peach, modifier = Modifier.size(72 * unit)) {
                    Icon(icon, contentDescription = null, tint = FamilyTokens.Navy, modifier = Modifier.padding(17 * unit))
                }
                Spacer(Modifier.weight(1f))
                Icon(Icons.Outlined.Info, contentDescription = null, tint = FamilyTokens.Navy, modifier = Modifier.size(42 * unit))
            }
            Spacer(Modifier.height(16 * unit))
            Text(
                label,
                color = FamilyTokens.Navy,
                fontSize = 22.sp,
                fontWeight = FontWeight.Bold
            )
            Text(subtitle, color = FamilyTokens.Navy, fontSize = 11.5.sp, fontWeight = FontWeight.Medium, maxLines = 1)
            Spacer(Modifier.weight(1f))
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = 48.dp)
                    .then(
                        if (enabled) {
                            Modifier.clickable(role = Role.Button, onClick = onClick)
                        } else {
                            Modifier.semantics { disabled() }
                        }
                    )
                    .semantics { contentDescription = accessibilityLabel ?: action },
                contentAlignment = Alignment.Center
            ) {
                val actionShape = RoundedCornerShape(12.dp)
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(56 * unit)
                        .clip(actionShape)
                        .background(
                            if (enabled) {
                                Brush.horizontalGradient(listOf(Color(0xFFFF6D18), Color(0xFFFF4B00)))
                            } else {
                                Brush.horizontalGradient(listOf(FamilyTokens.Peach, FamilyTokens.Peach))
                            }
                        ),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        if (enabled) "$action  ›" else action,
                        color = if (enabled) Color.White else FamilyTokens.OrangeTextAccessible,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.SemiBold,
                        maxLines = 1
                    )
                }
            }
        }
    }
}

@Composable
private fun DashboardBalanceCard(available: String, currency: String, fixture: Boolean, unit: androidx.compose.ui.unit.Dp, onClick: () -> Unit) {
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .height(163 * unit)
            .padding(start = 30 * unit, end = 31 * unit)
            .testTag("seller-region:055:balance")
            .clickable(role = Role.Button, onClick = onClick),
        shape = RoundedCornerShape(18.dp),
        color = FamilyTokens.White,
        border = BorderStroke(1.dp, FamilyTokens.Outline),
        shadowElevation = 2.dp
    ) {
        Row(modifier = Modifier.padding(horizontal = 22 * unit), verticalAlignment = Alignment.CenterVertically) {
            Surface(shape = CircleShape, color = FamilyTokens.Blue, modifier = Modifier.size(96 * unit)) {
                Icon(Icons.Outlined.AccountBalanceWallet, contentDescription = null, tint = FamilyTokens.Navy, modifier = Modifier.padding(23 * unit))
            }
            Column(modifier = Modifier.weight(1f).padding(start = 35 * unit)) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6 * unit)) {
                    Text(
                        "Kullanılabilir bakiye",
                        color = FamilyTokens.Muted,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Medium
                    )
                    Icon(Icons.Outlined.Info, contentDescription = null, tint = FamilyTokens.Muted, modifier = Modifier.size(28 * unit))
                }
                Text(
                    available,
                    color = FamilyTokens.Navy,
                    fontSize = 23.sp,
                    fontWeight = FontWeight.Bold,
                    maxLines = 1
                )
                Text(
                    dashboardBalanceSubtitle(fixture, currency),
                    color = Color(0xFF005DE8),
                    fontSize = 11.sp
                )
            }
            Icon(Icons.AutoMirrored.Outlined.KeyboardArrowRight, contentDescription = null, tint = FamilyTokens.Navy, modifier = Modifier.size(30 * unit))
        }
    }
}

@Composable
private fun DashboardRecentOrders(fixture: Boolean, recentStatus: Pair<String, Int>?, unit: androidx.compose.ui.unit.Dp, onClick: () -> Unit) {
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .height(198 * unit)
            .padding(start = 30 * unit, end = 31 * unit)
            .testTag("seller-region:055:recent_orders")
            .clickable(role = Role.Button, onClick = onClick),
        shape = RoundedCornerShape(18.dp),
        color = FamilyTokens.White,
        border = BorderStroke(1.dp, FamilyTokens.Outline),
        shadowElevation = 2.dp
    ) {
        Column(modifier = Modifier.padding(horizontal = 16 * unit)) {
            if (fixture) {
                DashboardOrderRow("#NS-240722-1842", "3 ürün", "Hazırlanıyor", "₺1.249,90", Modifier.weight(1f))
                Spacer(Modifier.fillMaxWidth().height(1.dp).background(FamilyTokens.Outline))
                DashboardOrderRow("#NS-240722-1838", "1 ürün", "Yeni sipariş", "₺849,00", Modifier.weight(1f))
            } else {
                DashboardOrderRow(
                    "Sipariş durum özeti",
                    recentStatus?.let { "${it.first.statusLabel()}: ${it.second} kayıt" } ?: "Kayıt yok",
                    "",
                    "",
                    Modifier.weight(1f)
                )
            }
        }
    }
}

@Composable
private fun DashboardOrderRow(title: String, subtitle: String, status: String, amount: String, modifier: Modifier) {
    Row(modifier = modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Surface(shape = CircleShape, color = FamilyTokens.Blue, modifier = Modifier.size(32.dp)) {
            Icon(Icons.Outlined.ShoppingBag, contentDescription = null, tint = FamilyTokens.Navy, modifier = Modifier.padding(7.dp))
        }
        Column(modifier = Modifier.weight(1f).padding(start = 15.dp).offset(y = 2.dp)) {
            Text(title, color = FamilyTokens.Navy, fontSize = 12.sp, fontWeight = FontWeight.ExtraBold)
            Text(subtitle, color = FamilyTokens.Muted, fontSize = 10.sp)
        }
        if (status.isNotEmpty()) {
            Surface(shape = RoundedCornerShape(12.dp), color = FamilyTokens.Peach) { Text(status, color = FamilyTokens.OrangeTextAccessible, fontSize = 9.sp, modifier = Modifier.padding(horizontal = 9.dp, vertical = 4.dp)) }
        }
        if (amount.isNotEmpty()) Text(amount, color = FamilyTokens.Navy, fontSize = 12.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(start = 10.dp).offset(x = 8.dp))
        Icon(Icons.AutoMirrored.Outlined.KeyboardArrowRight, contentDescription = null, tint = FamilyTokens.Navy, modifier = Modifier.padding(start = 6.dp).size(22.dp))
    }
}

@Composable
private fun SearchAndFilters(placeholder: String, chips: List<String>) {
    Surface(shape = RoundedCornerShape(13.dp), color = FamilyTokens.White, border = BorderStroke(1.dp, FamilyTokens.Outline)) {
        Row(modifier = Modifier.fillMaxWidth().height(46.dp).padding(horizontal = 11.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Outlined.Search, contentDescription = null, tint = FamilyTokens.Muted, modifier = Modifier.size(20.dp))
            Text(placeholder, color = FamilyTokens.Muted, fontSize = 10.sp, modifier = Modifier.weight(1f).padding(start = 8.dp))
            Icon(Icons.Outlined.FilterAlt, contentDescription = "Filtreler; salt okunur önizleme", tint = FamilyTokens.Navy, modifier = Modifier.size(20.dp))
        }
    }
    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(5.dp)) {
        chips.take(4).forEachIndexed { index, chip ->
            Surface(
                modifier = Modifier.weight(1f),
                shape = RoundedCornerShape(12.dp),
                color = if (index == 0) FamilyTokens.Navy else FamilyTokens.White,
                border = BorderStroke(1.dp, if (index == 0) FamilyTokens.Navy else FamilyTokens.Outline)
            ) {
                Text(chip, color = if (index == 0) FamilyTokens.White else FamilyTokens.Navy, fontSize = 8.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center, modifier = Modifier.padding(vertical = 8.dp))
            }
        }
    }
}

@Composable
private fun OfferListFamily(page: SellerPage, onOpen: (SellerScreen) -> Unit, onRefresh: () -> Unit) {
    val data = page.familyData as? SellerOfferListData
    val fixture = page.isCanonicalFixture
    val rows = data?.items?.take(6)?.map { item ->
        item.sellerSku to "${item.status.statusLabel()} • ${item.priceMinor.money(item.currency)} • ${item.quantity} stok"
    } ?: if (fixture && page.rows.isEmpty()) {
        listOf("Nova Akıllı Saat" to "Yayında • ₺2.499,90 • 18 stok", "Kablosuz Kulaklık" to "Taslak • ₺899,90 • 7 stok", "Hızlı Şarj Adaptörü" to "Yayında • ₺649,90 • 3 stok")
    } else page.rows.take(4)
    val active = data?.items?.count { it.status == "active" || it.visibility == "visible" } ?: if (fixture) 24 else 0
    val critical = data?.items?.count { it.quantity <= 3 } ?: if (fixture) 3 else 0
    FamilyList {
        item {
            if (fixture) BrandHeader("NovaStore Demo Mağaza")
            else FamilyTopBar("Ürünler", context = "Yetkili mağaza kapsamı")
        }
        item {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    if (page.canonicalReferenceId == "089") page.title else "Ürünler",
                    color = FamilyTokens.Navy,
                    fontSize = 20.sp,
                    fontWeight = FontWeight.ExtraBold,
                    modifier = Modifier.weight(1f)
                )
                Surface(
                    modifier = Modifier.semantics {
                        contentDescription = "Ürün ekle; bu sürümde kapalı"
                        disabled()
                    },
                    shape = RoundedCornerShape(11.dp),
                    color = FamilyTokens.OrangeDeepAccessible
                ) {
                    Row(modifier = Modifier.padding(horizontal = 10.dp, vertical = 7.dp), verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Outlined.Add, contentDescription = null, tint = FamilyTokens.White, modifier = Modifier.size(16.dp))
                        Text("Ürün ekle", color = FamilyTokens.White, fontSize = 9.sp, fontWeight = FontWeight.Bold)
                    }
                }
            }
        }
        item { SearchAndFilters("Ürün, SKU veya barkod ara", listOf("Tümü", "Yayında", "Taslak", "Stok az")) }
        item { ContextCard("Aktif teklifler", active.toString(), "Kritik stok", critical.toString()) }
        if (rows.isEmpty()) {
            item { DisclosureRow("Teklif bulunamadı", "Sunucu bu mağaza kapsamında kayıt döndürmedi", Icons.Outlined.Inventory2) }
        } else {
            items(rows) { row -> DisclosureRow(row.first, row.second, Icons.Outlined.Inventory2, if (row.second.contains("Yayında")) "Yayında" else null, onClick = { onOpen(SellerScreen.INVENTORY) }) }
        }
        item { Guardrail("Katalog bütünlüğü", "Ürün kimliği ve kanonik katalog alanları satıcı tarafından değiştirilemez.") }
        item { PrimaryAction("Stok durumunu görüntüle", onClick = { onOpen(SellerScreen.INVENTORY) }) }
        item { OutlinedButton(onClick = onRefresh, modifier = Modifier.fillMaxWidth()) { Text("Listeyi yenile", color = FamilyTokens.Navy) } }
    }
}

@Composable
private fun InventoryFamily(page: SellerPage, onOpen: (SellerScreen) -> Unit, onRefresh: () -> Unit) {
    val data = page.familyData as? SellerInventoryData
    val fixture = page.isCanonicalFixture
    val rows = data?.items?.take(6)?.map { item ->
        item.sellerSku to "${item.quantity} adet • Eşik ${item.lowStockThreshold}${if (item.quantity <= item.lowStockThreshold) " • Kritik" else ""}"
    } ?: if (fixture && page.rows.isEmpty()) {
        listOf("Nova Akıllı Saat" to "18 adet • Eşik 5", "Kablosuz Kulaklık" to "7 adet • Eşik 4", "Hızlı Şarj Adaptörü" to "3 adet • Kritik")
    } else page.rows.take(4)
    val total = data?.items?.sumOf { it.quantity } ?: if (fixture) 1284 else 0
    val critical = data?.items?.count { it.quantity <= it.lowStockThreshold } ?: if (fixture) 3 else 0
    val depleted = data?.items?.count { it.quantity == 0L } ?: if (fixture) 1 else 0
    FamilyList {
        item { FamilyTopBar("Stok ve Envanter", context = "NovaStore Satıcı Paneli") }
        item { SearchAndFilters("SKU veya ürün ara", listOf("Özet", "Ürünler", "Kritik", "Hareketler")) }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                MetricTile("Toplam", total.toString(), Modifier.weight(1f), FamilyTokens.Blue)
                MetricTile("Kritik", critical.toString(), Modifier.weight(1f), FamilyTokens.Peach)
                MetricTile("Tükendi", depleted.toString(), Modifier.weight(1f), FamilyTokens.PurpleTint)
            }
        }
        item { ContextCard("Stok kapsamı", if (fixture) "Ana depo" else "Yetkili mağaza", "Kaynak", if (fixture) "10:24" else "Canlı seller API") }
        item { SectionTitle("İlgilenmeniz gereken stoklar") }
        if (rows.isEmpty()) {
            item { DisclosureRow("Stok kaydı bulunamadı", "Sunucu bu mağaza kapsamında kayıt döndürmedi", Icons.Outlined.Inventory2) }
        } else {
            items(rows) { row -> DisclosureRow(row.first, row.second, Icons.Outlined.Inventory2, if (row.second.contains("Kritik")) "Kritik" else null) }
        }
        item { Guardrail("Negatif stok kapalı", "Her stok değişikliği revizyon ve idempotency anahtarıyla doğrulanır.", warning = true) }
        item { PrimaryAction("Stok güncelle", onClick = null, enabled = false) }
        item { OutlinedButton(onClick = { onOpen(SellerScreen.PRODUCTS) }, modifier = Modifier.fillMaxWidth()) { Text("Ürün listesine dön", color = FamilyTokens.Navy) } }
        item { OutlinedButton(onClick = onRefresh, modifier = Modifier.fillMaxWidth()) { Text("Stokları yenile", color = FamilyTokens.Navy) } }
    }
}

@Composable
private fun OrderListFamily(page: SellerPage, onRefresh: () -> Unit) {
    val data = page.familyData as? SellerOrderListData
    val fixture = page.isCanonicalFixture
    val rows = data?.items?.take(6)?.map { item ->
        "#NS-${item.id}" to "${item.status.statusLabel()} • ${item.packageCount} paket • ${item.grossMinor.money(item.currency)}"
    } ?: if (fixture && page.rows.isEmpty()) {
        listOf("#NS-240722-1842" to "Hazırlanıyor • Bugün 16:00", "#NS-240722-1798" to "Yeni • 2 ürün", "#NS-240721-1651" to "Kargoda • Takip mevcut")
    } else page.rows.take(4)
    FamilyList {
        item {
            if (fixture) BrandHeader("NovaStore Demo Mağaza")
            else FamilyTopBar("Siparişler", context = "Yetkili mağaza kapsamı")
        }
        item { Text("Siparişler", color = FamilyTokens.Navy, fontSize = 20.sp, fontWeight = FontWeight.ExtraBold) }
        item { SearchAndFilters("Sipariş numarası ara", listOf("Tümü", "Yeni", "Hazırlanıyor", "Kargoda")) }
        if (rows.isEmpty()) {
            item { DisclosureRow("Sipariş bulunamadı", "Sunucu bu mağaza kapsamında kayıt döndürmedi", Icons.Outlined.LocalShipping) }
        } else {
            items(rows) { row -> DisclosureRow(row.first, row.second, Icons.Outlined.LocalShipping, row.second.substringBefore(" • ")) }
        }
        item { Guardrail("Sipariş güvenliği", "Müşteri ve ödeme verileri yalnız gerekli iş adımında, tenant kapsamından sonra açılır.") }
        item { PrimaryAction("Seçili siparişi görüntüle", onClick = null, enabled = false) }
        item { OutlinedButton(onClick = onRefresh, modifier = Modifier.fillMaxWidth()) { Text("Siparişleri yenile", color = FamilyTokens.Navy) } }
    }
}

@Composable
private fun OrderDetailFamily(page: SellerPage, onBack: () -> Unit) {
    FamilyList {
        item { FamilyTopBar("Sipariş Detayı", onBack, "Platform siparişi • Satıcı paketi") }
        item { ContextCard("Sipariş", "#NS-240722-1842", "Durum", "Hazırlanıyor") }
        item { SplitHero("Paketleme görevi", "Bugün 16:00’ya kadar", "1 paket • 2 ürün • takip bilgisi hazırlanınca eklenir", R.drawable.seller_tur_4_order_fulfillment_illustration) }
        item { DisclosureRow("Nova Akıllı Saat", "1 adet • SKU NV-SW-01", Icons.Outlined.Inventory2, "Hazır") }
        item { DisclosureRow("Kablosuz Kulaklık", "1 adet • SKU NV-HP-02", Icons.Outlined.Inventory2) }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                MetricTile("Net kazanç", "₺2.984,40", Modifier.weight(1f), FamilyTokens.GreenTint)
                MetricTile("Kalan süre", "03:42", Modifier.weight(1f), FamilyTokens.Peach)
            }
        }
        item { Guardrail("Güvenli sıra", "Sipariş durumu yalnız sunucunun izin verdiği komutlarla ilerletilir.", warning = true) }
        item { PrimaryAction("Hazırlamaya başla", onClick = null, enabled = false) }
        item { OutlinedButton(onClick = onBack, modifier = Modifier.fillMaxWidth()) { Text("Siparişlere dön", color = FamilyTokens.Navy) } }
    }
}

@Composable
private fun FinanceFamily(page: SellerPage, onRefresh: () -> Unit) {
    val data = page.familyData as? SellerFinanceData
    val fixture = page.isCanonicalFixture
    val currency = data?.currency ?: "TRY"
    val available = data?.availableMinor?.money(currency) ?: if (fixture) "₺38.240,00" else "—"
    val gross = data?.grossMinor?.money(currency) ?: if (fixture) "₺42.680" else "—"
    val deductions = data?.let { (it.commissionMinor + it.refundMinor).money(currency) } ?: if (fixture) "₺4.440" else "—"
    val net = data?.netReceivableMinor?.money(currency) ?: if (fixture) "₺38.240" else "—"
    FamilyList {
        item { FamilyTopBar("Finans", context = if (fixture) "NovaStore Demo Mağaza • Bu ay" else "Doğrulanmış mağaza kapsamı • Bu ay") }
        item {
            Surface(modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(15.dp), color = FamilyTokens.OrangeDeepAccessible) {
                Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text("KULLANILABİLİR BAKİYE", color = FamilyTokens.White.copy(alpha = .85f), fontSize = 9.sp, fontWeight = FontWeight.ExtraBold)
                    Text(available, color = FamilyTokens.White, fontSize = 24.sp, fontWeight = FontWeight.ExtraBold)
                    Text("Sunucu tarafından doğrulandı", color = FamilyTokens.White.copy(alpha = .84f), fontSize = 9.sp)
                }
            }
        }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                MetricTile("Brüt satış", gross, Modifier.weight(1f), FamilyTokens.Blue)
                MetricTile("Kesintiler", deductions, Modifier.weight(1f), FamilyTokens.Peach)
                MetricTile("Net", net, Modifier.weight(1f), FamilyTokens.GreenTint)
            }
        }
        item { SectionTitle("Son finans hareketleri", "Tümünü gör") }
        if (data?.ledger.isNullOrEmpty()) {
            item { DisclosureRow("Hesap hareketleri", "Doğrulanmış kayıt bulunamadı", Icons.Outlined.Payments) }
        } else {
            items(data.ledger.take(5)) { entry ->
                DisclosureRow(entry.entryType.statusLabel(), entry.amountMinor.money(entry.currency), Icons.Outlined.Payments)
            }
        }
        item { Guardrail("Finansal doğruluk", "Uygulama tutar hesaplamaz; tüm değerler sunucunun minor-unit kayıtlarından gelir.") }
        item { PrimaryAction("Finans hareketlerini gör", onClick = onRefresh) }
    }
}

@Composable
private fun StoreFamily(page: SellerPage, onOpen: (SellerScreen) -> Unit, @Suppress("UNUSED_PARAMETER") onRefresh: () -> Unit, onBack: () -> Unit) {
    val data = page.familyData as? SellerStoreData
    val fixture = page.isCanonicalFixture
    val storeName = data?.displayName ?: if (fixture) "NovaStore Demo Mağaza" else "Mağaza verisi doğrulanamadı"
    val operationalStatus = data?.operationalStatus?.statusLabel() ?: if (fixture) "Yayında" else "Doğrulanmadı"
    FamilyList {
        item { FamilyTopBar("Mağazam", onBack, "Mağaza ve vitrin yönetimi") }
        item { ContextCard("Mağaza", storeName, "Çalışma durumu", operationalStatus) }
        item {
            val storeHeroStatus = when {
                data != null -> "$storeName • $operationalStatus"
                fixture -> "Mağazan yayında"
                else -> "Mağaza durumu doğrulanamadı"
            }
            SplitHero("Mağaza vitrini", storeHeroStatus, data?.description?.ifBlank { "Profil, görünürlük ve mağaza politikalarını tek kapsamda yönet." } ?: "Profil, görünürlük ve mağaza politikalarını tek kapsamda yönet.", R.drawable.seller_tur_9_storefront_review_question_illustration)
        }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                MetricTile("Revizyon", (data?.revision ?: if (fixture) 1 else 0).toString(), Modifier.weight(1f), FamilyTokens.Peach)
                MetricTile("Profil", if (data?.description.isNullOrBlank()) "Eksik" else "Hazır", Modifier.weight(1f), FamilyTokens.Blue)
                MetricTile("Kapsam", "Tek mağaza", Modifier.weight(1f), FamilyTokens.PurpleTint)
            }
        }
        item { DisclosureRow("Müşteri önizlemesi", "Önizleme rotası bu sürümde salt okunur", Icons.Outlined.Storefront) }
        item { SectionTitle("Mağaza yönetimi") }
        item { DisclosureRow("Profil ve görseller", "Ad, açıklama, logo ve kapak", Icons.Outlined.Storefront) }
        item { DisclosureRow("Kargo ve teslimat", "Hazırlama süresi ve teslimat özeti", Icons.Outlined.LocalShipping) }
        item { DisclosureRow("İade politikası", "Platform koşullarıyla uyumlu açıklama", Icons.Outlined.Shield) }
        item { Guardrail("Yalnız kendi mağazan", "Her değişiklik canlı üyelik, mağaza kapsamı ve revizyon ile doğrulanır.") }
        item { PrimaryAction("Mağaza Profilini Düzenle", onClick = null, enabled = false) }
        if (!fixture) {
            item { OutlinedButton(onClick = { onOpen(SellerScreen.CONTEXT) }, modifier = Modifier.fillMaxWidth().semantics { contentDescription = "Mağaza bağlamını görüntüle" }) { Text("Mağaza bağlamını görüntüle", color = FamilyTokens.Navy) } }
            item { OutlinedButton(onClick = { onOpen(SellerScreen.SUPPORT) }, modifier = Modifier.fillMaxWidth().semantics { contentDescription = "Satıcı desteğini görüntüle" }) { Text("Satıcı desteğini görüntüle", color = FamilyTokens.Navy) } }
        }
        item { OutlinedButton(onClick = { onOpen(SellerScreen.TEAM) }, modifier = Modifier.fillMaxWidth().semantics { contentDescription = "Ekip ve yetkileri görüntüle" }) { Text("Ekip ve yetkileri görüntüle", color = FamilyTokens.Navy) } }
        item { OutlinedButton(onClick = { onOpen(SellerScreen.SECURITY) }, modifier = Modifier.fillMaxWidth().semantics { contentDescription = "Hesap ve güvenliği görüntüle" }) { Text("Hesap ve güvenliği görüntüle", color = FamilyTokens.Navy) } }
    }
}

@Composable
private fun TeamFamily(page: SellerPage, onBack: () -> Unit) {
    val members = page.team?.members.orEmpty()
    val fixture = page.isCanonicalFixture
    val storeName = page.team?.storeName ?: if (fixture) "NovaStore Demo Mağaza" else "Mağaza bağlamı doğrulanamadı"
    val sessionRole = page.team?.sessionRoleCode?.statusLabel() ?: if (fixture) "Sahip" else "Rol doğrulanamadı"
    GoldenTeam282(members, fixture, storeName, sessionRole, onBack)
}

@Composable
private fun GoldenTeam282(
    members: List<com.novastore.seller.data.SellerTeamMember>,
    fixture: Boolean,
    storeName: String,
    sessionRole: String,
    onBack: () -> Unit
) {
    BoxWithConstraints(modifier = Modifier.fillMaxSize()) {
        val unit = maxWidth / 852f
        val visibleMembers = visibleTeamMembers(members, fixture)
        val scrollModifier = if (fixture) Modifier else Modifier.verticalScroll(rememberScrollState())
        Column(modifier = Modifier.fillMaxSize().background(FamilyTokens.Canvas).statusBarsPadding().then(scrollModifier)) {
            Spacer(Modifier.height(8.dp))
            Box(modifier = Modifier.fillMaxWidth().height(108 * unit).padding(horizontal = 40 * unit).testTag("seller-region:282:svg_major_01")) {
                TeamTopBar282(unit, onBack)
            }
            Spacer(Modifier.height(34 * unit))
            TeamContext282(storeName, sessionRole, unit)
            Spacer(Modifier.height(24 * unit))
            TeamHero282(if (fixture) 4 else activeTeamMemberCount(members), unit)
            Spacer(Modifier.height(26 * unit))
            if (visibleMembers.isEmpty()) {
                TeamEmpty282(unit)
            } else {
                visibleMembers.forEachIndexed { index, member ->
                    TeamMember282(member, index, fixture, unit)
                    if (index < visibleMembers.lastIndex) Spacer(Modifier.height(14 * unit))
                }
            }
            Spacer(Modifier.height(20 * unit))
            TeamGuardrail282(unit)
            Spacer(Modifier.height(36 * unit))
            Box(modifier = Modifier.fillMaxWidth().height(96 * unit).padding(horizontal = 48 * unit).testTag("seller-region:282:svg_major_08"), contentAlignment = Alignment.Center) {
                val ctaShape = RoundedCornerShape(24 * unit)
                Surface(
                    modifier = Modifier
                        .fillMaxSize()
                        .shadow(
                            elevation = 7.dp,
                            shape = ctaShape,
                            clip = false,
                            ambientColor = Color.Transparent,
                            spotColor = Color(0x99FF5A00)
                        )
                        .semantics {
                            contentDescription = "Ekip Üyesi Davet Et; bu sürümde kapalı"
                            disabled()
                        },
                    shape = ctaShape,
                    color = Color(0xFFFF5A00),
                    shadowElevation = 0.dp
                ) {
                    Box(
                        modifier = Modifier.fillMaxSize().background(
                            Brush.linearGradient(listOf(Color(0xFFFF6D18), Color(0xFFFF4B00)))
                        ),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            "Ekip Üyesi Davet Et",
                            color = Color.White,
                            fontSize = 15.sp,
                            fontWeight = FontWeight.ExtraBold,
                            letterSpacing = .85.sp,
                            modifier = Modifier.graphicsLayer(scaleX = 1.1f)
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun TeamTopBar282(unit: androidx.compose.ui.unit.Dp, onBack: () -> Unit) {
    val topBarShape = RoundedCornerShape(54 * unit)
    Surface(
        modifier = Modifier
            .fillMaxSize()
            .shadow(9.dp, topBarShape, clip = false, ambientColor = Color.Transparent, spotColor = Color(0x9917345B))
            .semantics { contentDescription = "seller-top-app-bar" },
        shape = topBarShape,
        color = Color.White,
        shadowElevation = 0.dp
    ) {
        Box(modifier = Modifier.fillMaxSize()) {
            IconButton(
                onClick = onBack,
                modifier = Modifier.offset(x = 14 * unit, y = 8 * unit).size(92 * unit).semantics { contentDescription = "Geri" }
            ) {
                Icon(Icons.AutoMirrored.Outlined.ArrowBack, contentDescription = null, tint = FamilyTokens.Navy, modifier = Modifier.size(44 * unit))
            }
            Text(
                "Ekip ve Yetkiler",
                color = FamilyTokens.Navy,
                fontSize = 17.sp,
                fontWeight = FontWeight.ExtraBold,
                letterSpacing = 1.25.sp,
                modifier = Modifier
                    .align(Alignment.Center)
                    .offset(y = 5 * unit)
                    .graphicsLayer(scaleX = 1.06f)
            )
            SourceInfoAffordance282(
                unit = unit,
                modifier = Modifier.offset(x = 689 * unit, y = 27 * unit),
                contentDescription = "Güvenli seller oturumu"
            )
        }
    }
}

@Composable
private fun SourceInfoAffordance282(
    unit: androidx.compose.ui.unit.Dp,
    modifier: Modifier = Modifier,
    contentDescription: String? = null
) {
    Surface(
        modifier = modifier.size(54 * unit).then(
            if (contentDescription == null) Modifier else Modifier.semantics { this.contentDescription = contentDescription }
        ),
        shape = CircleShape,
        color = Color.White,
        border = BorderStroke(2 * unit, FamilyTokens.Outline)
    ) {
        Box(contentAlignment = Alignment.Center) {
            Text("i", color = FamilyTokens.Navy, fontSize = 14.sp, fontWeight = FontWeight.ExtraBold)
        }
    }
}

@Composable
private fun TeamContext282(storeName: String, sessionRole: String, unit: androidx.compose.ui.unit.Dp) {
    val contextShape = RoundedCornerShape(28 * unit)
    Surface(modifier = Modifier.fillMaxWidth().height(148 * unit).padding(horizontal = 48 * unit).shadow(9.dp, contextShape, clip = false, ambientColor = Color.Transparent, spotColor = Color(0x9917345B)).testTag("seller-region:282:svg_major_02"), shape = contextShape, color = Color.White, shadowElevation = 0.dp) {
        Box(modifier = Modifier.fillMaxSize()) {
            Text("MAĞAZA BAĞLAMI", color = FamilyTokens.Muted, fontSize = 9.sp, fontWeight = FontWeight.ExtraBold, letterSpacing = 1.2.sp, modifier = Modifier.offset(x = 24 * unit, y = 11 * unit).graphicsLayer(scaleX = 1.07f, transformOrigin = androidx.compose.ui.graphics.TransformOrigin(0f, .5f)))
            Text(storeName, color = FamilyTokens.Navy, fontSize = 12.sp, fontWeight = FontWeight.ExtraBold, letterSpacing = 1.2.sp, maxLines = 1, modifier = Modifier.width(360 * unit).offset(x = 24 * unit, y = 50 * unit).graphicsLayer(scaleX = 1.07f, transformOrigin = androidx.compose.ui.graphics.TransformOrigin(0f, .5f)))
            Spacer(Modifier.offset(x = 392 * unit, y = 24 * unit).width(2 * unit).height(100 * unit).background(FamilyTokens.Outline))
            Text("OTURUM ROLÜ", color = FamilyTokens.Muted, fontSize = 9.sp, fontWeight = FontWeight.ExtraBold, letterSpacing = 1.2.sp, modifier = Modifier.offset(x = 418 * unit, y = 11 * unit).graphicsLayer(scaleX = 1.12f, transformOrigin = androidx.compose.ui.graphics.TransformOrigin(0f, .5f)))
            Surface(modifier = Modifier.offset(x = 418 * unit, y = 64 * unit).width(156 * unit).height(46 * unit), shape = RoundedCornerShape(23 * unit), color = FamilyTokens.Peach) {
                Box(contentAlignment = Alignment.Center) { Text(sessionRole, color = FamilyTokens.OrangeTextAccessible, fontSize = 9.sp, fontWeight = FontWeight.ExtraBold, letterSpacing = .45.sp, modifier = Modifier.graphicsLayer(scaleX = 1.05f)) }
            }
            Text("Yalnız bu mağaza", color = FamilyTokens.Muted, fontSize = 9.sp, fontWeight = FontWeight.Bold, letterSpacing = .4.sp, modifier = Modifier.offset(x = 418 * unit, y = 95 * unit).graphicsLayer(scaleX = 1.12f, transformOrigin = androidx.compose.ui.graphics.TransformOrigin(0f, .5f)))
            SourceInfoAffordance282(
                unit,
                Modifier.offset(x = 681 * unit, y = 91 * unit),
                "Mağaza ve oturum rolü hakkında bilgi"
            )
        }
    }
}

@Composable
private fun TeamHero282(count: Int, unit: androidx.compose.ui.unit.Dp) {
    val heroShape = RoundedCornerShape(30 * unit)
    Surface(modifier = Modifier.fillMaxWidth().height(272 * unit).padding(horizontal = 48 * unit).shadow(9.dp, heroShape, clip = false, ambientColor = Color.Transparent, spotColor = Color(0x9917345B)).testTag("seller-region:282:svg_major_03"), shape = heroShape, color = FamilyTokens.PeachLight, shadowElevation = 0.dp) {
        Box(modifier = Modifier.fillMaxSize()) {
            Text("EKİP YÖNETİMİ", color = FamilyTokens.OrangeTextAccessible, fontSize = 9.sp, fontWeight = FontWeight.ExtraBold, letterSpacing = .9.sp, modifier = Modifier.offset(x = 28 * unit, y = 20 * unit).graphicsLayer(scaleX = 1.07f, transformOrigin = androidx.compose.ui.graphics.TransformOrigin(0f, .5f)))
            SourceInfoAffordance282(
                unit,
                Modifier.offset(x = 346 * unit, y = 21 * unit),
                "Ekip yönetimi kapsamı hakkında bilgi"
            )
            Text("$count etkin üye", color = FamilyTokens.Navy, fontSize = 15.sp, fontWeight = FontWeight.Normal, letterSpacing = .35.sp, modifier = Modifier.offset(x = 28 * unit, y = 70 * unit).graphicsLayer(scaleX = 1.08f, transformOrigin = androidx.compose.ui.graphics.TransformOrigin(0f, .5f)))
            Text(
                "Yalnız bu mağazanın üyeleri görünür.\nRoller mağaza kapsamı ile sınırlıdır.",
                color = FamilyTokens.Muted,
                fontSize = 9.sp,
                fontWeight = FontWeight.Bold,
                letterSpacing = .45.sp,
                lineHeight = 13.sp,
                modifier = Modifier.offset(x = 28 * unit, y = 126 * unit).graphicsLayer(scaleX = 1.14f, transformOrigin = androidx.compose.ui.graphics.TransformOrigin(0f, .5f))
            )
            Image(
                painter = painterResource(R.drawable.seller_tur_12_team_roles_security_illustration),
                contentDescription = null,
                contentScale = ContentScale.Fit,
                modifier = Modifier.offset(x = 437 * unit, y = 15 * unit).width(294 * unit).height(238 * unit)
            )
        }
    }
}

@Composable
private fun TeamMember282(member: com.novastore.seller.data.SellerTeamMember, index: Int, fixture: Boolean, unit: androidx.compose.ui.unit.Dp) {
    val palette = when (index % 3) {
        0 -> FamilyTokens.Peach to FamilyTokens.OrangeTextAccessible
        1 -> FamilyTokens.GreenTint to FamilyTokens.Green
        else -> FamilyTokens.PurpleTint to FamilyTokens.Purple
    }
    val memberShape = RoundedCornerShape(28 * unit)
    Surface(modifier = Modifier.fillMaxWidth().height(150 * unit).padding(horizontal = 48 * unit).shadow(9.dp, memberShape, clip = false, ambientColor = Color.Transparent, spotColor = Color(0x9917345B)).testTag("seller-region:282:svg_major_${(index + 4).toString().padStart(2, '0')}"), shape = memberShape, color = Color.White, shadowElevation = 0.dp) {
        Box(modifier = Modifier.fillMaxSize()) {
            Surface(shape = CircleShape, color = palette.first, modifier = Modifier.offset(x = 26 * unit, y = 20 * unit).size(76 * unit)) {
                Box(contentAlignment = Alignment.Center) { Text(member.initials(), color = palette.second, fontSize = 10.sp) }
            }
            Text(member.displayName ?: "Ekip üyesi", color = FamilyTokens.Navy, fontSize = 11.sp, fontWeight = FontWeight.ExtraBold, letterSpacing = .75.sp, modifier = Modifier.offset(x = 126 * unit, y = 12 * unit).graphicsLayer(scaleX = 1.11f, transformOrigin = androidx.compose.ui.graphics.TransformOrigin(0f, .5f)))
            Text(verifiedTeamMemberSubtitle(member.roleCode, member.status, fixture), color = palette.second, fontSize = 9.sp, fontWeight = FontWeight.ExtraBold, letterSpacing = .55.sp, modifier = Modifier.offset(x = 126 * unit, y = 45 * unit))
            Text(verifiedTeamMemberBody(member.roleCode), color = FamilyTokens.Muted, fontSize = 8.sp, fontWeight = FontWeight.Bold, letterSpacing = .4.sp, maxLines = 1, modifier = Modifier.width(500 * unit).offset(x = 126 * unit, y = 80 * unit).graphicsLayer(scaleX = 1.18f, transformOrigin = androidx.compose.ui.graphics.TransformOrigin(0f, .5f)))
            Surface(modifier = Modifier.offset(x = 622 * unit, y = 48 * unit).width(94 * unit).height(50 * unit), shape = RoundedCornerShape(22 * unit), color = Color.White, border = BorderStroke(2 * unit, FamilyTokens.Navy)) {
                Box(contentAlignment = Alignment.Center) { Text(if (member.roleCode == "owner") "Sahip" else "Detay", color = FamilyTokens.Navy, fontSize = 9.sp, fontWeight = FontWeight.ExtraBold) }
            }
        }
    }
}

private fun com.novastore.seller.data.SellerTeamMember.initials(): String = displayName
    ?.split(' ')
    ?.mapNotNull { it.firstOrNull()?.uppercase() }
    ?.take(2)
    ?.joinToString("")
    .orEmpty()
    .ifEmpty { "Ü" }

internal fun visibleTeamMembers(
    members: List<com.novastore.seller.data.SellerTeamMember>,
    fixture: Boolean
): List<com.novastore.seller.data.SellerTeamMember> = if (fixture) members.take(3) else members

internal fun activeTeamMemberCount(members: List<com.novastore.seller.data.SellerTeamMember>): Int =
    members.count { it.status.equals("active", ignoreCase = true) }

internal fun verifiedTeamMemberSubtitle(roleCode: String, status: String, fixture: Boolean): String {
    val role = if (fixture && roleCode.equals("owner", ignoreCase = true)) {
        "Mağaza Sahibi"
    } else {
        roleCode.statusLabel()
    }
    return if (fixture) role else "$role • ${membershipStatusLabel(status)}"
}

internal fun membershipStatusLabel(status: String): String = when (status.lowercase()) {
    "active" -> "Etkin"
    "suspended" -> "Askıya alındı"
    "revoked" -> "Erişimi kaldırıldı"
    "expired" -> "Süresi doldu"
    else -> "Durum doğrulanamadı"
}

internal fun verifiedTeamMemberBody(roleCode: String): String = when (roleCode.lowercase()) {
    "owner" -> "Sahiplik devri ayrı güvenli işlemdir."
    "manager" -> "Ürün, sipariş ve kampanya yönetimi."
    "operator" -> "Sipariş ve stok görevleri."
    "viewer" -> "Salt okunur görünüm."
    else -> "Rol kapsamı doğrulanamadı; izinler gösterilmedi."
}

@Composable
private fun TeamEmpty282(unit: androidx.compose.ui.unit.Dp) {
    Surface(modifier = Modifier.fillMaxWidth().height(150 * unit).padding(horizontal = 48 * unit), shape = RoundedCornerShape(28 * unit), color = Color.White) {
        Row(modifier = Modifier.padding(horizontal = 26 * unit), verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Outlined.Person, contentDescription = null, tint = FamilyTokens.Navy)
            Text("Etkin ekip üyesi bulunamadı", color = FamilyTokens.Navy, fontSize = 11.sp, fontWeight = FontWeight.ExtraBold, modifier = Modifier.padding(start = 16 * unit))
        }
    }
}

@Composable
private fun TeamGuardrail282(unit: androidx.compose.ui.unit.Dp) {
    Box(modifier = Modifier.fillMaxWidth().height(112 * unit).padding(horizontal = 48 * unit)) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .testTag("seller-region:282:svg_major_07")
        ) {
            Canvas(modifier = Modifier.fillMaxSize().offset(y = -unit)) {
                val radius = CornerRadius((24 * unit).toPx())
                drawRoundRect(color = Color.White, cornerRadius = radius)
                drawRoundRect(
                    color = FamilyTokens.Outline,
                    cornerRadius = radius,
                    style = Stroke(width = (unit * 1.5f).toPx())
                )
            }
            Text("Güvenli sonraki adım", color = FamilyTokens.Navy, fontSize = 10.sp, fontWeight = FontWeight.ExtraBold, letterSpacing = .55.sp, modifier = Modifier.offset(x = 28 * unit, y = 6 * unit).graphicsLayer(scaleX = 1.10f, transformOrigin = androidx.compose.ui.graphics.TransformOrigin(0f, .5f)))
            Text("Üye eklemeden önce rolün kapsadığı izinleri incele.", color = FamilyTokens.Muted, fontSize = 9.sp, fontWeight = FontWeight.Bold, letterSpacing = .4.sp, maxLines = 1, modifier = Modifier.offset(x = 28 * unit, y = 41 * unit).graphicsLayer(scaleX = 1.15f, transformOrigin = androidx.compose.ui.graphics.TransformOrigin(0f, .5f)))
            SourceInfoAffordance282(
                unit,
                Modifier.offset(x = 681 * unit, y = 25 * unit),
                "Güvenli sonraki adım hakkında bilgi"
            )
        }
    }
}

@Composable
private fun SecurityFamily(
    page: SellerPage,
    onBack: () -> Unit,
    onOpen: (SellerScreen) -> Unit,
    onLogout: () -> Unit,
    onLogoutAll: () -> Unit
) {
    val data = page.familyData as? SellerSecurityData
    val fixture = page.isCanonicalFixture
    val activeSessionText = data?.sessions?.let { "${it.size} aktif cihaz${if (it.any { session -> session.current }) " • Bu cihaz" else ""}" }
        ?: page.rows.firstOrNull()?.second
        ?: "Canlı oturum listesi"
    FamilyList {
        item { FamilyTopBar("Hesap ve Güvenlik", onBack, "Hesap sahibi • Güvenli oturum") }
        if (fixture) {
            item { ContextCard("Mağaza", "NovaStore Demo Mağaza", "Oturum rolü", "Sahip") }
        }
        item { SplitHero("Güvenlik merkezi", "Hesabını koru", "Aktif cihazlarını ve seller oturumlarını düzenli olarak gözden geçir.", R.drawable.seller_tur_13_account_security_settings_illustration) }
        item { DisclosureRow("Profil ve iletişim", "Doğrulanmış hesap bilgileri", Icons.Outlined.Person) }
        item { DisclosureRow("Parola ve iki adımlı doğrulama", "Challenge akışları bu sürümde kapalı", Icons.Outlined.Lock) }
        item { DisclosureRow("Cihazlar ve oturumlar", activeSessionText, Icons.Outlined.Shield, "Aktif", onClick = { onOpen(SellerScreen.SECURITY) }) }
        item { DisclosureRow("Gizlilik, yasal ve yardım", "Hesap güvenliği kaynakları", Icons.Outlined.Info) }
        item { Guardrail("Oturum güvenliği", "Şüpheli kullanımda tüm cihazlardaki oturumları ayrı onayla kapat.", warning = true) }
        if (fixture) {
            item { PrimaryAction("Güvenlik durumunu incele", onClick = { onOpen(SellerScreen.SECURITY) }) }
        } else {
            item { PrimaryAction("Tüm cihazlardaki oturumları kapat", onClick = onLogoutAll) }
            item { OutlinedButton(onClick = onLogout, modifier = Modifier.fillMaxWidth().semantics { contentDescription = "Bu cihazda çıkış yap" }) { Text("Bu cihazda çıkış yap", color = FamilyTokens.Navy) } }
        }
    }
}

@Composable
private fun SupportFamily(page: SellerPage, onBack: () -> Unit, onRefresh: () -> Unit) {
    val data = page.familyData as? SellerSupportData
    val fixture = page.isCanonicalFixture
    FamilyList {
        item { FamilyTopBar(if (fixture) page.title else "Satıcı Desteği", onBack, "NovaStore destek konuşmaları") }
        item { SplitHero("Destek merkezi", "Yardım taleplerin", "Bu alan müşteri mesajlarından ayrıdır; yalnız satıcı destek kayıtlarını gösterir.", R.drawable.seller_tur_11_messaging_support_illustration) }
        item { ContextCard("Açık konuşma", (data?.conversations?.count { it.status == "open" } ?: 0).toString(), "Toplam", (data?.conversations?.size ?: if (fixture) 4 else 0).toString()) }
        if (fixture) {
            items(page.rows) { row ->
                DisclosureRow(row.first, row.second, Icons.Outlined.HeadsetMic)
            }
        } else if (data?.conversations.isNullOrEmpty()) {
            item { DisclosureRow("Destek kaydı yok", "Yeni bir destek talebi açabilirsiniz", Icons.Outlined.HeadsetMic) }
        } else {
            items(data.conversations.take(8)) { conversation ->
                DisclosureRow(
                    conversation.subject,
                    "${conversation.category.statusLabel()} • ${conversation.messageCount} mesaj",
                    Icons.Outlined.HeadsetMic,
                    conversation.status.statusLabel()
                )
            }
        }
        item { Guardrail("Ayrı iletişim sınırı", "Sipariş-bağlamlı müşteri konuşmaları bu destek yüzeyinde gösterilmez.") }
        item { PrimaryAction("Yeni destek konuşması", onClick = null, enabled = false) }
        item { OutlinedButton(onClick = onRefresh, modifier = Modifier.fillMaxWidth()) { Text("Destek kayıtlarını yenile", color = FamilyTokens.Navy) } }
    }
}

@Composable
private fun CapabilityUnavailableFamily(
    title: String,
    context: String,
    explanation: String,
    @DrawableRes illustration: Int,
    onBack: () -> Unit
) {
    FamilyList {
        item { FamilyTopBar(title, onBack, context) }
        item { SplitHero("Bu sürümde kapalı", title, explanation, illustration) }
        item {
            Surface(
                modifier = Modifier.fillMaxWidth().semantics {
                    contentDescription = "$title; capability kapalı; veri veya eylem sunulmaz"
                },
                color = FamilyTokens.White,
                shape = RoundedCornerShape(14.dp),
                border = BorderStroke(1.dp, FamilyTokens.Outline)
            ) {
                Column(modifier = Modifier.padding(18.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Icon(Icons.Outlined.ErrorOutline, contentDescription = null, tint = FamilyTokens.OrangeTextAccessible, modifier = Modifier.size(34.dp))
                    Text("Veri gösterilmedi", color = FamilyTokens.Navy, fontSize = 16.sp, fontWeight = FontWeight.ExtraBold)
                    Text("Canlı capability ve tenant-safe API sözleşmesi tamamlanmadan örnek veri ya da sahte işlem gösterilmez.", color = FamilyTokens.Muted, fontSize = 11.sp, textAlign = TextAlign.Center, lineHeight = 15.sp)
                }
            }
        }
        item { Guardrail("Fail-closed sınır", "Bu ekran dış sistem çağrısı yapmaz ve yerel metrik üretmez.", warning = true) }
        item { PrimaryAction("Özellik kullanıma kapalı", onClick = null, enabled = false) }
    }
}

private fun Long.money(currency: String): String {
    val negative = this < 0
    val absolute = kotlin.math.abs(this)
    val major = absolute / 100
    val minor = absolute % 100
    val grouped = major.toString().reversed().chunked(3).joinToString(".").reversed()
    val symbol = if (currency.equals("TRY", true)) "₺" else "$currency "
    return "${if (negative) "−" else ""}$symbol$grouped,${minor.toString().padStart(2, '0')}"
}

private fun String.statusLabel(): String = when (lowercase()) {
    "owner" -> "Sahip"
    "manager" -> "Yönetici"
    "operator" -> "Operasyon"
    "active", "open", "visible" -> "Yayında"
    "paused" -> "Geçici kapalı"
    "draft" -> "Taslak"
    "new" -> "Yeni"
    "preparing" -> "Hazırlanıyor"
    "prepared" -> "Hazır"
    "shipped" -> "Kargoda"
    "closed" -> "Kapalı"
    "sale" -> "Sipariş ödemesi"
    "commission" -> "Komisyon kesintisi"
    "refund" -> "İade"
    "technical" -> "Teknik"
    "billing" -> "Finans"
    else -> replace('_', ' ').replaceFirstChar { it.uppercase() }
}
