package com.novastore.app.feature.product

import android.content.Intent
import androidx.activity.compose.BackHandler
import androidx.compose.animation.animateContentSize
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.AddShoppingCart
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.ArrowForwardIos
import androidx.compose.material.icons.filled.AssignmentReturn
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.CreditCard
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.Inventory2
import androidx.compose.material.icons.filled.LocalOffer
import androidx.compose.material.icons.filled.LocalShipping
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Remove
import androidx.compose.material.icons.filled.Security
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.ShoppingCart
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.Storefront
import androidx.compose.material.icons.filled.Verified
import androidx.compose.material.icons.outlined.HelpOutline
import androidx.compose.material.icons.outlined.ImageNotSupported
import androidx.compose.material.icons.outlined.RateReview
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Divider
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.hilt.navigation.compose.hiltViewModel
import coil3.compose.AsyncImage
import com.novastore.app.core.theme.BorderLight
import com.novastore.app.core.theme.CardBackground
import com.novastore.app.core.theme.DiscountGreen as Success
import com.novastore.app.core.theme.Error as ErrorRed
import com.novastore.app.core.theme.NavyDark
import com.novastore.app.core.theme.NavyMid
import com.novastore.app.core.theme.PageBackground
import com.novastore.app.core.theme.PrimaryOrange as Orange
import com.novastore.app.core.theme.StoreBlue
import com.novastore.app.core.theme.TextSecondary as SecondaryText
import com.novastore.app.core.ui.optimizedImageUrl
import com.novastore.app.data.model.CartItem
import com.novastore.app.data.model.CustomerAddress
import com.novastore.app.data.model.Product
import com.novastore.app.data.model.ProductQuestion
import kotlinx.coroutines.launch
import java.text.NumberFormat
import java.util.Locale

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProductDetailScreen(
    productId: Int,
    onBackClick: () -> Unit,
    onNavigateCart: () -> Unit = {},
    onBuyNow: (CartItem) -> Unit = {},
    onProductClick: (Int) -> Unit = {},
    modifier: Modifier = Modifier,
    viewModel: ProductDetailViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()
    val snackbarHostState = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    var showAddedSheet by remember { mutableStateOf(false) }

    LaunchedEffect(productId) {
        viewModel.loadProduct(productId)
    }

    Scaffold(
        modifier = modifier,
        containerColor = PageBackground,
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = uiState.product?.name ?: "Ürün Detayı",
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        color = NavyDark,
                        fontWeight = FontWeight.Bold
                    )
                },
                navigationIcon = {
                    IconButton(onClick = onBackClick) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Geri", tint = NavyDark)
                    }
                },
                actions = {
                    val product = uiState.product
                    if (product != null) {
                        IconButton(
                            onClick = {
                                viewModel.toggleFavorite { _, message ->
                                    scope.launch { snackbarHostState.showSnackbar(message) }
                                }
                            },
                            enabled = !uiState.favoriteLoading
                        ) {
                            if (uiState.favoriteLoading) {
                                CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp, color = Orange)
                            } else {
                                Icon(
                                    imageVector = if (uiState.isFavorite) Icons.Default.Favorite else Icons.Default.FavoriteBorder,
                                    contentDescription = if (uiState.isFavorite) "Favorilerden kaldır" else "Favorilere ekle",
                                    tint = if (uiState.isFavorite) ErrorRed else NavyDark
                                )
                            }
                        }
                        IconButton(
                            onClick = {
                                val shareText = "${product.name}\n${formatPrice(product.price)}\nNovaStore ürün kodu: ${product.id}"
                                context.startActivity(
                                    Intent.createChooser(
                                        Intent(Intent.ACTION_SEND).apply {
                                            type = "text/plain"
                                            putExtra(Intent.EXTRA_TEXT, shareText)
                                        },
                                        "Ürünü paylaş"
                                    )
                                )
                            }
                        ) {
                            Icon(Icons.Default.Share, contentDescription = "Paylaş", tint = NavyDark)
                        }
                        IconButton(onClick = onNavigateCart) {
                            Icon(Icons.Default.ShoppingCart, contentDescription = "Sepete git", tint = NavyDark)
                        }
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Color.White)
            )
        },
        snackbarHost = { SnackbarHost(snackbarHostState) },
        bottomBar = {
            uiState.product?.let { product ->
                PurchaseBar(
                    product = product,
                    quantity = uiState.selectedQuantity,
                    isLoading = uiState.addToCartLoading,
                    onDecrease = { viewModel.changeQuantity(-1) },
                    onIncrease = { viewModel.changeQuantity(1) },
                    onAddToCart = {
                        viewModel.addToCart { success, message ->
                            scope.launch { snackbarHostState.showSnackbar(message) }
                            if (success) showAddedSheet = true
                        }
                    },
                    onBuyNow = {
                        onBuyNow(product.toCartItem(uiState.selectedQuantity))
                    }
                )
            }
        }
    ) { paddingValues ->
        when {
            uiState.isLoading -> ProductDetailSkeleton(Modifier.padding(paddingValues))
            uiState.error != null -> ErrorState(
                message = uiState.error.orEmpty(),
                onRetry = { viewModel.loadProduct(productId) },
                onBack = onBackClick,
                modifier = Modifier.padding(paddingValues)
            )
            uiState.product != null -> ProductDetailContent(
                uiState = uiState,
                onApplyCoupon = viewModel::applyCoupon,
                onSelectAddress = viewModel::selectAddress,
                onSubmitQuestion = viewModel::submitQuestion,
                onLoadQuestions = viewModel::loadQuestions,
                onProductClick = onProductClick,
                onMessage = { message -> scope.launch { snackbarHostState.showSnackbar(message) } },
                modifier = Modifier.padding(paddingValues)
            )
        }
    }

    if (showAddedSheet) {
        uiState.product?.let { product ->
            AddedToCartSheet(
                product = product,
                quantity = uiState.selectedQuantity,
                onDismiss = { showAddedSheet = false },
                onCart = {
                    showAddedSheet = false
                    onNavigateCart()
                }
            )
        }
    }
}

@Composable
private fun ProductDetailContent(
    uiState: ProductDetailUiState,
    onApplyCoupon: (String) -> Unit,
    onSelectAddress: (Long) -> Unit,
    onSubmitQuestion: (String, (Boolean, String) -> Unit) -> Unit,
    onLoadQuestions: (Int?) -> Unit,
    onProductClick: (Int) -> Unit,
    onMessage: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    val product = uiState.product ?: return
    val images = remember(product) { productImages(product) }
    val listState = rememberLazyListState()
    val scope = rememberCoroutineScope()
    var fullScreenImage by remember { mutableStateOf<Int?>(null) }
    var showInstallments by remember { mutableStateOf(false) }
    var showAddressSheet by remember { mutableStateOf(false) }
    var showSpecifications by remember { mutableStateOf(false) }
    var showQuestionSheet by remember { mutableStateOf(false) }
    var descriptionExpanded by remember { mutableStateOf(false) }

    LazyColumn(
        state = listState,
        modifier = modifier
            .fillMaxSize()
            .background(PageBackground),
        contentPadding = PaddingValues(bottom = 14.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        item {
            ProductGallery(
                images = images,
                productName = product.name,
                discount = product.discountPercentage,
                onImageClick = { fullScreenImage = it }
            )
        }
        item {
            ProductInfoCard(
                product = product,
                onReviewsClick = { scope.launch { listState.animateScrollToItem(8) } }
            )
        }
        item {
            PriceAndCampaignCard(
                product = product,
                selectedCouponId = uiState.selectedCouponId,
                onApplyCoupon = {
                    onApplyCoupon(it)
                    onMessage("Kupon uygulandı.")
                },
                onInstallments = { showInstallments = true }
            )
        }
        item {
            DeliveryCard(
                selectedAddress = uiState.addresses.firstOrNull { it.id == uiState.selectedAddressId }
                    ?: uiState.addresses.firstOrNull(),
                onAddressClick = { showAddressSheet = true }
            )
        }
        item { SellerCard(onMessage = onMessage) }
        item {
            DescriptionCard(
                description = product.description,
                expanded = descriptionExpanded,
                onToggle = { descriptionExpanded = !descriptionExpanded }
            )
        }
        item {
            SpecificationsCard(
                product = product,
                onShowAll = { showSpecifications = true }
            )
        }
        item { ReviewsCard(product = product) }
        item {
            ProductQuestionsSection(
                loading = uiState.questionsLoading,
                questions = uiState.questions,
                error = uiState.questionsError,
                onAskQuestion = { showQuestionSheet = true },
                onRetry = { onLoadQuestions(product.id) }
            )
        }
        if (uiState.relatedProducts.isNotEmpty()) {
            item {
                RelatedProductsCard(
                    products = uiState.relatedProducts,
                    onProductClick = onProductClick
                )
            }
        }
    }

    fullScreenImage?.let { index ->
        FullScreenGallery(
            images = images,
            initialPage = index,
            productName = product.name,
            onDismiss = { fullScreenImage = null }
        )
    }
    if (showInstallments) {
        InstallmentsSheet(onDismiss = { showInstallments = false })
    }
    if (showAddressSheet) {
        AddressSelectionSheet(
            addresses = uiState.addresses,
            selectedAddressId = uiState.selectedAddressId,
            onSelect = {
                onSelectAddress(it)
                showAddressSheet = false
            },
            onDismiss = { showAddressSheet = false }
        )
    }
    if (showSpecifications) {
        SpecificationsSheet(product = product, onDismiss = { showSpecifications = false })
    }
    if (showQuestionSheet) {
        QuestionSheet(
            sending = uiState.questionSending,
            onDismiss = { showQuestionSheet = false },
            onSubmit = { question ->
                onSubmitQuestion(question) { success, message ->
                    if (success) showQuestionSheet = false
                    onMessage(message)
                }
            }
        )
    }
}

@Composable
private fun ProductGallery(
    images: List<String>,
    productName: String,
    discount: Int,
    onImageClick: (Int) -> Unit
) {
    val pagerState = rememberPagerState(pageCount = { images.size.coerceAtLeast(1) })
    Surface(color = Color.White) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .aspectRatio(1f)
                .padding(12.dp)
                .clip(RoundedCornerShape(16.dp))
                .background(Color(0xFFFAFAFB))
        ) {
            if (images.isEmpty()) {
                EmptyImage(productName)
            } else {
                HorizontalPager(state = pagerState, modifier = Modifier.fillMaxSize()) { page ->
                    AsyncImage(
                        model = optimizedImageUrl(images[page], 1000, 1000),
                        contentDescription = "$productName görseli ${page + 1}",
                        contentScale = ContentScale.Fit,
                        modifier = Modifier
                            .fillMaxSize()
                            .clickable { onImageClick(page) }
                            .padding(18.dp)
                    )
                }
                Surface(
                    modifier = Modifier
                        .align(Alignment.BottomEnd)
                        .padding(12.dp),
                    color = NavyDark.copy(alpha = 0.82f),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Text(
                        "${pagerState.currentPage + 1}/${images.size}",
                        color = Color.White,
                        style = MaterialTheme.typography.labelMedium,
                        modifier = Modifier.padding(horizontal = 9.dp, vertical = 5.dp)
                    )
                }
            }
            if (discount > 0) {
                Surface(
                    modifier = Modifier
                        .align(Alignment.TopStart)
                        .padding(12.dp),
                    color = Success,
                    shape = RoundedCornerShape(8.dp)
                ) {
                    Text(
                        "%$discount indirim",
                        color = Color.White,
                        fontWeight = FontWeight.Bold,
                        style = MaterialTheme.typography.labelMedium,
                        maxLines = 1,
                        softWrap = false,
                        modifier = Modifier
                            .padding(horizontal = 10.dp, vertical = 6.dp)
                            .graphicsLayer(scaleY = 1.12f)
                    )
                }
            }
        }
    }
}

@Composable
private fun EmptyImage(productName: String) {
    Column(
        modifier = Modifier.fillMaxSize(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Icon(Icons.Outlined.ImageNotSupported, contentDescription = null, tint = Color(0xFFB7BEC9), modifier = Modifier.size(54.dp))
        Spacer(Modifier.height(8.dp))
        Text("$productName için görsel bulunamadı", color = SecondaryText)
    }
}

@Composable
private fun ProductInfoCard(product: Product, onReviewsClick: () -> Unit) {
    DetailCard {
        Text(product.category, color = Orange, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.labelLarge)
        Spacer(Modifier.height(6.dp))
        Text(
            product.name,
            color = NavyDark,
            fontWeight = FontWeight.Bold,
            style = MaterialTheme.typography.titleLarge,
            lineHeight = 27.sp
        )
        Spacer(Modifier.height(10.dp))
        Row(
            modifier = Modifier
                .clip(RoundedCornerShape(8.dp))
                .clickable(onClick = onReviewsClick)
                .padding(vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(Icons.Default.Star, contentDescription = null, tint = Orange, modifier = Modifier.size(19.dp))
            Spacer(Modifier.width(4.dp))
            Text(product.averageRating.ifBlank { "0.0" }, color = NavyDark, fontWeight = FontWeight.Bold)
            Text("  |  ${product.reviewCount} değerlendirme", color = SecondaryText)
            Spacer(Modifier.weight(1f))
            Icon(Icons.Default.ArrowForwardIos, contentDescription = null, tint = SecondaryText, modifier = Modifier.size(14.dp))
        }
        Spacer(Modifier.height(10.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            StockBadge(product.stock)
            Text("Ürün kodu: ${product.id}", color = SecondaryText, style = MaterialTheme.typography.bodySmall)
        }
    }
}

@Composable
private fun StockBadge(stock: Int) {
    val text = when {
        stock <= 0 -> "Tükendi"
        stock <= 3 -> "Son $stock ürün"
        else -> "Stokta var"
    }
    val color = when {
        stock <= 0 -> ErrorRed
        stock <= 3 -> Orange
        else -> Success
    }
    Surface(color = color.copy(alpha = 0.12f), shape = RoundedCornerShape(8.dp)) {
        Text(
            text,
            color = color,
            fontWeight = FontWeight.Bold,
            style = MaterialTheme.typography.labelMedium,
            modifier = Modifier.padding(horizontal = 9.dp, vertical = 5.dp)
        )
    }
}

@Composable
private fun PriceAndCampaignCard(
    product: Product,
    selectedCouponId: String?,
    onApplyCoupon: (String) -> Unit,
    onInstallments: () -> Unit
) {
    val isDiscounted = product.oldPrice != null && product.oldPrice > product.price
    DetailCard {
        Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(
                formatPrice(product.price),
                color = if (isDiscounted) Success else StoreBlue,
                fontWeight = FontWeight.ExtraBold,
                fontSize = 28.sp
            )
            product.oldPrice?.takeIf { it > product.price }?.let {
                Text(
                    formatPrice(it),
                    color = SecondaryText,
                    style = MaterialTheme.typography.bodyMedium.copy(textDecoration = TextDecoration.LineThrough),
                    modifier = Modifier.padding(bottom = 4.dp)
                )
            }
            if (isDiscounted) {
                Surface(color = Success.copy(alpha = 0.12f), shape = RoundedCornerShape(8.dp)) {
                    Text(
                        "%${product.discountPercentage} indirim",
                        color = Success,
                        fontWeight = FontWeight.Bold,
                        style = MaterialTheme.typography.labelMedium,
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 5.dp)
                    )
                }
            }
        }
        Spacer(Modifier.height(5.dp))
        Text("Sepette avantajlı NovaStore fiyatı", color = Success, fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.bodySmall)
        Spacer(Modifier.height(14.dp))
        Text("Kampanyalar", color = NavyDark, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium)
        Spacer(Modifier.height(9.dp))
        LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            item {
                CampaignChip(
                    icon = Icons.Default.LocalOffer,
                    title = if (selectedCouponId == "coupon50") "Uygulandı" else "50 TL kupon",
                    selected = selectedCouponId == "coupon50",
                    onClick = { onApplyCoupon("coupon50") }
                )
            }
            item {
                CampaignChip(
                    icon = Icons.Default.LocalShipping,
                    title = "Kargo bedava",
                    selected = false,
                    onClick = {}
                )
            }
            item {
                CampaignChip(
                    icon = Icons.Default.CreditCard,
                    title = "3 taksit",
                    selected = false,
                    onClick = onInstallments
                )
            }
        }
    }
}

@Composable
private fun CampaignChip(icon: ImageVector, title: String, selected: Boolean, onClick: () -> Unit) {
    Surface(
        modifier = Modifier.clickable(onClick = onClick),
        color = if (selected) Orange.copy(alpha = 0.12f) else Color(0xFFFFF7ED),
        border = BorderStroke(1.dp, Orange.copy(alpha = if (selected) 1f else 0.35f)),
        shape = RoundedCornerShape(12.dp)
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 11.dp, vertical = 9.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            Icon(if (selected) Icons.Default.Check else icon, contentDescription = null, tint = Orange, modifier = Modifier.size(18.dp))
            Text(title, color = NavyDark, fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.labelLarge)
        }
    }
}

@Composable
private fun DeliveryCard(selectedAddress: CustomerAddress?, onAddressClick: () -> Unit) {
    DetailCard {
        SectionTitle("Teslimat ve Kargo", Icons.Default.LocalShipping)
        Spacer(Modifier.height(12.dp))
        InfoRow(Icons.Default.LocalShipping, "Tahmini teslimat", "Yarın kargoda", Success)
        InfoRow(Icons.Default.Inventory2, "Kargo", "Ücretsiz gönderim", Orange)
        InfoRow(Icons.Default.AssignmentReturn, "İade", "14 gün içinde kolay iade", NavyMid)
        InfoRow(Icons.Default.Security, "Garanti", "2 yıl NovaStore güvencesi", NavyMid)
        HorizontalDivider(color = BorderLight, modifier = Modifier.padding(vertical = 10.dp))
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(10.dp))
                .clickable(onClick = onAddressClick)
                .padding(vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(Icons.Default.LocationOn, contentDescription = null, tint = Orange)
            Spacer(Modifier.width(9.dp))
            Column(Modifier.weight(1f)) {
                Text(
                    if (selectedAddress == null) "Teslimat adresi seç" else selectedAddress.title,
                    color = NavyDark,
                    fontWeight = FontWeight.Bold
                )
                Text(
                    selectedAddress?.let { "${it.district}, ${it.city}" } ?: "Bölgenize özel teslimat tarihini görün",
                    color = SecondaryText,
                    style = MaterialTheme.typography.bodySmall
                )
            }
            Icon(Icons.Default.ArrowForwardIos, contentDescription = null, tint = SecondaryText, modifier = Modifier.size(15.dp))
        }
    }
}

@Composable
private fun InfoRow(icon: ImageVector, title: String, value: String, iconColor: Color) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 5.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(icon, contentDescription = null, tint = iconColor, modifier = Modifier.size(20.dp))
        Spacer(Modifier.width(10.dp))
        Text(title, color = SecondaryText, modifier = Modifier.width(125.dp), style = MaterialTheme.typography.bodyMedium)
        Text(value, color = NavyDark, fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.bodyMedium)
    }
}

@Composable
private fun SellerCard(onMessage: (String) -> Unit) {
    DetailCard {
        SectionTitle("Satıcı Bilgisi", Icons.Default.Storefront)
        Spacer(Modifier.height(12.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Surface(color = NavyDark, shape = CircleShape, modifier = Modifier.size(46.dp)) {
                Box(contentAlignment = Alignment.Center) {
                    Text("N", color = Color.White, fontWeight = FontWeight.ExtraBold, fontSize = 22.sp)
                }
            }
            Spacer(Modifier.width(10.dp))
            Column(Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("NovaStore", color = NavyDark, fontWeight = FontWeight.Bold)
                    Spacer(Modifier.width(5.dp))
                    Icon(Icons.Default.Verified, contentDescription = "Güvenilir satıcı", tint = Success, modifier = Modifier.size(17.dp))
                }
                Text("Güvenilir Satıcı • Hızlı Gönderici", color = SecondaryText, style = MaterialTheme.typography.bodySmall)
            }
            Surface(color = Success.copy(alpha = 0.12f), shape = RoundedCornerShape(8.dp)) {
                Text("9.8", color = Success, fontWeight = FontWeight.Bold, modifier = Modifier.padding(horizontal = 9.dp, vertical = 5.dp))
            }
        }
        Spacer(Modifier.height(12.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(
                onClick = { onMessage("NovaStore mağazası yakında açılacak.") },
                modifier = Modifier.weight(1f),
                shape = RoundedCornerShape(12.dp)
            ) { Text("Mağazaya Git", color = NavyDark) }
            OutlinedButton(
                onClick = { onMessage("Sorunuzu soru-cevap alanından iletebilirsiniz.") },
                modifier = Modifier.weight(1f),
                shape = RoundedCornerShape(12.dp)
            ) { Text("Satıcıya Sor", color = NavyDark) }
        }
    }
}

@Composable
private fun DescriptionCard(description: String?, expanded: Boolean, onToggle: () -> Unit) {
    val text = remember(description) { sanitizeDescription(description) }
    if (text.isBlank()) return
    val isLong = text.length > 220
    DetailCard {
        SectionTitle("Ürün Açıklaması", Icons.Default.Inventory2)
        Spacer(Modifier.height(10.dp))
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .animateContentSize()
        ) {
            Text(
                text = text,
                color = Color(0xFF344054),
                style = MaterialTheme.typography.bodyMedium,
                lineHeight = 22.sp,
                maxLines = if (expanded) Int.MAX_VALUE else 5,
                overflow = TextOverflow.Ellipsis
            )
            if (isLong && !expanded) {
                Box(
                    modifier = Modifier
                        .align(Alignment.BottomCenter)
                        .fillMaxWidth()
                        .height(54.dp)
                        .background(
                            Brush.verticalGradient(
                                colors = listOf(
                                    CardBackground.copy(alpha = 0f),
                                    CardBackground.copy(alpha = 0.78f),
                                    CardBackground
                                )
                            )
                        )
                )
            }
        }
        if (isLong) {
            TextButton(onClick = onToggle, contentPadding = PaddingValues(0.dp)) {
                Text(if (expanded) "Daha az göster" else "Devamını oku", color = Orange, fontWeight = FontWeight.Bold)
            }
        }
    }
}

@Composable
private fun SpecificationsCard(product: Product, onShowAll: () -> Unit) {
    val specs = productSpecifications(product)
    DetailCard {
        SectionTitle("Teknik Özellikler", Icons.Default.Inventory2)
        Spacer(Modifier.height(10.dp))
        specs.take(5).forEachIndexed { index, spec ->
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(if (index % 2 == 0) Color(0xFFF8FAFC) else Color.White)
                    .padding(horizontal = 10.dp, vertical = 10.dp)
            ) {
                Text(spec.first, color = SecondaryText, modifier = Modifier.weight(1f))
                Text(spec.second, color = NavyDark, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
            }
        }
        TextButton(onClick = onShowAll, modifier = Modifier.align(Alignment.End)) {
            Text("Tüm özellikleri gör", color = Orange, fontWeight = FontWeight.Bold)
        }
    }
}

@Composable
private fun ReviewsCard(product: Product) {
    DetailCard {
        SectionTitle("Değerlendirmeler", Icons.Outlined.RateReview)
        Spacer(Modifier.height(12.dp))
        if (product.reviewCount <= 0) {
            EmptySection(
                icon = Icons.Outlined.RateReview,
                title = "Henüz değerlendirme yok",
                text = "Bu ürünü alan ilk müşterilerden biri olarak deneyimini paylaşabilirsin."
            )
        } else {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(product.averageRating, color = NavyDark, fontWeight = FontWeight.ExtraBold, fontSize = 34.sp)
                Spacer(Modifier.width(10.dp))
                Column {
                    Row {
                        repeat(5) {
                            Icon(Icons.Default.Star, contentDescription = null, tint = Orange, modifier = Modifier.size(18.dp))
                        }
                    }
                    Text("${product.reviewCount} değerlendirme", color = SecondaryText, style = MaterialTheme.typography.bodySmall)
                }
            }
            Spacer(Modifier.height(12.dp))
            Text("Yorum detayları hazır olduğunda burada gösterilecek.", color = SecondaryText)
        }
    }
}

@Composable
private fun ProductQuestionsSection(
    loading: Boolean,
    questions: List<ProductQuestion>,
    error: String?,
    onAskQuestion: () -> Unit,
    onRetry: () -> Unit
) {
    DetailCard {
        SectionTitle("Soru - Cevap", Icons.Outlined.HelpOutline)
        Spacer(Modifier.height(10.dp))
        when {
            loading -> Row(verticalAlignment = Alignment.CenterVertically) {
                CircularProgressIndicator(color = Orange, modifier = Modifier.size(22.dp), strokeWidth = 2.dp)
                Spacer(Modifier.width(10.dp))
                Text("Sorular yükleniyor", color = SecondaryText)
            }
            error != null -> {
                EmptySection(Icons.Outlined.HelpOutline, "Sorular alınamadı", error)
                OutlinedButton(onClick = onRetry, shape = RoundedCornerShape(12.dp), modifier = Modifier.fillMaxWidth()) {
                    Text("Tekrar Dene", color = NavyDark)
                }
            }
            questions.isEmpty() -> EmptySection(
                icon = Icons.Outlined.HelpOutline,
                title = "Henüz soru yok",
                text = "Bu ürün hakkında merak ettiğin konuyu satıcıya sorabilirsin."
            )
            else -> questions.take(6).forEach { question ->
                ProductQuestionCard(question)
                Spacer(Modifier.height(10.dp))
            }
        }
        Spacer(Modifier.height(10.dp))
        Button(
            onClick = onAskQuestion,
            modifier = Modifier.fillMaxWidth().height(48.dp),
            colors = ButtonDefaults.buttonColors(containerColor = Orange),
            shape = RoundedCornerShape(12.dp)
        ) { Text("Satıcıya Soru Sor", fontWeight = FontWeight.Bold) }
    }
}

@Composable
private fun ProductQuestionCard(question: ProductQuestion) {
    val answered = !question.answer.isNullOrBlank()
    Surface(
        color = if (answered) Color.White else Color(0xFFFFF8ED),
        border = BorderStroke(1.dp, if (answered) BorderLight else Orange.copy(alpha = 0.35f)),
        shape = RoundedCornerShape(14.dp),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(modifier = Modifier.padding(13.dp), verticalArrangement = Arrangement.spacedBy(9.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Surface(color = Color(0xFFF1F5F9), shape = RoundedCornerShape(8.dp)) {
                    Text("SORU", color = NavyDark, fontWeight = FontWeight.ExtraBold, fontSize = 11.sp, modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp))
                }
                Spacer(Modifier.width(8.dp))
                Text(formatQuestionDate(question.createdAt), color = SecondaryText, fontSize = 12.sp, modifier = Modifier.weight(1f), textAlign = androidx.compose.ui.text.style.TextAlign.End)
            }
            Text(question.question, color = NavyDark, fontWeight = FontWeight.SemiBold, lineHeight = 20.sp)
            Surface(
                color = if (answered) Color(0xFFF8FAFC) else Color.White,
                border = BorderStroke(1.dp, BorderLight),
                shape = RoundedCornerShape(12.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.padding(12.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("NovaStore", color = NavyDark, fontWeight = FontWeight.ExtraBold, modifier = Modifier.weight(1f))
                        Surface(color = if (answered) Success.copy(alpha = 0.12f) else Orange.copy(alpha = 0.12f), shape = RoundedCornerShape(999.dp)) {
                            Text(
                                if (answered) "Yanıtlandı" else "Bekliyor",
                                color = if (answered) Success else Orange,
                                fontWeight = FontWeight.Bold,
                                fontSize = 11.sp,
                                modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                            )
                        }
                    }
                    Spacer(Modifier.height(6.dp))
                    Text(question.answer ?: "Satıcı henüz yanıtlamadı.", color = if (answered) NavyDark else SecondaryText, lineHeight = 20.sp)
                }
            }
        }
    }
}

@Composable
private fun QuestionsCard(onAskQuestion: () -> Unit, onMessage: (String) -> Unit) {
    DetailCard {
        SectionTitle("Soru - Cevap", Icons.Outlined.HelpOutline)
        Spacer(Modifier.height(10.dp))
        Text("Bu ürün hakkında henüz soru sorulmamış.", color = SecondaryText)
        Spacer(Modifier.height(10.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(
                onClick = onAskQuestion,
                modifier = Modifier.weight(1f),
                colors = ButtonDefaults.buttonColors(containerColor = Orange),
                shape = RoundedCornerShape(12.dp)
            ) { Text("Satıcıya Soru Sor", fontWeight = FontWeight.Bold) }
            OutlinedButton(
                onClick = { onMessage("Henüz görüntülenecek soru bulunmuyor.") },
                modifier = Modifier.weight(1f),
                shape = RoundedCornerShape(12.dp)
            ) { Text("Tüm Sorular", color = NavyDark) }
        }
    }
}

@Composable
private fun RelatedProductsCard(products: List<Product>, onProductClick: (Int) -> Unit) {
    DetailCard(contentPadding = PaddingValues(vertical = 16.dp)) {
        Text(
            "Benzer Ürünler",
            color = NavyDark,
            fontWeight = FontWeight.Bold,
            style = MaterialTheme.typography.titleMedium,
            modifier = Modifier.padding(horizontal = 16.dp)
        )
        Spacer(Modifier.height(10.dp))
        LazyRow(
            contentPadding = PaddingValues(horizontal = 16.dp),
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            items(products, key = { it.id }) { product ->
                RelatedProductItem(product = product, onClick = { onProductClick(product.id) })
            }
        }
    }
}

@Composable
private fun RelatedProductItem(product: Product, onClick: () -> Unit) {
    Surface(
        modifier = Modifier
            .width(150.dp)
            .clickable(onClick = onClick),
        color = Color.White,
        border = BorderStroke(1.dp, BorderLight),
        shape = RoundedCornerShape(14.dp)
    ) {
        Column(modifier = Modifier.padding(9.dp)) {
            AsyncImage(
                model = optimizedImageUrl(product.imageUrl, 400, 400),
                contentDescription = product.name,
                contentScale = ContentScale.Fit,
                modifier = Modifier
                    .fillMaxWidth()
                    .aspectRatio(1f)
                    .clip(RoundedCornerShape(10.dp))
                    .background(Color(0xFFFAFAFB))
            )
            Spacer(Modifier.height(7.dp))
            Text(product.name, maxLines = 2, overflow = TextOverflow.Ellipsis, color = NavyDark, style = MaterialTheme.typography.bodySmall)
            Spacer(Modifier.height(5.dp))
            Text(formatPrice(product.price), color = Orange, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.bodyMedium)
        }
    }
}

@Composable
private fun PurchaseBar(
    product: Product,
    quantity: Int,
    isLoading: Boolean,
    onDecrease: () -> Unit,
    onIncrease: () -> Unit,
    onAddToCart: () -> Unit,
    onBuyNow: () -> Unit
) {
    Surface(color = Color.White, shadowElevation = 10.dp, tonalElevation = 2.dp) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .navigationBarsPadding()
                .padding(horizontal = 12.dp, vertical = 10.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text("Toplam", color = SecondaryText, style = MaterialTheme.typography.labelMedium)
                    Text(
                        formatPrice(product.price * quantity),
                        color = StoreBlue,
                        fontWeight = FontWeight.ExtraBold,
                        style = MaterialTheme.typography.titleMedium
                    )
                }
                if (product.stock > 0) {
                    QuantitySelector(
                        quantity = quantity,
                        canDecrease = quantity > 1,
                        canIncrease = quantity < product.stock,
                        onDecrease = onDecrease,
                        onIncrease = onIncrease
                    )
                }
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                OutlinedButton(
                    onClick = onAddToCart,
                    enabled = product.stock > 0 && !isLoading,
                    modifier = Modifier
                        .weight(1f)
                        .height(48.dp),
                    shape = RoundedCornerShape(13.dp),
                    border = BorderStroke(1.dp, Orange)
                ) {
                    if (isLoading) {
                        CircularProgressIndicator(modifier = Modifier.size(20.dp), color = Orange, strokeWidth = 2.dp)
                    } else {
                        Icon(Icons.Default.AddShoppingCart, contentDescription = null, tint = Orange, modifier = Modifier.size(19.dp))
                        Spacer(Modifier.width(6.dp))
                        Text(if (product.stock > 0) "Sepete Ekle" else "Tükendi", color = Orange, fontWeight = FontWeight.Bold)
                    }
                }
                Button(
                    onClick = onBuyNow,
                    enabled = product.stock > 0 && !isLoading,
                    modifier = Modifier
                        .weight(1f)
                        .height(48.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = Orange, disabledContainerColor = Color(0xFFD1D5DB)),
                    shape = RoundedCornerShape(13.dp)
                ) {
                    Icon(Icons.Default.CreditCard, contentDescription = null, modifier = Modifier.size(19.dp))
                    Spacer(Modifier.width(6.dp))
                    Text(if (product.stock > 0) "Hemen Al" else "Tükendi", fontWeight = FontWeight.Bold)
                }
            }
        }
    }
}

@Composable
private fun QuantitySelector(
    quantity: Int,
    canDecrease: Boolean,
    canIncrease: Boolean,
    onDecrease: () -> Unit,
    onIncrease: () -> Unit
) {
    Row(
        modifier = Modifier
            .border(1.dp, BorderLight, RoundedCornerShape(12.dp))
            .height(44.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        IconButton(onClick = onDecrease, enabled = canDecrease, modifier = Modifier.size(36.dp)) {
            Icon(Icons.Default.Remove, contentDescription = "Adedi azalt", modifier = Modifier.size(17.dp))
        }
        Text(quantity.toString(), color = NavyDark, fontWeight = FontWeight.Bold, modifier = Modifier.padding(horizontal = 4.dp))
        IconButton(onClick = onIncrease, enabled = canIncrease, modifier = Modifier.size(36.dp)) {
            Icon(Icons.Default.Add, contentDescription = "Adedi artır", modifier = Modifier.size(17.dp))
        }
    }
}

@Composable
private fun DetailCard(
    modifier: Modifier = Modifier,
    contentPadding: PaddingValues = PaddingValues(16.dp),
    content: @Composable ColumnScope.() -> Unit
) {
    Card(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 12.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        shape = RoundedCornerShape(16.dp),
        border = BorderStroke(1.dp, BorderLight),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
    ) {
        Column(modifier = Modifier.padding(contentPadding), content = content)
    }
}

@Composable
private fun SectionTitle(title: String, icon: ImageVector) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Icon(icon, contentDescription = null, tint = Orange, modifier = Modifier.size(21.dp))
        Spacer(Modifier.width(8.dp))
        Text(title, color = NavyDark, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium)
    }
}

@Composable
private fun EmptySection(icon: ImageVector, title: String, text: String) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 12.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Icon(icon, contentDescription = null, tint = Color(0xFFB7BEC9), modifier = Modifier.size(42.dp))
        Spacer(Modifier.height(8.dp))
        Text(title, color = NavyDark, fontWeight = FontWeight.Bold)
        Spacer(Modifier.height(4.dp))
        Text(text, color = SecondaryText, style = MaterialTheme.typography.bodySmall)
    }
}

@Composable
private fun FullScreenGallery(
    images: List<String>,
    initialPage: Int,
    productName: String,
    onDismiss: () -> Unit
) {
    if (images.isEmpty()) return
    val pagerState = rememberPagerState(initialPage = initialPage, pageCount = { images.size })
    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false)
    ) {
        BackHandler(onBack = onDismiss)
        Box(modifier = Modifier.fillMaxSize().background(Color.Black)) {
            HorizontalPager(state = pagerState, modifier = Modifier.fillMaxSize()) { page ->
                ZoomableImage(url = images[page], contentDescription = "$productName görseli ${page + 1}")
            }
            IconButton(
                onClick = onDismiss,
                modifier = Modifier
                    .align(Alignment.TopStart)
                    .padding(16.dp)
                    .background(Color.Black.copy(alpha = 0.5f), CircleShape)
            ) {
                Icon(Icons.Default.Close, contentDescription = "Galeriyi kapat", tint = Color.White)
            }
            Surface(
                modifier = Modifier
                    .align(Alignment.TopCenter)
                    .padding(top = 24.dp),
                color = Color.Black.copy(alpha = 0.55f),
                shape = RoundedCornerShape(14.dp)
            ) {
                Text(
                    "${pagerState.currentPage + 1}/${images.size}",
                    color = Color.White,
                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp)
                )
            }
        }
    }
}

@Composable
private fun ZoomableImage(url: String, contentDescription: String) {
    var scale by remember { mutableFloatStateOf(1f) }
    var offsetX by remember { mutableFloatStateOf(0f) }
    var offsetY by remember { mutableFloatStateOf(0f) }
    AsyncImage(
        model = optimizedImageUrl(url, 1600, 1600),
        contentDescription = contentDescription,
        contentScale = ContentScale.Fit,
        modifier = Modifier
            .fillMaxSize()
            .pointerInput(Unit) {
                detectTransformGestures { _, pan, zoom, _ ->
                    scale = (scale * zoom).coerceIn(1f, 4f)
                    if (scale > 1f) {
                        offsetX += pan.x
                        offsetY += pan.y
                    } else {
                        offsetX = 0f
                        offsetY = 0f
                    }
                }
            }
            .graphicsLayer {
                scaleX = scale
                scaleY = scale
                translationX = offsetX
                translationY = offsetY
            }
            .padding(12.dp)
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun InstallmentsSheet(onDismiss: () -> Unit) {
    ModalBottomSheet(onDismissRequest = onDismiss, containerColor = Color.White) {
        Column(modifier = Modifier.padding(horizontal = 20.dp).padding(bottom = 24.dp)) {
            Text("Taksit Seçenekleri", color = NavyDark, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleLarge)
            Spacer(Modifier.height(12.dp))
            listOf("Peşin" to "Tek çekim", "3 Taksit" to "Peşin fiyatına", "6 Taksit" to "Banka koşullarına göre").forEach {
                Row(modifier = Modifier.fillMaxWidth().padding(vertical = 11.dp)) {
                    Text(it.first, color = NavyDark, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                    Text(it.second, color = SecondaryText)
                }
                HorizontalDivider(color = BorderLight)
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AddressSelectionSheet(
    addresses: List<CustomerAddress>,
    selectedAddressId: Long,
    onSelect: (Long) -> Unit,
    onDismiss: () -> Unit
) {
    ModalBottomSheet(onDismissRequest = onDismiss, containerColor = Color.White) {
        Column(modifier = Modifier.padding(horizontal = 20.dp).padding(bottom = 24.dp)) {
            Text("Teslimat Adresi", color = NavyDark, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleLarge)
            Spacer(Modifier.height(12.dp))
            if (addresses.isEmpty()) {
                EmptySection(Icons.Default.LocationOn, "Kayıtlı adres yok", "Ana sayfadaki Adres Ekle alanından yeni adres oluşturabilirsin.")
            } else {
                addresses.forEach { address ->
                    val selected = address.id == selectedAddressId
                    Surface(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 5.dp)
                            .clickable { onSelect(address.id) },
                        color = if (selected) Orange.copy(alpha = 0.08f) else Color.White,
                        border = BorderStroke(1.dp, if (selected) Orange else BorderLight),
                        shape = RoundedCornerShape(13.dp)
                    ) {
                        Row(modifier = Modifier.padding(13.dp), verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Default.LocationOn, contentDescription = null, tint = Orange)
                            Spacer(Modifier.width(10.dp))
                            Column(Modifier.weight(1f)) {
                                Text(address.title, color = NavyDark, fontWeight = FontWeight.Bold)
                                Text(address.singleLine, color = SecondaryText, style = MaterialTheme.typography.bodySmall, maxLines = 2)
                            }
                            if (selected) Icon(Icons.Default.Check, contentDescription = "Seçili", tint = Success)
                        }
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun SpecificationsSheet(product: Product, onDismiss: () -> Unit) {
    ModalBottomSheet(onDismissRequest = onDismiss, containerColor = Color.White) {
        Column(
            modifier = Modifier
                .fillMaxHeight(0.72f)
                .padding(horizontal = 20.dp)
                .padding(bottom = 24.dp)
        ) {
            Text("Tüm Özellikler", color = NavyDark, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleLarge)
            Spacer(Modifier.height(12.dp))
            productSpecifications(product).forEachIndexed { index, spec ->
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(if (index % 2 == 0) Color(0xFFF8FAFC) else Color.White)
                        .padding(12.dp)
                ) {
                    Text(spec.first, color = SecondaryText, modifier = Modifier.weight(1f))
                    Text(spec.second, color = NavyDark, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun QuestionSheet(
    sending: Boolean,
    onDismiss: () -> Unit,
    onSubmit: (String) -> Unit
) {
    var question by remember { mutableStateOf("") }
    ModalBottomSheet(onDismissRequest = onDismiss, containerColor = Color.White) {
        Column(modifier = Modifier.padding(horizontal = 20.dp).padding(bottom = 24.dp)) {
            Text("Satıcıya Soru Sor", color = NavyDark, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleLarge)
            Spacer(Modifier.height(12.dp))
            OutlinedTextField(
                value = question,
                onValueChange = { question = it.take(500) },
                modifier = Modifier.fillMaxWidth().heightIn(min = 120.dp),
                placeholder = { Text("Ürün hakkında merak ettiğiniz konuyu yazın...") },
                shape = RoundedCornerShape(14.dp)
            )
            Spacer(Modifier.height(12.dp))
            Button(
                onClick = { onSubmit(question) },
                enabled = question.isNotBlank() && !sending,
                modifier = Modifier.fillMaxWidth().height(48.dp),
                colors = ButtonDefaults.buttonColors(containerColor = Orange),
                shape = RoundedCornerShape(13.dp)
            ) {
                if (sending) {
                    CircularProgressIndicator(color = Color.White, modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
                } else {
                    Text("Soruyu Gönder", fontWeight = FontWeight.Bold)
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AddedToCartSheet(product: Product, quantity: Int, onDismiss: () -> Unit, onCart: () -> Unit) {
    ModalBottomSheet(onDismissRequest = onDismiss, containerColor = Color.White) {
        Column(modifier = Modifier.padding(horizontal = 20.dp).padding(bottom = 24.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Surface(color = Success.copy(alpha = 0.12f), shape = CircleShape, modifier = Modifier.size(42.dp)) {
                    Box(contentAlignment = Alignment.Center) {
                        Icon(Icons.Default.Check, contentDescription = null, tint = Success)
                    }
                }
                Spacer(Modifier.width(10.dp))
                Text("Ürün sepete eklendi", color = NavyDark, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium)
            }
            Spacer(Modifier.height(14.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                AsyncImage(
                    model = optimizedImageUrl(product.imageUrl, 240, 240),
                    contentDescription = product.name,
                    contentScale = ContentScale.Fit,
                    modifier = Modifier.size(74.dp).clip(RoundedCornerShape(10.dp)).background(Color(0xFFFAFAFB))
                )
                Spacer(Modifier.width(12.dp))
                Column(Modifier.weight(1f)) {
                    Text(product.name, color = NavyDark, fontWeight = FontWeight.SemiBold, maxLines = 2, overflow = TextOverflow.Ellipsis)
                    Text("$quantity adet • ${formatPrice(product.price * quantity)}", color = Orange, fontWeight = FontWeight.Bold)
                }
            }
            Spacer(Modifier.height(16.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                OutlinedButton(onClick = onDismiss, modifier = Modifier.weight(1f), shape = RoundedCornerShape(13.dp)) {
                    Text("Alışverişe Devam", color = NavyDark)
                }
                Button(
                    onClick = onCart,
                    modifier = Modifier.weight(1f),
                    colors = ButtonDefaults.buttonColors(containerColor = Orange),
                    shape = RoundedCornerShape(13.dp)
                ) { Text("Sepete Git", fontWeight = FontWeight.Bold) }
            }
        }
    }
}

@Composable
private fun ProductDetailSkeleton(modifier: Modifier = Modifier) {
    LazyColumn(
        modifier = modifier.fillMaxSize().background(PageBackground),
        verticalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        item { SkeletonBlock(Modifier.fillMaxWidth().aspectRatio(1f)) }
        items(4) { SkeletonBlock(Modifier.fillMaxWidth().height(150.dp).padding(horizontal = 12.dp)) }
    }
}

@Composable
private fun SkeletonBlock(modifier: Modifier) {
    Box(modifier = modifier.clip(RoundedCornerShape(16.dp)).background(Color(0xFFE7EAF0)))
}

@Composable
private fun ErrorState(message: String, onRetry: () -> Unit, onBack: () -> Unit, modifier: Modifier = Modifier) {
    Box(modifier = modifier.fillMaxSize().background(PageBackground), contentAlignment = Alignment.Center) {
        Column(
            modifier = Modifier.padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Icon(Icons.Outlined.ImageNotSupported, contentDescription = null, tint = Color(0xFFB7BEC9), modifier = Modifier.size(64.dp))
            Spacer(Modifier.height(12.dp))
            Text("Ürün bilgisi alınamadı", color = NavyDark, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleLarge)
            Spacer(Modifier.height(6.dp))
            Text(message, color = SecondaryText)
            Spacer(Modifier.height(16.dp))
            Button(onClick = onRetry, colors = ButtonDefaults.buttonColors(containerColor = Orange), shape = RoundedCornerShape(12.dp)) {
                Text("Tekrar Dene", fontWeight = FontWeight.Bold)
            }
            TextButton(onClick = onBack) { Text("Geri Dön", color = NavyDark) }
        }
    }
}

private fun productImages(product: Product): List<String> {
    return buildList {
        product.imageUrl?.takeIf { it.isNotBlank() }?.let(::add)
        product.media.sortedBy { it.sortOrder }.forEach { media ->
            if (media.mediaUrl.isNotBlank() && media.mediaUrl !in this) add(media.mediaUrl)
        }
    }
}

private fun productSpecifications(product: Product): List<Pair<String, String>> {
    return buildList {
        add("Kategori" to product.category)
        add("Ürün Kodu" to product.id.toString())
        add("Stok Durumu" to if (product.stock > 0) "Stokta var" else "Tükendi")
        add("Stok Adedi" to product.stock.coerceAtLeast(0).toString())
        add("Satıcı" to "NovaStore")
        add("Kargo" to "Ücretsiz gönderim")
        add("İade" to "14 gün içinde")
        add("Garanti" to "2 yıl")
    }
}

private fun formatPrice(value: Double): String {
    return NumberFormat.getNumberInstance(Locale("tr", "TR")).apply {
        maximumFractionDigits = 2
        minimumFractionDigits = 2
    }.format(value) + " TL"
}

private fun formatQuestionDate(raw: String?): String {
    if (raw.isNullOrBlank()) return "Tarih yok"
    return raw.take(16).replace("T", " ")
}

private fun Product.toCartItem(quantity: Int) = CartItem(
    productId = id,
    name = name,
    price = price,
    imageUrl = imageUrl,
    quantity = quantity
)

private fun sanitizeDescription(description: String?): String {
    if (description.isNullOrBlank()) return ""
    return description
        .replace(Regex("(?i)<br\\s*/?>"), "\n")
        .replace(Regex("(?i)</p>"), "\n")
        .replace(Regex("<[^>]+>"), "")
        .replace("&nbsp;", " ")
        .replace("&amp;", "&")
        .replace(Regex("[ \\t]+"), " ")
        .replace(Regex("\\n{3,}"), "\n\n")
        .trim()
}
