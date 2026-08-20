package com.novastore.app.feature.categories

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ChevronRight
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import com.novastore.app.core.design.CustomerColors
import com.novastore.app.core.design.CustomerGlassState
import com.novastore.app.core.design.CustomerRadii
import com.novastore.app.core.design.CustomerSpacing
import com.novastore.app.core.ui.components.CustomerButton
import com.novastore.app.core.ui.components.CustomerButtonStyle
import com.novastore.app.core.ui.components.CustomerStateKind
import com.novastore.app.core.ui.components.CustomerStatePanel
import com.novastore.app.core.ui.components.CustomerTextField
import com.novastore.app.core.ui.components.CustomerTopBar
import com.novastore.app.core.ui.optimizedImageUrl
import com.novastore.app.data.model.Category
import com.novastore.app.data.model.Product
import com.novastore.app.feature.home.HomeViewModel

@Composable
fun CategoriesScreen(
    onProductClick: (Int) -> Unit,
    onCategorySelected: (Category) -> Unit,
    onShowProducts: () -> Unit,
    modifier: Modifier = Modifier,
    glassState: CustomerGlassState? = null,
    viewModel: HomeViewModel
) {
    val state by viewModel.uiState.collectAsState()
    val selectedCategory = state.selectedCategoryBreadcrumb.lastOrNull()
    val visibleCategories = selectedCategory
        ?.children
        ?.takeIf { it.isNotEmpty() }
        ?: state.categories

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(CustomerColors.Page)
            .padding(bottom = 92.dp)
    ) {
        CustomerTopBar(
            title = "Kategoriler",
            glassState = glassState,
            modifier = Modifier.padding(
                horizontal = CustomerSpacing.ScreenHorizontal,
                vertical = CustomerSpacing.Xs
            )
        )

        CustomerTextField(
            value = state.searchQuery,
            onValueChange = viewModel::updateSearchQuery,
            label = "Kategori veya ürün ara",
            modifier = Modifier.padding(
                horizontal = CustomerSpacing.ScreenHorizontal,
                vertical = CustomerSpacing.Xs
            )
        )

        when {
            state.isLoading && state.categories.isEmpty() -> {
                Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = CustomerColors.Orange)
                }
            }

            state.error != null && state.categories.isEmpty() -> {
                CustomerStatePanel(
                    kind = CustomerStateKind.ERROR,
                    title = "Kategoriler yüklenemedi",
                    message = state.error.orEmpty(),
                    actionLabel = "Yeniden dene",
                    onAction = { viewModel.loadData(forceRefresh = true) },
                    modifier = Modifier.padding(CustomerSpacing.ScreenHorizontal)
                )
            }

            state.categories.isEmpty() -> {
                CustomerStatePanel(
                    kind = CustomerStateKind.EMPTY,
                    title = "Kategori bulunamadı",
                    message = "Katalog güncellendiğinde kategoriler burada görünecek.",
                    modifier = Modifier.padding(CustomerSpacing.ScreenHorizontal)
                )
            }

            else -> {
                BoxWithConstraints(Modifier.fillMaxSize()) {
                    val isExpanded = maxWidth >= 700.dp
                    val railWidth = if (isExpanded) 170.dp else 108.dp
                    Row(Modifier.fillMaxSize()) {
                        CategoryRail(
                            categories = state.categories,
                            selectedCategoryId = state.selectedCategoryBreadcrumb.firstOrNull()?.id,
                            onCategorySelected = onCategorySelected,
                            modifier = Modifier.width(railWidth)
                        )
                        CategoryCatalog(
                            title = selectedCategory?.name ?: "Tüm Kategoriler",
                            categories = visibleCategories,
                            products = state.filteredProducts,
                            columns = if (isExpanded) 3 else 2,
                            onCategorySelected = onCategorySelected,
                            onProductClick = onProductClick,
                            onShowProducts = onShowProducts,
                            modifier = Modifier.weight(1f)
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun CategoryRail(
    categories: List<Category>,
    selectedCategoryId: Int?,
    onCategorySelected: (Category) -> Unit,
    modifier: Modifier = Modifier
) {
    LazyColumn(
        modifier = modifier
            .fillMaxHeight()
            .background(CustomerColors.SurfaceMuted),
        contentPadding = PaddingValues(vertical = CustomerSpacing.Xs)
    ) {
        items(categories, key = Category::id) { category ->
            val selected = category.id == selectedCategoryId
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable { onCategorySelected(category) }
                    .background(if (selected) CustomerColors.Surface else CustomerColors.SurfaceMuted)
                    .padding(horizontal = CustomerSpacing.Sm, vertical = CustomerSpacing.Md)
            ) {
                if (selected) {
                    Box(
                        modifier = Modifier
                            .align(Alignment.CenterStart)
                            .width(3.dp)
                            .height(34.dp)
                            .background(CustomerColors.Orange, RoundedCornerShape(CustomerRadii.Pill))
                    )
                }
                Text(
                    text = category.name,
                    modifier = Modifier.padding(start = if (selected) CustomerSpacing.Xs else 0.dp),
                    style = MaterialTheme.typography.labelMedium,
                    color = CustomerColors.Navy,
                    fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium,
                    maxLines = 3,
                    overflow = TextOverflow.Ellipsis
                )
            }
        }
    }
}

@Composable
private fun CategoryCatalog(
    title: String,
    categories: List<Category>,
    products: List<Product>,
    columns: Int,
    onCategorySelected: (Category) -> Unit,
    onProductClick: (Int) -> Unit,
    onShowProducts: () -> Unit,
    modifier: Modifier = Modifier
) {
    Column(modifier = modifier.fillMaxHeight()) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = CustomerSpacing.Md, vertical = CustomerSpacing.Sm),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = title,
                modifier = Modifier.weight(1f),
                style = MaterialTheme.typography.titleMedium,
                color = CustomerColors.Navy
            )
            if (products.isNotEmpty()) {
                CustomerButton(
                    text = "Ürünleri gör",
                    onClick = onShowProducts,
                    style = CustomerButtonStyle.OUTLINED
                )
            }
        }

        LazyVerticalGrid(
            columns = GridCells.Fixed(columns),
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(
                start = CustomerSpacing.Md,
                end = CustomerSpacing.Md,
                bottom = CustomerSpacing.Xxl
            ),
            horizontalArrangement = Arrangement.spacedBy(CustomerSpacing.Sm),
            verticalArrangement = Arrangement.spacedBy(CustomerSpacing.Sm)
        ) {
            items(categories, key = { "category-${it.id}" }) { category ->
                CategoryTile(category = category, onClick = { onCategorySelected(category) })
            }
            items(products.take(12), key = { "product-${it.id}" }) { product ->
                CategoryProductTile(product = product, onClick = { onProductClick(product.id) })
            }
        }
    }
}

@Composable
private fun CategoryTile(category: Category, onClick: () -> Unit) {
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .aspectRatio(1.05f)
            .clickable(onClick = onClick),
        shape = RoundedCornerShape(CustomerRadii.Card),
        color = CustomerColors.Surface,
        border = BorderStroke(1.dp, CustomerColors.Divider)
    ) {
        Column(
            modifier = Modifier.padding(CustomerSpacing.Md),
            verticalArrangement = Arrangement.SpaceBetween
        ) {
            Text(
                text = category.name,
                style = MaterialTheme.typography.titleSmall,
                color = CustomerColors.Navy,
                maxLines = 3,
                overflow = TextOverflow.Ellipsis
            )
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = if (category.visibleProductCount > 0) {
                        "${category.visibleProductCount} ürün"
                    } else {
                        "Keşfet"
                    },
                    modifier = Modifier.weight(1f),
                    style = MaterialTheme.typography.bodySmall,
                    color = CustomerColors.TextSecondary
                )
                Icon(
                    imageVector = Icons.Outlined.ChevronRight,
                    contentDescription = null,
                    tint = CustomerColors.Orange,
                    modifier = Modifier.size(20.dp)
                )
            }
        }
    }
}

@Composable
private fun CategoryProductTile(product: Product, onClick: () -> Unit) {
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
        shape = RoundedCornerShape(CustomerRadii.Card),
        color = CustomerColors.Surface,
        border = BorderStroke(1.dp, CustomerColors.Divider)
    ) {
        Column {
            product.imageUrl?.takeIf(String::isNotBlank)?.let { imageUrl ->
                AsyncImage(
                    model = optimizedImageUrl(imageUrl, width = 360, height = 300),
                    contentDescription = product.name,
                    modifier = Modifier
                        .fillMaxWidth()
                        .aspectRatio(1.2f)
                        .clip(
                            RoundedCornerShape(
                                topStart = CustomerRadii.Card,
                                topEnd = CustomerRadii.Card
                            )
                        ),
                    contentScale = ContentScale.Crop
                )
            }
            Column(Modifier.padding(CustomerSpacing.Sm)) {
                Text(
                    text = product.name,
                    style = MaterialTheme.typography.labelMedium,
                    color = CustomerColors.Navy,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis
                )
                Spacer(Modifier.height(CustomerSpacing.Xs))
                Text(
                    text = "%,.2f TL".format(java.util.Locale("tr", "TR"), product.price),
                    style = MaterialTheme.typography.titleSmall,
                    color = CustomerColors.Orange
                )
            }
        }
    }
}
