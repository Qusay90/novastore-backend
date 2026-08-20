package com.novastore.seller

import android.content.Context
import android.content.Intent

data class SellerCanonicalStateSpec(
    val state: String,
    val references: List<String>,
    val expectedRoute: String,
    val expectedMarkers: List<String>,
    val expectedFixture: String,
    val fixtureStrategy: String,
    val expectedApiCalls: List<String>,
    val screenshotPath: String
)

object SellerCanonicalStateHarness {
    private fun canonical(
        reference: String,
        route: String,
        markers: List<String>,
        api: String
    ) = SellerCanonicalStateSpec(
        state = "ref_$reference",
        references = listOf(reference),
        expectedRoute = route,
        expectedMarkers = markers,
        expectedFixture = "seller-canonical-ref-$reference",
        fixtureStrategy = "DEBUG_ONLY_SYNTHETIC_CANONICAL",
        expectedApiCalls = listOf(api),
        screenshotPath = "artifacts/seller-wave4/visual/$reference-runtime.png"
    )

    val highThroughputSpecifications = listOf(
        canonical("055", "seller://dashboard", listOf("Günaydın, Kuşay", "Bugünkü satış", "Son siparişler"), "GET /api/seller/v1/dashboard"),
        canonical("056", "seller://dashboard", listOf("Bugünkü satış nedir?", "Ne işe yarar?", "Anladım"), "NONE N/A-BACKEND"),
        canonical("057", "seller://dashboard", listOf("Mağazanız satışa hazır", "İlk ürününü ekle", "3 adımdan 1’i tamamlandı"), "GET /api/seller/v1/dashboard"),
        canonical("058", "seller://dashboard", listOf("Bu ayın satışları", "Brüt satış", "Finans ayrıntılarını aç"), "GET /api/seller/v1/dashboard"),
        canonical("059", "seller://dashboard", listOf("Bekleyen siparişler", "Bugün hazırlanması gereken", "Hazırlamaya başla"), "GET /api/seller/v1/dashboard"),
        canonical("060", "seller://dashboard", listOf("Kargoya verilecek", "2 paketi bugün kargoya vermelisiniz.", "Kargoya verildi bildir"), "GET /api/seller/v1/dashboard"),
        canonical("061", "seller://dashboard", listOf("Düşük stoklar", "3 ürün kritik seviyede", "Stok ekle"), "GET /api/seller/v1/dashboard"),
        canonical("062", "seller://dashboard", listOf("Mağaza puanı", "4,7/5", "Tüm değerlendirmeleri gör"), "GET /api/seller/v1/dashboard"),
        canonical("063", "seller://dashboard", listOf("Bakiye özeti", "Kullanılabilir bakiye", "Finans bölümünü aç"), "GET /api/seller/v1/dashboard"),
        canonical("064", "seller://dashboard", listOf("Yaklaşan ödeme", "24 Temmuz", "Ödeme ayrıntılarını gör"), "GET /api/seller/v1/dashboard"),
        canonical("065", "seller://dashboard", listOf("Satış grafiği", "Brüt satış", "Net kazanç"), "NONE N/A-BACKEND"),
        canonical("066", "seller://dashboard", listOf("Ürün performansı", "En çok satanlar", "İlgilenmeniz gerekenler"), "GET /api/seller/v1/dashboard"),
        canonical("067", "seller://dashboard", listOf("Hızlı işlem seç", "Yeni ürün ekle", "Kampanya oluştur"), "NONE N/A-BACKEND"),
        canonical("068", "seller://dashboard", listOf("Önemli görevler", "Siparişleri görüntüle", "Stoğu güncelle"), "GET /api/seller/v1/dashboard"),
        canonical("069", "seller://dashboard", listOf("Bildirim özeti", "Tümünü okundu işaretle", "Yeni sipariş"), "GET /api/seller/v1/dashboard"),
        canonical("070", "seller://dashboard", listOf("Bilgileriniz hazırlanıyor...", "Bu işlem genellikle birkaç saniye sürer.", "Son siparişler"), "GET /api/seller/v1/dashboard"),
        canonical("071", "seller://dashboard", listOf("Bilgiler şu anda yüklenemedi", "Tekrar dene", "Destek al"), "GET /api/seller/v1/dashboard"),
        canonical("072", "seller://dashboard", listOf("İnternet bağlantısı yok", "Bağlantıyı kontrol et", "Kayıtlı bilgileri gör"), "GET /api/seller/v1/dashboard"),
        canonical("073", "seller://dashboard", listOf("Tarih aralığı seç", "Başlangıç", "Uygula"), "NONE N/A-BACKEND"),
        canonical("243", "seller://store", listOf("Mağazan yayında", "Mağaza yönetimi", "Yalnız kendi mağazan"), "GET /api/seller/v1/stores/{storeId}"),
        canonical("244", "seller://store", listOf("NovaStore Demo Mağaza", "Öne çıkan ürünler", "Profili Düzenle"), "GET /api/seller/v1/stores/{storeId}"),
        canonical("245", "seller://store", listOf("Mağaza adı", "Mağaza açıklaması", "Değişiklikleri Kaydet"), "PATCH /api/seller/v1/stores/{storeId}"),
        canonical("246", "seller://store", listOf("Mağaza logosu", "Kapak görseli", "Kapak Görselini Değiştir"), "PATCH /api/seller/v1/stores/{storeId}"),
        canonical("247", "seller://store", listOf("Müşteriye görünen destek e-postası", "Görünürlük ayarları", "Bilgileri Doğrula ve Kaydet"), "PATCH /api/seller/v1/stores/{storeId}"),
        canonical("248", "seller://store", listOf("Hazırlama süresi", "Müşteriye gösterilecek özet", "Politikayı Kaydet"), "PATCH /api/seller/v1/stores/{storeId}"),
        canonical("249", "seller://store", listOf("Platform iade koşulları", "Açıklamada bulunmaması gerekenler", "Açıklamayı Kaydet"), "PATCH /api/seller/v1/stores/{storeId}"),
        canonical("250", "seller://store", listOf("Açık", "Geçici kapalı", "Durumu Güncelle"), "PATCH /api/seller/v1/stores/{storeId}"),
        canonical("251", "seller://store", listOf("Mağazayı geçici kapat?", "Açık siparişleri tamamla", "Doğrula ve Geçici Kapat"), "PATCH /api/seller/v1/stores/{storeId}"),
        canonical("282", "seller://team", listOf("4 etkin üye", "Ayşe Kaya", "Ekip Üyesi Davet Et"), "GET /api/seller/v1/team/members"),
        canonical("286", "seller://team", listOf("Ece Demir", "Atanan erişim", "Yetkileri Düzenle"), "GET /api/seller/v1/team/members"),
        canonical("288", "seller://team", listOf("N. K. için davet bekliyor", "Bekleyen daveti iptal et", "Davet Bağlantısını Yenile"), "GET /api/seller/v1/team/members"),
        canonical("289", "seller://team", listOf("Ekip üyesi eklendi", "Ece Demir", "Ekip Üyesini Görüntüle"), "GET /api/seller/v1/team/members")
    )

    private val representativeExpansionSpecifications = listOf(
        canonical("074", "seller://offers", listOf("Ürünler", "AKTİF TEKLİFLER", "Katalog bütünlüğü"), "GET /api/seller/v1/offers"),
        canonical("089", "seller://offers", listOf("NovaSound Pro Kulaklık", "₺1.249,90", "Detayı aç"), "GET /api/seller/v1/offers"),
        canonical("124", "seller://inventory", listOf("Stok ve Envanter", "İlgilenmeniz gereken stoklar", "Negatif stok kapalı"), "GET /api/seller/v1/inventory"),
        canonical("142", "seller://orders", listOf("Siparişler", "Sipariş numarası ara", "Sipariş güvenliği"), "GET /api/seller/v1/orders"),
        canonical("156", "seller://orders/detail", listOf("Sipariş Detayı", "Paketleme görevi", "Güvenli sıra"), "GET /api/seller/v1/orders/{sellerOrderId}"),
        canonical("185", "seller://finance", listOf("KULLANILABİLİR BAKİYE", "Son finans hareketleri", "Finansal doğruluk"), "GET /api/seller/v1/finance/summary"),
        canonical("276", "seller://support", listOf("Destek Geçmişi", "Geçmiş destek görüşmeleri", "Seçili Görüşmeyi Aç"), "GET /api/seller/v1/support/conversations"),
        canonical("292", "seller://settings/security", listOf("Hesap ve Güvenlik", "Güvenlik merkezi", "Oturum güvenliği"), "GET /api/seller/v1/security/sessions")
    )

    val bottomNavigationSpecifications = listOf(
        SellerCanonicalStateSpec("nav_dashboard", listOf("055"), "seller://dashboard", listOf("Günaydın, Kuşay"), "seller-canonical-ref-055", "DEBUG_ONLY_SYNTHETIC_CANONICAL", listOf("GET /api/seller/v1/dashboard"), "artifacts/seller-wave4/visual/bottom-nav-dashboard-selected.png"),
        SellerCanonicalStateSpec("nav_products", listOf("074"), "seller://offers", listOf("Ürünler"), "seller-canonical-ref-074", "DEBUG_ONLY_SYNTHETIC_CANONICAL", listOf("GET /api/seller/v1/offers"), "artifacts/seller-wave4/visual/bottom-nav-products-selected.png"),
        SellerCanonicalStateSpec("nav_orders", listOf("142"), "seller://orders", listOf("Siparişler"), "seller-canonical-ref-142", "DEBUG_ONLY_SYNTHETIC_CANONICAL", listOf("GET /api/seller/v1/orders"), "artifacts/seller-wave4/visual/bottom-nav-orders-selected.png"),
        SellerCanonicalStateSpec("nav_finance", listOf("185"), "seller://finance", listOf("Finans"), "seller-canonical-ref-185", "DEBUG_ONLY_SYNTHETIC_CANONICAL", listOf("GET /api/seller/v1/finance/summary"), "artifacts/seller-wave4/visual/bottom-nav-finance-selected.png"),
        SellerCanonicalStateSpec("nav_store", listOf("243"), "seller://store", listOf("Mağazam"), "seller-canonical-ref-243", "DEBUG_ONLY_SYNTHETIC_CANONICAL", listOf("GET /api/seller/v1/stores/{storeId}"), "artifacts/seller-wave4/visual/bottom-nav-store-selected.png")
    )

    private val loginSpecification = SellerCanonicalStateSpec("login", listOf("001"), "seller://auth/login", listOf("Satıcı Girişi", "E-posta veya telefon numarası", "Giriş Yap"), "none", "NO_FIXTURE", listOf("POST /api/seller/v1/auth/login"), "artifacts/seller-wave4/visual/001-runtime.png")

    val specifications = listOf(
        loginSpecification,
        SellerCanonicalStateSpec("loading", listOf("003"), "seller://dashboard/loading", listOf("Yükleniyor"), "none", "DEBUG_STATE", listOf("GET /api/seller/v1/dashboard"), "artifacts/seller-wave4/visual/003-runtime.png"),
        SellerCanonicalStateSpec("empty", emptyList(), "seller://dashboard/empty", listOf("Henüz veri yok"), "none", "DEBUG_STATE", listOf("GET /api/seller/v1/dashboard"), "artifacts/seller-wave4/visual/dashboard-empty-runtime.png"),
        SellerCanonicalStateSpec("error", emptyList(), "seller://dashboard/error", listOf("İşlem tamamlanamadı"), "none", "DEBUG_STATE", listOf("GET /api/seller/v1/dashboard"), "artifacts/seller-wave4/visual/dashboard-error-runtime.png"),
        SellerCanonicalStateSpec("offline", emptyList(), "seller://dashboard/offline", listOf("Çevrimdışısınız"), "none", "DEBUG_STATE", listOf("GET /api/seller/v1/dashboard"), "artifacts/seller-wave4/visual/dashboard-offline-runtime.png"),
        SellerCanonicalStateSpec("disabled", emptyList(), "seller://dashboard/disabled", listOf("Bu özellik kullanıma kapalı"), "none", "DEBUG_STATE", listOf("NONE N/A-BACKEND"), "artifacts/seller-wave4/visual/dashboard-disabled-runtime.png"),
        SellerCanonicalStateSpec("session_expired", listOf("021"), "seller://auth/session-expired", listOf("Oturumun sona erdi"), "none", "DEBUG_STATE", listOf("POST /api/seller/v1/auth/refresh"), "artifacts/seller-wave4/visual/021-runtime.png"),
        SellerCanonicalStateSpec("team", emptyList(), "seller://team", listOf("Ekip ve Yetkiler", "EKİP YÖNETİMİ", "Test Mağazası"), "seller-team-fixture-v1", "LEGACY_DEBUG_TEAM", listOf("GET /api/seller/v1/team/members"), "artifacts/seller-wave4/visual/team-legacy-runtime.png")
    ) + highThroughputSpecifications + representativeExpansionSpecifications

    val representativeGateSpecifications = listOf("001", "055", "057", "066", "069", "074", "089", "124", "142", "156", "185", "243", "276", "282", "292")
        .map { reference ->
            if (reference == "001") loginSpecification
            else specification("ref_$reference")
        }

    val states: List<String> = specifications.map { it.state }

    fun specification(state: String): SellerCanonicalStateSpec = (specifications + bottomNavigationSpecifications).firstOrNull { it.state == state }
        ?: throw IllegalArgumentException("Unknown canonical test state: $state")

    fun intent(context: Context, state: String): Intent {
        specification(state)
        return Intent(context, SellerMainActivity::class.java)
            .putExtra(SellerMainActivity.EXTRA_CANONICAL_TEST_STATE, state)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    }
}
