package com.novastore.seller.ui

import com.novastore.seller.BuildConfig
import com.novastore.seller.mutationHarnessForBuild
import androidx.activity.compose.LocalActivity
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.Image
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.filled.Dashboard
import androidx.compose.material.icons.outlined.AccountBalanceWallet
import androidx.compose.material.icons.outlined.Assignment
import androidx.compose.material.icons.outlined.Check
import androidx.compose.material.icons.outlined.HeadsetMic
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material.icons.outlined.Inventory2
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.Sell
import androidx.compose.material.icons.outlined.Storefront
import androidx.compose.material.icons.outlined.Visibility
import androidx.compose.material.icons.outlined.VisibilityOff
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.Button
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.draw.clip
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.disabled
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.testTagsAsResourceId
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.novastore.seller.R
import com.novastore.seller.data.SellerPage
import com.novastore.seller.data.SellerPageSource
import com.novastore.seller.data.SellerMutationAction
import com.novastore.seller.data.SellerMutationResult
import com.novastore.seller.data.SellerScreen
import com.novastore.seller.data.SellerTab
import com.novastore.seller.data.SellerTeamMember
import com.novastore.seller.data.SellerTeamPage
import com.novastore.seller.data.SellerUiState

private object SellerVisualTokens {
    val Navy = Color(0xFF12345B)
    val PrimaryOrange = Color(0xFFFF5A00)
    val WarmOrange = Color(0xFFB13200)
    val DeepOrange = Color(0xFF902A00)
    val OrangeText = Color(0xFFA93600)
    val Ivory = Color(0xFFF7F7F8)
    val SoftBlue = Color(0xFFEDF5FF)
    val Muted = Color(0xFF52657D)
    val Outline = Color(0xFFD9DFE7)
    val Peach = Color(0xFFFFF8EE)
    val OrangeTint = Color(0xFFFFF3EB)
    val Success = Color(0xFF219653)
    val SuccessTint = Color(0xFFEAF8F0)
    val Purple = Color(0xFF6D45D6)
    val PurpleTint = Color(0xFFF2EDFF)
    val PageInset = 18.dp
    val CardRadius = 20.dp
    val CardPadding = 16.dp
    val PrimaryButtonHeight = 54.dp
    val PrimaryButtonRadius = 16.dp
}

private val Navy = SellerVisualTokens.Navy
private val Orange = SellerVisualTokens.PrimaryOrange
private val WarmOrange = SellerVisualTokens.WarmOrange
private val Ivory = SellerVisualTokens.Ivory
private val SoftBlue = SellerVisualTokens.SoftBlue
private val Success = SellerVisualTokens.Success
internal object SellerMutationHarnessControl {
    @Volatile
    var enabled: Boolean = false
}

@Composable
fun SellerApp(
    viewModel: SellerViewModel,
    canonicalHarnessActive: Boolean = false,
    mutationHarnessActive: Boolean = false
) {
    val state by viewModel.state.collectAsState()
    val selectedTab by viewModel.selectedTab.collectAsState()
    val screen by viewModel.screen.collectAsState()
    val mutationResults by viewModel.mutationResults.collectAsState()
    val mutationRunning by viewModel.mutationRunning.collectAsState()
    val canonicalPage = (state as? SellerUiState.Content)?.page
    val canonicalFixture = canonicalPage?.canonicalFixtureId
        ?.takeIf { BuildConfig.SELLER_TEST_STATE_ENABLED }
    val canonicalReference = canonicalPage?.canonicalReferenceId
        ?.takeIf { BuildConfig.SELLER_TEST_STATE_ENABLED }
    var canonicalIdle by remember(canonicalReference) {
        mutableStateOf(canonicalReference == null)
    }
    LaunchedEffect(canonicalReference) {
        canonicalIdle = canonicalReference == null
        if (canonicalReference != null) {
            kotlinx.coroutines.delay(850)
            canonicalIdle = true
        }
    }
    val activeRoute = sellerRouteFor(state, screen)
    val activeFixture = canonicalFixture?.let { " $it" }.orEmpty()
    val activeCanonicalState = canonicalReference?.let {
        " seller-state:ref_$it seller-canonical-ref-$it"
    }.orEmpty()
    val activeIdle = " seller-ui-idle:${if (canonicalIdle) "yes" else "no"}"
    val activeSource = if ((state as? SellerUiState.Content)?.page?.source == SellerPageSource.API) {
        " seller-runtime-source:api"
    } else {
        ""
    }
    val mutationEvidence = mutationResults.lastOrNull()?.let {
        " seller-mutation-result:${it.action.name}:${if (it.passed) "PASS" else "FAIL"}:${it.code}"
    }.orEmpty()
    MaterialTheme(colorScheme = MaterialTheme.colorScheme.copy(primary = Orange, onPrimary = Color.White, surface = Color.White, background = Ivory)) {
        Surface(
            modifier = Modifier.fillMaxSize().semantics {
                testTagsAsResourceId = true
                contentDescription = "seller-route:$activeRoute$activeFixture$activeSource$activeCanonicalState$activeIdle$mutationEvidence"
            },
            color = Ivory
        ) {
            when (state) {
                SellerUiState.Unauthorized -> SellerLogin(
                    onSubmit = viewModel::login,
                    includeTestScrollTail = canonicalHarnessActive && BuildConfig.SELLER_TEST_STATE_ENABLED
                )
                SellerUiState.SessionExpired -> SellerLogin(
                    onSubmit = viewModel::login,
                    sessionExpired = true,
                    includeTestScrollTail = canonicalHarnessActive && BuildConfig.SELLER_TEST_STATE_ENABLED
                )
                else -> SellerShell(
                    state = state,
                    selectedTab = selectedTab,
                    screen = screen,
                    onTab = viewModel::load,
                    onRetry = viewModel::refresh,
                    onOpen = viewModel::open,
                    onBack = viewModel::backToSelectedTab,
                    onLogout = viewModel::logout,
                    mutationHarnessActive = mutationHarnessForBuild(
                        BuildConfig.SELLER_TEST_STATE_ENABLED,
                        mutationHarnessActive || SellerMutationHarnessControl.enabled
                    ),
                    mutationResults = mutationResults,
                    mutationRunning = mutationRunning,
                    onMutation = viewModel::performMutation
                )
            }
        }
    }
}

private fun canonicalScreenRoute(screen: SellerScreen): String = when (screen) {
    SellerScreen.PRODUCTS -> "offers"
    SellerScreen.ORDER_DETAIL -> "orders/detail"
    SellerScreen.CUSTOMER_MESSAGES -> "support"
    SellerScreen.SECURITY -> "settings/security"
    else -> screen.name.lowercase()
}

private fun sellerRouteFor(state: SellerUiState, screen: SellerScreen): String = when (state) {
    SellerUiState.Unauthorized -> "seller://auth/login"
    SellerUiState.SessionExpired -> "seller://auth/session-expired"
    SellerUiState.Loading -> "seller://${canonicalScreenRoute(screen)}/loading"
    is SellerUiState.Empty -> "seller://${canonicalScreenRoute(screen)}/empty"
    is SellerUiState.Error -> "seller://${canonicalScreenRoute(screen)}/error"
    is SellerUiState.Offline -> "seller://${canonicalScreenRoute(screen)}/offline"
    is SellerUiState.Disabled -> "seller://${canonicalScreenRoute(screen)}/disabled"
    is SellerUiState.Content -> when (state.page.canonicalReferenceId) {
        "027" -> "seller://onboarding/store-identity"
        else -> "seller://${canonicalScreenRoute(state.page.screen)}"
    }
}

@Composable
private fun SellerLogin(
    onSubmit: (String, String) -> Unit,
    sessionExpired: Boolean = false,
    includeTestScrollTail: Boolean = false
) {
    val activity = LocalActivity.current
    var identifier by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var passwordVisible by remember { mutableStateOf(false) }
    var remembered by remember { mutableStateOf(false) }
    var validationRequested by remember { mutableStateOf(false) }
    val valid = identifier.isNotBlank() && password.length >= 8

    Column(modifier = Modifier.fillMaxSize().imePadding()) {
        Spacer(Modifier.statusBarsPadding().height(10.dp))
        SellerTopAppBar(
            title = "Satıcı Girişi",
            onBack = { activity?.finish() },
            compact = true,
            modifier = Modifier
                .padding(horizontal = 19.dp)
                .testTag("seller-region:001:top_bar")
        )
        LazyColumn(
            modifier = Modifier.weight(1f).padding(horizontal = 19.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            contentPadding = PaddingValues(bottom = 24.dp)
        ) {
        item { Spacer(Modifier.height(41.5.dp)) }
        item {
            Column(
                modifier = Modifier.testTag("seller-region:001:brand"),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(4.dp)
            ) {
                Image(
                    painter = painterResource(R.drawable.novastore_logo),
                    contentDescription = "NovaStore marka işareti",
                    contentScale = ContentScale.Fit,
                    modifier = Modifier.size(64.dp)
                )
                Text("NovaStore", color = Navy, fontSize = 23.sp, fontWeight = FontWeight.SemiBold)
            }
        }
        item { Spacer(Modifier.height(37.dp)) }
        item {
            Column(
                modifier = Modifier.testTag("seller-region:001:hero_copy"),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(5.5.dp)
            ) {
                Text(
                    "Mağazanı yönetmeye devam et.",
                    color = Navy,
                    fontSize = 20.sp,
                    fontWeight = FontWeight.SemiBold,
                    textAlign = TextAlign.Center
                )
                Text(
                    "Siparişlerini, ürünlerini ve kazancını tek yerden yönet.",
                    color = SellerVisualTokens.Muted,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Normal,
                    textAlign = TextAlign.Center
                )
            }
        }
        item { Spacer(Modifier.height(31.5.dp)) }
        item {
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = 292.dp)
                    .testTag("seller-region:001:form_card"),
                shape = RoundedCornerShape(22.dp),
                colors = CardDefaults.cardColors(containerColor = Color.White),
                elevation = CardDefaults.cardElevation(defaultElevation = 3.dp)
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 24.dp, vertical = 24.dp)
                ) {
                    SellerBindingField(
                        "E-posta veya telefon numarası",
                        identifier,
                        { identifier = it },
                        "ornek@magaza.com veya +90 5…",
                        regionTag = "seller-region:001:identifier_field",
                        error = validationRequested && identifier.isBlank()
                    )
                    Spacer(Modifier.height(18.dp))
                    SellerBindingField(
                        "Şifre",
                        password,
                        { password = it },
                        "Şifreni gir",
                        password = true,
                        passwordVisible = passwordVisible,
                        onPasswordVisibility = { passwordVisible = !passwordVisible },
                        regionTag = "seller-region:001:password_field",
                        error = validationRequested && password.length < 8
                    )
                    Spacer(Modifier.height(16.dp))
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(48.dp)
                            .testTag("seller-region:001:remember_row")
                    ) {
                        Row(
                            modifier = Modifier
                                .height(48.dp)
                                .align(Alignment.CenterStart)
                                .toggleable(
                                    value = remembered,
                                    role = Role.Checkbox,
                                    onValueChange = { remembered = it }
                                ),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Surface(
                                modifier = Modifier.size(20.dp),
                                shape = RoundedCornerShape(5.dp),
                                color = Color.White,
                                border = BorderStroke(1.25.dp, if (remembered) Orange else Navy)
                            ) {
                                if (remembered) {
                                    Icon(Icons.Outlined.Check, contentDescription = null, tint = Orange, modifier = Modifier.padding(2.dp))
                                }
                            }
                            Spacer(Modifier.width(10.dp))
                            Text(
                                "Beni hatırla",
                                color = Navy,
                                fontSize = 13.sp,
                                fontWeight = FontWeight.Normal
                            )
                        }
                        Text(
                            "Şifremi unuttum",
                            color = Navy,
                            fontSize = 13.sp,
                            fontWeight = FontWeight.Medium,
                            modifier = Modifier
                                .align(Alignment.CenterEnd)
                                .semantics {
                                    contentDescription = "Şifremi unuttum; bu sürümde kapalı"
                                    disabled()
                                }
                        )
                    }
                }
            }
        }
        item { Spacer(Modifier.height(24.dp)) }
        item {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(SellerVisualTokens.PrimaryButtonHeight)
                    .testTag("seller-region:001:primary_cta"),
                contentAlignment = Alignment.Center
            ) {
                val buttonShape = RoundedCornerShape(SellerVisualTokens.PrimaryButtonRadius)
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(SellerVisualTokens.PrimaryButtonHeight)
                        .shadow(6.dp, buttonShape, clip = false, ambientColor = Color.Transparent, spotColor = Orange.copy(alpha = .55f))
                        .clip(buttonShape)
                        .background(Brush.horizontalGradient(listOf(Color(0xFFFF6D18), Color(0xFFFF4B00))))
                        .clickable(role = Role.Button, onClick = {
                            if (valid) onSubmit(identifier, password) else validationRequested = true
                        })
                        .semantics { contentDescription = "Giriş Yap" },
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        "Giriş Yap",
                        color = Color.White,
                        fontSize = 16.sp,
                        fontWeight = FontWeight.SemiBold
                    )
                }
            }
        }
        item { Spacer(Modifier.height(20.dp)) }
        item {
            Text(
                "Satıcı hesabın yok mu?  Başvuru Yap",
                color = Navy,
                fontSize = 12.sp,
                textAlign = TextAlign.Center,
                fontWeight = FontWeight.Normal,
                modifier = Modifier
                    .semantics {
                    contentDescription = "Satıcı başvurusu; bu sürümde kapalı"
                    disabled()
                }.testTag("seller-region:001:application_action")
            )
        }
        item { Spacer(Modifier.height(28.5.dp)) }
        item {
            Row(
                modifier = Modifier.testTag("seller-region:001:support_row"),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Icon(Icons.Outlined.HeadsetMic, contentDescription = null, tint = Navy, modifier = Modifier.size(22.dp))
                Text(
                    "Satıcı desteği",
                    color = Navy,
                    fontSize = 12.sp,
                    modifier = Modifier
                        .semantics {
                        contentDescription = "Satıcı desteği; giriş öncesi bu sürümde kapalı"
                        disabled()
                    }
                )
            }
        }
        item { Spacer(Modifier.height(33.dp)) }
        item {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                modifier = Modifier
                    .padding(bottom = 24.dp)
                    .testTag("seller-region:001:security_footer")
            ) {
                Icon(Icons.Outlined.Lock, contentDescription = null, tint = Navy, modifier = Modifier.size(18.dp))
                Text(
                    "Giriş bilgilerinin güvenliğini kimseyle paylaşma.",
                    color = Navy,
                    fontSize = 10.sp,
                    fontWeight = FontWeight.Normal
                )
            }
        }
        if (includeTestScrollTail) {
            item { Spacer(Modifier.height(360.dp).semantics { contentDescription = "seller-test-scroll-tail" }) }
        }
        }
    }
    if (sessionExpired) SellerSessionExpiredDialog()
}

@Composable
private fun SellerTopAppBar(
    title: String,
    modifier: Modifier = Modifier,
    onBack: (() -> Unit)? = null,
    showInfo: Boolean = false,
    actionLabel: String? = null,
    onAction: (() -> Unit)? = null,
    compact: Boolean = false
) {
    Surface(
        modifier = modifier
            .fillMaxWidth()
            .height(if (compact) 51.5.dp else 54.dp)
            .semantics { contentDescription = "seller-top-app-bar" },
        shape = RoundedCornerShape(if (compact) 26.dp else 28.dp),
        color = Color.White,
        shadowElevation = if (compact) 2.dp else 4.dp
    ) {
        Box(contentAlignment = Alignment.Center) {
            if (onBack != null) {
                IconButton(
                    onClick = onBack,
                    modifier = Modifier.align(Alignment.CenterStart).padding(start = 12.dp).semantics { contentDescription = "Geri" }
                ) { Icon(Icons.AutoMirrored.Outlined.ArrowBack, contentDescription = null, tint = Navy, modifier = Modifier.size(if (compact) 24.dp else 30.dp)) }
            }
            Text(
                title,
                color = Navy,
                fontSize = if (compact) 18.sp else 20.sp,
                fontWeight = if (compact) FontWeight.SemiBold else FontWeight.Bold,
                textAlign = TextAlign.Center,
                modifier = Modifier
            )
            if (showInfo) {
                IconButton(
                    onClick = {},
                    enabled = false,
                    modifier = Modifier.align(Alignment.CenterEnd).padding(end = 12.dp).semantics {
                        contentDescription = "Bilgi; bu ekranda eylem yok"
                        disabled()
                    }
                ) { Icon(Icons.Outlined.Info, contentDescription = null, tint = Navy, modifier = Modifier.size(27.dp)) }
            } else if (actionLabel != null && onAction != null) {
                Text(
                    actionLabel,
                    color = Navy,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier
                        .align(Alignment.CenterEnd)
                        .padding(end = 18.dp)
                        .clickable(onClick = onAction)
                        .semantics { contentDescription = actionLabel }
                )
            }
        }
    }
}

@Composable
private fun SellerBindingField(
    label: String,
    value: String,
    onValueChange: (String) -> Unit,
    placeholder: String,
    password: Boolean = false,
    passwordVisible: Boolean = false,
    onPasswordVisibility: () -> Unit = {},
    regionTag: String? = null,
    fieldHeight: androidx.compose.ui.unit.Dp = 52.dp,
    error: Boolean = false
) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(
            label,
            color = Navy,
            fontWeight = FontWeight.Medium,
            fontSize = 13.sp,
            modifier = Modifier
        )
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(fieldHeight)
                .then(if (regionTag == null) Modifier else Modifier.testTag(regionTag))
        ) {
            BasicTextField(
                value = value,
                onValueChange = onValueChange,
                visualTransformation = if (password && !passwordVisible) PasswordVisualTransformation() else androidx.compose.ui.text.input.VisualTransformation.None,
                singleLine = true,
                textStyle = TextStyle(color = Navy, fontSize = 13.sp, fontWeight = FontWeight.Normal),
                cursorBrush = SolidColor(Navy),
                modifier = Modifier
                    .fillMaxSize()
                    .semantics { contentDescription = label },
                decorationBox = { innerTextField ->
                    Surface(
                        modifier = Modifier.fillMaxSize(),
                        shape = RoundedCornerShape(14.dp),
                        color = Color.White,
                        border = BorderStroke(
                            1.dp,
                            if (error) Orange else SellerVisualTokens.Outline
                        )
                    ) {
                        Row(
                            modifier = Modifier.fillMaxSize().padding(start = 16.dp, end = if (password) 4.dp else 16.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Box(modifier = Modifier.weight(1f)) {
                                if (value.isEmpty()) {
                                    Text(
                                        placeholder,
                                        color = Color(0xFF8C8C92),
                                        fontSize = 13.sp,
                                        fontWeight = FontWeight.Normal
                                    )
                                }
                                innerTextField()
                            }
                            if (password) {
                                IconButton(
                                    onClick = onPasswordVisibility,
                                    modifier = Modifier.size(44.dp).semantics {
                                        contentDescription = if (passwordVisible) "Şifreyi gizle" else "Şifreyi göster"
                                    }
                                ) {
                                    Icon(
                                        if (passwordVisible) Icons.Outlined.VisibilityOff else Icons.Outlined.Visibility,
                                        contentDescription = null,
                                        tint = Navy,
                                        modifier = Modifier.size(24.dp)
                                    )
                                }
                            }
                        }
                    }
                }
            )
        }
        if (error) {
            Text(
                "Bu alan giriş için gerekli.",
                color = Orange,
                fontSize = 13.sp,
                modifier = Modifier.semantics {
                    contentDescription = "$label hatası: Bu alan giriş için gerekli."
                }
            )
        }
    }
}

@Composable
private fun SellerSessionExpiredDialog() {
    var visible by remember { mutableStateOf(true) }
    if (!visible) return
    AlertDialog(
        onDismissRequest = { visible = false },
        title = { Text("Oturumun sona erdi", color = Navy) },
        text = { Text("Güvenliğin için yeniden giriş yapmalısın.", color = Navy) },
        confirmButton = { TextButton(onClick = { visible = false }) { Text("Girişe dön", color = Orange) } }
    )
}

@Composable
private fun SellerShell(
    state: SellerUiState,
    selectedTab: SellerTab,
    screen: SellerScreen,
    onTab: (SellerTab) -> Unit,
    onRetry: () -> Unit,
    onOpen: (SellerScreen) -> Unit,
    onBack: () -> Unit,
    onLogout: (Boolean) -> Unit,
    mutationHarnessActive: Boolean,
    mutationResults: List<SellerMutationResult>,
    mutationRunning: Boolean,
    onMutation: (SellerMutationAction) -> Unit
) {
    var logoutSheet by remember { mutableStateOf(false) }
    Column(modifier = Modifier.fillMaxSize()) {
        Box(modifier = Modifier.fillMaxWidth().weight(1f)) {
            SellerPageContent(state, selectedTab, screen, onRetry, onOpen, onBack, { logoutSheet = true }, onLogout)
        }
        if (mutationHarnessActive && state is SellerUiState.Content) {
            SellerMutationUatPanel(
                screen = screen,
                results = mutationResults,
                running = mutationRunning,
                onMutation = onMutation
            )
        }
        SellerBottomNavigation(
            selected = selectedTab,
            onTab = onTab,
            canonicalReferenceId = (state as? SellerUiState.Content)?.page?.canonicalReferenceId
        )
    }
    if (logoutSheet) SellerLogoutSheet(onDismiss = { logoutSheet = false }, onConfirm = { logoutSheet = false; onLogout(false) })
}

@Composable
private fun SellerMutationUatPanel(
    screen: SellerScreen,
    results: List<SellerMutationResult>,
    running: Boolean,
    onMutation: (SellerMutationAction) -> Unit
) {
    val actions = when (screen) {
        SellerScreen.STORE -> listOf(
            SellerMutationAction.STORE_UPDATE,
            SellerMutationAction.STORE_PROTECTED_FIELD_DENIAL,
            SellerMutationAction.STORE_CROSS_TENANT_DENIAL
        )
        SellerScreen.PRODUCTS -> listOf(
            SellerMutationAction.OFFER_UPDATE,
            SellerMutationAction.OFFER_PROTECTED_FIELD_DENIAL,
            SellerMutationAction.OFFER_CROSS_TENANT_DENIAL
        )
        SellerScreen.INVENTORY -> listOf(
            SellerMutationAction.INVENTORY_UPDATE,
            SellerMutationAction.INVENTORY_NEGATIVE_DENIAL,
            SellerMutationAction.INVENTORY_STALE_CONFLICT,
            SellerMutationAction.INVENTORY_CONCURRENT_CONFLICT,
            SellerMutationAction.INVENTORY_CROSS_TENANT_DENIAL
        )
        SellerScreen.ORDERS -> listOf(
            SellerMutationAction.ORDER_ALLOWED_TRANSITION,
            SellerMutationAction.ORDER_INVALID_TRANSITION,
            SellerMutationAction.ORDER_STALE_CONFLICT,
            SellerMutationAction.ORDER_CROSS_TENANT_DENIAL
        )
        SellerScreen.SUPPORT -> listOf(
            SellerMutationAction.SUPPORT_CREATE_AND_SEND,
            SellerMutationAction.SUPPORT_IDEMPOTENT_RETRY,
            SellerMutationAction.SUPPORT_CROSS_TENANT_DENIAL
        )
        SellerScreen.SECURITY -> listOf(SellerMutationAction.SESSION_LOGOUT_ALL)
        else -> emptyList()
    }
    if (actions.isEmpty()) return
    val latest = results.lastOrNull { it.action in actions }
    Surface(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 3.dp),
        color = Color(0xFFEAF8F0),
        shape = RoundedCornerShape(14.dp),
        border = BorderStroke(1.dp, Color(0xFF1B7642))
    ) {
        Column(modifier = Modifier.padding(7.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("YEREL ANDROID MUTATION UAT", color = Navy, fontSize = 9.sp, fontWeight = FontWeight.ExtraBold, modifier = Modifier.weight(1f))
                latest?.let {
                    Text(
                        if (it.passed) "PASS" else "FAIL",
                        color = if (it.passed) Color(0xFF1B7642) else Color(0xFF9B1C1C),
                        fontSize = 9.sp,
                        fontWeight = FontWeight.ExtraBold,
                        modifier = Modifier.semantics {
                            contentDescription = "seller-mutation-result:${it.action.name}:${if (it.passed) "PASS" else "FAIL"}:${it.code}"
                        }
                    )
                }
            }
            actions.forEach { action ->
                Button(
                    onClick = { onMutation(action) },
                    enabled = !running,
                    modifier = Modifier.fillMaxWidth().height(34.dp).semantics {
                        contentDescription = "seller-mutation:${action.name}"
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = Navy, disabledContainerColor = Navy.copy(alpha = .45f)),
                    contentPadding = PaddingValues(horizontal = 8.dp, vertical = 0.dp),
                    shape = RoundedCornerShape(9.dp)
                ) {
                    Text(action.label, color = Color.White, fontSize = 9.sp, fontWeight = FontWeight.Bold)
                }
            }
        }
    }
}

@Composable
private fun SellerLogoutSheet(onDismiss: () -> Unit, onConfirm: () -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Oturumu kapat", color = Navy) },
        text = { Text("Bu cihazdaki oturum güvenli biçimde kapatılır. Tüm cihazlardan çıkış için ayrı onay gerekir.", color = Navy) },
        confirmButton = { TextButton(onClick = onConfirm) { Text("Bu cihazdan çık", color = Orange) } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Vazgeç", color = Navy) } }
    )
}

@Composable
private fun SellerPageContent(
    state: SellerUiState,
    tab: SellerTab,
    screen: SellerScreen,
    onRetry: () -> Unit,
    onOpen: (SellerScreen) -> Unit,
    onBack: () -> Unit,
    onLogout: () -> Unit,
    onLogoutAll: (Boolean) -> Unit
) {
    when (state) {
        SellerUiState.Loading -> StatePage("Yükleniyor", "Mağaza verileri güvenle getiriliyor.", loading = true)
        is SellerUiState.Content -> ContentPage(state.page, tab, screen, onRetry, onOpen, onBack, onLogout, onLogoutAll)
        is SellerUiState.Empty -> StatePage("Henüz veri yok", state.message, action = "Yenile", onAction = onRetry)
        is SellerUiState.Error -> StatePage("İşlem tamamlanamadı", state.message, action = if (state.retryable) "Tekrar dene" else null, onAction = onRetry)
        is SellerUiState.Offline -> StatePage("Çevrimdışısınız", state.message, action = "Tekrar dene", onAction = onRetry)
        is SellerUiState.Disabled -> StatePage("Bu özellik kullanıma kapalı", state.message)
        SellerUiState.Unauthorized, SellerUiState.SessionExpired -> Unit
    }
}

@Composable
private fun ContentPage(
    page: SellerPage,
    tab: SellerTab,
    screen: SellerScreen,
    onRetry: () -> Unit,
    onOpen: (SellerScreen) -> Unit,
    onBack: () -> Unit,
    onLogout: () -> Unit,
    onLogoutAll: (Boolean) -> Unit
) {
    if (SellerScreens.usesFamilyRenderer(page)) {
        SellerRepresentativeFamilyScreen(
            page = page,
            onBack = onBack,
            onOpen = onOpen,
            onRefresh = onRetry,
            onLogout = onLogout,
            onLogoutAll = { onLogoutAll(true) }
        )
        return
    }
    if (page.screen == SellerScreen.TEAM && page.team != null) {
        Box(modifier = Modifier.fillMaxSize().semantics { contentDescription = "seller-team-content" }) {
            SellerTeamScreen(team = page.team, onBack = onBack)
        }
        return
    }
    if (page.canonicalReferenceId != null) {
        SellerCanonicalFixtureScreen(page = page, onBack = onBack)
        return
    }
    val nested = page.screen != SellerScreen.fromTab(tab)
    Column(modifier = Modifier.fillMaxSize()) {
        Spacer(Modifier.statusBarsPadding().height(8.dp))
        SellerTopAppBar(
            title = page.title,
            onBack = if (nested) onBack else null,
            actionLabel = if (nested) null else "Çıkış",
            onAction = if (nested) null else onLogout,
            modifier = Modifier.padding(horizontal = 18.dp)
        )
        LazyColumn(
            modifier = Modifier.weight(1f).padding(horizontal = 18.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
            contentPadding = PaddingValues(top = 16.dp, bottom = 24.dp)
        ) {
        item { SellerHero(tab) }
        if (page.rows.isEmpty()) {
            item { StatePage("Veri hazırlanıyor", "Sunucudan gösterilecek güvenli alan bulunamadı.", action = "Yenile", onAction = onRetry) }
        } else {
            items(page.rows) { row -> SellerDataCard(row.first, row.second) }
        }
        item { SellerScreenActions(screen, onOpen, onLogoutAll) }
        item { SellerInfoCard(tab) }
        item { Button(onClick = onRetry, modifier = Modifier.fillMaxWidth().height(54.dp), colors = ButtonDefaults.buttonColors(containerColor = Orange), shape = RoundedCornerShape(17.dp)) { Text("Güncel verileri yenile", fontWeight = FontWeight.Bold, fontSize = 17.sp) } }
        item { Spacer(Modifier.height(14.dp)) }
        }
    }
}

@Composable
private fun SellerCanonicalFixtureScreen(page: SellerPage, onBack: () -> Unit) {
    val reference = requireNotNull(page.canonicalReferenceId)
    val dashboardRoot = reference in setOf(
        "055", "056", "057", "067", "068", "069", "070", "071", "072", "073"
    )
    val overlay = reference in setOf("056", "067", "073", "251")
    Box(modifier = Modifier.fillMaxSize()) {
        Column(modifier = Modifier.fillMaxSize()) {
            Spacer(Modifier.statusBarsPadding().height(8.dp))
            if (dashboardRoot) {
                SellerDashboardHeader()
            } else {
                SellerTopAppBar(
                    title = page.title,
                    onBack = onBack,
                    showInfo = page.screen != SellerScreen.DASHBOARD,
                    modifier = Modifier.padding(horizontal = SellerVisualTokens.PageInset)
                )
            }
            LazyColumn(
                modifier = Modifier.weight(1f).padding(horizontal = SellerVisualTokens.PageInset),
                verticalArrangement = Arrangement.spacedBy(10.dp),
                contentPadding = PaddingValues(top = 12.dp, bottom = 18.dp)
            ) {
                if (dashboardRoot) {
                    item {
                        Text(
                            if (reference in setOf("055", "056", "067", "068", "069", "072", "073")) "Günaydın, Kuşay" else page.title,
                            color = Navy,
                            fontSize = 22.sp,
                            fontWeight = FontWeight.ExtraBold
                        )
                    }
                }
                when {
                    reference == "070" -> {
                        item { Text(page.rows.first().first, color = SellerVisualTokens.Muted, fontSize = 13.sp) }
                        items(4) { index -> SellerSkeletonCard(index) }
                        item { Text(page.rows.last().first, color = Navy, fontSize = 15.sp, fontWeight = FontWeight.ExtraBold) }
                        items(2) { index -> SellerSkeletonCard(index + 4) }
                    }
                    reference == "071" -> item { SellerCanonicalErrorCard(page) }
                    reference == "072" -> {
                        item { SellerOfflineBanner() }
                        item { SellerCanonicalHeroCard(page, reference) }
                        items(page.rows) { row -> SellerCanonicalDataCard(row.first, row.second) }
                    }
                    reference == "282" -> Unit
                    else -> {
                        item { SellerCanonicalHeroCard(page, reference) }
                        items(page.rows) { row -> SellerCanonicalDataCard(row.first, row.second) }
                        if (reference in setOf("243", "244", "245", "246", "247", "248", "249", "250", "286", "288", "289")) {
                            item { SellerCanonicalGuidanceCard(reference) }
                        }
                        canonicalActionLabel(reference)?.let { label ->
                            item { SellerPrimaryButton(label = label, enabled = reference !in setOf("288")) }
                        }
                    }
                }
                item { Spacer(Modifier.height(6.dp)) }
            }
        }
        if (overlay) {
            SellerCanonicalBottomSheet(page = page, reference = reference)
        }
    }
}

@Composable
private fun SellerDashboardHeader() {
    Row(
        modifier = Modifier.fillMaxWidth().padding(horizontal = SellerVisualTokens.PageInset, vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Image(
            painter = painterResource(R.drawable.novastore_logo),
            contentDescription = "NovaStore marka işareti",
            contentScale = ContentScale.Fit,
            modifier = Modifier.size(38.dp)
        )
        Column(modifier = Modifier.padding(start = 8.dp)) {
            Text("Nova Teknoloji", color = Navy, fontWeight = FontWeight.ExtraBold, fontSize = 13.sp)
            Text("● Mağaza açık", color = Success, fontWeight = FontWeight.Bold, fontSize = 10.sp)
        }
        Spacer(Modifier.weight(1f))
        Text("◯", color = SellerVisualTokens.OrangeText, fontSize = 22.sp, modifier = Modifier.semantics { contentDescription = "Bildirimler" })
    }
}

@Composable
private fun SellerCanonicalHeroCard(page: SellerPage, reference: String) {
    val background = when {
        page.screen == SellerScreen.DASHBOARD && reference != "057" -> Navy
        else -> SellerVisualTokens.Peach
    }
    val foreground = if (background == Navy) Color.White else Navy
    Card(
        shape = RoundedCornerShape(SellerVisualTokens.CardRadius),
        colors = CardDefaults.cardColors(containerColor = background),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().heightIn(min = if (page.screen == SellerScreen.DASHBOARD) 118.dp else 108.dp).padding(SellerVisualTokens.CardPadding),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(
                    when {
                        reference == "055" -> "Bugünkü satış"
                        reference == "057" -> "Mağazanız satışa hazır"
                        page.screen == SellerScreen.STORE -> "MAĞAZA VİTRİNİ"
                        page.screen == SellerScreen.TEAM -> "EKİP YÖNETİMİ"
                        else -> page.title
                    },
                    color = if (background == Navy) Color.White.copy(alpha = .85f) else SellerVisualTokens.OrangeText,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.ExtraBold
                )
                Text(page.rows.firstOrNull()?.second ?: page.title, color = foreground, fontSize = 21.sp, fontWeight = FontWeight.ExtraBold)
                Text(
                    when (page.screen) {
                        SellerScreen.STORE -> "Profil, vitrin ve mağaza politikalarını güvenle yönet."
                        SellerScreen.TEAM -> "Yalnız bu mağazanın üyeleri görünür."
                        else -> "Yalnız doğrulanmış mağaza verileri gösterilir."
                    },
                    color = foreground.copy(alpha = .74f),
                    fontSize = 12.sp
                )
            }
            if (reference == "057" || page.screen == SellerScreen.STORE || page.screen == SellerScreen.TEAM) {
                val illustration = when (page.screen) {
                    SellerScreen.TEAM -> R.drawable.seller_tur_12_team_roles_security_illustration
                    else -> R.drawable.seller_tur_9_storefront_review_question_illustration
                }
                Image(
                    painter = painterResource(illustration),
                    contentDescription = null,
                    contentScale = ContentScale.Fit,
                    modifier = Modifier.size(96.dp)
                )
            }
        }
    }
}

@Composable
private fun SellerCanonicalDataCard(label: String, value: String) {
    Card(
        shape = RoundedCornerShape(SellerVisualTokens.CardRadius),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().heightIn(min = 64.dp).padding(SellerVisualTokens.CardPadding),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Surface(shape = RoundedCornerShape(14.dp), color = SellerVisualTokens.OrangeTint, modifier = Modifier.size(38.dp)) {
                Box(contentAlignment = Alignment.Center) {
                    Text(label.take(1).uppercase(), color = SellerVisualTokens.OrangeText, fontWeight = FontWeight.ExtraBold)
                }
            }
            Column(modifier = Modifier.weight(1f).padding(start = 12.dp), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                Text(label, color = Navy, fontSize = 14.sp, fontWeight = FontWeight.ExtraBold)
                Text(value, color = SellerVisualTokens.Muted, fontSize = 12.sp, fontWeight = FontWeight.Medium)
            }
        }
    }
}

@Composable
private fun SellerCanonicalGuidanceCard(reference: String) {
    val warning = reference in setOf("247", "248", "249", "251", "288")
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(14.dp),
        color = if (warning) SellerVisualTokens.OrangeTint else SellerVisualTokens.SoftBlue,
        border = BorderStroke(1.dp, if (warning) Orange.copy(alpha = .48f) else SellerVisualTokens.Outline)
    ) {
        Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(if (warning) "Güvenlik notu" else "Yalnız kendi mağazan", color = Navy, fontSize = 13.sp, fontWeight = FontWeight.ExtraBold)
            Text("Değişiklikler mağaza kapsamı ve canlı seller oturumu ile doğrulanır.", color = SellerVisualTokens.Muted, fontSize = 11.sp)
        }
    }
}

@Composable
private fun SellerCanonicalErrorCard(page: SellerPage) {
    Card(
        shape = RoundedCornerShape(SellerVisualTokens.CardRadius),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Column(
            modifier = Modifier.fillMaxWidth().padding(22.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Image(
                painter = painterResource(R.drawable.seller_tur_9_storefront_review_question_illustration),
                contentDescription = null,
                contentScale = ContentScale.Fit,
                modifier = Modifier.size(112.dp)
            )
            Text(page.title, color = Navy, fontSize = 19.sp, fontWeight = FontWeight.ExtraBold, textAlign = TextAlign.Center)
            page.rows.forEach { Text(it.first, color = Navy, fontSize = 14.sp, fontWeight = FontWeight.Bold) }
        }
    }
}

@Composable
private fun SellerOfflineBanner() {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        color = SellerVisualTokens.OrangeTint,
        shape = RoundedCornerShape(14.dp),
        border = BorderStroke(1.dp, Orange.copy(alpha = .4f))
    ) {
        Text("İnternet bağlantısı yok", color = SellerVisualTokens.OrangeText, fontWeight = FontWeight.ExtraBold, modifier = Modifier.padding(14.dp))
    }
}

@Composable
private fun SellerSkeletonCard(index: Int) {
    Surface(modifier = Modifier.fillMaxWidth().height(if (index == 0) 122.dp else 68.dp), shape = RoundedCornerShape(SellerVisualTokens.CardRadius), color = Color.White) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(9.dp)) {
            Surface(modifier = Modifier.fillMaxWidth(if (index == 0) .62f else .42f).height(12.dp), shape = RoundedCornerShape(8.dp), color = Color(0xFFE7EBF1)) {}
            Surface(modifier = Modifier.fillMaxWidth(if (index == 0) .82f else .68f).height(10.dp), shape = RoundedCornerShape(8.dp), color = Color(0xFFF0F2F5)) {}
        }
    }
}

@Composable
private fun SellerCanonicalBottomSheet(page: SellerPage, reference: String) {
    Box(
        modifier = Modifier.fillMaxSize().background(Color.Black.copy(alpha = .55f)),
        contentAlignment = Alignment.BottomCenter
    ) {
        Surface(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(topStart = 26.dp, topEnd = 26.dp),
            color = Color.White.copy(alpha = .97f),
            shadowElevation = 10.dp
        ) {
            Column(modifier = Modifier.padding(horizontal = 22.dp, vertical = 18.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Surface(modifier = Modifier.align(Alignment.CenterHorizontally).width(48.dp).height(4.dp), shape = RoundedCornerShape(4.dp), color = SellerVisualTokens.Outline) {}
                Text(page.title, color = Navy, fontSize = 20.sp, fontWeight = FontWeight.ExtraBold)
                page.rows.forEach { (label, value) ->
                    SellerCanonicalDataCard(label, value)
                }
                SellerPrimaryButton(canonicalActionLabel(reference) ?: "Anladım")
                Text("Vazgeç", color = Navy, fontSize = 14.sp, fontWeight = FontWeight.Bold, modifier = Modifier.fillMaxWidth(), textAlign = TextAlign.Center)
            }
        }
    }
}

@Composable
private fun SellerPrimaryButton(
    label: String,
    enabled: Boolean = false,
    onClick: (() -> Unit)? = null
) {
    val actionable = enabled && onClick != null
    val clickAction = onClick ?: {}
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(SellerVisualTokens.PrimaryButtonHeight)
            .clip(RoundedCornerShape(SellerVisualTokens.PrimaryButtonRadius))
            .background(
                if (actionable) Brush.horizontalGradient(listOf(WarmOrange, SellerVisualTokens.DeepOrange))
                else Brush.horizontalGradient(listOf(Orange.copy(alpha = .42f), Orange.copy(alpha = .42f)))
            )
            .then(if (actionable) Modifier.clickable(role = Role.Button, onClick = clickAction) else Modifier)
            .semantics {
                contentDescription = if (actionable) label else "$label; bu ekranda eylem yok"
                role = Role.Button
                if (!actionable) disabled()
            },
        contentAlignment = Alignment.Center
    ) {
        Text(label, color = Color.White, fontSize = 16.sp, fontWeight = FontWeight.ExtraBold)
    }
}

private fun canonicalActionLabel(reference: String): String? = when (reference) {
    "055" -> "Ürün ekle"
    "056" -> "Anladım"
    "057" -> "İlk ürününü ekle"
    "058" -> "Finans ayrıntılarını aç"
    "059" -> "Hazırlamaya başla"
    "060" -> "Kargoya verildi bildir"
    "061" -> "Stok ekle"
    "062" -> "Tüm değerlendirmeleri gör"
    "063" -> "Finans bölümünü aç"
    "064" -> "Ödeme ayrıntılarını gör"
    "065" -> "Tüm satışları gör"
    "066" -> "Tüm ürünleri aç"
    "067" -> "Vazgeç"
    "068" -> "Görevleri görüntüle"
    "069" -> "Tümünü okundu işaretle"
    "071" -> "Tekrar dene"
    "072" -> "Bağlantıyı kontrol et"
    "073" -> "Uygula"
    "243" -> "Mağaza Profilini Düzenle"
    "244" -> "Profili Düzenle"
    "245" -> "Değişiklikleri Kaydet"
    "246" -> "Kapak Görselini Değiştir"
    "247" -> "Bilgileri Doğrula ve Kaydet"
    "248" -> "Politikayı Kaydet"
    "249" -> "Açıklamayı Kaydet"
    "250" -> "Durumu Güncelle"
    "251" -> "Doğrula ve Geçici Kapat"
    "286" -> "Yetkileri Düzenle"
    "288" -> "Davet Bağlantısını Yenile"
    "289" -> "Ekip Üyesini Görüntüle"
    else -> null
}

@Composable
private fun SellerTeamScreen(team: SellerTeamPage, onBack: () -> Unit) {
    Column(modifier = Modifier.fillMaxSize()) {
        Spacer(Modifier.statusBarsPadding().height(10.dp))
        SellerTopAppBar(
            title = "Ekip ve Yetkiler",
            onBack = onBack,
            showInfo = true,
            modifier = Modifier.padding(horizontal = SellerVisualTokens.PageInset)
        )
        LazyColumn(
            modifier = Modifier.weight(1f).padding(horizontal = SellerVisualTokens.PageInset),
            verticalArrangement = Arrangement.spacedBy(7.dp),
            contentPadding = PaddingValues(top = 8.dp, bottom = 12.dp)
        ) {
        item { SellerTeamContextCard(team) }
        item { SellerTeamManagementCard(team) }
        if (team.members.isEmpty()) {
            item { SellerEmptyTeamCard() }
        } else {
            items(team.members) { member -> SellerTeamMemberCard(member) }
        }
        item { SellerTeamSecurityCard() }
        item { Button(
            onClick = {},
            enabled = false,
            modifier = Modifier.fillMaxWidth().height(48.dp).semantics { contentDescription = "Ekip Üyesi Davet Et; bu sürümde kapalı" },
            colors = ButtonDefaults.buttonColors(
                disabledContainerColor = Orange,
                disabledContentColor = Color.White
            ),
            shape = RoundedCornerShape(SellerVisualTokens.PrimaryButtonRadius)
        ) { Text("Ekip Üyesi Davet Et", fontSize = 16.sp, fontWeight = FontWeight.Bold) } }
        item { Spacer(Modifier.height(8.dp)) }
        }
    }
}

@Composable
private fun SellerTeamContextCard(team: SellerTeamPage) {
    Card(shape = RoundedCornerShape(16.dp), colors = CardDefaults.cardColors(containerColor = Color.White), elevation = CardDefaults.cardElevation(defaultElevation = 3.dp)) {
        Row(modifier = Modifier.fillMaxWidth().heightIn(min = 66.dp).padding(10.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                Text("MAĞAZA BAĞLAMI", color = SellerVisualTokens.Muted, fontWeight = FontWeight.ExtraBold, fontSize = 9.sp)
                Text(team.storeName, color = Navy, fontWeight = FontWeight.ExtraBold, fontSize = 12.sp)
            }
            Spacer(Modifier.width(1.dp).height(48.dp).background(SellerVisualTokens.Outline))
            Column(modifier = Modifier.weight(.86f).padding(start = 10.dp), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                Text("OTURUM ROLÜ", color = SellerVisualTokens.Muted, fontWeight = FontWeight.ExtraBold, fontSize = 9.sp)
                Surface(color = SellerVisualTokens.OrangeTint, shape = RoundedCornerShape(16.dp)) {
                    Text(teamRoleLabel(team.sessionRoleCode), color = SellerVisualTokens.OrangeText, fontSize = 11.sp, fontWeight = FontWeight.ExtraBold, modifier = Modifier.padding(horizontal = 11.dp, vertical = 4.dp), textAlign = TextAlign.Center)
                }
                Text("Yalnız bu mağaza", color = SellerVisualTokens.Muted, fontWeight = FontWeight.Bold, fontSize = 9.sp)
            }
        }
    }
}

@Composable
private fun SellerTeamManagementCard(team: SellerTeamPage) {
    Card(shape = RoundedCornerShape(16.dp), colors = CardDefaults.cardColors(containerColor = SellerVisualTokens.Peach), elevation = CardDefaults.cardElevation(defaultElevation = 3.dp)) {
        Row(modifier = Modifier.fillMaxWidth().heightIn(min = 94.dp).padding(10.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(modifier = Modifier.weight(1.15f), verticalArrangement = Arrangement.spacedBy(5.dp)) {
                Text("EKİP YÖNETİMİ", color = SellerVisualTokens.OrangeText, fontSize = 9.sp, fontWeight = FontWeight.ExtraBold, modifier = Modifier.semantics { contentDescription = "EKİP YÖNETİMİ" })
                Text("${team.members.size} etkin üye", color = Navy, fontSize = 17.sp, fontWeight = FontWeight.ExtraBold)
                Text("Yalnız bu mağazanın üyeleri görünür. Roller mağaza kapsamı ile sınırlıdır.", color = SellerVisualTokens.Muted, fontSize = 9.sp, fontWeight = FontWeight.SemiBold)
            }
            androidx.compose.foundation.Image(
                painter = painterResource(R.drawable.seller_tur_12_team_roles_security_illustration),
                contentDescription = "Ekip ve rol güvenliği görseli",
                modifier = Modifier.weight(.85f).height(78.dp)
            )
        }
    }
}

@Composable
private fun SellerTeamMemberCard(member: SellerTeamMember) {
    val roleColor = when (member.roleCode.lowercase()) {
        "owner", "sahip" -> Orange
        "manager", "yönetici" -> Success
        else -> SellerVisualTokens.Purple
    }
    val initials = member.displayName.orEmpty().split(' ').filter { it.isNotBlank() }.take(2).joinToString("") { it.first().uppercase() }.ifBlank { "Ü" }
    Card(shape = RoundedCornerShape(16.dp), colors = CardDefaults.cardColors(containerColor = Color.White), elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)) {
        Row(modifier = Modifier.fillMaxWidth().heightIn(min = 64.dp).padding(10.dp), verticalAlignment = Alignment.CenterVertically) {
            Surface(shape = RoundedCornerShape(50), color = roleColor.copy(alpha = .11f), modifier = Modifier.size(38.dp)) {
                Box(contentAlignment = Alignment.Center) { Text(initials, color = roleColor, fontWeight = FontWeight.ExtraBold, fontSize = 12.sp) }
            }
            Column(modifier = Modifier.weight(1f).padding(start = 9.dp), verticalArrangement = Arrangement.spacedBy(1.dp)) {
                Text(member.displayName ?: "Ekip üyesi", color = Navy, fontSize = 12.sp, fontWeight = FontWeight.ExtraBold)
                Text(teamMemberRoleLabel(member.roleCode), color = roleColor, fontSize = 10.sp, fontWeight = FontWeight.ExtraBold)
                Text(teamMemberDescription(member), color = SellerVisualTokens.Muted, fontSize = 9.sp, fontWeight = FontWeight.Medium)
            }
            Surface(shape = RoundedCornerShape(12.dp), border = BorderStroke(1.dp, Navy), color = Color.White) {
                Text(if (member.roleCode.equals("owner", true)) "Sahip" else "Detay", color = Navy, fontSize = 9.sp, fontWeight = FontWeight.ExtraBold, modifier = Modifier.padding(horizontal = 9.dp, vertical = 6.dp))
            }
        }
    }
}

@Composable
private fun SellerEmptyTeamCard() {
    Card(shape = RoundedCornerShape(24.dp), colors = CardDefaults.cardColors(containerColor = Color.White), elevation = CardDefaults.cardElevation(defaultElevation = 3.dp)) {
        Text("Henüz gösterilebilecek etkin ekip üyesi yok.", color = Navy, fontWeight = FontWeight.Bold, modifier = Modifier.padding(22.dp))
    }
}

@Composable
private fun SellerTeamSecurityCard() {
    Surface(shape = RoundedCornerShape(12.dp), color = Color.White, border = BorderStroke(1.dp, SellerVisualTokens.Outline), modifier = Modifier.fillMaxWidth()) {
        Row(modifier = Modifier.padding(10.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                Text("Güvenli sonraki adım", color = Navy, fontSize = 11.sp, fontWeight = FontWeight.ExtraBold)
                Text("Üye eklemeden önce rolün kapsadığı izinleri incele.", color = SellerVisualTokens.Muted, fontSize = 9.sp, fontWeight = FontWeight.SemiBold)
            }
            Icon(Icons.Outlined.Info, contentDescription = "Güvenli sonraki adım bilgisi", tint = Navy, modifier = Modifier.size(21.dp))
        }
    }
}

private fun teamRoleLabel(code: String): String = when (code.lowercase()) {
    "owner", "sahip" -> "Sahip"
    "manager", "yönetici" -> "Yönetici"
    "operator", "operasyon" -> "Operasyon"
    else -> "Yetkili"
}

private fun teamMemberRoleLabel(code: String): String = when (code.lowercase()) {
    "owner", "sahip" -> "Mağaza Sahibi"
    else -> teamRoleLabel(code)
}

private fun teamMemberDescription(member: SellerTeamMember): String = when {
    !member.status.equals("active", true) -> "Bu üyenin erişimi etkin değil."
    member.roleCode.equals("owner", true) -> "Sahiplik devri ayrı güvenli işlemdir."
    member.roleCode.equals("manager", true) -> "Ürün, sipariş ve kampanya yönetimi."
    else -> "Sipariş ve stok görevleri."
}

@Composable
private fun SellerHero(tab: SellerTab) {
    val image = when (tab) {
        SellerTab.DASHBOARD -> R.drawable.seller_tur_7_analytics_performance_illustration
        SellerTab.PRODUCTS -> R.drawable.seller_tur_8_campaign_discount_coupon_illustration
        SellerTab.ORDERS -> R.drawable.seller_tur_4_order_fulfillment_illustration
        SellerTab.FINANCE -> R.drawable.seller_tur_6_finance_payout_illustration
        SellerTab.STORE -> R.drawable.seller_tur_9_storefront_review_question_illustration
    }
    Card(shape = RoundedCornerShape(24.dp), colors = CardDefaults.cardColors(containerColor = Color(0xFFFFF6EB))) {
        Row(modifier = Modifier.fillMaxWidth().padding(18.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(modifier = Modifier.weight(1f)) {
                Text("Yalnız kendi mağazan", color = Orange, fontWeight = FontWeight.Bold)
                Text(when (tab) {
                    SellerTab.DASHBOARD -> "Güncel satış görünümü"
                    SellerTab.PRODUCTS -> "Ürün ve stok yönetimi"
                    SellerTab.ORDERS -> "Siparişlerini güvenle yönet"
                    SellerTab.FINANCE -> "Sunucudan doğrulanan finans"
                    SellerTab.STORE -> "Mağaza profilin ve bağlamın"
                }, color = Navy, fontSize = 21.sp, fontWeight = FontWeight.Bold)
            }
            androidx.compose.foundation.Image(painter = painterResource(image), contentDescription = null, modifier = Modifier.size(100.dp))
        }
    }
}

@Composable
private fun SellerScreenActions(
    screen: SellerScreen,
    onOpen: (SellerScreen) -> Unit,
    onLogoutAll: (Boolean) -> Unit
) {
    val actions = when (screen) {
        SellerScreen.DASHBOARD -> listOf("Stok durumunu görüntüle" to SellerScreen.INVENTORY)
        SellerScreen.PRODUCTS -> listOf("Stok durumunu görüntüle" to SellerScreen.INVENTORY)
        SellerScreen.STORE -> listOf(
            "Mağaza bağlamını görüntüle" to SellerScreen.CONTEXT,
            "Ekip ve yetkileri görüntüle" to SellerScreen.TEAM,
            "Hesap ve güvenliği görüntüle" to SellerScreen.SECURITY,
            "Satıcı desteğini görüntüle" to SellerScreen.SUPPORT
        )
        else -> emptyList()
    }
    if (actions.isEmpty() && screen != SellerScreen.SECURITY) return
    Card(shape = RoundedCornerShape(20.dp), colors = CardDefaults.cardColors(containerColor = Color.White), elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)) {
        Column(modifier = Modifier.fillMaxWidth().padding(18.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text("Güvenli işlemler", color = Navy, fontWeight = FontWeight.Bold, fontSize = 18.sp)
            actions.forEach { (label, destination) ->
                Button(
                    onClick = { onOpen(destination) },
                    modifier = Modifier.fillMaxWidth().height(50.dp).semantics { contentDescription = label },
                    colors = ButtonDefaults.buttonColors(containerColor = SoftBlue, contentColor = Navy),
                    shape = RoundedCornerShape(16.dp)
                ) { Text(label, fontWeight = FontWeight.SemiBold) }
            }
            if (screen == SellerScreen.SECURITY) {
                Button(
                    onClick = { onLogoutAll(true) },
                    modifier = Modifier.fillMaxWidth().height(50.dp).semantics { contentDescription = "Tüm cihazlardaki oturumları kapat" },
                    colors = ButtonDefaults.buttonColors(containerColor = Orange),
                    shape = RoundedCornerShape(16.dp)
                ) { Text("Tüm cihazlardaki oturumları kapat", fontWeight = FontWeight.Bold) }
            }
        }
    }
}

@Composable
private fun SellerDataCard(label: String, value: String) {
    Card(shape = RoundedCornerShape(20.dp), colors = CardDefaults.cardColors(containerColor = Color.White), elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)) {
        Column(modifier = Modifier.fillMaxWidth().padding(18.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(label, color = Navy.copy(alpha = .7f), fontSize = 13.sp, fontWeight = FontWeight.Bold)
            Text(value, color = Navy, fontSize = 19.sp, fontWeight = FontWeight.SemiBold)
        }
    }
}

@Composable
private fun SellerInfoCard(tab: SellerTab) {
    Card(shape = RoundedCornerShape(20.dp), colors = CardDefaults.cardColors(containerColor = SoftBlue)) {
        Text(
            when (tab) {
                SellerTab.ORDERS -> "Teslimat adresi, ödeme ve platforma özel bilgiler bu ekranda gösterilmez."
                SellerTab.FINANCE -> "Tutarlar sunucu tarafından sağlanır; uygulama finansal hesaplama yapmaz."
                SellerTab.PRODUCTS -> "Kanonik katalog alanları salt okunurdur. Negatif stok ve backorder kapalıdır."
                else -> "Veri erişimi canlı seller oturumu, rol ve mağaza kapsamıyla doğrulanır."
            },
            modifier = Modifier.padding(18.dp), color = Navy, fontSize = 15.sp
        )
    }
}

@Composable
private fun StatePage(title: String, message: String, loading: Boolean = false, action: String? = null, onAction: () -> Unit = {}) {
    Column(
        modifier = Modifier.fillMaxSize().padding(28.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        if (loading) CircularProgressIndicator(color = Orange, modifier = Modifier.size(42.dp))
        Spacer(Modifier.height(18.dp))
        Text(title, color = Navy, fontSize = 25.sp, fontWeight = FontWeight.Bold)
        Spacer(Modifier.height(8.dp))
        Text(message, color = Navy.copy(alpha = .78f), fontSize = 16.sp)
        if (action != null) {
            Spacer(Modifier.height(22.dp))
            Button(onClick = onAction, colors = ButtonDefaults.buttonColors(containerColor = Orange), shape = RoundedCornerShape(16.dp)) { Text(action) }
        }
    }
}

@Composable
private fun SellerBottomNavigation(
    selected: SellerTab,
    onTab: (SellerTab) -> Unit,
    canonicalReferenceId: String? = null
) {
    if (canonicalReferenceId == "282") {
        SellerTeamBottomNavigation282(selected, onTab)
        return
    }
    val familyOffset = if (selected == SellerTab.STORE) (-14).dp else (-6).dp
    val itemHeight = 60.dp
    val regionReference = when (selected) {
        SellerTab.DASHBOARD -> "055"
        SellerTab.STORE -> "282"
        else -> selected.name.lowercase()
    }
    val regionId = if (selected == SellerTab.STORE) "svg_major_09" else "bottom_navigation"
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .navigationBarsPadding()
            .offset(y = familyOffset)
            .padding(
                start = 12.dp,
                end = 12.dp,
                top = 2.dp,
                bottom = 2.dp
            )
            .testTag("seller-region:$regionReference:$regionId"),
        shape = RoundedCornerShape(24.dp),
        color = Color.White,
        border = BorderStroke(1.dp, SellerVisualTokens.Outline.copy(alpha = .72f)),
        shadowElevation = 7.dp
    ) {
        Row(modifier = Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 1.dp), horizontalArrangement = Arrangement.SpaceBetween) {
            SellerTab.entries.forEach { tab ->
                SellerNavigationItem(
                    tab = tab,
                    selected = tab == selected,
                    itemHeight = itemHeight,
                    rootSelected = selected,
                    itemShape = 18.dp,
                    showOrderBadge = canonicalReferenceId == "055",
                    onClick = { onTab(tab) }
                )
            }
        }
    }
}

@Composable
private fun SellerTeamBottomNavigation282(selected: SellerTab, onTab: (SellerTab) -> Unit) {
    BoxWithConstraints(
        modifier = Modifier
            .fillMaxWidth()
            .navigationBarsPadding()
    ) {
        val unit = maxWidth / 852f
        val navShape = RoundedCornerShape(unit * 42)
        Surface(
            modifier = Modifier
                .fillMaxWidth()
                .height(unit * 152)
                .offset(y = unit * -10)
                .padding(horizontal = unit * 28)
                .shadow(
                    elevation = 9.dp,
                    shape = navShape,
                    clip = false,
                    ambientColor = Color.Transparent,
                    spotColor = Color(0x8017345B)
                )
                .testTag("seller-region:282:svg_major_09"),
            shape = navShape,
            color = Color.White,
            border = null,
            shadowElevation = 0.dp
        ) {
            Box(modifier = Modifier.fillMaxSize()) {
                Canvas(modifier = Modifier.fillMaxSize()) {
                    drawRoundRect(
                        color = SellerVisualTokens.Outline,
                        cornerRadius = CornerRadius((unit * 42).toPx()),
                        style = Stroke(width = (unit * 2f).toPx())
                    )
                }
                Row(modifier = Modifier.fillMaxSize()) {
                    SellerTab.entries.forEach { tab ->
                        Box(
                            modifier = Modifier
                                .weight(1f)
                                .fillMaxHeight()
                                .padding(top = unit * 23),
                            contentAlignment = Alignment.TopCenter
                        ) {
                            SellerTeamNavigationItem282(
                                tab = tab,
                                selected = tab == selected,
                                unit = unit,
                                onClick = { onTab(tab) }
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun SellerTeamNavigationItem282(
    tab: SellerTab,
    selected: Boolean,
    unit: androidx.compose.ui.unit.Dp,
    onClick: () -> Unit
) {
    val motionProgress by animateFloatAsState(
        targetValue = if (selected) 1f else 0f,
        animationSpec = tween(durationMillis = 720, easing = LinearEasing),
        label = "seller-team-nav-motion"
    )
    val lift = (5f * motionProgress).dp
    val motionBucket = when {
        motionProgress < .125f -> "T0"
        motionProgress < .375f -> "T25"
        motionProgress < .625f -> "T50"
        motionProgress < .875f -> "T75"
        else -> "T100"
    }
    val shape = RoundedCornerShape(unit * 36)
    Surface(
        modifier = Modifier
            .width(unit * 134)
            .height(unit * 124)
            .graphicsLayer { translationY = -lift.toPx() }
            .shadow(
                elevation = (6f * motionProgress).dp,
                shape = shape,
                clip = false,
                ambientColor = Color.Transparent,
                spotColor = Color(0xA0FF5A00)
            )
            .testTag("seller-tab:${tab.name.lowercase()}")
            .semantics {
                contentDescription = "${tab.title}, ${if (selected) "seçili" else "seçili değil"}"
                this.selected = selected
            }
            .clickable(role = Role.Tab, onClick = onClick),
        shape = shape,
        color = Color.Transparent,
        shadowElevation = 0.dp,
        border = if (selected) BorderStroke(1.dp, Color.White.copy(alpha = .72f)) else null
    ) {
        Box(modifier = Modifier.fillMaxSize().clip(shape)) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .graphicsLayer {
                        alpha = if (selected) 1f else 0f
                        scaleX = .88f + (.12f * motionProgress)
                        scaleY = .88f + (.12f * motionProgress)
                    }
                    .background(Brush.linearGradient(listOf(Color(0xFFFF7B32), Color(0xFFF04400))))
                    .testTag("seller-nav-motion:${tab.name.lowercase()}:$motionBucket")
            )
            SellerTeamNavigationGlyph282(tab = tab, selected = selected, unit = unit)
        }
    }
}

@Composable
private fun SellerTeamNavigationGlyph282(
    tab: SellerTab,
    selected: Boolean,
    unit: androidx.compose.ui.unit.Dp
) {
    Canvas(modifier = Modifier.fillMaxSize()) {
        val u = unit.toPx()
        val foreground = if (selected) Color.White else Navy
        val stroke = Stroke(width = 5 * u, cap = StrokeCap.Round, join = StrokeJoin.Round)
        fun path(block: Path.() -> Unit) {
            drawPath(Path().apply(block), color = foreground, style = stroke)
        }
        if (selected && tab == SellerTab.STORE) {
            drawCircle(Color.White.copy(alpha = .76f), radius = 13 * u, center = androidx.compose.ui.geometry.Offset(48 * u, 19 * u))
            drawCircle(Color.White.copy(alpha = .58f), radius = 6 * u, center = androidx.compose.ui.geometry.Offset(94 * u, 12 * u))
        }
        when (tab) {
            SellerTab.DASHBOARD -> path {
                moveTo(39 * u, 37 * u)
                lineTo(67 * u, 12 * u)
                lineTo(95 * u, 37 * u)
                lineTo(95 * u, 66 * u)
                lineTo(75 * u, 66 * u)
                lineTo(75 * u, 44 * u)
                lineTo(59 * u, 44 * u)
                lineTo(59 * u, 66 * u)
                lineTo(39 * u, 66 * u)
                close()
            }
            SellerTab.PRODUCTS -> {
                path {
                    moveTo(38 * u, 14 * u)
                    lineTo(76 * u, 14 * u)
                    lineTo(97 * u, 35 * u)
                    lineTo(59 * u, 72 * u)
                    lineTo(38 * u, 51 * u)
                    close()
                }
                drawCircle(foreground, radius = 4 * u, center = androidx.compose.ui.geometry.Offset(56 * u, 31 * u))
            }
            SellerTab.ORDERS -> {
                drawRoundRect(
                    color = foreground,
                    topLeft = androidx.compose.ui.geometry.Offset(42 * u, 8 * u),
                    size = androidx.compose.ui.geometry.Size(50 * u, 62 * u),
                    cornerRadius = CornerRadius(8 * u),
                    style = stroke
                )
                path {
                    moveTo(55 * u, 27 * u); lineTo(81 * u, 27 * u)
                    moveTo(55 * u, 41 * u); lineTo(81 * u, 41 * u)
                    moveTo(55 * u, 55 * u); lineTo(75 * u, 55 * u)
                }
            }
            SellerTab.FINANCE -> {
                drawRoundRect(
                    color = foreground,
                    topLeft = androidx.compose.ui.geometry.Offset(36 * u, 17 * u),
                    size = androidx.compose.ui.geometry.Size(62 * u, 47 * u),
                    cornerRadius = CornerRadius(9 * u),
                    style = stroke
                )
                path {
                    moveTo(46 * u, 17 * u)
                    lineTo(46 * u, 6 * u)
                    lineTo(86 * u, 6 * u)
                }
                drawCircle(foreground, radius = 5 * u, center = androidx.compose.ui.geometry.Offset(81 * u, 40 * u))
            }
            SellerTab.STORE -> path {
                moveTo(36 * u, 35 * u)
                lineTo(98 * u, 35 * u)
                lineTo(91 * u, 16 * u)
                lineTo(43 * u, 16 * u)
                close()
                moveTo(42 * u, 35 * u)
                lineTo(42 * u, 76 * u)
                lineTo(92 * u, 76 * u)
                lineTo(92 * u, 35 * u)
                moveTo(60 * u, 76 * u)
                lineTo(60 * u, 51 * u)
            }
        }
        drawIntoCanvas { canvas ->
            val paint = android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG).apply {
                color = foreground.toArgb()
                textAlign = android.graphics.Paint.Align.CENTER
                textSize = 18 * u
                textScaleX = 1.06f
                typeface = android.graphics.Typeface.create(
                    if (selected) "sans-serif-condensed" else "sans-serif-condensed",
                    if (selected) android.graphics.Typeface.BOLD else android.graphics.Typeface.NORMAL
                )
            }
            canvas.nativeCanvas.drawText(tab.title, size.width / 2f, (if (selected) 113 else 103) * u, paint)
        }
    }
}

@Composable
private fun SellerNavigationItem(
    tab: SellerTab,
    selected: Boolean,
    itemHeight: androidx.compose.ui.unit.Dp,
    rootSelected: SellerTab,
    itemWidth: androidx.compose.ui.unit.Dp = 72.dp,
    itemShape: androidx.compose.ui.unit.Dp = 20.dp,
    iconSize: androidx.compose.ui.unit.Dp = 24.dp,
    contentOffsetY: androidx.compose.ui.unit.Dp = 0.dp,
    selectedGradient: List<Color>? = null,
    showOrderBadge: Boolean = false,
    onClick: () -> Unit
) {
    val motionProgress by animateFloatAsState(
        targetValue = if (selected) 1f else 0f,
        animationSpec = tween(durationMillis = 720, easing = LinearEasing),
        label = "seller-nav-motion"
    )
    val motionBucket = when {
        motionProgress < .125f -> "T0"
        motionProgress < .375f -> "T25"
        motionProgress < .625f -> "T50"
        motionProgress < .875f -> "T75"
        else -> "T100"
    }
    val lift = (4f * motionProgress).dp
    val icon = when (tab) {
        SellerTab.DASHBOARD -> if (rootSelected == SellerTab.DASHBOARD) Icons.Filled.Dashboard else Icons.Outlined.Home
        SellerTab.PRODUCTS -> Icons.Outlined.Sell
        SellerTab.ORDERS -> Icons.Outlined.Assignment
        SellerTab.FINANCE -> Icons.Outlined.AccountBalanceWallet
        SellerTab.STORE -> Icons.Outlined.Storefront
    }
    val shape = RoundedCornerShape(itemShape)
    Surface(
        modifier = Modifier
            .width(itemWidth)
            .height(itemHeight)
            .graphicsLayer { translationY = -lift.toPx() }
            .testTag("seller-tab:${tab.name.lowercase()}")
            .semantics {
                contentDescription = "${tab.title}, ${if (selected) "seçili" else "seçili değil"}"
                this.selected = selected
            }
            .clickable(role = Role.Tab, onClick = onClick),
        shape = shape,
        color = Color.Transparent,
        shadowElevation = (7f * motionProgress).dp,
        border = if (motionProgress > 0f) BorderStroke(1.dp, Color.White.copy(alpha = .72f * motionProgress)) else null
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .clip(shape)
        ) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .graphicsLayer {
                        alpha = if (selected) 1f else 0f
                        scaleX = .88f + (.12f * motionProgress)
                        scaleY = .88f + (.12f * motionProgress)
                    }
                    .background(
                        Brush.verticalGradient(
                            selectedGradient ?: listOf(Color(0xFFFF7B32), Color(0xFFF04400))
                        )
                    )
                    .testTag("seller-nav-motion:${tab.name.lowercase()}:$motionBucket")
            )
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .offset(y = contentOffsetY)
                    .padding(horizontal = 6.dp, vertical = 7.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center
            ) {
                val foreground = when {
                    !selected -> Navy
                    else -> Color.White
                }
                Icon(imageVector = icon, contentDescription = null, tint = foreground, modifier = Modifier.size(iconSize))
                Text(
                    tab.title,
                    color = foreground,
                    fontSize = 9.sp,
                    fontWeight = if (selected) FontWeight.Bold else FontWeight.Normal,
                    maxLines = 1,
                    modifier = Modifier.graphicsLayer(scaleX = 1.06f)
                )
            }
            if (showOrderBadge && tab == SellerTab.ORDERS) {
                Surface(
                    modifier = Modifier
                        .align(Alignment.TopEnd)
                        .padding(top = 1.dp, end = 5.dp)
                        .size(16.dp),
                    shape = CircleShape,
                    color = Color(0xFFFF4B00)
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Text("6", color = Color.White, fontSize = 8.sp, fontWeight = FontWeight.ExtraBold)
                    }
                }
            }
            if (selected && motionProgress > 0f) {
                Surface(
                    modifier = Modifier
                        .align(Alignment.TopCenter)
                        .padding(top = 3.dp)
                        .width(44.dp)
                        .height(2.dp)
                        .graphicsLayer {
                            alpha = motionProgress
                            scaleX = .35f + (.65f * motionProgress)
                        },
                    shape = RoundedCornerShape(2.dp),
                    color = Color.White.copy(alpha = .78f)
                ) {}
            }
        }
    }
}
