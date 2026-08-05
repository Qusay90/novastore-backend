package com.novastore.app.core.design

import androidx.annotation.DrawableRes
import com.novastore.app.R

/**
 * Source-bound customer navigation iconography.
 *
 * Each drawable is pinned to the closest open-library silhouette found by the
 * 1080 px source bake-off. The exact library, variant, commit and license are
 * recorded in docs/licenses/android-customer-theme-assets.md.
 */
object CustomerIconography {
    @DrawableRes val Back = R.drawable.ic_customer_caret_left

    @DrawableRes val Home = R.drawable.ic_customer_house
    @DrawableRes val HomeSelected = R.drawable.ic_customer_house_filled

    @DrawableRes val Categories = R.drawable.ic_customer_circles_four
    @DrawableRes val CategoriesSelected = R.drawable.ic_customer_circles_four_filled

    @DrawableRes val Favorites = R.drawable.ic_customer_heart
    @DrawableRes val FavoritesSelected = R.drawable.ic_customer_heart_filled

    @DrawableRes val Cart = R.drawable.ic_customer_handbag_simple
    @DrawableRes val CartSelected = R.drawable.ic_customer_handbag_simple_filled

    @DrawableRes val Support = R.drawable.ic_customer_chat_circle
    @DrawableRes val SupportSelected = R.drawable.ic_customer_chat_circle_filled

    @DrawableRes val Account = R.drawable.ic_customer_user
    @DrawableRes val AccountSelected = R.drawable.ic_customer_user_filled
}
