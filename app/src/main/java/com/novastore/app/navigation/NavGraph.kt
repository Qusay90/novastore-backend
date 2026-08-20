package com.novastore.app.navigation

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation3.runtime.NavEntry
import androidx.navigation3.runtime.NavKey
import androidx.navigation3.runtime.rememberNavBackStack
import androidx.navigation3.ui.NavDisplay
import com.novastore.app.core.design.CustomerColors
import com.novastore.app.core.design.CustomerSpacing
import com.novastore.app.core.design.customerGlassSource
import com.novastore.app.core.design.rememberCustomerGlassState
import com.novastore.app.core.ui.components.CustomerBubbleBottomBar
import com.novastore.app.core.ui.components.customerBottomDestinations
import com.novastore.app.data.model.CartItem
import com.novastore.app.feature.auth.AuthScreen
import com.novastore.app.feature.auth.AuthViewModel
import com.novastore.app.feature.cart.CartScreen
import com.novastore.app.feature.cart.CartViewModel
import com.novastore.app.feature.categories.CategoriesScreen
import com.novastore.app.feature.checkout.CheckoutScreen
import com.novastore.app.feature.favorites.FavoritesScreen
import com.novastore.app.feature.home.HomeScreen
import com.novastore.app.feature.home.HomeViewModel
import com.novastore.app.feature.notifications.NotificationsScreen
import com.novastore.app.feature.product.ProductDetailScreen
import com.novastore.app.feature.support.SupportScreen
import kotlinx.serialization.Serializable

sealed interface Screen : NavKey {
    @Serializable data object Home : Screen
    @Serializable data object Categories : Screen
    @Serializable data object Favorites : Screen
    @Serializable data object Cart : Screen
    @Serializable data object Support : Screen
    @Serializable data object Account : Screen
    @Serializable data class ProductDetail(val productId: Int) : Screen
    @Serializable
    data class Checkout(
        val buyNowItem: CartItem? = null,
        val couponCode: String? = null
    ) : Screen
    @Serializable data object Notifications : Screen
}

private enum class Tab(val id: String, val screen: Screen) {
    HOME("home", Screen.Home),
    CATEGORIES("categories", Screen.Categories),
    FAVORITES("favorites", Screen.Favorites),
    CART("cart", Screen.Cart),
    SUPPORT("support", Screen.Support),
    ACCOUNT("account", Screen.Account)
}

internal fun Screen.showsCustomerBottomNavigation(): Boolean = when (this) {
    Screen.Home,
    Screen.Categories,
    Screen.Favorites,
    Screen.Cart,
    Screen.Support,
    Screen.Account -> true
    is Screen.ProductDetail,
    is Screen.Checkout,
    Screen.Notifications -> false
}

@Composable
fun NovaStoreNavGraph(
    modifier: Modifier = Modifier,
    cartViewModel: CartViewModel = hiltViewModel(),
    authViewModel: AuthViewModel = hiltViewModel(),
    homeViewModel: HomeViewModel = hiltViewModel()
) {
    val backStack = rememberNavBackStack(Screen.Home)
    val cartCount by cartViewModel.cartCount.collectAsState()
    val isLoggedIn by authViewModel.isLoggedInState.collectAsState()
    val glassState = rememberCustomerGlassState()
    val bottomDestinations = remember(cartCount) { customerBottomDestinations(cartCount) }
    var refreshToken by remember { mutableIntStateOf(0) }
    var homeResetToken by remember { mutableIntStateOf(0) }
    var accountResetToken by remember { mutableIntStateOf(0) }
    var refreshHomeOnNextPress by remember { mutableStateOf(false) }

    val rootScreen = backStack.firstOrNull()
    val topScreen = backStack.lastOrNull() as? Screen
    val selectedTab = Tab.entries.firstOrNull { it.screen == rootScreen } ?: Tab.HOME

    fun navigateHome(resetPosition: Boolean = true) {
        backStack.clear()
        backStack.add(Screen.Home)
        if (resetPosition) homeResetToken += 1
        refreshHomeOnNextPress = true
    }

    fun selectTab(tab: Tab) {
        if (tab == Tab.HOME) {
            val isHomeRoot = rootScreen == Screen.Home && backStack.size == 1
            if (isHomeRoot && refreshHomeOnNextPress) {
                refreshToken += 1
                refreshHomeOnNextPress = false
            } else {
                navigateHome()
            }
            return
        }

        refreshToken += 1
        refreshHomeOnNextPress = false
        if (tab == Tab.ACCOUNT) accountResetToken += 1
        backStack.clear()
        backStack.add(tab.screen)
    }

    fun handleSystemBack() {
        when {
            backStack.size > 1 -> backStack.removeLastOrNull()
            rootScreen != Screen.Home -> navigateHome()
            else -> Unit
        }
    }

    BackHandler(enabled = backStack.size > 1 || rootScreen != Screen.Home, onBack = ::handleSystemBack)

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(CustomerColors.Page)
            .customerGlassSource(glassState, key = "production_customer_content")
    ) {
        NavDisplay(
            modifier = Modifier.fillMaxSize(),
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
                            onCatalogInteraction = { refreshHomeOnNextPress = false },
                            viewModel = homeViewModel
                        )
                    }

                    is Screen.Categories -> NavEntry<NavKey>(key) {
                        CategoriesScreen(
                            viewModel = homeViewModel,
                            glassState = glassState,
                            onProductClick = { productId ->
                                backStack.add(Screen.ProductDetail(productId))
                            },
                            onCategorySelected = { category ->
                                homeViewModel.selectCategory(category)
                            },
                            onShowProducts = {
                                backStack.clear()
                                backStack.add(Screen.Home)
                                homeResetToken += 1
                                refreshHomeOnNextPress = true
                            }
                        )
                    }

                    is Screen.Favorites -> NavEntry<NavKey>(key) {
                        FavoritesScreen(
                            onProductClick = { productId -> backStack.add(Screen.ProductDetail(productId)) },
                            onAddToCart = { cartItem, onResult -> cartViewModel.addToCart(cartItem, onResult) },
                            onExploreClick = { navigateHome() },
                            onLoginClick = {
                                backStack.clear()
                                backStack.add(Screen.Account)
                            },
                            isLoggedIn = isLoggedIn,
                            refreshToken = refreshToken
                        )
                    }

                    is Screen.Cart -> NavEntry<NavKey>(key) {
                        CartScreen(
                            onCheckoutClick = { backStack.add(Screen.Checkout()) },
                            onNavigateToHome = { navigateHome() }
                        )
                    }

                    is Screen.Support -> NavEntry<NavKey>(key) {
                        SupportScreen(
                            refreshToken = refreshToken,
                            onProductClick = { productId -> backStack.add(Screen.ProductDetail(productId)) }
                        )
                    }

                    is Screen.Account -> NavEntry<NavKey>(key) {
                        if (isLoggedIn) {
                            NotificationsScreen(
                                onLogoutClick = authViewModel::logout,
                                onNavigateHome = { navigateHome() },
                                onNavigateFavorites = { selectTab(Tab.FAVORITES) },
                                onNavigateCart = { selectTab(Tab.CART) },
                                onNavigateSupport = { selectTab(Tab.SUPPORT) },
                                onNavigateProduct = { productId -> backStack.add(Screen.ProductDetail(productId)) },
                                onNavigateNotificationProduct = { productId ->
                                    backStack.clear()
                                    backStack.add(Screen.Notifications)
                                    backStack.add(Screen.ProductDetail(productId))
                                },
                                systemBackEnabled = topScreen == Screen.Account,
                                initialSection = "Center",
                                resetRootToken = accountResetToken,
                                glassState = glassState
                            )
                        } else {
                            AuthScreen(
                                viewModel = authViewModel,
                                onAuthSuccess = {},
                                glassState = glassState
                            )
                        }
                    }

                    is Screen.ProductDetail -> NavEntry<NavKey>(key) {
                        ProductDetailScreen(
                            productId = key.productId,
                            onBackClick = { backStack.removeLastOrNull() },
                            onNavigateCart = { selectTab(Tab.CART) },
                            onBuyNow = { item, couponCode ->
                                backStack.add(Screen.Checkout(item, couponCode))
                            },
                            onProductClick = { productId ->
                                backStack.add(Screen.ProductDetail(productId))
                            }
                        )
                    }

                    is Screen.Checkout -> NavEntry<NavKey>(key) {
                        CheckoutScreen(
                            onBackClick = { backStack.removeLastOrNull() },
                            onNavigateToHome = { navigateHome() },
                            buyNowItem = key.buyNowItem,
                            couponCode = key.couponCode
                        )
                    }

                    is Screen.Notifications -> NavEntry<NavKey>(key) {
                        NotificationsScreen(
                            onLogoutClick = {
                                authViewModel.logout()
                                backStack.clear()
                                backStack.add(Screen.Account)
                            },
                            onNavigateHome = { navigateHome() },
                            onNavigateFavorites = { selectTab(Tab.FAVORITES) },
                            onNavigateCart = { selectTab(Tab.CART) },
                            onNavigateSupport = { selectTab(Tab.SUPPORT) },
                            onNavigateProduct = { productId -> backStack.add(Screen.ProductDetail(productId)) },
                            onNavigateNotificationProduct = { productId -> backStack.add(Screen.ProductDetail(productId)) },
                            systemBackEnabled = topScreen == Screen.Notifications,
                            initialSection = "Notifications",
                            resetRootToken = 0,
                            glassState = glassState
                        )
                    }

                    else -> error("Unknown destination: $key")
                }
            }
        )

        if (topScreen?.showsCustomerBottomNavigation() == true) {
            CustomerBubbleBottomBar(
                destinations = bottomDestinations,
                selectedId = selectedTab.id,
                onSelect = { destination ->
                    Tab.entries.firstOrNull { it.id == destination.id }?.let(::selectTab)
                },
                glassState = glassState,
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .navigationBarsPadding()
                    .padding(
                        horizontal = CustomerSpacing.ScreenHorizontal,
                        vertical = CustomerSpacing.Sm
                    )
            )
        }
    }
}
