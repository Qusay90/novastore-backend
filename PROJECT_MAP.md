# PROJECT_MAP.md - NovaStore Android App

## [TECH_STACK]
- **Language:** Kotlin
- **UI Framework:** Jetpack Compose
- **Architecture:** MVVM with Unidirectional Data Flow
- **Dependency Injection:** Hilt
- **Networking:** Retrofit 2 + OkHttp 4
- **Concurrency:** Kotlin Coroutines & Flow
- **Local Persistence:** Room Database
- **Image Loading:** Coil
- **Navigation:** Jetpack Compose Navigation
- **Logging:** Timber and OkHttp basic debug logging
- **Build System:** Gradle Kotlin DSL with Version Catalog

## [LESSONS LEARNED - PREVIOUS WEBVIEW ATTEMPT]
- **No Webview Shell:** Native Android UI must not depend on DOM mutation, JavaScript navigation patches, or fake native alerts.
- **No localStorage State:** Cart and mobile state must use native persistence; Room is the selected storage layer.
- **First-Class Android Flow:** Back behavior, navigation, lifecycle, and loading states must be handled by Android APIs.
- **No Feature Creep:** The app serves only discovery, category browsing, product detail, cart, checkout transition, daily deals, and notifications.

## [SYSTEM_FLOW]
1. **Initialization:** App starts, Hilt graph is created, Timber is attached in debug, Compose root is rendered.
2. **Discovery Flow:** Home screen loads products and categories from `/api/products` and `/api/categories`; category selection filters the visible list.
3. **Product Detail Flow:** Product card opens product detail using the real API product id.
4. **Shopping Flow:** Product detail adds item to local Room-backed cart; cart screen shows items, quantity, and total.
5. **Checkout Flow:** Cart transitions to checkout summary and then to NovaStore secure payment entry.
6. **Engagement Flow:** Daily deals and notifications are listed without expanding scope beyond the first APK.

## [ARCHITECTURE]
- **Data Layer:** Retrofit services, Room DAOs, repository implementations, error logging.
- **Domain Layer:** Minimal domain models only where the app needs stable UI/business fields.
- **UI Layer:** Compose screens, Hilt ViewModels, StateFlow state models, Navigation Compose routes.
- **Shared/Core Rule:** Shared code is allowed only for repeated behavior such as formatting, logging, persistence, and navigation.

## [THEME_REDESIGN_PROTOCOL]
- **Reference Pattern:** Trendyol, Hepsiburada, and Alibaba-style mobile commerce density will be used as product-experience references, not copied visually.
- **Target Identity:** NovaStore remains technology-focused, premium, fast, and trust-led; no marketplace clutter or unrelated features.
- **Scope:** Theme, home/discovery layout, product cards, deal strip, category chips, detail hierarchy, cart bottom bar, and notification screen polish.
- **Non-Scope:** Loyalty systems, marketplace seller pages, social feeds, live commerce, gamification, and webview shell behavior.
- **Verification:** Theme work must pass build/tests and emulator visual smoke review before APK regeneration.

## [COMPLETED]
- [x] Android app module scaffolded.
- [x] Hilt, Retrofit, OkHttp, Timber, Compose Navigation, Coil, and Room dependencies configured.
- [x] Product/category API contracts aligned with existing backend routes.
- [x] Product Discovery implemented with loading, error, empty, category, and list states.
- [x] Product Detail implemented with route argument, loading, error, and content states.
- [x] Repository filtering covered by unit tests.
- [x] Room-backed cart persistence implemented.
- [x] Product Detail adds products to cart with logged failure handling.
- [x] Cart screen shows items, quantity controls, removal, and live total.
- [x] Checkout summary opens NovaStore secure payment entry URL.
- [x] Cart total calculation covered by unit tests.
- [x] Daily Deals implemented from discounted product data.
- [x] Notifications implemented with customer login session, backend notification list, read actions, and logout.
- [x] Notification title mapping covered by unit tests.
- [x] Premium NovaStore theme system implemented with navy/orange commerce palette, stronger typography, and rounded surfaces.
- [x] Discovery screen redesigned with search-first header, category chips, commerce hero, daily deals, and two-column product grid.
- [x] Product detail, cart, checkout, and notifications aligned with the new premium commerce theme.
- [x] NovaStore.tr web palette aligned to native theme: `#0F2A43`, `#1E4E79`, `#F7941D`, `#F5F7FA`, white surfaces.
- [x] Product card presentation policy added and covered by TDD unit test.
- [x] Discovery product cards now expose image area, category, badge, stock label, old/new price layout, favorite toggle, and add-to-cart action.
- [x] Discovery search/category actions and card add-to-cart failures are logged through Timber without logging sensitive query text.
- [x] Themed APK installed and smoke-launched on `emulator-5554`.
- [x] Android app files passed the banned-marker scan.
- [x] AndroidX build properties configured.
- [x] Gradle wrapper generated for repeatable local builds.
- [x] Release signing config wired through Gradle properties without hardcoded secrets.
- [x] Debug APK generated at `app/build/outputs/apk/debug/app-debug.apk`.
- [x] Unsigned release APK generated at `app/build/outputs/apk/release/app-release-unsigned.apk`.
- [x] `./gradlew.bat :app:assembleDebug :app:assembleRelease :app:testDebugUnitTest` passed.
- [x] `git diff --check` passed; only unrelated CRLF warnings were emitted by existing workspace files.

## [SCOPE NOTES]
- Native Favorites screen and Account screen are not implemented in the current APK product scope; this surgical edit only added product-card favorite state and preserved existing scoped flows.

## [ORPHANS & PENDING]
None.

## [EXTERNAL BLOCKERS]
- Signed production release requires keystore passwords supplied via `NOVASTORE_RELEASE_STORE_PASSWORD`, `NOVASTORE_RELEASE_KEY_ALIAS`, and `NOVASTORE_RELEASE_KEY_PASSWORD`.
