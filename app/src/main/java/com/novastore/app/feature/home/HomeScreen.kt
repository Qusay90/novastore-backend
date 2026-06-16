package com.novastore.app.feature.home

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.animation.togetherWith
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.grid.rememberLazyGridState
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.PagerDefaults
import androidx.compose.foundation.pager.PagerSnapDistance
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AddShoppingCart
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Sort
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material.icons.filled.ShoppingCart
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.outlined.StarOutline
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.nestedscroll.NestedScrollConnection
import androidx.compose.ui.input.nestedscroll.NestedScrollSource
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.unit.Velocity
import androidx.compose.ui.window.Dialog
import androidx.hilt.navigation.compose.hiltViewModel
import com.novastore.app.R
import coil3.compose.AsyncImage
import coil3.imageLoader
import coil3.request.ImageRequest
import com.novastore.app.core.theme.NavyDark
import com.novastore.app.core.theme.NavyMid
import com.novastore.app.core.theme.Orange
import com.novastore.app.core.ui.optimizedImageUrl
import com.novastore.app.data.local.TurkeyLocations
import com.novastore.app.data.model.CartItem
import com.novastore.app.data.model.CustomerAddress
import com.novastore.app.data.model.Product
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import timber.log.Timber

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(
    onProductClick: (Int) -> Unit,
    onAddToCart: (CartItem) -> Unit,
    onNotificationsClick: () -> Unit,
    refreshToken: Int = 0,
    resetPositionToken: Int = 0,
    onCatalogInteraction: () -> Unit = {},
    modifier: Modifier = Modifier,
    viewModel: HomeViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()
    val favoriteIds by viewModel.favoriteIds.collectAsState()
    val addresses by viewModel.addresses.collectAsState()
    val selectedAddressId by viewModel.selectedAddressId.collectAsState()
    val selectedAddress = addresses.firstOrNull { it.id == selectedAddressId } ?: addresses.firstOrNull()
    var showAddressDialog by remember { mutableStateOf(false) }

    LaunchedEffect(refreshToken) {
        if (refreshToken > 0) {
            viewModel.loadData(forceRefresh = true)
        }
    }

    Scaffold(
        topBar = {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(Color.White)
                    .padding(horizontal = 16.dp, vertical = 6.dp)
            ) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(42.dp)
                ) {
                    // Left side: Address
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier
                            .align(Alignment.CenterStart)
                            .clip(RoundedCornerShape(8.dp))
                            .clickable { showAddressDialog = true }
                            .padding(end = 8.dp, top = 6.dp, bottom = 6.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Default.LocationOn,
                            contentDescription = "Adres",
                            tint = Orange,
                            modifier = Modifier.size(16.dp)
                        )
                        Spacer(modifier = Modifier.width(4.dp))
                        Text(
                            text = selectedAddress?.title ?: "Adres Ekle",
                            style = MaterialTheme.typography.labelSmall,
                            color = NavyDark,
                            fontWeight = FontWeight.Medium
                        )
                    }

                    // Center: Logo
                    Text(
                        text = androidx.compose.ui.text.buildAnnotatedString {
                            withStyle(androidx.compose.ui.text.SpanStyle(color = NavyDark)) {
                                append("Nova")
                            }
                            withStyle(androidx.compose.ui.text.SpanStyle(color = Orange)) {
                                append("Store")
                            }
                        },
                        style = MaterialTheme.typography.headlineMedium.copy(
                            fontWeight = FontWeight.Black,
                            letterSpacing = (-0.5).sp
                        ),
                        modifier = Modifier.align(Alignment.Center)
                    )

                    // Right side: Notifications
                    IconButton(
                        onClick = onNotificationsClick,
                        modifier = Modifier
                            .size(32.dp)
                            .align(Alignment.CenterEnd)
                    ) {
                        Icon(
                            imageVector = Icons.Outlined.Notifications,
                            contentDescription = "Bildirimler",
                            tint = NavyDark,
                            modifier = Modifier.size(24.dp)
                        )
                    }
                }
                
                Spacer(modifier = Modifier.height(4.dp))
                
                SearchBar(
                    query = uiState.searchQuery,
                    onQueryChange = {
                        onCatalogInteraction()
                        viewModel.updateSearchQuery(it)
                    }
                )
            }
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
                ErrorState(message = uiState.error!!, onRetry = { viewModel.loadData(forceRefresh = true) })
            } else {
                ProductCatalogGrid(
                    uiState = uiState,
                    onCategorySelect = {
                        onCatalogInteraction()
                        viewModel.selectCategory(it)
                    },
                    onFilterSelect = {
                        onCatalogInteraction()
                        viewModel.selectFilter(it)
                    },
                    onSortSelect = {
                        onCatalogInteraction()
                        viewModel.selectSort(it)
                    },
                    onResetCatalog = { viewModel.resetCatalogPosition() },
                    onProductClick = onProductClick,
                    onAddToCart = onAddToCart,
                    favoriteIds = favoriteIds,
                    onToggleFavorite = viewModel::toggleFavorite,
                    isRefreshing = uiState.isRefreshing,
                    pullRefreshEnabled = !showAddressDialog,
                    onRefresh = { viewModel.loadData(forceRefresh = true) },
                    resetPositionToken = resetPositionToken
                )
            }
        }
    }

    if (showAddressDialog) {
        AddressPickerDialog(
            addresses = addresses,
            selectedAddressId = selectedAddress?.id,
            sessionPhone = viewModel.currentUserPhone,
            onDismiss = { showAddressDialog = false },
            onSelect = {
                viewModel.selectAddress(it)
                showAddressDialog = false
            },
            onSave = {
                viewModel.saveAddress(it)
                showAddressDialog = false
            }
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ProductCatalogGrid(
    uiState: HomeUiState,
    onCategorySelect: (String?) -> Unit,
    onFilterSelect: (HomeProductFilter) -> Unit,
    onSortSelect: (HomeProductSort) -> Unit,
    onResetCatalog: () -> Unit,
    onProductClick: (Int) -> Unit,
    onAddToCart: (CartItem) -> Unit,
    favoriteIds: Set<Int>,
    onToggleFavorite: (Int) -> Unit,
    isRefreshing: Boolean,
    pullRefreshEnabled: Boolean,
    onRefresh: () -> Unit,
    resetPositionToken: Int
) {
    val discountedProducts = remember(uiState.products) {
        uiState.products.filter { it.discountPercentage > 0 }.take(6)
    }
    val filteredProducts = remember(
        uiState.products,
        uiState.selectedCategory,
        uiState.searchQuery
    ) {
        uiState.filteredProducts
    }
    val context = LocalContext.current
    val coroutineScope = rememberCoroutineScope()
    var showSortSheet by remember { mutableStateOf(false) }
    LaunchedEffect(filteredProducts) {
        filteredProducts.take(24).forEach { product ->
            val imageUrl = optimizedImageUrl(product.imageUrl, width = 520, height = 520)
            if (!imageUrl.isNullOrBlank()) {
                context.imageLoader.enqueue(
                    ImageRequest.Builder(context)
                        .data(imageUrl)
                        .build()
                )
            }
        }
    }
    val gridState = rememberLazyGridState()
    val refreshThreshold = with(LocalDensity.current) { 108.dp.toPx() }
    var pullDistance by remember { mutableFloatStateOf(0f) }
    val pullProgress = (pullDistance / refreshThreshold).coerceIn(0f, 1f)

    LaunchedEffect(resetPositionToken) {
        if (resetPositionToken > 0) {
            onResetCatalog()
            pullDistance = 0f
            gridState.animateScrollToItem(0)
        }
    }

    LaunchedEffect(isRefreshing) {
        if (!isRefreshing) pullDistance = 0f
    }

    val pullToRefreshConnection = remember(pullRefreshEnabled, isRefreshing, refreshThreshold) {
        object : NestedScrollConnection {
            override fun onPreScroll(available: Offset, source: NestedScrollSource): Offset {
                val isAtTop = gridState.firstVisibleItemIndex == 0 && gridState.firstVisibleItemScrollOffset == 0
                if (!pullRefreshEnabled || isRefreshing || source != NestedScrollSource.UserInput) return Offset.Zero

                if (available.y > 0 && isAtTop) {
                    pullDistance = (pullDistance + available.y).coerceAtMost(refreshThreshold * 1.35f)
                } else if (available.y < 0 && pullDistance > 0f) {
                    pullDistance = (pullDistance + available.y).coerceAtLeast(0f)
                }
                return Offset.Zero
            }

            override suspend fun onPreFling(available: Velocity): Velocity {
                if (pullRefreshEnabled && !isRefreshing && pullDistance >= refreshThreshold) {
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
                .nestedScroll(pullToRefreshConnection)
                .padding(horizontal = 16.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
        // 1. Category Row
        item(span = { GridItemSpan(2) }) {
            CategoryFilterRow(
                categories = uiState.categories.map { it.name },
                selectedCategory = uiState.selectedCategory,
                onCategorySelect = onCategorySelect
            )
        }

        item(span = { GridItemSpan(2) }) {
            HomeFilterRow(
                selectedFilter = uiState.selectedFilter,
                selectedSort = uiState.selectedSort,
                onFilterSelect = onFilterSelect,
                onSortClick = { showSortSheet = true }
            )
        }

        // 2. Dynamic Deals Strip
        if (discountedProducts.isNotEmpty() && uiState.selectedCategory == null && uiState.searchQuery.isEmpty()) {
            item(span = { GridItemSpan(2) }) {
                HorizontalDealsSection(
                    products = discountedProducts,
                    onProductClick = onProductClick
                )
            }
        }

        // 4. Products Grid Title
        item(span = { GridItemSpan(2) }) {
            Text(
                text = if (uiState.selectedCategory != null) "${uiState.selectedCategory} Ürünleri" else "Yeni Gelenler",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                color = NavyDark,
                modifier = Modifier.padding(vertical = 4.dp)
            )
        }

        // 5. Empty State Check
        if (filteredProducts.isEmpty()) {
            item(span = { GridItemSpan(2) }) {
                EmptyState()
            }
        } else {
            // 6. Products Grid
            items(filteredProducts, key = { it.id }) { product ->
                ProductCard(
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

        PullRefreshIndicator(
            progress = pullProgress,
            isRefreshing = isRefreshing,
            modifier = Modifier.align(Alignment.TopCenter)
        )

        if (showSortSheet) {
            ModalBottomSheet(
                onDismissRequest = { showSortSheet = false },
                containerColor = Color.White
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 20.dp)
                        .padding(bottom = 24.dp)
                ) {
                    Text("Sırala", style = MaterialTheme.typography.titleLarge, color = NavyDark)
                    Spacer(Modifier.height(12.dp))
                    HomeProductSort.entries.forEach { sort ->
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(10.dp))
                                .clickable {
                                    onSortSelect(sort)
                                    showSortSheet = false
                                    coroutineScope.launch { gridState.animateScrollToItem(0) }
                                }
                                .padding(vertical = 14.dp, horizontal = 12.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                sort.label,
                                modifier = Modifier.weight(1f),
                                color = if (uiState.selectedSort == sort) Orange else NavyDark,
                                fontWeight = if (uiState.selectedSort == sort) FontWeight.Bold else FontWeight.Normal
                            )
                            if (uiState.selectedSort == sort) {
                                Surface(color = Orange, shape = CircleShape, modifier = Modifier.size(8.dp)) {}
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun PullRefreshIndicator(
    progress: Float,
    isRefreshing: Boolean,
    modifier: Modifier = Modifier
) {
    val visible = progress > 0f || isRefreshing
    val animatedAlpha by animateFloatAsState(
        targetValue = if (visible) 1f else 0f,
        animationSpec = tween(180),
        label = "pull_refresh_alpha"
    )
    val offsetY by animateDpAsState(
        targetValue = if (isRefreshing) 18.dp else (8 + (progress * 34)).dp,
        animationSpec = tween(180),
        label = "pull_refresh_offset"
    )
    val indicatorColor = Orange.copy(alpha = if (progress >= 1f || isRefreshing) 1f else 0.32f)

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
                    color = Orange,
                    strokeWidth = 3.dp
                )
            } else {
                CircularProgressIndicator(
                    progress = { progress.coerceIn(0f, 1f) },
                    modifier = Modifier.size(28.dp),
                    color = indicatorColor,
                    trackColor = Orange.copy(alpha = 0.12f),
                    strokeWidth = 3.dp
                )
            }
        }
    }
}

@Composable
private fun SearchBar(
    query: String,
    onQueryChange: (String) -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(40.dp)
            .background(Color(0xFFF8FAFC), RoundedCornerShape(12.dp))
            .border(1.dp, Color(0xFFE2E8F0), RoundedCornerShape(12.dp))
            .padding(horizontal = 12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(Icons.Default.Search, contentDescription = "Ara", tint = Orange, modifier = Modifier.size(20.dp))
        Spacer(modifier = Modifier.width(8.dp))
        androidx.compose.foundation.text.BasicTextField(
            value = query,
            onValueChange = onQueryChange,
            modifier = Modifier.weight(1f),
            singleLine = true,
            textStyle = androidx.compose.ui.text.TextStyle(fontSize = 13.sp, color = NavyDark),
            decorationBox = { innerTextField ->
                if (query.isEmpty()) {
                    Text("Ürün, marka veya kategori ara...", fontSize = 13.sp, color = Color.Gray)
                }
                innerTextField()
            }
        )
        if (query.isNotEmpty()) {
            IconButton(onClick = { onQueryChange("") }, modifier = Modifier.size(24.dp)) {
                Icon(Icons.Default.Clear, contentDescription = "Temizle", tint = Color.Gray, modifier = Modifier.size(16.dp))
            }
        } else {
            Icon(Icons.Default.CameraAlt, contentDescription = "Scan", tint = Color.Gray, modifier = Modifier.size(20.dp))
        }
    }
}

@Composable
private fun CategoryFilterRow(
    categories: List<String>,
    selectedCategory: String?,
    onCategorySelect: (String?) -> Unit
) {
    LazyRow(
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp)
    ) {
        item {
            CategoryChip(
                name = "Tümü",
                isSelected = selectedCategory == null,
                onClick = { onCategorySelect(null) }
            )
        }
        items(categories) { categoryName ->
            CategoryChip(
                name = categoryName,
                isSelected = selectedCategory == categoryName,
                onClick = { onCategorySelect(categoryName) }
            )
        }
    }
}

@Composable
private fun HomeFilterRow(
    selectedFilter: HomeProductFilter,
    selectedSort: HomeProductSort,
    onFilterSelect: (HomeProductFilter) -> Unit,
    onSortClick: () -> Unit
) {
    LazyRow(
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        modifier = Modifier
            .fillMaxWidth()
            .padding(bottom = 4.dp)
    ) {
        item {
            FilterChip(
                selected = selectedSort != HomeProductSort.FEATURED,
                onClick = onSortClick,
                label = { Text(if (selectedSort == HomeProductSort.FEATURED) "Sırala" else selectedSort.label) },
                leadingIcon = { Icon(Icons.Default.Sort, contentDescription = null, modifier = Modifier.size(18.dp)) },
                colors = homeFilterChipColors(selectedSort != HomeProductSort.FEATURED),
                border = FilterChipDefaults.filterChipBorder(
                    enabled = true,
                    selected = selectedSort != HomeProductSort.FEATURED,
                    borderColor = Color(0xFFE2E8F0),
                    selectedBorderColor = Orange
                )
            )
        }
        items(HomeProductFilter.entries) { filter ->
            val selected = selectedFilter == filter
            FilterChip(
                selected = selected,
                onClick = { onFilterSelect(filter) },
                label = { Text(filter.label) },
                colors = homeFilterChipColors(selected),
                border = FilterChipDefaults.filterChipBorder(
                    enabled = true,
                    selected = selected,
                    borderColor = Color(0xFFE2E8F0),
                    selectedBorderColor = Orange
                )
            )
        }
    }
}

@Composable
private fun homeFilterChipColors(selected: Boolean) = FilterChipDefaults.filterChipColors(
    containerColor = Color.White,
    labelColor = NavyDark,
    iconColor = NavyDark,
    selectedContainerColor = Orange.copy(alpha = 0.10f),
    selectedLabelColor = Orange,
    selectedLeadingIconColor = Orange
)

@Composable
private fun CategoryChip(
    name: String,
    isSelected: Boolean,
    onClick: () -> Unit
) {
    Surface(
        modifier = Modifier
            .clip(RoundedCornerShape(8.dp))
            .clickable(onClick = onClick),
        shape = RoundedCornerShape(8.dp),
        color = if (isSelected) Orange.copy(alpha = 0.08f) else Color.White,
        border = BorderStroke(
            width = 1.dp,
            color = if (isSelected) Orange else Color(0xFFE2E8F0)
        )
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.padding(horizontal = 14.dp, vertical = 8.dp)
        ) {
            if (isSelected) {
                Box(
                    modifier = Modifier
                        .size(6.dp)
                        .clip(CircleShape)
                        .background(Orange)
                )
                Spacer(modifier = Modifier.width(6.dp))
            }
            Text(
                text = name,
                style = MaterialTheme.typography.labelLarge.copy(fontSize = 12.sp),
                fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Medium,
                color = if (isSelected) Orange else NavyDark
            )
        }
    }
}

@Composable
private fun HeroBanner() {
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
                        colors = listOf(NavyDark, NavyMid, Color(0xFF1E3A5F))
                    )
                )
                .padding(14.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxSize(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(
                    modifier = Modifier.weight(1.3f),
                    verticalArrangement = Arrangement.Center
                ) {
                    Box(
                        modifier = Modifier
                            .background(Orange, RoundedCornerShape(4.dp))
                            .padding(horizontal = 6.dp, vertical = 2.dp)
                    ) {
                        Text(
                            "HAFTANIN YILDIZLARI",
                            style = MaterialTheme.typography.labelSmall.copy(fontSize = 8.sp),
                            color = Color.White,
                            fontWeight = FontWeight.Bold
                        )
                    }
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        "Teknoloji Ürünlerinde Büyük Fırsat!",
                        style = MaterialTheme.typography.titleMedium.copy(fontSize = 14.sp),
                        color = Color.White,
                        fontWeight = FontWeight.Bold
                    )
                    Text(
                        "Sınırlı süre için sepette ekstra indirimler.",
                        style = MaterialTheme.typography.bodySmall.copy(fontSize = 10.sp),
                        color = Color.White.copy(alpha = 0.8f)
                    )
                }

                Button(
                    onClick = {},
                    colors = ButtonDefaults.buttonColors(containerColor = Orange),
                    shape = RoundedCornerShape(8.dp),
                    contentPadding = PaddingValues(horizontal = 10.dp, vertical = 6.dp),
                    modifier = Modifier.weight(0.7f)
                ) {
                    Text(
                        "Keşfet ➜",
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color.White
                    )
                }
            }
        }
    }
}

@Composable
private fun HorizontalDealsSection(
    products: List<Product>,
    onProductClick: (Int) -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 8.dp)
            .background(Color(0xFFFEF3C7).copy(alpha = 0.4f), RoundedCornerShape(12.dp))
            .padding(12.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    "🔥 Günün Fırsatları",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    color = Color(0xFFD97706)
                )
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
        }
        
        Spacer(modifier = Modifier.height(10.dp))
        
        LazyRow(
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            modifier = Modifier.fillMaxWidth()
        ) {
            items(products) { product ->
                HorizontalDealCard(
                    product = product,
                    onClick = { onProductClick(product.id) }
                )
            }
        }
    }
}

@Composable
private fun HorizontalDealCard(
    product: Product,
    onClick: () -> Unit
) {
    val context = LocalContext.current
    val imageUrl = optimizedImageUrl(product.imageUrl, width = 260, height = 180)
    val imageRequest = remember(context, imageUrl) {
        ImageRequest.Builder(context)
            .data(imageUrl)
            .build()
    }

    Card(
        modifier = Modifier
            .width(130.dp)
            .clickable(onClick = onClick),
        shape = RoundedCornerShape(8.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        border = BorderStroke(1.dp, Color(0xFFFEF3C7))
    ) {
        Column(modifier = Modifier.padding(8.dp)) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(90.dp),
                contentAlignment = Alignment.Center
            ) {
                AsyncImage(
                    model = imageRequest,
                    contentDescription = null,
                    contentScale = ContentScale.Fit,
                    modifier = Modifier.fillMaxSize()
                )
                Box(
                    modifier = Modifier
                        .align(Alignment.TopStart)
                        .background(Orange, RoundedCornerShape(4.dp))
                        .padding(horizontal = 4.dp, vertical = 1.dp)
                ) {
                    Text(
                        "-%${product.discountPercentage}",
                        color = Color.White,
                        fontSize = 9.sp,
                        fontWeight = FontWeight.Bold
                    )
                }
            }
            
            Spacer(modifier = Modifier.height(6.dp))
            
            Text(
                text = product.name,
                style = MaterialTheme.typography.bodySmall.copy(fontSize = 11.sp),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                fontWeight = FontWeight.Medium,
                color = NavyDark
            )
            
            Spacer(modifier = Modifier.height(2.dp))
            
            Text(
                text = "${product.price} TL",
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.Bold,
                color = Orange
            )
        }
    }
}

@Composable
private fun ProductCard(
    product: Product,
    onProductClick: (Int) -> Unit,
    onAddToCart: (CartItem) -> Unit,
    isFavorite: Boolean,
    onToggleFavorite: (Int) -> Unit
) {
    // Build full image list from imageUrl + media
    val allImages = remember(product.id, product.imageUrl, product.media) {
        val list = mutableListOf<String>()
        product.imageUrl?.takeIf { it.isNotBlank() }?.let { list.add(it) }
        product.media.map { it.mediaUrl }.forEach { url ->
            if (url.isNotBlank() && !list.contains(url)) list.add(url)
        }
        if (list.isEmpty()) list.add("")
        list.take(4)
    }
    val context = LocalContext.current
    val pagerState = rememberPagerState(pageCount = { allImages.size })

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
                    HorizontalPager(
                        state = pagerState,
                        modifier = Modifier.fillMaxSize(),
                        beyondViewportPageCount = 0,
                        flingBehavior = PagerDefaults.flingBehavior(
                            state = pagerState,
                            pagerSnapDistance = PagerSnapDistance.atMost(1)
                        )
                    ) { page ->
                        val imageUrl = remember(allImages, page) {
                            optimizedImageUrl(allImages[page], width = 360, height = 360)
                        }
                        val imageRequest = remember(context, imageUrl) {
                            ImageRequest.Builder(context)
                                .data(imageUrl)
                                .build()
                        }
                        AsyncImage(
                            model = imageRequest,
                            contentDescription = stringResource(
                                R.string.home_product_image_content_description,
                                product.name,
                                page + 1
                            ),
                            contentScale = ContentScale.Crop,
                            modifier = Modifier.fillMaxSize()
                        )
                    }

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
                                        .size(if (index == pagerState.currentPage) 7.dp else 5.dp)
                                        .clip(CircleShape)
                                        .background(
                                            if (index == pagerState.currentPage) TealGreen else Color.LightGray.copy(alpha = 0.6f)
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
                        Timber.d("Favorite toggled for product ${product.id}")
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
                // Product Name — always 2 lines for consistent card height
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

                // Discount Row — always reserves space for consistent height
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

                    // Cart Button (no border, plain icon with cart→check animation)
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
                                label = "cart_check_anim"
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
private fun AddressPickerDialog(
    addresses: List<CustomerAddress>,
    selectedAddressId: Long?,
    sessionPhone: String = "",
    onDismiss: () -> Unit,
    onSelect: (Long) -> Unit,
    onSave: (CustomerAddress) -> Unit
) {
    var title by remember { mutableStateOf("") }
    var fullName by remember { mutableStateOf("") }
    var phone by remember { mutableStateOf(sessionPhone) }
    var city by remember { mutableStateOf("") }
    var district by remember { mutableStateOf("") }
    var detail by remember { mutableStateOf("") }
    var attemptedSubmit by remember { mutableStateOf(false) }
    var isSaving by remember { mutableStateOf(false) }
    var pickerMode by remember { mutableStateOf<LocationPickerMode?>(null) }
    var localError by remember { mutableStateOf<String?>(null) }

    val phoneValid = phone.length == 11 && phone.startsWith("05")
    val formValid = title.isNotBlank() && fullName.isNotBlank() && phoneValid && city.isNotBlank() && district.isNotBlank() && detail.isNotBlank()

    BackHandler(onBack = onDismiss)

    Dialog(onDismissRequest = onDismiss) {
        Surface(
            shape = RoundedCornerShape(24.dp),
            color = Color(0xFFFBFCFF),
            shadowElevation = 10.dp,
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 10.dp)
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(max = 680.dp)
                    .padding(18.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp)
            ) {
                Text("Adreslerim", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.ExtraBold, color = NavyDark)

                if (addresses.isNotEmpty()) {
                    LazyColumn(
                        modifier = Modifier.heightIn(max = 150.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        items(addresses, key = { it.id }) { address ->
                            Surface(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clip(RoundedCornerShape(14.dp))
                                    .clickable { onSelect(address.id) },
                                color = if (address.id == selectedAddressId) Orange.copy(alpha = 0.10f) else Color.White,
                                border = BorderStroke(1.dp, if (address.id == selectedAddressId) Orange else Color(0xFFE6EAF0)),
                                shape = RoundedCornerShape(14.dp)
                            ) {
                                Column(modifier = Modifier.padding(12.dp)) {
                                    Text(address.title, fontWeight = FontWeight.Bold, color = NavyDark)
                                    Text(address.singleLine, style = MaterialTheme.typography.bodySmall, color = Color(0xFF6B7280), maxLines = 2)
                                }
                            }
                        }
                    }
                    HorizontalDivider(color = Color(0xFFE8EDF3))
                }

                Text("Yeni adres ekle", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = NavyDark)

                Column(
                    modifier = Modifier
                        .weight(1f, fill = false)
                        .verticalScroll(rememberScrollState()),
                    verticalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    AddressTextField(value = title, onValueChange = { title = it }, label = "Başlık", placeholder = "Ev, İş")
                    FormError(show = attemptedSubmit && title.isBlank(), text = "Başlık zorunlu.")

                    AddressTextField(value = fullName, onValueChange = { fullName = it }, label = "Alıcı adı", placeholder = "Ad Soyad")
                    FormError(show = attemptedSubmit && fullName.isBlank(), text = "Alıcı adı zorunlu.")

                    AddressTextField(
                        value = phone,
                        onValueChange = { phone = it.filter(Char::isDigit).take(11) },
                        label = "Telefon",
                        placeholder = "05XXXXXXXXX",
                        keyboardType = KeyboardType.Phone,
                        isError = attemptedSubmit && !phoneValid
                    )
                    FormError(show = attemptedSubmit && !phoneValid, text = "Telefon 05 ile başlayan 11 haneli sayı olmalı.")

                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        SelectionField(
                            value = city,
                            label = "İl",
                            placeholder = "İl seç",
                            modifier = Modifier.weight(1f),
                            onClick = { pickerMode = LocationPickerMode.Province }
                        )
                        SelectionField(
                            value = district,
                            label = "İlçe",
                            placeholder = if (city.isBlank()) "Önce il" else "İlçe seç",
                            enabled = city.isNotBlank(),
                            modifier = Modifier.weight(1f),
                            onClick = {
                                if (city.isBlank()) localError = "Lütfen önce il seçin." else pickerMode = LocationPickerMode.District
                            }
                        )
                    }
                    FormError(show = attemptedSubmit && city.isBlank(), text = "İl seçimi zorunlu.")
                    FormError(show = attemptedSubmit && district.isBlank(), text = "İlçe seçimi zorunlu.")

                    AddressTextField(
                        value = detail,
                        onValueChange = { detail = it },
                        label = "Açık adres",
                        placeholder = "Mahalle, cadde, sokak, bina ve daire no",
                        minLines = 3
                    )
                    FormError(show = attemptedSubmit && detail.isBlank(), text = "Açık adres zorunlu.")

                    localError?.let { Text(it, color = Color(0xFFEA5455), style = MaterialTheme.typography.bodySmall) }
                }

                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    OutlinedButton(
                        onClick = onDismiss,
                        modifier = Modifier.weight(1f),
                        shape = RoundedCornerShape(14.dp)
                    ) {
                        Text("Kapat", color = NavyDark, fontWeight = FontWeight.Bold)
                    }
                    Button(
                        onClick = {
                            attemptedSubmit = true
                            localError = null
                            if (!formValid || isSaving) return@Button
                            isSaving = true
                            onSave(
                                CustomerAddress(
                                    id = 0L,
                                    title = title.trim(),
                                    fullName = fullName.trim(),
                                    phone = phone,
                                    city = city,
                                    district = district,
                                    detail = detail.trim()
                                )
                            )
                        },
                        modifier = Modifier.weight(1f),
                        enabled = formValid && !isSaving,
                        colors = ButtonDefaults.buttonColors(containerColor = Orange, disabledContainerColor = Color(0xFFD7DBE2)),
                        shape = RoundedCornerShape(14.dp)
                    ) {
                        if (isSaving) {
                            CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp, color = Color.White)
                        } else {
                            Text("Kaydet", fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }
        }
    }

    pickerMode?.let { mode ->
        val items = if (mode == LocationPickerMode.Province) TurkeyLocations.provinces else TurkeyLocations.districtsFor(city)
        LocationSelectionDialog(
            title = if (mode == LocationPickerMode.Province) "İl Seç" else "İlçe Seç",
            items = items,
            onDismiss = { pickerMode = null },
            onSelect = { selected ->
                if (mode == LocationPickerMode.Province) {
                    if (city != selected) district = ""
                    city = selected
                } else {
                    district = selected
                }
                localError = null
                pickerMode = null
            }
        )
    }
}


private enum class LocationPickerMode {
    Province,
    District
}

@Composable
private fun AddressTextField(
    value: String,
    onValueChange: (String) -> Unit,
    label: String,
    placeholder: String,
    modifier: Modifier = Modifier,
    keyboardType: KeyboardType = KeyboardType.Text,
    minLines: Int = 1,
    isError: Boolean = false
) {
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        modifier = modifier.fillMaxWidth(),
        label = { Text(label) },
        placeholder = { Text(placeholder, color = Color(0xFF98A2B3)) },
        keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(keyboardType = keyboardType),
        minLines = minLines,
        singleLine = minLines == 1,
        isError = isError,
        shape = RoundedCornerShape(14.dp),
        colors = OutlinedTextFieldDefaults.colors(
            focusedBorderColor = Orange,
            unfocusedBorderColor = Color(0xFFE2E8F0),
            focusedContainerColor = Color.White,
            unfocusedContainerColor = Color.White,
            errorBorderColor = Color(0xFFEA5455)
        )
    )
}

@Composable
private fun SelectionField(
    value: String,
    label: String,
    placeholder: String,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    onClick: () -> Unit
) {
    Column(modifier = modifier) {
        Text(label, style = MaterialTheme.typography.labelMedium, color = NavyDark, fontWeight = FontWeight.Bold)
        Surface(
            modifier = Modifier
                .fillMaxWidth()
                .height(56.dp)
                .clip(RoundedCornerShape(14.dp))
                .clickable(enabled = true, onClick = onClick),
            color = if (enabled) Color.White else Color(0xFFF1F3F6),
            border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
            shape = RoundedCornerShape(14.dp)
        ) {
            Row(modifier = Modifier.padding(horizontal = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = value.ifBlank { placeholder },
                    color = if (value.isBlank()) Color(0xFF98A2B3) else NavyDark,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f)
                )
                Icon(Icons.Default.KeyboardArrowDown, contentDescription = null, tint = if (enabled) Orange else Color(0xFF98A2B3))
            }
        }
    }
}

@Composable
private fun FormError(show: Boolean, text: String) {
    if (show) Text(text, color = Color(0xFFEA5455), style = MaterialTheme.typography.labelMedium)
}

@Composable
private fun LocationSelectionDialog(
    title: String,
    items: List<String>,
    onDismiss: () -> Unit,
    onSelect: (String) -> Unit
) {
    var query by remember { mutableStateOf("") }
    val filteredItems = remember(items, query) { TurkeyLocations.search(items, query) }

    Dialog(onDismissRequest = onDismiss) {
        Surface(
            shape = RoundedCornerShape(22.dp),
            color = Color.White,
            shadowElevation = 10.dp,
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 8.dp)
        ) {
            Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text(title, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.ExtraBold, color = NavyDark)
                AddressTextField(value = query, onValueChange = { query = it }, label = "Ara", placeholder = "İsim yazın...")
                LazyColumn(modifier = Modifier.heightIn(max = 390.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    items(filteredItems) { item ->
                        Surface(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(12.dp))
                                .clickable { onSelect(item) },
                            color = Color(0xFFF8FAFC),
                            shape = RoundedCornerShape(12.dp)
                        ) {
                            Text(
                                item,
                                color = NavyDark,
                                fontWeight = FontWeight.Medium,
                                modifier = Modifier.padding(horizontal = 14.dp, vertical = 12.dp)
                            )
                        }
                    }
                }
                TextButton(onClick = onDismiss, modifier = Modifier.align(Alignment.End)) {
                    Text("Kapat", color = Orange, fontWeight = FontWeight.Bold)
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
private fun EmptyState() {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 48.dp),
        contentAlignment = Alignment.Center
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(
                "Aradığınız ürün bulunamadı.",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                color = NavyDark
            )
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                "Lütfen farklı kelimelerle arama yapmayı deneyin.",
                style = MaterialTheme.typography.bodySmall,
                color = Color.Gray
            )
        }
    }
}

