package com.novastore.app.core.navigation

enum class CustomerRouteId {
    ACCOUNT_HUB,
    SIGN_IN,
    REGISTER,
    REGISTRATION_SUCCESS,
    EMAIL_VERIFICATION,
    PHONE_VERIFICATION,
    FORGOT_PASSWORD,
    PASSWORD_RESET_CODE,
    NEW_PASSWORD,
    PASSWORD_CHANGED,
    SIGN_IN_TWO_FACTOR,
    HOME,
    CATEGORIES,
    FAVORITES,
    PRODUCT_CARD_SPECIMEN,
    SEARCH,
    NOTIFICATIONS,
    SETTINGS,
    PROFILE_EDIT,
    PROFILE_PHOTO_ACTIONS,
    EMAIL_CHANGE,
    PHONE_CHANGE,
    PASSWORD_CHANGE,
    LOGOUT_CONFIRM,
    ADDRESSES,
    ADDRESS_FORM,
    ADDRESS_DELETE_CONFIRM,
    CHECKOUT_ADDRESS_FORM,
    CHECKOUT_ADDRESS_SELECT,
    ORDERS,
    ORDER_DETAIL,
    SHIPMENT_TRACKING,
    INVOICE_VIEWER,
    ORDER_CANCEL,
    ORDER_CANCELLED,
    RETURN_CREATE,
    RETURN_TRACKING,
    PAYMENT_METHODS,
    PAYMENT_METHOD_ADD,
    PAYMENT_METHOD_VERIFIED,
    PAYMENT_METHOD_ACTIONS,
    COUPONS,
    COUPON_DETAIL,
    CHECKOUT_PAYMENT,
    REVIEWS,
    REVIEW_CREATE,
    REVIEW_DETAIL,
    QUESTIONS,
    QUESTION_DETAIL,
    SUPPORT_HUB,
    NOVABOT_CHAT,
    LIVE_SUPPORT_CHAT,
    SUPPORT_CONVERSATIONS,
    SUPPORT_CONVERSATION_DETAIL,
    SUPPORT_RATING,
    FAQ_HUB,
    FAQ_ARTICLE,
    SECURITY_HUB,
    ACTIVE_SESSIONS,
    TWO_FACTOR_METHOD,
    AUTHENTICATOR_SETUP,
    RECOVERY_CODES,
    PRIVACY_PERMISSIONS,
    DATA_EXPORT,
    ACCOUNT_DELETE_INFO,
    ACCOUNT_DELETE_CONFIRM,
    PRIVACY_POLICY_VIEWER,
    NOTIFICATION_PREFERENCES,
    QUIET_HOURS,
    LANGUAGE_REGION,
    APPEARANCE_ACCESSIBILITY,
    DEVICE_PERMISSIONS_DATA,
    ABOUT_LEGAL
}

enum class CustomerAuthRequirement {
    PUBLIC,
    SIGNED_OUT,
    SIGNED_IN,
    CHALLENGE
}

enum class CustomerChrome(
    val topBar: Boolean,
    val bottomBar: Boolean,
    val backButton: Boolean,
    val modal: Boolean
) {
    ROOT(topBar = true, bottomBar = true, backButton = false, modal = false),
    ROOT_ACTIONS(topBar = true, bottomBar = true, backButton = false, modal = false),
    DETAIL_WITH_NAV(topBar = true, bottomBar = true, backButton = true, modal = false),
    DETAIL(topBar = true, bottomBar = false, backButton = true, modal = false),
    FULLSCREEN(topBar = false, bottomBar = false, backButton = false, modal = false),
    MODAL_WITH_NAV(topBar = true, bottomBar = true, backButton = false, modal = true),
    MODAL(topBar = true, bottomBar = false, backButton = true, modal = true),
    COMPONENT(topBar = false, bottomBar = true, backButton = false, modal = false)
}

enum class CustomerSampleState {
    DEFAULT,
    SIGNED_OUT,
    SIGNED_IN,
    FORM_EMPTY,
    FORM_FILLED,
    LIST,
    DETAIL,
    SUCCESS,
    CONFIRMATION,
    ACTIVE
}

data class CustomerVisualReference(
    val referenceFile: String,
    val referenceSha256: String,
    val referenceWidth: Int,
    val referenceHeight: Int,
    val screenId: String,
    val routeId: CustomerRouteId,
    val authRequirement: CustomerAuthRequirement,
    val chrome: CustomerChrome,
    val sampleState: CustomerSampleState,
    val variant: String,
    val tour: Int
)

/**
 * Machine-readable contract for all 80 supplied files and 77 byte-unique
 * visual states. Exact duplicate files intentionally share a [screenId].
 */
object CustomerVisualManifest {
    const val EXPECTED_REFERENCE_COUNT = 80
    const val EXPECTED_SCREEN_COUNT = 77

    val references: List<CustomerVisualReference> = listOf(
        // Tur 2 — signed-out and signed-in account roots.
        r("giriş kayıt ol kısmı.png", "bae16db2c1e0cdcbfae51baba2f7096822aaae7cddb32e9e868310347b48103f", 852, 1846, "account-hub-signed-out", CustomerRouteId.ACCOUNT_HUB, CustomerAuthRequirement.SIGNED_OUT, CustomerChrome.ROOT, CustomerSampleState.SIGNED_OUT, "guest", 2),
        r("hesabım kısmı.png", "db037c342996e1627ea97e1d2c31b6e202e6dbc7c643203f88380b657893ff9d", 852, 1846, "account-hub-signed-in", CustomerRouteId.ACCOUNT_HUB, CustomerAuthRequirement.SIGNED_IN, CustomerChrome.ROOT, CustomerSampleState.SIGNED_IN, "customer", 2),

        // Tur 3 — authentication, registration, verification and reset.
        r("Giriş, kayıt ve şifre sıfırlama.png", "d2f4dc36982360378169e3156d91a353dd443b75795578a280810c8066b31e9c", 852, 1846, "sign-in", CustomerRouteId.SIGN_IN, CustomerAuthRequirement.SIGNED_OUT, CustomerChrome.DETAIL, CustomerSampleState.FORM_EMPTY, "credentials", 3),
        r("Hesap Oluştur.png", "25bc8c3d6e850a3d27257ab4dd2d157c4e2ce17b49ed96990c7f76e7d558f1c2", 864, 1821, "registration", CustomerRouteId.REGISTER, CustomerAuthRequirement.SIGNED_OUT, CustomerChrome.DETAIL, CustomerSampleState.FORM_EMPTY, "customer", 3),
        r("Kayıt tamamlandı.png", "e0e3ca841396bc91a23c43e0099ba29e8ba16fe634b817f29c8b648b02f3fcef", 853, 1844, "registration-success", CustomerRouteId.REGISTRATION_SUCCESS, CustomerAuthRequirement.SIGNED_OUT, CustomerChrome.FULLSCREEN, CustomerSampleState.SUCCESS, "email-verified-phone-pending", 3),
        r("E-posta doğrulama.png", "0b532df8b8a8c82b442ce309c7ddb720f92f5a743c2a11f12fc2289e617b5cd1", 852, 1846, "email-verification", CustomerRouteId.EMAIL_VERIFICATION, CustomerAuthRequirement.CHALLENGE, CustomerChrome.DETAIL_WITH_NAV, CustomerSampleState.FORM_FILLED, "otp-six-digit", 3),
        r("Telefon doğrulama.png", "8db5866680b9e0e275be68d8a843daadfb10339c8783ceb9875880005814e552", 852, 1846, "phone-verification", CustomerRouteId.PHONE_VERIFICATION, CustomerAuthRequirement.CHALLENGE, CustomerChrome.DETAIL_WITH_NAV, CustomerSampleState.FORM_FILLED, "otp-six-digit", 3),
        r("Şifremi Unuttum.png", "ab4c195d16584f8b28160adf7b661c68bd25a6cd05d2a43d89ee6bf2831174fa", 852, 1846, "forgot-password", CustomerRouteId.FORGOT_PASSWORD, CustomerAuthRequirement.SIGNED_OUT, CustomerChrome.DETAIL, CustomerSampleState.FORM_EMPTY, "identifier", 3),
        r("Şifre sıfırlama kodu.png", "c8f2b45a26ffbe6c6ec5b0631322c1bd734ffc2d12e7ab2bd00e07428ce3e4f2", 852, 1847, "password-reset-code", CustomerRouteId.PASSWORD_RESET_CODE, CustomerAuthRequirement.CHALLENGE, CustomerChrome.DETAIL, CustomerSampleState.FORM_FILLED, "otp-six-digit", 3),
        r("Yeni şifre oluşturma.png", "017dd0134dfc5a3945552d0850d0a112a47a4eaa6d78b2e8d7c17fb6496e718c", 852, 1846, "new-password", CustomerRouteId.NEW_PASSWORD, CustomerAuthRequirement.CHALLENGE, CustomerChrome.DETAIL, CustomerSampleState.FORM_FILLED, "strength-valid", 3),
        r("Şifre değiştirildi.png", "48fbe8c492523d65ebce0b5db53e9a80357f6a50f9fee63acce810c97606db41", 862, 1824, "password-changed", CustomerRouteId.PASSWORD_CHANGED, CustomerAuthRequirement.SIGNED_OUT, CustomerChrome.FULLSCREEN, CustomerSampleState.SUCCESS, "reset-complete", 3),
        r("İki adımlı doğrulamayla giriş.png", "60b7df2152003f3e10676d85353ce49144ab61a200e865dab523de8d7ba7fcf7", 852, 1846, "sign-in-two-factor", CustomerRouteId.SIGN_IN_TWO_FACTOR, CustomerAuthRequirement.CHALLENGE, CustomerChrome.DETAIL, CustomerSampleState.FORM_FILLED, "authenticator", 3),

        // Tur 4 — discovery, categories, favourites, search and notifications.
        r("Anasayfa teması.png", "1b6ef48087360f6bd2e75c5b1bc766e7600f92bdcd6df6230bd9865e96a8122e", 853, 1844, "home", CustomerRouteId.HOME, CustomerAuthRequirement.PUBLIC, CustomerChrome.ROOT_ACTIONS, CustomerSampleState.DEFAULT, "discovery", 4),
        r("kategoriler kısmı.jpg", "5b903be0e9f2c6b79d65fcea211b39f2f4a2a90aba1a32db8f6f3653350418a4", 740, 1600, "categories", CustomerRouteId.CATEGORIES, CustomerAuthRequirement.PUBLIC, CustomerChrome.ROOT_ACTIONS, CustomerSampleState.DEFAULT, "image-grid", 4),
        r("favori kısmı.png", "31c891bdc7685e983be0fdad2bc67ff3b1379446e3641d6ffd9ef82f877a7b04", 852, 1846, "favorites", CustomerRouteId.FAVORITES, CustomerAuthRequirement.SIGNED_IN, CustomerChrome.ROOT_ACTIONS, CustomerSampleState.LIST, "products", 4),
        r("ürün kartı tasarımı.png", "ec00daa543fc8f0a11659ee545d018dec5288f4b81d9650aa830e374a6f63b7f", 853, 1844, "product-card-specimen", CustomerRouteId.PRODUCT_CARD_SPECIMEN, CustomerAuthRequirement.PUBLIC, CustomerChrome.COMPONENT, CustomerSampleState.DEFAULT, "discounted", 4),
        r("arama kısmı 1.png", "6e7a0add4d4b16f1967a2417f30d618883c7546ab1be34f73ad96f8c70b9dc57", 853, 1844, "search-recents", CustomerRouteId.SEARCH, CustomerAuthRequirement.PUBLIC, CustomerChrome.ROOT_ACTIONS, CustomerSampleState.DEFAULT, "recents", 4),
        r("arama kısmı 2.png", "623f4a739fcc4221dd6aabd563021aeb0bf691fa50c258d4bc2b3e167f1f57de", 853, 1844, "search-results", CustomerRouteId.SEARCH, CustomerAuthRequirement.PUBLIC, CustomerChrome.DETAIL_WITH_NAV, CustomerSampleState.LIST, "results", 4),
        r("bildirim kısmı.png", "ce2792aedb066d701ac8ce76cbce09d0c55d353e1a67032a20d2f87611410758", 853, 1844, "notifications", CustomerRouteId.NOTIFICATIONS, CustomerAuthRequirement.SIGNED_IN, CustomerChrome.ROOT_ACTIONS, CustomerSampleState.LIST, "grouped", 4),

        // Tur 5 — profile, contact security, settings and logout.
        r("Ayarlar ve profil düzenleme.png", "222a28f9f1d9e1b2a21d91a9f4e08a7cde025ab37d82716d4283b160046b713e", 852, 1846, "settings-hub", CustomerRouteId.SETTINGS, CustomerAuthRequirement.SIGNED_IN, CustomerChrome.DETAIL_WITH_NAV, CustomerSampleState.LIST, "account", 5),
        r("Profilimi Düzenle.png", "adef6d59b3356300dfbc9b37ef42e7fb220259f9397e1e1b4c645b4dd26f15a9", 853, 1844, "profile-edit", CustomerRouteId.PROFILE_EDIT, CustomerAuthRequirement.SIGNED_IN, CustomerChrome.DETAIL_WITH_NAV, CustomerSampleState.FORM_FILLED, "personal-and-contact", 5),
        r("Profil fotoğrafı işlemleri.png", "d1fe62356919087351207951742372711ce2f8ef47d27def0f93a8d6c9c2eddb", 861, 1827, "profile-photo-actions", CustomerRouteId.PROFILE_PHOTO_ACTIONS, CustomerAuthRequirement.SIGNED_IN, CustomerChrome.MODAL, CustomerSampleState.CONFIRMATION, "bottom-sheet", 5),
        r("E-posta adresini değiştirme.png", "8f45adff8414fdea9cf301e57a6068b4776c3d365c5542f051cdcd8934e75a78", 852, 1846, "email-change", CustomerRouteId.EMAIL_CHANGE, CustomerAuthRequirement.SIGNED_IN, CustomerChrome.DETAIL_WITH_NAV, CustomerSampleState.FORM_EMPTY, "challenge-start", 5),
        r("Telefon numarasını güvenli biçimde değiştirme.png", "e8f65ab04ac3f83f3fbf05468c7c8199d213794982274774e2d150426ea3a96e", 853, 1844, "phone-change", CustomerRouteId.PHONE_CHANGE, CustomerAuthRequirement.SIGNED_IN, CustomerChrome.DETAIL_WITH_NAV, CustomerSampleState.FORM_FILLED, "challenge-start", 5),
        r("Giriş yapılmış hesaptan şifre değiştirme.png", "6d6a7a1adf782906f21b1bc832718bea1f46da3284ebf75a7af28fae8dc81c41", 852, 1846, "password-change-authenticated", CustomerRouteId.PASSWORD_CHANGE, CustomerAuthRequirement.SIGNED_IN, CustomerChrome.DETAIL_WITH_NAV, CustomerSampleState.FORM_FILLED, "authenticated", 5),
        r("Çıkış yapma onayı.png", "5cc4f503172d76762da68acc110b9ddf37f5baf0d1bedc10e5a01aeb0c21fb84", 853, 1844, "logout-confirm", CustomerRouteId.LOGOUT_CONFIRM, CustomerAuthRequirement.SIGNED_IN, CustomerChrome.MODAL_WITH_NAV, CustomerSampleState.CONFIRMATION, "remove-device-credentials", 5),

        // Tur 6 — account and checkout address management.
        r("Adres yönetimi.png", "1f9aec5787bc2fa83648b991189892af47fdc68ff92dc7fcb1c391b724a30df6", 852, 1846, "address-list", CustomerRouteId.ADDRESSES, CustomerAuthRequirement.SIGNED_IN, CustomerChrome.DETAIL_WITH_NAV, CustomerSampleState.LIST, "account", 6),
        r("Yeni adres ekleme.png", "119b961715c38960e80c2701c19d55316700624bfc6d567e728c5e7edc5473a2", 852, 1846, "address-create", CustomerRouteId.ADDRESS_FORM, CustomerAuthRequirement.SIGNED_IN, CustomerChrome.DETAIL_WITH_NAV, CustomerSampleState.FORM_EMPTY, "account-create", 6),
        r("Adresi düzenleme.png", "810e51ae33e0de88b19938dc341aa0603dac8159e0bf5e8daaf97e9d5e90420b", 852, 1846, "address-edit", CustomerRouteId.ADDRESS_FORM, CustomerAuthRequirement.SIGNED_IN, CustomerChrome.DETAIL_WITH_NAV, CustomerSampleState.FORM_FILLED, "account-edit", 6),
        r("Adres silme onayı.png", "17961293370cb9e177336bb21c1d0b1258c74b26bee7ad1cb4535c0be5680e2f", 852, 1846, "address-delete-confirm", CustomerRouteId.ADDRESS_DELETE_CONFIRM, CustomerAuthRequirement.SIGNED_IN, CustomerChrome.MODAL_WITH_NAV, CustomerSampleState.CONFIRMATION, "destructive", 6),
        r("adres ekleme 1.png", "d37d9f1c431864b85cbf4419f997749c32babd9f31fc7b42cf7d050ae3b1b929", 853, 1844, "checkout-address-edit", CustomerRouteId.CHECKOUT_ADDRESS_FORM, CustomerAuthRequirement.SIGNED_IN, CustomerChrome.DETAIL_WITH_NAV, CustomerSampleState.FORM_FILLED, "checkout-edit", 6),
        r("adres ekleme 2.png", "82c2d9550dfab18f591153c1561bc0cba7770c378911816a28cff44837c0f60e", 853, 1844, "checkout-address-create", CustomerRouteId.CHECKOUT_ADDRESS_FORM, CustomerAuthRequirement.SIGNED_IN, CustomerChrome.DETAIL_WITH_NAV, CustomerSampleState.FORM_EMPTY, "checkout-create", 6),
        r("adres seçimi.png", "c59b6d6f25d1702114651156908b061440b04ed7413c628aab1956a0a1de60a7", 853, 1844, "checkout-address-select", CustomerRouteId.CHECKOUT_ADDRESS_SELECT, CustomerAuthRequirement.SIGNED_IN, CustomerChrome.DETAIL_WITH_NAV, CustomerSampleState.LIST, "checkout", 6),

        // Tur 7 — orders, cargo, cancellation, returns and refunds.
        r("Siparişlerim listesi.png", "a7930a78a89f4e01ff54bff8e8a14c46bc535554dd3aa31e43fd4081460ffc37", 850, 1850, "orders", CustomerRouteId.ORDERS, CustomerAuthRequirement.SIGNED_IN, CustomerChrome.DETAIL_WITH_NAV, CustomerSampleState.LIST, "filtered", 7),
        r("Sipariş detayı.png", "922729ca9c3fa83e5f1fc038d05410787af4153d251abb6f6cd91686b3dca46a", 852, 1846, "order-detail", CustomerRouteId.ORDER_DETAIL, CustomerAuthRequirement.SIGNED_IN, CustomerChrome.DETAIL_WITH_NAV, CustomerSampleState.DETAIL, "in-transit", 7),
        r("Kargo takibi.png", "f10f25e24833c891483fb9a0853e30acd528a1ac263163a8694c53a5a73623d2", 852, 1846, "shipment-tracking", CustomerRouteId.SHIPMENT_TRACKING, CustomerAuthRequirement.SIGNED_IN, CustomerChrome.DETAIL_WITH_NAV, CustomerSampleState.ACTIVE, "distribution-center", 7),
        r("E-Arşiv fatura.png", "aa06bffc239ca4ff420a76668bd231d4a147966751d533327f83ae810a48b6ef", 852, 1847, "invoice-viewer", CustomerRouteId.INVOICE_VIEWER, CustomerAuthRequirement.SIGNED_IN, CustomerChrome.DETAIL_WITH_NAV, CustomerSampleState.DETAIL, "e-archive", 7),
        r("Sipariş iptali.png", "e4cfb78ba2317e1eb06205b4076d2ac972cb897be6a5cd082da402a7c5023a3a", 852, 1846, "order-cancel", CustomerRouteId.ORDER_CANCEL, CustomerAuthRequirement.SIGNED_IN, CustomerChrome.DETAIL_WITH_NAV, CustomerSampleState.FORM_FILLED, "eligible", 7),
        r("Sipariş iptal edildi.png", "a66c9fb6bacb1d04c970da41a4f088fdc37f4599f99027948cc18cfa7219a77c", 852, 1846, "order-cancelled", CustomerRouteId.ORDER_CANCELLED, CustomerAuthRequirement.SIGNED_IN, CustomerChrome.DETAIL_WITH_NAV, CustomerSampleState.SUCCESS, "refund-started", 7),
        r("ade talebi oluşturma.png", "1ae9f8f4a0739f9618ac35de220aef0bd867785201ba2755385ff2a062136a38", 852, 1846, "return-create", CustomerRouteId.RETURN_CREATE, CustomerAuthRequirement.SIGNED_IN, CustomerChrome.DETAIL_WITH_NAV, CustomerSampleState.FORM_FILLED, "item-and-reason", 7),
        r("İade ve geri ödeme takibi.png", "dd8178d69b34a3b318b9134f5fcba0f469a7feb37f514291f4b34ffa35118bce", 852, 1846, "return-tracking", CustomerRouteId.RETURN_TRACKING, CustomerAuthRequirement.SIGNED_IN, CustomerChrome.DETAIL_WITH_NAV, CustomerSampleState.ACTIVE, "inspection", 7),

        // Tur 8 — payment methods, coupons and checkout payment.
        r("Kayıtlı ödeme yöntemleri.png", "9eec96674dcaa60c5b1f05ed2debcd01bfcfa96d4c1ceaa605f8e87a71fd954d", 852, 1846, "payment-methods", CustomerRouteId.PAYMENT_METHODS, CustomerAuthRequirement.SIGNED_IN, CustomerChrome.DETAIL_WITH_NAV, CustomerSampleState.LIST, "tokenized", 8),
        r("Yeni kart ekleme.png", "087b71e0c8988df1a972c8bc4c49c743eaf899274d6355ad7d911a94e065bf62", 852, 1846, "payment-method-add", CustomerRouteId.PAYMENT_METHOD_ADD, CustomerAuthRequirement.SIGNED_IN, CustomerChrome.DETAIL_WITH_NAV, CustomerSampleState.FORM_EMPTY, "provider-tokenization", 8),
        r("Kart doğrulama başarı durumu.png", "78c1105dfbf3982284de648e28b46b9d401566b0f95b3cf51bcf842349a38f48", 852, 1846, "payment-method-verified", CustomerRouteId.PAYMENT_METHOD_VERIFIED, CustomerAuthRequirement.SIGNED_IN, CustomerChrome.DETAIL_WITH_NAV, CustomerSampleState.SUCCESS, "default-card", 8),
        r("Kart işlemleri.png", "31c3c908f28ad60ac0d0c3d06eff5add6b00be2de0bd8de42586e69530f1fe07", 852, 1846, "payment-method-actions", CustomerRouteId.PAYMENT_METHOD_ACTIONS, CustomerAuthRequirement.SIGNED_IN, CustomerChrome.MODAL_WITH_NAV, CustomerSampleState.CONFIRMATION, "bottom-sheet", 8),
        r("Kupon merkezi.png", "074468cada76316ce45ad99e62100790b171c10064d70bacbbe1f06314ec6424", 852, 1846, "coupons", CustomerRouteId.COUPONS, CustomerAuthRequirement.SIGNED_IN, CustomerChrome.DETAIL_WITH_NAV, CustomerSampleState.LIST, "available", 8),
        r("Kupon detayı.png", "a47ebf479d7f7fb251e2339315579cb779f45bab479654462ac1d05db73cb0ac", 852, 1846, "coupon-detail", CustomerRouteId.COUPON_DETAIL, CustomerAuthRequirement.SIGNED_IN, CustomerChrome.DETAIL_WITH_NAV, CustomerSampleState.DETAIL, "eligible", 8),
        r("ödeme ekranı.png", "8918766a6996fb04af991209de70aba32cb04f8c098ad6ebb7eac5009d822faa", 853, 1844, "checkout-payment", CustomerRouteId.CHECKOUT_PAYMENT, CustomerAuthRequirement.SIGNED_IN, CustomerChrome.DETAIL_WITH_NAV, CustomerSampleState.FORM_FILLED, "card", 8),

        // Tur 9 — reviews and seller questions.
        r("Değerlendirme merkezi.png", "6b4094065970b6c720e9c31aff70fd1019c5bccbc9467f24cb28573de416c4f4", 852, 1846, "review-center", CustomerRouteId.REVIEWS, CustomerAuthRequirement.SIGNED_IN, CustomerChrome.DETAIL_WITH_NAV, CustomerSampleState.LIST, "awaiting-review", 9),
        r("Değerlendirme yazma.png", "2b9457905f598467f022b217859bee809bfb013dd271630b883100802d298de8", 852, 1846, "review-create", CustomerRouteId.REVIEW_CREATE, CustomerAuthRequirement.SIGNED_IN, CustomerChrome.DETAIL_WITH_NAV, CustomerSampleState.FORM_EMPTY, "product-and-seller", 9),
        r("Yayınlanan değerlendirme detayı.png", "5ea31aea478634761121dfc50196e317e27f0ec9d0e427a8b9451a7d64e22066", 852, 1846, "review-detail", CustomerRouteId.REVIEW_DETAIL, CustomerAuthRequirement.SIGNED_IN, CustomerChrome.DETAIL_WITH_NAV, CustomerSampleState.DETAIL, "published", 9),
        r("Satıcıya sorulan sorular.png", "aab6ccb4d5e992a3769e4413ce8bc5912a34e7a26f31f80fb59155e41e66f804", 852, 1846, "questions", CustomerRouteId.QUESTIONS, CustomerAuthRequirement.SIGNED_IN, CustomerChrome.DETAIL_WITH_NAV, CustomerSampleState.LIST, "mixed-status", 9),
        r("Soru ve satıcı yanıtı detayı.png", "293e84a55b1a486af67fc3f2174c0e3092653fc94dc2ca780fa6d89385c6f154", 850, 1850, "question-detail", CustomerRouteId.QUESTION_DETAIL, CustomerAuthRequirement.SIGNED_IN, CustomerChrome.DETAIL_WITH_NAV, CustomerSampleState.DETAIL, "answered", 9),

        // Tur 10 — support, NovaBot, live chat, history and FAQ.
        r("Yardım, NovaBot, canlı destek ve SSS.png", "5d88d6f2440a3dda4f5e907fbc5c64c7bdea69e17e5197c5fdd1dae83ce8479e", 852, 1846, "support-hub", CustomerRouteId.SUPPORT_HUB, CustomerAuthRequirement.PUBLIC, CustomerChrome.ROOT_ACTIONS, CustomerSampleState.DEFAULT, "help", 10),
        r("NovaBot sohbet.png", "6f41bd5fdb1ae255794ab7d2748bc7f4919e6e8846c0ac965c6c616349678f1a", 853, 1844, "novabot-chat", CustomerRouteId.NOVABOT_CHAT, CustomerAuthRequirement.PUBLIC, CustomerChrome.ROOT_ACTIONS, CustomerSampleState.ACTIVE, "canonical", 10),
        r("novabot chat.png", "6f41bd5fdb1ae255794ab7d2748bc7f4919e6e8846c0ac965c6c616349678f1a", 853, 1844, "novabot-chat", CustomerRouteId.NOVABOT_CHAT, CustomerAuthRequirement.PUBLIC, CustomerChrome.ROOT_ACTIONS, CustomerSampleState.ACTIVE, "filename-alias", 10),
        r("Canlı desteğe bağlanmış sohbet.png", "004110f17eb25f33e1cb865b46081d731cd7c0ffa57596f10831a28cf443e898", 852, 1846, "live-support-chat", CustomerRouteId.LIVE_SUPPORT_CHAT, CustomerAuthRequirement.SIGNED_IN, CustomerChrome.ROOT_ACTIONS, CustomerSampleState.ACTIVE, "canonical", 10),
        r("canlı destek chat.png", "004110f17eb25f33e1cb865b46081d731cd7c0ffa57596f10831a28cf443e898", 852, 1846, "live-support-chat", CustomerRouteId.LIVE_SUPPORT_CHAT, CustomerAuthRequirement.SIGNED_IN, CustomerChrome.ROOT_ACTIONS, CustomerSampleState.ACTIVE, "filename-alias", 10),
        r("Geçmiş sohbetler.png", "f5f3f19127dd820a86f7c516b0b9df9dd0b6c7423916548b46fa057164b62731", 853, 1844, "support-conversations", CustomerRouteId.SUPPORT_CONVERSATIONS, CustomerAuthRequirement.SIGNED_IN, CustomerChrome.DETAIL_WITH_NAV, CustomerSampleState.LIST, "canonical", 10),
        r("geçmiş chat.png", "f5f3f19127dd820a86f7c516b0b9df9dd0b6c7423916548b46fa057164b62731", 853, 1844, "support-conversations", CustomerRouteId.SUPPORT_CONVERSATIONS, CustomerAuthRequirement.SIGNED_IN, CustomerChrome.DETAIL_WITH_NAV, CustomerSampleState.LIST, "filename-alias", 10),
        r("Geçmiş görüşme detayı.png", "c0c88c00774f9d7c02f6ea95fb83706f2186abfba86cb9098267d7bea90bf2ed", 852, 1846, "support-conversation-detail", CustomerRouteId.SUPPORT_CONVERSATION_DETAIL, CustomerAuthRequirement.SIGNED_IN, CustomerChrome.DETAIL_WITH_NAV, CustomerSampleState.DETAIL, "resolved", 10),
        r("Destek görüşmesini puanlama.png", "badec22d0988358f7c0ebfadf73cc227345ff2df8205720c4f0d456ca510343f", 853, 1844, "support-rating", CustomerRouteId.SUPPORT_RATING, CustomerAuthRequirement.SIGNED_IN, CustomerChrome.MODAL, CustomerSampleState.FORM_FILLED, "bottom-sheet", 10),
        r("Sıkça Sorulan Sorular merkezi.png", "fe0cc9df5f980985031bfe1ca5a33fe59c414f72542ac82851056cfcad775645", 852, 1846, "faq-hub", CustomerRouteId.FAQ_HUB, CustomerAuthRequirement.PUBLIC, CustomerChrome.DETAIL_WITH_NAV, CustomerSampleState.LIST, "topics", 10),
        r("SSS makale detayı.png", "f708bdfadb195e76dec14b9c7be2b6dad77bdb5665d18d6f8f15c39bcdcd0b05", 852, 1847, "faq-article", CustomerRouteId.FAQ_ARTICLE, CustomerAuthRequirement.PUBLIC, CustomerChrome.DETAIL_WITH_NAV, CustomerSampleState.DETAIL, "shipment", 10),

        // Tur 11 — security, sessions, privacy, export and deletion.
        r("Gizlilik ve Güvenlik merkezi.png", "078d95bdac45a5c8781be7f366c35f427f73dcd215eb0c7785a570a0a8ae7a61", 852, 1846, "security-hub", CustomerRouteId.SECURITY_HUB, CustomerAuthRequirement.SIGNED_IN, CustomerChrome.DETAIL_WITH_NAV, CustomerSampleState.LIST, "account-protection", 11),
        r("Aktif cihazlar ve oturumlar.png", "e683ce41c46e46959df8d183974586a456134cdbfcef044eb4587fdd15275fe7", 852, 1846, "active-sessions", CustomerRouteId.ACTIVE_SESSIONS, CustomerAuthRequirement.SIGNED_IN, CustomerChrome.DETAIL_WITH_NAV, CustomerSampleState.LIST, "current-and-other", 11),
        r("İki adımlı doğrulama yöntemi.png", "4e3686fb45faa07979bf068c91cf604c4dfaeeac3b8a5ad2718d02e90bffb524", 852, 1846, "two-factor-method", CustomerRouteId.TWO_FACTOR_METHOD, CustomerAuthRequirement.SIGNED_IN, CustomerChrome.DETAIL_WITH_NAV, CustomerSampleState.DEFAULT, "authenticator-recommended", 11),
        r("Doğrulama uygulaması ve QR kurulumu.png", "33c6a398f658f32409c1cc343a1c841cbf78d1dc068fa09f8ce674c31759a741", 852, 1846, "authenticator-setup", CustomerRouteId.AUTHENTICATOR_SETUP, CustomerAuthRequirement.CHALLENGE, CustomerChrome.DETAIL_WITH_NAV, CustomerSampleState.FORM_FILLED, "qr-and-code", 11),
        r("Kurtarma kodları.png", "10cd2773c903788587bc726eb1d3a22c8f6f97d57e766a3f589f8858470a6ed3", 852, 1846, "recovery-codes", CustomerRouteId.RECOVERY_CODES, CustomerAuthRequirement.CHALLENGE, CustomerChrome.DETAIL_WITH_NAV, CustomerSampleState.SUCCESS, "single-display", 11),
        r("Gizlilik ve izinler.png", "a8e691791655b499763ddebe020cc02cbbf28f01dc725902483c2c3397d22b73", 853, 1844, "privacy-permissions", CustomerRouteId.PRIVACY_PERMISSIONS, CustomerAuthRequirement.SIGNED_IN, CustomerChrome.DETAIL_WITH_NAV, CustomerSampleState.LIST, "personalization", 11),
        r("Verilerimin kopyasını isteme.png", "55d6aaa1dd2d0020d6d39c03a3c85171eb6e331c7ceb012ac754d921b1ecc0af", 852, 1846, "data-export", CustomerRouteId.DATA_EXPORT, CustomerAuthRequirement.SIGNED_IN, CustomerChrome.DETAIL_WITH_NAV, CustomerSampleState.FORM_FILLED, "identity-confirmation", 11),
        r("Hesabı silme bilgilendirmesi.png", "c2937d20afdc1780492907e7eb4b023ffc6b39090d26cd0e5c391f5773418c48", 852, 1846, "account-delete-info", CustomerRouteId.ACCOUNT_DELETE_INFO, CustomerAuthRequirement.SIGNED_IN, CustomerChrome.DETAIL_WITH_NAV, CustomerSampleState.CONFIRMATION, "reason", 11),
        r("Hesabı kalıcı silme son onayı.png", "ffe41d4e58bc4afdada7c4729bcf54dd9db35a16fe6c2eff66c3b03c1b1db23b", 852, 1846, "account-delete-confirm", CustomerRouteId.ACCOUNT_DELETE_CONFIRM, CustomerAuthRequirement.CHALLENGE, CustomerChrome.DETAIL, CustomerSampleState.CONFIRMATION, "type-to-confirm", 11),
        r("Gizlilik politikası belge görüntüleyici.png", "142a94a7238ff867e7f78738df3c375bc047fe679487fc2f1d854e3d98509050", 852, 1846, "privacy-policy-viewer", CustomerRouteId.PRIVACY_POLICY_VIEWER, CustomerAuthRequirement.PUBLIC, CustomerChrome.DETAIL_WITH_NAV, CustomerSampleState.DETAIL, "versioned", 11),

        // Tur 12 — preferences, accessibility, permissions and legal.
        r("Bildirim ve uygulama tercihleri.png", "69e9d21fe9757eaa3e805b17c118aa62fece2aa32053b9d32ce50a7291ccbde4", 852, 1846, "notification-preferences", CustomerRouteId.NOTIFICATION_PREFERENCES, CustomerAuthRequirement.SIGNED_IN, CustomerChrome.DETAIL_WITH_NAV, CustomerSampleState.LIST, "channels-and-types", 12),
        r("Sessiz saatler.png", "5e03fb98388cd5a6f294e3f9df3e009d2ee6fd820679f4f9950353b5a8ff21ed", 852, 1846, "quiet-hours", CustomerRouteId.QUIET_HOURS, CustomerAuthRequirement.SIGNED_IN, CustomerChrome.DETAIL_WITH_NAV, CustomerSampleState.FORM_FILLED, "timezone-aware", 12),
        r("Dil ve bölge.png", "160e31aff83d6bf7468539c40635b369459716795a7245079fd10f2dfdcffbbd", 852, 1847, "language-region", CustomerRouteId.LANGUAGE_REGION, CustomerAuthRequirement.SIGNED_IN, CustomerChrome.DETAIL_WITH_NAV, CustomerSampleState.FORM_FILLED, "tr-TR", 12),
        r("Görünüm ve erişilebilirlik.png", "3e89f2435b43e7bca39e4e3c511ba359ae119dfffbe5a4b556eb58cb94fbadec", 853, 1844, "appearance-accessibility", CustomerRouteId.APPEARANCE_ACCESSIBILITY, CustomerAuthRequirement.SIGNED_IN, CustomerChrome.DETAIL_WITH_NAV, CustomerSampleState.FORM_FILLED, "system-theme", 12),
        r("İzinler ve veri kullanımı.png", "674b331f25978ab14b08b71efcda6921848302aa0f0ebb9e6f2b1d74e52b3102", 853, 1844, "device-permissions-data", CustomerRouteId.DEVICE_PERMISSIONS_DATA, CustomerAuthRequirement.SIGNED_IN, CustomerChrome.DETAIL_WITH_NAV, CustomerSampleState.LIST, "device", 12),
        r("Hakkında ve yasal.png", "ffb80014fc726d10f24c6baf7112190dc42c5c4bf673da8a254ffa0379698b16", 852, 1846, "about-legal", CustomerRouteId.ABOUT_LEGAL, CustomerAuthRequirement.PUBLIC, CustomerChrome.DETAIL_WITH_NAV, CustomerSampleState.LIST, "version-and-links", 12)
    )

    val validationErrors: List<String> by lazy { validate(references) }

    val referencesByScreenId: Map<String, List<CustomerVisualReference>> by lazy {
        references.groupBy(CustomerVisualReference::screenId)
    }

    fun requireValid() {
        check(validationErrors.isEmpty()) {
            validationErrors.joinToString(prefix = "Invalid customer visual manifest: ", separator = "; ")
        }
    }

    fun validate(items: List<CustomerVisualReference>): List<String> = buildList {
        if (items.size != EXPECTED_REFERENCE_COUNT) add("expected 80 references, found ${items.size}")
        val duplicateFiles = items.groupBy(CustomerVisualReference::referenceFile).filterValues { it.size > 1 }
        if (duplicateFiles.isNotEmpty()) add("duplicate filenames: ${duplicateFiles.keys.sorted()}")
        val uniqueScreenCount = items.map(CustomerVisualReference::screenId).toSet().size
        if (uniqueScreenCount != EXPECTED_SCREEN_COUNT) add("expected 77 screenIds, found $uniqueScreenCount")
        items.forEach { item ->
            if (!item.screenId.matches(Regex("[a-z0-9][a-z0-9-]*"))) add("invalid screenId: ${item.screenId}")
            if (item.referenceSha256.length != 64 || item.referenceSha256.any { it !in "0123456789abcdef" }) {
                add("invalid SHA-256: ${item.referenceFile}")
            }
            if (item.referenceWidth <= 0 || item.referenceHeight <= 0) add("invalid dimensions: ${item.referenceFile}")
            if (item.variant.isBlank()) add("blank variant: ${item.referenceFile}")
            if (item.tour !in 2..12) add("invalid tour: ${item.referenceFile}")
        }
        items.groupBy(CustomerVisualReference::screenId).forEach { (screenId, sameScreen) ->
            if (sameScreen.map(CustomerVisualReference::referenceSha256).toSet().size != 1) {
                add("screenId $screenId maps to different image bytes")
            }
            if (sameScreen.map(CustomerVisualReference::routeId).toSet().size != 1) {
                add("screenId $screenId maps to different routes")
            }
        }
    }

    private fun r(
        file: String,
        sha256: String,
        width: Int,
        height: Int,
        screenId: String,
        routeId: CustomerRouteId,
        auth: CustomerAuthRequirement,
        chrome: CustomerChrome,
        state: CustomerSampleState,
        variant: String,
        tour: Int
    ) = CustomerVisualReference(
        referenceFile = file,
        referenceSha256 = sha256,
        referenceWidth = width,
        referenceHeight = height,
        screenId = screenId,
        routeId = routeId,
        authRequirement = auth,
        chrome = chrome,
        sampleState = state,
        variant = variant,
        tour = tour
    )
}
