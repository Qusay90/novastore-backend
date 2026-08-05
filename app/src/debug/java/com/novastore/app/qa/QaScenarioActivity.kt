package com.novastore.app.qa

import android.graphics.Color
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsControllerCompat
import com.novastore.app.core.design.NovaCustomerTheme
import com.novastore.app.core.navigation.CustomerVisualManifest

class QaScenarioActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        CustomerVisualManifest.requireValid()
        WindowCompat.setDecorFitsSystemWindows(window, true)
        window.statusBarColor = Color.WHITE
        window.navigationBarColor = Color.WHITE
        WindowInsetsControllerCompat(window, window.decorView).apply {
            isAppearanceLightStatusBars = true
            isAppearanceLightNavigationBars = true
        }
        val fixtureMode = QaVisualFixtureMode.fromWireValue(
            intent.getStringExtra(EXTRA_VISUAL_FIXTURE_MODE)
        )
        val initialSelectedId = intent.getStringExtra(EXTRA_VISUAL_SELECTED_ID) ?: "home"
        setContent {
            NovaCustomerTheme {
                val fixture = DeterministicQaFixtureDataSource.snapshot()
                if (fixtureMode == null) {
                    QaScenarioApp(fixture = fixture)
                } else {
                    QaVisualFixtureApp(
                        mode = fixtureMode,
                        cartCount = fixture.cartCount,
                        initialSelectedId = initialSelectedId
                    )
                }
            }
        }
    }

    companion object {
        const val EXTRA_VISUAL_FIXTURE_MODE = "visual_fixture_mode"
        const val EXTRA_VISUAL_SELECTED_ID = "visual_fixture_selected_id"
    }
}
