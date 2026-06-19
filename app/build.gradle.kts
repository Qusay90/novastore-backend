import org.gradle.api.GradleException
import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.ksp)
    alias(libs.plugins.hilt)
}

val releaseKeystoreProperties = Properties()
val releaseKeystorePropertiesFile = rootProject.file("keystore.properties")
if (releaseKeystorePropertiesFile.exists()) {
    releaseKeystorePropertiesFile.inputStream().use(releaseKeystoreProperties::load)
}

fun releaseSigningValue(envName: String, propertyName: String): String? =
    providers.environmentVariable(envName).orNull?.trim()?.takeIf { it.isNotEmpty() }
        ?: releaseKeystoreProperties.getProperty(propertyName)?.trim()?.takeIf { it.isNotEmpty() }

val releaseStoreFilePath = releaseSigningValue("NOVASTORE_RELEASE_STORE_FILE", "storeFile")
val releaseStorePassword = releaseSigningValue("NOVASTORE_RELEASE_STORE_PASSWORD", "storePassword")
val releaseKeyAlias = releaseSigningValue("NOVASTORE_RELEASE_KEY_ALIAS", "keyAlias")
val releaseKeyPassword = releaseSigningValue("NOVASTORE_RELEASE_KEY_PASSWORD", "keyPassword")

val missingReleaseSigningKeys = listOfNotNull(
    "NOVASTORE_RELEASE_STORE_FILE or keystore.properties storeFile".takeIf { releaseStoreFilePath == null },
    "NOVASTORE_RELEASE_STORE_PASSWORD or keystore.properties storePassword".takeIf { releaseStorePassword == null },
    "NOVASTORE_RELEASE_KEY_ALIAS or keystore.properties keyAlias".takeIf { releaseKeyAlias == null },
    "NOVASTORE_RELEASE_KEY_PASSWORD or keystore.properties keyPassword".takeIf { releaseKeyPassword == null },
)

gradle.taskGraph.whenReady {
    val releaseSigningRequired = allTasks.any { task ->
        task.path in setOf(":app:assembleRelease", ":app:bundleRelease", ":app:packageRelease")
    }
    if (releaseSigningRequired && missingReleaseSigningKeys.isNotEmpty()) {
        throw GradleException(
            "Release signing is not configured. Provide NOVASTORE_RELEASE_STORE_FILE, " +
                "NOVASTORE_RELEASE_STORE_PASSWORD, NOVASTORE_RELEASE_KEY_ALIAS, " +
                "NOVASTORE_RELEASE_KEY_PASSWORD or ignored keystore.properties. Missing: " +
                missingReleaseSigningKeys.joinToString(", ")
        )
    }
    if (releaseSigningRequired && releaseStoreFilePath != null && !rootProject.file(releaseStoreFilePath).exists()) {
        throw GradleException(
            "Release signing store file was configured but does not exist. Check " +
                "NOVASTORE_RELEASE_STORE_FILE or keystore.properties storeFile."
        )
    }
}

android {
    namespace = "com.novastore.app"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.novastore.app"
        minSdk = 24
        targetSdk = 35
        versionCode = 1
        versionName = "1.0.0"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    signingConfigs {
        create("release") {
            if (missingReleaseSigningKeys.isEmpty()) {
                storeFile = rootProject.file(releaseStoreFilePath!!)
                storePassword = releaseStorePassword
                keyAlias = releaseKeyAlias
                keyPassword = releaseKeyPassword
            }
        }
    }

    buildTypes {
        release {
            signingConfig = signingConfigs.getByName("release")
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
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
    // Compose BOM
    val composeBom = platform(libs.compose.bom)
    implementation(composeBom)
    implementation(libs.compose.ui)
    implementation(libs.compose.ui.graphics)
    implementation(libs.compose.ui.tooling.preview)
    implementation(libs.compose.material3)
    implementation(libs.compose.material.icons.extended)
    debugImplementation(libs.compose.ui.tooling)

    // Activity
    implementation(libs.activity.compose)

    // Lifecycle
    implementation(libs.lifecycle.viewmodel.compose)
    implementation(libs.lifecycle.runtime.compose)

    // Navigation 3
    implementation(libs.navigation3.runtime)
    implementation(libs.navigation3.ui)

    // Hilt
    implementation(libs.hilt.android)
    ksp(libs.hilt.compiler)
    implementation(libs.hilt.navigation.compose)

    // Retrofit + OkHttp
    implementation(libs.retrofit)
    implementation(libs.retrofit.converter.gson)
    implementation(platform(libs.okhttp.bom))
    implementation(libs.okhttp)
    implementation(libs.okhttp.logging)

    // Room
    implementation(libs.room.runtime)
    implementation(libs.room.ktx)
    ksp(libs.room.compiler)

    // Coroutines
    implementation(libs.coroutines.android)

    // Coil
    implementation(libs.coil.compose)
    implementation(libs.coil.network.okhttp)

    // Timber
    implementation(libs.timber)

    // Serialization
    implementation(libs.serialization.json)

    // AndroidX Core
    implementation(libs.core)
    implementation(libs.security.crypto)

    // Testing
    testImplementation(libs.junit)
}
