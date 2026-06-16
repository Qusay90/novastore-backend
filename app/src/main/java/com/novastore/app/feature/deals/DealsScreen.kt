package com.novastore.app.feature.deals

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.tween
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.LocalOffer
import androidx.compose.material.icons.filled.ShoppingCart
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.outlined.StarOutline
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import coil3.compose.AsyncImage
import com.novastore.app.core.theme.NavyDark
import com.novastore.app.core.theme.NavyMid
import com.novastore.app.core.theme.Orange
import com.novastore.app.core.ui.optimizedImageUrl
import com.novastore.app.data.model.CartItem
import com.novastore.app.data.model.Product
import kotlinx.coroutines.delay
import timber.log.Timber

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DealsScreen(
    onProductClick: (Int) -> Unit,
    onAddToCart: (CartItem) -> Unit,
    modifier: Modifier = Modifier,
    viewModel: DealsViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()
    val favoriteIds by viewModel.favoriteIds.collectAsState()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { 
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("Günün Fırsatları", fontWeight = FontWeight.Bold, color = NavyDark)
                        Spacer(modifier = Modifier.width(8.dp))
                        Box(
                            modifier = Modifier
                                .background(Color(0xFFEF4444), RoundedCornerShape(4.dp))
                                .padding(horizontal = 6.dp, vertical = 2.dp)
                        ) {
                            Text(
                                "02:54:18",
                                color = Color.White,
                                fontSize = 10.sp,
                                fontWeight = FontWeight.Bold
                            )
                        }
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.background
                )
            )
        },
        modifier = modifier
    ) { paddingValues ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .background(MaterialTheme.colorScheme.background)
        ) {
            if (uiState.isLoading) {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = Orange)
                }
            } else if (uiState.error != null) {
                ErrorState(message = uiState.error!!, onRetry = { viewModel.loadDeals() })
            } else {
                DealsCatalogGrid(
                    uiState = uiState,
                    onProductClick = onProductClick,
                    onAddToCart = onAddToCart,
                    favoriteIds = favoriteIds,
                    onToggleFavorite = viewModel::toggleFavorite
                )
            }
        }
    }
}

@Composable
private fun DealsCatalogGrid(
    uiState: DealsUiState,
    onProductClick: (Int) -> Unit,
    onAddToCart: (CartItem) -> Unit,
    favoriteIds: Set<Int>,
    onToggleFavorite: (Int) -> Unit
) {
    LazyVerticalGrid(
        columns = GridCells.Fixed(2),
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 16.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        // 1. Deals Hero Promo Banner
        item(span = { GridItemSpan(2) }) {
            DealsHeroBanner()
        }

        // 2. Deals Title
        item(span = { GridItemSpan(2) }) {
            Text(
                text = "Kaçırılmayacak Fiyatlar",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                color = NavyDark,
                modifier = Modifier.padding(vertical = 4.dp)
            )
        }

        // 3. Empty State Check
        if (uiState.deals.isEmpty()) {
            item(span = { GridItemSpan(2) }) {
                EmptyDealsState()
            }
        } else {
            // 4. Products Grid
            items(uiState.deals, key = { it.id }) { product ->
                DealProductCard(
                    product = product,
                    onProductClick = onProductClick,
                    onAddToCart = onAddToCart,
                    isFavorite = favoriteIds.contains(product.id),
                    onToggleFavorite = onToggleFavorite
                )
            }
        }

        // Space at the bottom
        item(span = { GridItemSpan(2) }) {
            Spacer(modifier = Modifier.height(16.dp))
        }
    }
}

@Composable
private fun DealsHeroBanner() {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .height(110.dp)
            .padding(vertical = 4.dp),
        shape = RoundedCornerShape(12.dp),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(
                    Brush.horizontalGradient(
                        colors = listOf(Orange, Color(0xFFE08D14), Color(0xFFEA580C))
                    )
                )
                .padding(14.dp)
        ) {
            Column(
                modifier = Modifier
                    .fillMaxHeight()
                    .align(Alignment.CenterStart),
                verticalArrangement = Arrangement.Center
            ) {
                Box(
                    modifier = Modifier
                        .background(NavyDark, RoundedCornerShape(4.dp))
                        .padding(horizontal = 6.dp, vertical = 2.dp)
                ) {
                    Text(
                        "FLAŞ İNDİRİMLER",
                        style = MaterialTheme.typography.labelSmall.copy(fontSize = 8.sp),
                        color = Color.White,
                        fontWeight = FontWeight.Bold
                    )
                }
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    "Süper Fiyatlar Başladı!",
                    style = MaterialTheme.typography.titleMedium.copy(fontSize = 14.sp),
                    color = Color.White,
                    fontWeight = FontWeight.Bold
                )
                Text(
                    "Teknoloji ürünlerinde kaçırılmayacak fırsat ve indirimler.",
                    style = MaterialTheme.typography.bodySmall.copy(fontSize = 10.sp),
                    color = Color.White.copy(alpha = 0.9f)
                )
            }
        }
    }
}

@Composable
private fun DealProductCard(
    product: Product,
    onProductClick: (Int) -> Unit,
    onAddToCart: (CartItem) -> Unit,
    isFavorite: Boolean,
    onToggleFavorite: (Int) -> Unit
) {
    // Build full image list from imageUrl + media
    val allImages = remember(product) {
        val list = mutableListOf<String>()
        product.imageUrl?.let { list.add(it) }
        product.media.map { it.mediaUrl }.forEach { url ->
            if (!list.contains(url)) list.add(url)
        }
        if (list.isEmpty()) list.add("")
        list
    }
    val previewImageUrl = remember(allImages) {
        optimizedImageUrl(allImages.firstOrNull(), width = 520, height = 520)
    }

    val TealGreen = Color(0xFF0D9488)

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onProductClick(product.id) },
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Column {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(8.dp)
            ) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .aspectRatio(1f)
                        .clip(RoundedCornerShape(12.dp))
                        .background(Color.White)
                ) {
                    AsyncImage(
                        model = previewImageUrl,
                        contentDescription = product.name,
                        contentScale = ContentScale.Crop,
                        modifier = Modifier.fillMaxSize()
                    )

                    if (allImages.size > 1) {
                        Row(
                            modifier = Modifier
                                .align(Alignment.BottomCenter)
                                .padding(bottom = 6.dp),
                            horizontalArrangement = Arrangement.spacedBy(4.dp)
                        ) {
                            repeat(allImages.size) { index ->
                                Box(
                                    modifier = Modifier
                                        .size(if (index == 0) 7.dp else 5.dp)
                                        .clip(CircleShape)
                                        .background(
                                            if (index == 0) TealGreen else Color.LightGray.copy(alpha = 0.6f)
                                        )
                                )
                            }
                        }
                    }

                    // Tükendi overlay
                    if (product.stock == 0) {
                        Box(
                            modifier = Modifier
                                .fillMaxSize()
                                .background(Color.White.copy(alpha = 0.75f)),
                            contentAlignment = Alignment.Center
                        ) {
                            Surface(
                                shape = RoundedCornerShape(6.dp),
                                color = Color(0xFFEF4444),
                                shadowElevation = 2.dp
                            ) {
                                Text(
                                    "TÜKENDİ",
                                    color = Color.White,
                                    fontSize = 10.sp,
                                    fontWeight = FontWeight.Bold,
                                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                                )
                            }
                        }
                    }
                }

                IconButton(
                    onClick = {
                        onToggleFavorite(product.id)
                        Timber.d("Favorite toggled for deal product ${product.id}")
                    },
                    modifier = Modifier
                        .align(Alignment.TopEnd)
                        .padding(top = 8.dp, end = 8.dp)
                        .size(36.dp)
                ) {
                    AnimatedContent(
                        targetState = isFavorite,
                        transitionSpec = {
                            scaleIn(animationSpec = tween(250)) togetherWith
                                scaleOut(animationSpec = tween(250))
                        },
                        label = "favorite_anim"
                    ) { state ->
                        Box {
                            // Shadow
                            Icon(
                                imageVector = if (state) Icons.Filled.Favorite else Icons.Filled.FavoriteBorder,
                                contentDescription = null,
                                tint = Color.Black.copy(alpha = 0.25f),
                                modifier = Modifier
                                    .size(26.dp)
                                    .offset(x = 1.dp, y = 1.5.dp)
                            )
                            // Actual Icon
                            Icon(
                                imageVector = if (state) Icons.Filled.Favorite else Icons.Filled.FavoriteBorder,
                                contentDescription = "Favoriye Ekle",
                                tint = if (state) Color(0xFFEF4444) else Color(0xFFD1D5DB),
                                modifier = Modifier.size(26.dp)
                            )
                        }
                    }
                }
            }

            // ── Info Section ──
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(start = 12.dp, end = 12.dp, bottom = 12.dp)
            ) {
                // Product Name — always 2 lines
                Text(
                    text = product.name,
                    style = MaterialTheme.typography.bodyMedium.copy(fontSize = 13.sp),
                    fontWeight = FontWeight.Medium,
                    color = NavyDark,
                    maxLines = 2,
                    minLines = 2,
                    overflow = TextOverflow.Ellipsis
                )

                Spacer(modifier = Modifier.height(4.dp))

                // Rating Row
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        imageVector = if (product.reviewCount > 0) Icons.Filled.Star else Icons.Outlined.StarOutline,
                        contentDescription = "Rating",
                        tint = if (product.reviewCount > 0) Color(0xFFF59E0B) else Color(0xFFD1D5DB),
                        modifier = Modifier.size(14.dp)
                    )
                    Spacer(modifier = Modifier.width(3.dp))
                    Text(
                        text = if (product.reviewCount > 0) "${product.averageRating} (${product.reviewCount})" else "Değerlendirme Yok",
                        style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.sp),
                        color = Color(0xFF9CA3AF)
                    )
                }

                Spacer(modifier = Modifier.height(6.dp))

                // Discount Row — always reserves space
                Box(modifier = Modifier.height(20.dp)) {
                    if (product.oldPrice != null && product.oldPrice > product.price) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(
                                "Sepete Özel",
                                color = TealGreen,
                                fontSize = 9.sp,
                                fontWeight = FontWeight.Bold
                            )
                            Spacer(modifier = Modifier.width(4.dp))
                            Text(
                                text = "${product.oldPrice} TL",
                                style = MaterialTheme.typography.labelSmall.copy(
                                    textDecoration = TextDecoration.LineThrough,
                                    fontSize = 10.sp
                                ),
                                color = Color(0xFF9CA3AF)
                            )
                            Spacer(modifier = Modifier.width(4.dp))
                            Box(
                                modifier = Modifier
                                    .background(TealGreen, RoundedCornerShape(4.dp))
                                    .padding(horizontal = 4.dp, vertical = 2.dp),
                                contentAlignment = Alignment.Center
                            ) {
                                Text(
                                    "%${product.discountPercentage}",
                                    color = Color.White,
                                    fontSize = 9.sp,
                                    fontWeight = FontWeight.Bold
                                )
                            }
                        }
                    }
                }

                Spacer(modifier = Modifier.height(4.dp))

                // Price + Cart Button Row
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    val priceWhole = product.price.toInt()
                    val priceDecimal = ((product.price - priceWhole) * 100).toInt()
                    val isDiscounted = product.oldPrice != null && product.oldPrice > product.price
                    
                    Text(
                        text = androidx.compose.ui.text.buildAnnotatedString {
                            append("$priceWhole,")
                            withStyle(androidx.compose.ui.text.SpanStyle(fontSize = 11.sp)) {
                                append(priceDecimal.toString().padStart(2, '0'))
                            }
                            append(" TL")
                        },
                        style = MaterialTheme.typography.titleMedium.copy(fontSize = 16.sp),
                        fontWeight = FontWeight.ExtraBold,
                        color = if (isDiscounted) TealGreen else NavyDark
                    )

                    // Cart Button with animation
                    if (product.stock > 0) {
                        var showCheck by remember { mutableStateOf(false) }

                        LaunchedEffect(showCheck) {
                            if (showCheck) {
                                delay(1000L)
                                showCheck = false
                            }
                        }

                        IconButton(
                            onClick = {
                                if (!showCheck) {
                                    showCheck = true
                                    onAddToCart(
                                        CartItem(
                                            productId = product.id,
                                            name = product.name,
                                            price = product.price,
                                            imageUrl = product.imageUrl,
                                            quantity = 1
                                        )
                                    )
                                }
                            },
                            modifier = Modifier.size(34.dp)
                        ) {
                            AnimatedContent(
                                targetState = showCheck,
                                transitionSpec = {
                                    scaleIn(animationSpec = tween(250)) togetherWith
                                        scaleOut(animationSpec = tween(250))
                                },
                                label = "deal_cart_check_anim"
                            ) { isCheck ->
                                Icon(
                                    imageVector = if (isCheck) Icons.Default.Check else Icons.Default.ShoppingCart,
                                    contentDescription = "Sepete Ekle",
                                    tint = if (isCheck) TealGreen else Color(0xFF6B7280),
                                    modifier = Modifier.size(18.dp)
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun ErrorState(
    message: String,
    onRetry: () -> Unit
) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        contentAlignment = Alignment.Center
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(
                "Yükleme Başarısız",
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold,
                color = NavyDark
            )
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                message,
                style = MaterialTheme.typography.bodyMedium,
                color = Color.Gray
            )
            Spacer(modifier = Modifier.height(16.dp))
            Button(
                onClick = onRetry,
                colors = ButtonDefaults.buttonColors(containerColor = Orange)
            ) {
                Text("Tekrar Dene")
            }
        }
    }
}

@Composable
private fun EmptyDealsState() {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 48.dp),
        contentAlignment = Alignment.Center
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Icon(
                imageVector = Icons.Default.LocalOffer,
                contentDescription = "Boş Fırsat",
                tint = Color.LightGray,
                modifier = Modifier.size(60.dp)
            )
            Spacer(modifier = Modifier.height(16.dp))
            Text(
                "Şu an aktif fırsat bulunmuyor.",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                color = NavyDark
            )
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                "Daha sonra tekrar kontrol etmeyi unutmayın!",
                style = MaterialTheme.typography.bodySmall,
                color = Color.Gray
            )
        }
    }
}
