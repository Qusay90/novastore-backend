package com.novastore.app.feature.favorites

import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.grid.rememberLazyGridState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.ShoppingCart
import androidx.compose.material.icons.filled.Sort
import androidx.compose.material.icons.outlined.FavoriteBorder
import androidx.compose.material.icons.outlined.Inventory2
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.SnackbarResult
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.nestedscroll.NestedScrollConnection
import androidx.compose.ui.input.nestedscroll.NestedScrollSource
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.unit.Velocity
import androidx.hilt.navigation.compose.hiltViewModel
import coil3.compose.AsyncImage
import coil3.request.ImageRequest
import com.novastore.app.core.theme.BorderLight
import com.novastore.app.core.theme.CardBackground
import com.novastore.app.core.theme.DisabledBackground
import com.novastore.app.core.theme.DiscountGreen
import com.novastore.app.core.theme.Error
import com.novastore.app.core.theme.NavyDark
import com.novastore.app.core.theme.PageBackground
import com.novastore.app.core.theme.PrimaryOrange
import com.novastore.app.core.theme.StoreBlue
import com.novastore.app.core.theme.TextSecondary
import com.novastore.app.core.ui.optimizedImageUrl
import com.novastore.app.data.model.CartItem
import com.novastore.app.data.model.Product
import java.text.NumberFormat
import java.util.Locale
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FavoritesScreen(
    onProductClick: (Int) -> Unit,
    onAddToCart: (CartItem, (Boolean, String) -> Unit) -> Unit,
    onExploreClick: () -> Unit,
    onLoginClick: () -> Unit,
    isLoggedIn: Boolean,
    refreshToken: Int = 0,
    modifier: Modifier = Modifier,
    viewModel: FavoritesViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()
    val snackbarHostState = remember { SnackbarHostState() }
    val coroutineScope = rememberCoroutineScope()
    var showSortSheet by remember { mutableStateOf(false) }

    LaunchedEffect(refreshToken) {
        if (refreshToken > 0) viewModel.loadProducts(forceRefresh = true)
    }

    LaunchedEffect(uiState.undoRemovedItem?.id) {
        if (uiState.undoRemovedItem != null) {
            val result = snackbarHostState.showSnackbar(
                message = "Ürün favorilerden kaldırıldı.",
                actionLabel = "Geri al"
            )
            if (result == SnackbarResult.ActionPerformed) viewModel.undoRemoveFavorite()
            else viewModel.clearUndoRemovedItem()
        }
    }

    Scaffold(
        modifier = modifier,
        containerColor = PageBackground,
        snackbarHost = { SnackbarHost(snackbarHostState) },
        topBar = {
            FavoritesHeader(
                favoriteCount = uiState.favorites.size,
                searchQuery = uiState.searchQuery,
                selectedFilter = uiState.selectedFilter,
                selectedSort = uiState.selectedSort,
                onSearchQueryChange = viewModel::updateSearchQuery,
                onFilterSelected = viewModel::selectFilter,
                onSortClick = { showSortSheet = true }
            )
        }
    ) { padding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .background(PageBackground)
        ) {
            when {
                uiState.isLoading -> FavoritesSkeleton()
                uiState.error != null -> FavoritesMessageState(
                    icon = { Icon(Icons.Outlined.Inventory2, contentDescription = null) },
                    title = "Favorilerin yüklenemedi",
                    subtitle = "Lütfen internet bağlantını kontrol edip tekrar dene.",
                    primaryAction = "Tekrar Dene",
                    onPrimaryAction = { viewModel.loadProducts(forceRefresh = true) }
                )
                !isLoggedIn && uiState.favorites.isEmpty() -> FavoritesMessageState(
                    icon = { Icon(Icons.Outlined.FavoriteBorder, contentDescription = null) },
                    title = "Favorilerini görmek için giriş yap",
                    subtitle = "Beğendiğin ürünleri kaydetmek ve daha sonra kolayca bulmak için hesabına giriş yap.",
                    primaryAction = "Giriş Yap",
                    onPrimaryAction = onLoginClick,
                    secondaryAction = "Alışverişe Devam Et",
                    onSecondaryAction = onExploreClick
                )
                uiState.favorites.isEmpty() -> FavoritesMessageState(
                    icon = { Icon(Icons.Outlined.FavoriteBorder, contentDescription = null) },
                    title = "Henüz favori ürünün yok",
                    subtitle = "Beğendiğin ürünleri kalp ikonuna dokunarak favorilerine ekleyebilirsin.",
                    primaryAction = "Alışverişe başla",
                    onPrimaryAction = onExploreClick
                )
                uiState.visibleFavorites.isEmpty() -> FavoritesMessageState(
                    icon = { Icon(Icons.Default.Search, contentDescription = null) },
                    title = if (uiState.searchQuery.isNotBlank()) {
                        "Aradığın ürün favorilerinde bulunamadı"
                    } else {
                        "Bu filtreye uygun ürün bulunamadı"
                    },
                    subtitle = "Aramanı veya seçili filtreyi değiştirerek tekrar deneyebilirsin.",
                    primaryAction = "Tümünü Göster",
                    onPrimaryAction = {
                        viewModel.updateSearchQuery("")
                        viewModel.selectFilter(FavoriteFilter.ALL)
                    }
                )
                else -> FavoriteProductsGrid(
                    products = uiState.visibleFavorites,
                    isRefreshing = uiState.isRefreshing,
                    removingFavoriteIds = uiState.removingFavoriteIds,
                    addingToCartProductIds = uiState.addingToCartProductIds,
                    onRefresh = { viewModel.loadProducts(forceRefresh = true) },
                    onProductClick = onProductClick,
                    onRemove = viewModel::removeFavorite,
                    onAddToCart = { product ->
                        if (product.stock <= 0 || uiState.addingToCartProductIds.contains(product.id)) return@FavoriteProductsGrid
                        viewModel.setAddingToCart(product.id, true)
                        onAddToCart(product.toCartItem()) { success, message ->
                            viewModel.setAddingToCart(product.id, false)
                            val snackbarMessage = if (success) "Ürün sepete eklendi." else message
                            coroutineScope.launch {
                                snackbarHostState.showSnackbar(snackbarMessage)
                            }
                        }
                    }
                )
            }
        }
    }

    if (showSortSheet) {
        ModalBottomSheet(
            onDismissRequest = { showSortSheet = false },
            containerColor = CardBackground
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 20.dp)
                    .padding(bottom = 24.dp)
            ) {
                Text("Sırala", style = MaterialTheme.typography.titleLarge, color = NavyDark)
                Spacer(Modifier.height(12.dp))
                FavoriteSort.entries.forEach { sort ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(10.dp))
                            .clickable {
                                viewModel.selectSort(sort)
                                showSortSheet = false
                            }
                            .padding(vertical = 14.dp, horizontal = 12.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            sort.label,
                            modifier = Modifier.weight(1f),
                            color = if (uiState.selectedSort == sort) PrimaryOrange else NavyDark,
                            fontWeight = if (uiState.selectedSort == sort) FontWeight.Bold else FontWeight.Normal
                        )
                        if (uiState.selectedSort == sort) {
                            Surface(color = PrimaryOrange, shape = CircleShape, modifier = Modifier.size(8.dp)) {}
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun FavoritesHeader(
    favoriteCount: Int,
    searchQuery: String,
    selectedFilter: FavoriteFilter,
    selectedSort: FavoriteSort,
    onSearchQueryChange: (String) -> Unit,
    onFilterSelected: (FavoriteFilter) -> Unit,
    onSortClick: () -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(CardBackground)
            .padding(top = 12.dp, bottom = 10.dp)
    ) {
        Column(modifier = Modifier.padding(horizontal = 16.dp)) {
            Text("Favorilerim", style = MaterialTheme.typography.headlineMedium, color = NavyDark)
            Text(
                "$favoriteCount ürün favorilerinde",
                style = MaterialTheme.typography.bodySmall,
                color = TextSecondary
            )
            Spacer(Modifier.height(12.dp))
            TextField(
                value = searchQuery,
                onValueChange = onSearchQueryChange,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(52.dp)
                    .border(1.dp, BorderLight, RoundedCornerShape(12.dp)),
                placeholder = { Text("Favorilerinde ara", color = TextSecondary) },
                leadingIcon = { Icon(Icons.Default.Search, contentDescription = "Ara", tint = PrimaryOrange) },
                trailingIcon = {
                    if (searchQuery.isNotEmpty()) {
                        IconButton(onClick = { onSearchQueryChange("") }) {
                            Icon(Icons.Default.Close, contentDescription = "Aramayı temizle", tint = TextSecondary)
                        }
                    }
                },
                singleLine = true,
                shape = RoundedCornerShape(12.dp),
                colors = TextFieldDefaults.colors(
                    focusedContainerColor = PageBackground,
                    unfocusedContainerColor = PageBackground,
                    focusedIndicatorColor = Color.Transparent,
                    unfocusedIndicatorColor = Color.Transparent
                )
            )
        }
        Spacer(Modifier.height(10.dp))
        LazyRow(
            contentPadding = PaddingValues(horizontal = 16.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            item {
                FilterChip(
                    selected = false,
                    onClick = onSortClick,
                    label = { Text(if (selectedSort == FavoriteSort.NEWEST) "Sırala" else selectedSort.label) },
                    leadingIcon = { Icon(Icons.Default.Sort, contentDescription = null, modifier = Modifier.size(18.dp)) },
                    colors = favoriteChipColors(false),
                    border = FilterChipDefaults.filterChipBorder(
                        enabled = true,
                        selected = false,
                        borderColor = BorderLight,
                        selectedBorderColor = PrimaryOrange
                    )
                )
            }
            items(FavoriteFilter.entries) { filter ->
                val selected = selectedFilter == filter
                FilterChip(
                    selected = selected,
                    onClick = { onFilterSelected(filter) },
                    label = { Text(filter.label) },
                    colors = favoriteChipColors(selected),
                    border = FilterChipDefaults.filterChipBorder(
                        enabled = true,
                        selected = selected,
                        borderColor = BorderLight,
                        selectedBorderColor = PrimaryOrange
                    )
                )
            }
        }
    }
}

@Composable
private fun favoriteChipColors(selected: Boolean) = FilterChipDefaults.filterChipColors(
    containerColor = CardBackground,
    labelColor = NavyDark,
    iconColor = NavyDark,
    selectedContainerColor = PrimaryOrange.copy(alpha = 0.12f),
    selectedLabelColor = PrimaryOrange,
    selectedLeadingIconColor = PrimaryOrange
)

@Composable
private fun FavoriteProductsGrid(
    products: List<Product>,
    isRefreshing: Boolean,
    removingFavoriteIds: Set<Int>,
    addingToCartProductIds: Set<Int>,
    onRefresh: () -> Unit,
    onProductClick: (Int) -> Unit,
    onRemove: (Product) -> Unit,
    onAddToCart: (Product) -> Unit
) {
    val gridState = rememberLazyGridState()
    val refreshThreshold = with(LocalDensity.current) { 108.dp.toPx() }
    var pullDistance by remember { mutableFloatStateOf(0f) }
    val pullProgress = (pullDistance / refreshThreshold).coerceIn(0f, 1f)

    LaunchedEffect(isRefreshing) {
        if (!isRefreshing) pullDistance = 0f
    }

    val pullToRefreshConnection = remember(isRefreshing, refreshThreshold) {
        object : NestedScrollConnection {
            override fun onPreScroll(available: Offset, source: NestedScrollSource): Offset {
                val isAtTop = gridState.firstVisibleItemIndex == 0 && gridState.firstVisibleItemScrollOffset == 0
                if (isRefreshing || source != NestedScrollSource.UserInput) return Offset.Zero

                if (available.y > 0 && isAtTop) {
                    pullDistance = (pullDistance + available.y).coerceAtMost(refreshThreshold * 1.35f)
                } else if (available.y < 0 && pullDistance > 0f) {
                    pullDistance = (pullDistance + available.y).coerceAtLeast(0f)
                }
                return Offset.Zero
            }

            override suspend fun onPreFling(available: Velocity): Velocity {
                if (!isRefreshing && pullDistance >= refreshThreshold) {
                    onRefresh()
                } else {
                    pullDistance = 0f
                }
                return Velocity.Zero
            }
        }
    }

    Box(modifier = Modifier.fillMaxSize()) {
        LazyVerticalGrid(
            columns = GridCells.Fixed(2),
            state = gridState,
            modifier = Modifier
                .fillMaxSize()
                .nestedScroll(pullToRefreshConnection),
            contentPadding = PaddingValues(12.dp),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            items(products, key = { it.id }) { product ->
                FavoriteProductCard(
                    product = product,
                    isRemoving = removingFavoriteIds.contains(product.id),
                    isAddingToCart = addingToCartProductIds.contains(product.id),
                    onProductClick = { onProductClick(product.id) },
                    onRemove = { onRemove(product) },
                    onAddToCart = { onAddToCart(product) }
                )
            }
        }

        FavoritesPullRefreshIndicator(
            progress = pullProgress,
            isRefreshing = isRefreshing,
            modifier = Modifier.align(Alignment.TopCenter)
        )
    }
}

@Composable
private fun FavoritesPullRefreshIndicator(
    progress: Float,
    isRefreshing: Boolean,
    modifier: Modifier = Modifier
) {
    val visible = progress > 0f || isRefreshing
    val animatedAlpha by animateFloatAsState(
        targetValue = if (visible) 1f else 0f,
        animationSpec = tween(180),
        label = "favorites_pull_refresh_alpha"
    )
    val offsetY by animateDpAsState(
        targetValue = if (isRefreshing) 18.dp else (8 + (progress * 34)).dp,
        animationSpec = tween(180),
        label = "favorites_pull_refresh_offset"
    )
    val indicatorColor = PrimaryOrange.copy(alpha = if (progress >= 1f || isRefreshing) 1f else 0.32f)

    Surface(
        modifier = modifier
            .offset(y = offsetY)
            .alpha(animatedAlpha)
            .size(56.dp),
        shape = CircleShape,
        color = Color.White,
        shadowElevation = 6.dp
    ) {
        Box(contentAlignment = Alignment.Center, modifier = Modifier.fillMaxSize()) {
            if (isRefreshing) {
                CircularProgressIndicator(
                    modifier = Modifier.size(28.dp),
                    color = PrimaryOrange,
                    strokeWidth = 3.dp
                )
            } else {
                CircularProgressIndicator(
                    progress = { progress.coerceIn(0f, 1f) },
                    modifier = Modifier.size(28.dp),
                    color = indicatorColor,
                    trackColor = PrimaryOrange.copy(alpha = 0.12f),
                    strokeWidth = 3.dp
                )
            }
        }
    }
}

@Composable
private fun FavoriteProductCard(
    product: Product,
    isRemoving: Boolean,
    isAddingToCart: Boolean,
    onProductClick: () -> Unit,
    onRemove: () -> Unit,
    onAddToCart: () -> Unit
) {
    val context = LocalContext.current
    val imageUrl = optimizedImageUrl(product.imageUrl, width = 520, height = 520)
    val imageRequest = remember(context, imageUrl) {
        ImageRequest.Builder(context).data(imageUrl).build()
    }
    val isDiscounted = product.oldPrice != null && product.oldPrice > product.price
    val isInStock = product.stock > 0

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onProductClick),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = CardBackground),
        border = androidx.compose.foundation.BorderStroke(1.dp, BorderLight),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
    ) {
        Column(modifier = Modifier.padding(10.dp)) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .aspectRatio(1f)
                    .clip(RoundedCornerShape(10.dp))
                    .background(PageBackground)
            ) {
                AsyncImage(
                    model = imageRequest,
                    contentDescription = product.name,
                    contentScale = ContentScale.Fit,
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(8.dp)
                )
                if (isDiscounted) {
                    Surface(
                        modifier = Modifier
                            .align(Alignment.TopStart)
                            .padding(6.dp),
                        color = DiscountGreen,
                        shape = RoundedCornerShape(6.dp)
                    ) {
                        Text(
                            "%${product.discountPercentage} indirim",
                            color = Color.White,
                            fontWeight = FontWeight.Bold,
                            fontSize = 11.sp,
                            modifier = Modifier.padding(horizontal = 6.dp, vertical = 4.dp)
                        )
                    }
                }
                Surface(
                    modifier = Modifier
                        .align(Alignment.TopEnd)
                        .padding(4.dp),
                    color = CardBackground,
                    shape = CircleShape,
                    shadowElevation = 1.dp
                ) {
                    IconButton(
                        onClick = onRemove,
                        enabled = !isRemoving,
                        modifier = Modifier
                            .size(38.dp)
                            .semantics { contentDescription = "Favorilerden kaldır" }
                    ) {
                        if (isRemoving) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(18.dp),
                                strokeWidth = 2.dp,
                                color = Error
                            )
                        } else {
                            Icon(Icons.Default.Favorite, contentDescription = null, tint = Error)
                        }
                    }
                }
            }
            Spacer(Modifier.height(8.dp))
            Text(
                product.category,
                color = PrimaryOrange,
                style = MaterialTheme.typography.labelMedium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
            Text(
                product.name,
                color = NavyDark,
                fontWeight = FontWeight.SemiBold,
                style = MaterialTheme.typography.bodyMedium,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.height(40.dp)
            )
            Spacer(Modifier.height(6.dp))
            Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                Text(
                    formatPrice(product.price),
                    color = if (isDiscounted) DiscountGreen else StoreBlue,
                    fontWeight = FontWeight.ExtraBold,
                    style = MaterialTheme.typography.titleMedium
                )
                product.oldPrice?.takeIf { it > product.price }?.let {
                    Text(
                        formatPrice(it),
                        color = TextSecondary,
                        fontSize = 11.sp,
                        textDecoration = TextDecoration.LineThrough,
                        maxLines = 1
                    )
                }
            }
            Spacer(Modifier.height(5.dp))
            Text(
                text = when {
                    product.stock <= 0 -> "Tükendi"
                    product.stock <= 3 -> "Son ${product.stock} ürün"
                    else -> "Stokta var"
                },
                color = when {
                    product.stock <= 0 -> Error
                    product.stock <= 3 -> PrimaryOrange
                    else -> DiscountGreen
                },
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.SemiBold
            )
            Spacer(Modifier.height(8.dp))
            Button(
                onClick = onAddToCart,
                enabled = isInStock && !isAddingToCart,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(40.dp)
                    .semantics { contentDescription = "Sepete ekle" },
                shape = RoundedCornerShape(10.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = PrimaryOrange,
                    disabledContainerColor = DisabledBackground,
                    disabledContentColor = TextSecondary
                ),
                contentPadding = PaddingValues(horizontal = 6.dp)
            ) {
                if (isAddingToCart) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(17.dp),
                        strokeWidth = 2.dp,
                        color = Color.White
                    )
                } else {
                    Icon(Icons.Default.ShoppingCart, contentDescription = null, modifier = Modifier.size(17.dp))
                    Spacer(Modifier.width(5.dp))
                    Text(if (isInStock) "Sepete Ekle" else "Tükendi", fontWeight = FontWeight.Bold, fontSize = 12.sp)
                }
            }
        }
    }
}

@Composable
private fun FavoritesMessageState(
    icon: @Composable () -> Unit,
    title: String,
    subtitle: String,
    primaryAction: String,
    onPrimaryAction: () -> Unit,
    secondaryAction: String? = null,
    onSecondaryAction: (() -> Unit)? = null
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 28.dp, vertical = 32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Surface(
            color = PrimaryOrange.copy(alpha = 0.12f),
            shape = CircleShape,
            modifier = Modifier.size(88.dp)
        ) {
            Box(
                modifier = Modifier.padding(22.dp),
                contentAlignment = Alignment.Center
            ) {
                androidx.compose.runtime.CompositionLocalProvider(
                    androidx.compose.material3.LocalContentColor provides PrimaryOrange,
                    content = icon
                )
            }
        }
        Spacer(Modifier.height(18.dp))
        Text(title, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, color = NavyDark)
        Spacer(Modifier.height(8.dp))
        Text(
            subtitle,
            style = MaterialTheme.typography.bodyMedium,
            color = TextSecondary,
            modifier = Modifier.fillMaxWidth(),
            textAlign = TextAlign.Center,
            maxLines = 3
        )
        Spacer(Modifier.height(22.dp))
        Button(
            onClick = onPrimaryAction,
            colors = ButtonDefaults.buttonColors(containerColor = PrimaryOrange),
            shape = RoundedCornerShape(12.dp),
            modifier = Modifier.fillMaxWidth()
        ) {
            Text(primaryAction, fontWeight = FontWeight.Bold)
        }
        if (secondaryAction != null && onSecondaryAction != null) {
            Spacer(Modifier.height(8.dp))
            OutlinedButton(
                onClick = onSecondaryAction,
                shape = RoundedCornerShape(12.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                Text(secondaryAction, color = StoreBlue, fontWeight = FontWeight.Bold)
            }
        }
    }
}

@Composable
private fun FavoritesSkeleton() {
    LazyVerticalGrid(
        columns = GridCells.Fixed(2),
        contentPadding = PaddingValues(12.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        items(6) {
            Card(
                shape = RoundedCornerShape(12.dp),
                colors = CardDefaults.cardColors(containerColor = CardBackground),
                border = androidx.compose.foundation.BorderStroke(1.dp, BorderLight)
            ) {
                Column(modifier = Modifier.padding(10.dp)) {
                    SkeletonBlock(Modifier.fillMaxWidth().aspectRatio(1f))
                    Spacer(Modifier.height(10.dp))
                    SkeletonBlock(Modifier.fillMaxWidth(0.45f).height(12.dp))
                    Spacer(Modifier.height(7.dp))
                    SkeletonBlock(Modifier.fillMaxWidth().height(14.dp))
                    Spacer(Modifier.height(7.dp))
                    SkeletonBlock(Modifier.fillMaxWidth(0.6f).height(18.dp))
                    Spacer(Modifier.height(10.dp))
                    SkeletonBlock(Modifier.fillMaxWidth().height(40.dp))
                }
            }
        }
    }
}

@Composable
private fun SkeletonBlock(modifier: Modifier) {
    Box(modifier = modifier.clip(RoundedCornerShape(8.dp)).background(DisabledBackground))
}

private fun Product.toCartItem() = CartItem(
    productId = id,
    name = name,
    price = price,
    imageUrl = imageUrl,
    quantity = 1
)

private fun formatPrice(price: Double): String {
    val formatter = NumberFormat.getNumberInstance(Locale("tr", "TR")).apply {
        minimumFractionDigits = 2
        maximumFractionDigits = 2
    }
    return "${formatter.format(price)} TL"
}
