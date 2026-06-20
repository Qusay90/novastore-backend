package com.novastore.app.navigation

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.Image
import androidx.annotation.StringRes
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.ShoppingCart
import androidx.compose.material.icons.outlined.FavoriteBorder
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material.icons.outlined.ShoppingCart
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation3.runtime.NavEntry
import androidx.navigation3.runtime.NavKey
import androidx.navigation3.runtime.rememberNavBackStack
import androidx.navigation3.ui.NavDisplay
import com.novastore.app.R
import com.novastore.app.core.theme.Orange
import com.novastore.app.feature.auth.AuthScreen
import com.novastore.app.feature.auth.AuthViewModel
import com.novastore.app.feature.cart.CartScreen
import com.novastore.app.feature.cart.CartViewModel
import com.novastore.app.feature.checkout.CheckoutScreen
import com.novastore.app.feature.favorites.FavoritesScreen
import com.novastore.app.feature.home.HomeScreen
import com.novastore.app.feature.notifications.NotificationsScreen
import com.novastore.app.feature.product.ProductDetailScreen
import com.novastore.app.feature.support.SupportScreen
import com.novastore.app.data.model.CartItem
import kotlinx.serialization.Serializable

sealed interface Screen : NavKey {
    @Serializable data object Home : Screen
    @Serializable data object Support : Screen
    @Serializable data object Cart : Screen
    @Serializable data object Favorites : Screen
    @Serializable data object Account : Screen
    @Serializable data class ProductDetail(val productId: Int) : Screen
    @Serializable data class Checkout(val buyNowItem: CartItem? = null) : Screen
    @Serializable data object Notifications : Screen
}

private enum class Tab(
    val screen: Screen,
    @StringRes val labelRes: Int,
    val selectedIcon: ImageVector,
    val unselectedIcon: ImageVector
) {
    HOME(Screen.Home, R.string.tab_home, Icons.Filled.Home, Icons.Outlined.Home),
    FAVORITES(Screen.Favorites, R.string.tab_favorites, Icons.Filled.Favorite, Icons.Outlined.FavoriteBorder),
    SUPPORT(Screen.Support, R.string.tab_support, Icons.Filled.Home, Icons.Outlined.Home),
    CART(Screen.Cart, R.string.tab_cart, Icons.Filled.ShoppingCart, Icons.Outlined.ShoppingCart),
    ACCOUNT(Screen.Account, R.string.tab_account_full, Icons.Filled.Person, Icons.Outlined.Person)
}

@Composable
fun NovaStoreNavGraph(
    modifier: Modifier = Modifier,
    cartViewModel: CartViewModel = hiltViewModel(),
    authViewModel: AuthViewModel = hiltViewModel()
) {
    val backStack = rememberNavBackStack(Screen.Home)
    val cartCount by cartViewModel.cartCount.collectAsState()
    val isLoggedIn by authViewModel.isLoggedInState.collectAsState()
    var refreshToken by remember { mutableIntStateOf(0) }
    var homeResetToken by remember { mutableIntStateOf(0) }
    var accountResetToken by remember { mutableIntStateOf(0) }
    var refreshHomeOnNextPress by remember { mutableStateOf(false) }

    val rootScreen = backStack.firstOrNull()
    val selectedTabIndex = Tab.entries.indexOfFirst { it.screen == rootScreen }.coerceAtLeast(0)

    fun navigateHome(resetPosition: Boolean = true) {
        backStack.clear()
        backStack.add(Screen.Home)
        if (resetPosition) homeResetToken += 1
        refreshHomeOnNextPress = true
    }

    fun handleSystemBack() {
        when {
            backStack.size > 1 -> backStack.removeLastOrNull()
            rootScreen != Screen.Home -> navigateHome()
            else -> Unit
        }
    }

    BackHandler(enabled = backStack.size > 1 || rootScreen != Screen.Home, onBack = ::handleSystemBack)

    Scaffold(
        modifier = modifier.navigationBarsPadding(),
        bottomBar = {
            NavigationBar(
                modifier = Modifier.height(64.dp),
                containerColor = Color.White,
                tonalElevation = 0.dp,
                windowInsets = WindowInsets(0.dp)
            ) {
                Tab.entries.forEachIndexed { index, tab ->
                    val isSelected = index == selectedTabIndex
                    val tabLabel = stringResource(tab.labelRes)
                    NavigationBarItem(
                        selected = isSelected,
                        onClick = {
                            if (tab == Tab.HOME) {
                                val isHomeRoot = rootScreen == Screen.Home && backStack.size == 1
                                if (isHomeRoot && refreshHomeOnNextPress) {
                                    refreshToken += 1
                                    refreshHomeOnNextPress = false
                                } else {
                                    backStack.clear()
                                    backStack.add(Screen.Home)
                                    homeResetToken += 1
                                    refreshHomeOnNextPress = true
                                }
                            } else {
                                refreshToken += 1
                                refreshHomeOnNextPress = false
                                if (tab == Tab.ACCOUNT) {
                                    accountResetToken += 1
                                }
                                backStack.clear()
                                backStack.add(tab.screen)
                            }
                        },
                        icon = {
                            val iconImage = if (isSelected) tab.selectedIcon else tab.unselectedIcon
                            if (tab == Tab.SUPPORT) {
                                Image(
                                    painter = painterResource(id = R.drawable.support_novastore),
                                    contentDescription = tabLabel,
                                    modifier = Modifier
                                        .size(if (isSelected) 34.dp else 30.dp)
                                        .clip(RoundedCornerShape(8.dp))
                                )
                            } else if (tab == Tab.CART && cartCount > 0) {
                                BadgedBox(
                                    badge = {
                                        Badge(
                                            containerColor = Orange,
                                            contentColor = Color.White
                                        ) {
                                            Text(cartCount.toString())
                                        }
                                    }
                                ) {
                                    Icon(
                                        imageVector = iconImage,
                                        contentDescription = tabLabel
                                    )
                                }
                            } else {
                                Icon(
                                    imageVector = iconImage,
                                    contentDescription = tabLabel
                                )
                            }
                        },
                        label = { Text(tabLabel, style = MaterialTheme.typography.labelMedium) },
                        colors = NavigationBarItemDefaults.colors(
                            selectedIconColor = Orange,
                            selectedTextColor = Orange,
                            indicatorColor = Orange.copy(alpha = 0.12f)
                        )
                    )
                }
            }
        }
    ) { padding ->
        NavDisplay(
            backStack = backStack,
            onBack = ::handleSystemBack,
            entryProvider = { key ->
                when (key) {
                    is Screen.Home -> NavEntry<NavKey>(key) {
                        HomeScreen(
                            onProductClick = { productId ->
                                backStack.add(Screen.ProductDetail(productId))
                            },
                            onAddToCart = { cartItem ->
                                cartViewModel.addToCart(cartItem) { _, _ -> }
                            },
                            onNotificationsClick = {
                                if (isLoggedIn) {
                                    backStack.add(Screen.Notifications)
                                } else {
                                    backStack.clear()
                                    backStack.add(Screen.Account)
                                }
                            },
                            refreshToken = refreshToken,
                            resetPositionToken = homeResetToken,
                            onCatalogInteraction = {
                                refreshHomeOnNextPress = false
                            },
                            modifier = Modifier.padding(padding)
                        )
                    }
                    is Screen.Support -> NavEntry<NavKey>(key) {
                        SupportScreen(
                            refreshToken = refreshToken,
                            onProductClick = { productId -> backStack.add(Screen.ProductDetail(productId)) },
                            modifier = Modifier.padding(padding)
                        )
                    }
                    is Screen.Favorites -> NavEntry<NavKey>(key) {
                        FavoritesScreen(
                            onProductClick = { productId -> backStack.add(Screen.ProductDetail(productId)) },
                            onAddToCart = { cartItem, onResult -> cartViewModel.addToCart(cartItem, onResult) },
                            onExploreClick = {
                                backStack.clear()
                                backStack.add(Screen.Home)
                            },
                            onLoginClick = {
                                backStack.clear()
                                backStack.add(Screen.Account)
                            },
                            isLoggedIn = isLoggedIn,
                            refreshToken = refreshToken,
                            modifier = Modifier.padding(padding)
                        )
                    }
                    is Screen.Cart -> NavEntry<NavKey>(key) {
                        CartScreen(
                            onCheckoutClick = {
                                backStack.add(Screen.Checkout())
                            },
                            onNavigateToHome = {
                                backStack.clear()
                                backStack.add(Screen.Home)
                            },
                            modifier = Modifier.padding(padding)
                        )
                    }
                    is Screen.Account -> NavEntry<NavKey>(key) {
                        if (isLoggedIn) {
                            NotificationsScreen(
                                onLogoutClick = {
                                    authViewModel.logout()
                                },
                                onNavigateHome = {
                                    backStack.clear()
                                    backStack.add(Screen.Home)
                                },
                                onNavigateFavorites = {
                                    backStack.clear()
                                    backStack.add(Screen.Favorites)
                                },
                                onNavigateCart = {
                                    backStack.clear()
                                    backStack.add(Screen.Cart)
                                },
                                onNavigateSupport = {
                                    backStack.clear()
                                    backStack.add(Screen.Support)
                                },
                                initialSection = "Center",
                                resetRootToken = accountResetToken,
                                modifier = Modifier.padding(padding)
                            )
                        } else {
                            AuthScreen(
                                viewModel = authViewModel,
                                onAuthSuccess = {},
                                modifier = Modifier.padding(padding)
                            )
                        }
                    }
                    is Screen.ProductDetail -> NavEntry<NavKey>(key) {
                        ProductDetailScreen(
                            productId = key.productId,
                            onBackClick = {
                                backStack.removeLastOrNull()
                            },
                            onNavigateCart = {
                                backStack.clear()
                                backStack.add(Screen.Cart)
                            },
                            onBuyNow = { item ->
                                backStack.add(Screen.Checkout(item))
                            },
                            onProductClick = { productId ->
                                backStack.add(Screen.ProductDetail(productId))
                            },
                            modifier = Modifier.padding(padding)
                        )
                    }
                    is Screen.Checkout -> NavEntry<NavKey>(key) {
                        CheckoutScreen(
                            onBackClick = {
                                backStack.removeLastOrNull()
                            },
                            onNavigateToHome = {
                                backStack.clear()
                                backStack.add(Screen.Home)
                            },
                            buyNowItem = key.buyNowItem,
                            modifier = Modifier.padding(padding)
                        )
                    }
                    is Screen.Notifications -> NavEntry<NavKey>(key) {
                        NotificationsScreen(
                            onLogoutClick = {
                                authViewModel.logout()
                                backStack.clear()
                                backStack.add(Screen.Account)
                            },
                            onNavigateHome = {
                                backStack.clear()
                                backStack.add(Screen.Home)
                            },
                            onNavigateFavorites = {
                                backStack.clear()
                                backStack.add(Screen.Favorites)
                            },
                            onNavigateCart = {
                                backStack.clear()
                                backStack.add(Screen.Cart)
                            },
                            onNavigateSupport = {
                                backStack.clear()
                                backStack.add(Screen.Support)
                            },
                            initialSection = "Notifications",
                            resetRootToken = accountResetToken,
                            modifier = Modifier.padding(padding)
                        )
                    }
                    else -> error("Unknown destination: $key")
                }
            }
        )
    }
}
