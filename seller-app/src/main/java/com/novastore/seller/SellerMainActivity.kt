package com.novastore.seller

import android.os.Bundle
import android.content.Intent
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.mutableStateOf
import androidx.lifecycle.ViewModelProvider
import com.novastore.seller.data.SellerRepository
import com.novastore.seller.data.SellerSessionStore
import com.novastore.seller.ui.SellerApp
import com.novastore.seller.ui.SellerViewModel

class SellerMainActivity : ComponentActivity() {
    companion object {
        const val EXTRA_CANONICAL_TEST_STATE = "seller_test_state"
    }

    private lateinit var sellerViewModel: SellerViewModel
    private val canonicalHarnessState = mutableStateOf<String?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        val sessionStore = SellerSessionStore(applicationContext)
        val repository = SellerRepository(sessionStore)
        val testState = canonicalHarnessStateForBuild(
            BuildConfig.SELLER_TEST_STATE_ENABLED,
            intent?.getStringExtra(EXTRA_CANONICAL_TEST_STATE)
        )
        canonicalHarnessState.value = testState
        sellerViewModel = ViewModelProvider(this, SellerViewModel.Factory(repository, testState))[SellerViewModel::class.java]
        testState?.let(sellerViewModel::applyCanonicalTestState)
        setContent {
            SellerApp(
                viewModel = sellerViewModel,
                canonicalHarnessActive = canonicalHarnessState.value != null,
                mutationHarnessActive = false
            )
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        canonicalHarnessStateForBuild(
            BuildConfig.SELLER_TEST_STATE_ENABLED,
            intent.getStringExtra(EXTRA_CANONICAL_TEST_STATE)
        )?.let { state ->
            canonicalHarnessState.value = state
            sellerViewModel.applyCanonicalTestState(state)
        }
    }
}

internal fun canonicalHarnessStateForBuild(testStateEnabled: Boolean, requestedState: String?): String? =
    requestedState?.takeIf { testStateEnabled }

internal fun mutationHarnessForBuild(testStateEnabled: Boolean, requested: Boolean): Boolean =
    testStateEnabled && requested
