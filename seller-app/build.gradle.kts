import java.net.URI

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
}

val sellerReleaseApiBaseUrl = providers.gradleProperty("sellerReleaseApiBaseUrl")
    .orNull
    ?.trim()
    .orEmpty()
val sellerReleaseApiHostAllowlist = setOf("novastore-backend.onrender.com")

if (sellerReleaseApiBaseUrl.isNotEmpty()) {
    val uri = try {
        URI(sellerReleaseApiBaseUrl)
    } catch (_: Exception) {
        throw GradleException("sellerReleaseApiBaseUrl is invalid.")
    }
    val normalizedHost = uri.host?.lowercase()
    if (
        !uri.scheme.equals("https", ignoreCase = true) ||
        normalizedHost !in sellerReleaseApiHostAllowlist ||
        uri.rawPath != "/" ||
        uri.port !in setOf(-1, 443) ||
        uri.userInfo != null ||
        uri.rawQuery != null ||
        uri.rawFragment != null ||
        !sellerReleaseApiBaseUrl.endsWith("/")
    ) {
        throw GradleException("sellerReleaseApiBaseUrl is not an approved NovaStore HTTPS API origin.")
    }
}

val escapedSellerReleaseApiBaseUrl = sellerReleaseApiBaseUrl
    .replace("\\", "\\\\")
    .replace("\"", "\\\"")

android {
    namespace = "com.novastore.seller"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.novastore.seller"
        minSdk = 24
        targetSdk = 35
        versionCode = 1
        versionName = "1.0.0"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    buildTypes {
        debug {
            buildConfigField("String", "SELLER_API_BASE_URL", "\"http://10.0.2.2:5001/\"")
            buildConfigField("boolean", "SELLER_RELEASE_BUILD", "false")
            buildConfigField("boolean", "SELLER_TEST_STATE_ENABLED", "true")
        }
        release {
            buildConfigField("String", "SELLER_API_BASE_URL", "\"$escapedSellerReleaseApiBaseUrl\"")
            buildConfigField("boolean", "SELLER_RELEASE_BUILD", "true")
            buildConfigField("boolean", "SELLER_TEST_STATE_ENABLED", "false")
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }
}

kotlin {
    jvmToolchain(21)
}

dependencies {
    val composeBom = platform(libs.compose.bom)
    implementation(composeBom)
    implementation(libs.compose.ui)
    implementation(libs.compose.ui.graphics)
    implementation(libs.compose.ui.tooling.preview)
    implementation(libs.compose.material3)
    implementation(libs.compose.material.icons.extended)
    debugImplementation(libs.compose.ui.tooling)
    implementation(libs.activity.compose)
    implementation(libs.lifecycle.viewmodel.compose)
    implementation(libs.lifecycle.runtime.compose)
    // These versions are already available in the approved local Gradle cache.
    // Pinning them here keeps the offline verification path deterministic.
    implementation("androidx.navigationevent:navigationevent-android:1.0.2")
    implementation("androidx.profileinstaller:profileinstaller:1.4.1")
    implementation("androidx.startup:startup-runtime:1.2.0")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-core-jvm:1.11.0")
    implementation(libs.retrofit)
    implementation(libs.retrofit.converter.gson)
    implementation(platform(libs.okhttp.bom))
    implementation(libs.okhttp)
    implementation(libs.coroutines.android)
    implementation(libs.security.crypto)
    testImplementation(libs.junit)
    androidTestImplementation("androidx.test:runner:1.7.0")
    androidTestImplementation("androidx.test.ext:junit:1.3.0")
}
