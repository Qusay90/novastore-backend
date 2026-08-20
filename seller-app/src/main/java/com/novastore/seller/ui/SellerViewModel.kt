package com.novastore.seller.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.novastore.seller.data.SellerRepository
import com.novastore.seller.data.SellerPage
import com.novastore.seller.data.SellerPageSource
import com.novastore.seller.data.SellerMutationAction
import com.novastore.seller.data.SellerMutationResult
import com.novastore.seller.data.SellerScreen
import com.novastore.seller.data.SellerTab
import com.novastore.seller.data.SellerTeamMember
import com.novastore.seller.data.SellerTeamPage
import com.novastore.seller.data.SellerUiState
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class SellerViewModel(
    private val repository: SellerRepository,
    canonicalTestState: String? = null
) : ViewModel() {
    private val canonicalHarnessActive = canonicalTestState != null
    private val persistedSessionAtStart = canonicalTestState == null && repository.hasPersistedSession()
    private val _state = MutableStateFlow<SellerUiState>(
        if (persistedSessionAtStart) SellerUiState.Loading else SellerUiState.Unauthorized
    )
    val state: StateFlow<SellerUiState> = _state.asStateFlow()
    private val _selectedTab = MutableStateFlow(SellerTab.DASHBOARD)
    val selectedTab: StateFlow<SellerTab> = _selectedTab.asStateFlow()
    private val _screen = MutableStateFlow(SellerScreen.DASHBOARD)
    val screen: StateFlow<SellerScreen> = _screen.asStateFlow()
    private val _mutationResults = MutableStateFlow<List<SellerMutationResult>>(emptyList())
    val mutationResults: StateFlow<List<SellerMutationResult>> = _mutationResults.asStateFlow()
    private val _mutationRunning = MutableStateFlow(false)
    val mutationRunning: StateFlow<Boolean> = _mutationRunning.asStateFlow()

    init {
        if (canonicalTestState != null && applyCanonicalTestState(canonicalTestState)) {
            Unit
        } else if (persistedSessionAtStart) {
            load(SellerScreen.DASHBOARD)
        }
    }

    fun applyCanonicalTestState(value: String): Boolean {
        val initialState = canonicalStateForHarness(value) ?: return false
        _state.value = initialState
        if (initialState is SellerUiState.Content) {
            _screen.value = initialState.page.screen
            initialState.page.screen.tab?.let { _selectedTab.value = it }
        } else {
            _screen.value = SellerScreen.DASHBOARD
            _selectedTab.value = SellerTab.DASHBOARD
        }
        return true
    }

    fun login(identifier: String, password: String) = viewModelScope.launch {
        _state.value = SellerUiState.Loading
        _state.value = repository.login(identifier, password)
        if (_state.value is SellerUiState.Content) load(SellerScreen.DASHBOARD)
    }

    fun load(tab: SellerTab) {
        if (canonicalHarnessActive && applyCanonicalTestState("nav_${tab.name.lowercase()}")) return
        load(SellerScreen.fromTab(tab))
    }

    fun load(screen: SellerScreen = _screen.value) = viewModelScope.launch {
        _screen.value = screen
        screen.tab?.let { _selectedTab.value = it }
        _state.value = SellerUiState.Loading
        _state.value = repository.load(screen)
    }

    fun resolveContext() = load(SellerScreen.CONTEXT)

    fun backToSelectedTab() = load(SellerScreen.fromTab(_selectedTab.value))

    fun refresh() = load(_screen.value)

    fun open(screen: SellerScreen) = load(screen)

    fun performMutation(action: SellerMutationAction) {
        if (_mutationRunning.value) return
        viewModelScope.launch {
            _mutationRunning.value = true
            val result = repository.performMutation(action)
            _mutationResults.value = (_mutationResults.value.filterNot { it.action == action } + result)
            _mutationRunning.value = false
            if (action == SellerMutationAction.SESSION_LOGOUT_ALL && result.passed) {
                _screen.value = SellerScreen.DASHBOARD
                _selectedTab.value = SellerTab.DASHBOARD
                _state.value = SellerUiState.Unauthorized
            }
        }
    }

    fun logout(all: Boolean) = viewModelScope.launch {
        repository.logout(all)
        _screen.value = SellerScreen.DASHBOARD
        _selectedTab.value = SellerTab.DASHBOARD
        _state.value = SellerUiState.Unauthorized
    }

    class Factory(
        private val repository: SellerRepository,
        private val canonicalTestState: String? = null
    ) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T = SellerViewModel(repository, canonicalTestState) as T
    }
}

private fun canonicalStateForHarness(value: String): SellerUiState? = when (value) {
    "login" -> SellerUiState.Unauthorized
    "loading" -> SellerUiState.Loading
    "empty" -> SellerUiState.Empty("Henüz gösterilecek kayıt bulunmuyor.")
    "error" -> SellerUiState.Error("Yerel test durumu: güvenli yeniden deneme gerekli.")
    "offline" -> SellerUiState.Offline("Yerel test durumu: bağlantı yok.")
    "disabled" -> SellerUiState.Disabled("Yerel test durumu: özellik kapalı.")
    "session_expired" -> SellerUiState.SessionExpired
    "team" -> SellerUiState.Content(
        SellerPage(
            title = "Ekip ve Yetkiler",
            rows = emptyList(),
            screen = SellerScreen.TEAM,
            team = SellerTeamPage(
                storeName = "Test Mağazası",
                sessionRoleCode = "owner",
                members = listOf(
                    SellerTeamMember(101, "Test Sahibi", "owner", "active"),
                    SellerTeamMember(102, "Test Yönetici", "manager", "active"),
                    SellerTeamMember(103, "Test Operasyon", "operator", "active")
                )
            ),
            canonicalFixtureId = "seller-team-fixture-v1",
            source = SellerPageSource.CANONICAL_FIXTURE
        )
    )
    else -> canonicalFixtureDefinitions[canonicalFixtureStateAlias[value] ?: value]?.toPage()?.let(SellerUiState::Content)
}

private val canonicalFixtureStateAlias = mapOf(
    "nav_dashboard" to "ref_055",
    "nav_products" to "ref_074",
    "nav_orders" to "ref_142",
    "nav_finance" to "ref_185",
    "nav_store" to "ref_243"
)

private data class CanonicalFixtureDefinition(
    val reference: String,
    val title: String,
    val screen: SellerScreen,
    val rows: List<Pair<String, String>>,
    val team: SellerTeamPage? = null
) {
    fun toPage() = SellerPage(
        title = title,
        rows = rows,
        screen = screen,
        team = team,
        canonicalFixtureId = "seller-canonical-ref-$reference",
        canonicalReferenceId = reference,
        source = SellerPageSource.CANONICAL_FIXTURE
    )
}

private fun fixture(
    reference: String,
    title: String,
    screen: SellerScreen,
    vararg rows: Pair<String, String>
) = CanonicalFixtureDefinition(reference, title, screen, rows.toList())

private val canonicalFixtureDefinitions = listOf(
    fixture("027", "Kurulum Özeti", SellerScreen.ONBOARDING, "İlerleme" to "%40 • 2/5", "Mağaza kimliği" to "Capability kapalı"),
    fixture("055", "Günaydın, Kuşay", SellerScreen.DASHBOARD, "Bugünkü satış" to "₺12.480,50", "Son siparişler" to "2 kayıt"),
    fixture("056", "Bugünkü satış nedir?", SellerScreen.DASHBOARD, "Ne işe yarar?" to "Günün satış hızını açıklar.", "Anladım" to "Bilgi kapatılır"),
    fixture("057", "Mağazanız satışa hazır", SellerScreen.DASHBOARD, "İlk ürününü ekle" to "Ürünlerini ekleyerek mağazanı doldurmaya başla.", "3 adımdan 1’i tamamlandı" to "Kurulum ilerlemesi"),
    fixture("058", "Bu ayın satışları", SellerScreen.DASHBOARD, "Brüt satış" to "₺186.420,00", "Finans ayrıntılarını aç" to "Doğrulanmış özet"),
    fixture("059", "Bekleyen siparişler", SellerScreen.DASHBOARD, "Bugün hazırlanması gereken" to "4 sipariş var", "Hazırlamaya başla" to "Sipariş ayrıntısı"),
    fixture("060", "Kargoya verilecek", SellerScreen.DASHBOARD, "2 paketi bugün kargoya vermelisiniz." to "Yerel sentetik veri", "Kargoya verildi bildir" to "Güvenli işlem"),
    fixture("061", "Düşük stoklar", SellerScreen.DASHBOARD, "3 ürün kritik seviyede" to "Stok alarmı", "Stok ekle" to "Stok işlemi"),
    fixture("062", "Mağaza puanı", SellerScreen.DASHBOARD, "4,7/5" to "1.284 değerlendirme", "Tüm değerlendirmeleri gör" to "Salt okunur"),
    fixture("063", "Bakiye özeti", SellerScreen.DASHBOARD, "Kullanılabilir bakiye" to "₺38.240,00", "Finans bölümünü aç" to "Doğrulanmış tutar"),
    fixture("064", "Yaklaşan ödeme", SellerScreen.DASHBOARD, "24 Temmuz" to "Perşembe", "Ödeme ayrıntılarını gör" to "₺36.925,40"),
    fixture("065", "Satış grafiği", SellerScreen.DASHBOARD, "Brüt satış" to "₺42.680", "Net kazanç" to "₺32.450"),
    fixture("066", "Ürün performansı", SellerScreen.DASHBOARD, "En çok satanlar" to "Satış sıralaması", "İlgilenmeniz gerekenler" to "Stok uyarıları"),
    fixture("067", "Hızlı işlem seç", SellerScreen.DASHBOARD, "Yeni ürün ekle" to "Mağazana yeni ürün ekle.", "Kampanya oluştur" to "İndirim ve kampanya"),
    fixture("068", "Önemli görevler", SellerScreen.DASHBOARD, "Siparişleri görüntüle" to "2 sipariş bugün kargoya verilecek", "Stoğu güncelle" to "3 ürün kritik"),
    fixture("069", "Bildirim özeti", SellerScreen.DASHBOARD, "Tümünü okundu işaretle" to "Bugün", "Yeni sipariş" to "10:24"),
    fixture("070", "Bilgileriniz hazırlanıyor...", SellerScreen.DASHBOARD, "Bu işlem genellikle birkaç saniye sürer." to "Yükleniyor", "Son siparişler" to "Hazırlanıyor"),
    fixture("071", "Bilgiler şu anda yüklenemedi", SellerScreen.DASHBOARD, "Tekrar dene" to "Güvenli yeniden deneme", "Destek al" to "Satıcı desteği"),
    fixture("072", "İnternet bağlantısı yok", SellerScreen.DASHBOARD, "Bağlantıyı kontrol et" to "Çevrimdışı", "Kayıtlı bilgileri gör" to "Son güvenli kayıt"),
    fixture("073", "Tarih aralığı seç", SellerScreen.DASHBOARD, "Başlangıç" to "15 Temmuz 2025", "Uygula" to "22 Temmuz 2025"),
    fixture("074", "Ürünler", SellerScreen.PRODUCTS, "Ürün kataloğu" to "Yayındaki teklifler", "Stok durumunu görüntüle" to "Envanter"),
    fixture("089", "NovaSound Pro Kulaklık", SellerScreen.PRODUCTS, "₺1.249,90" to "Yayında • 18 stok", "Detayı aç" to "Ürün ayrıntısı"),
    fixture("124", "Stok ve Envanter", SellerScreen.INVENTORY, "Nova Akıllı Saat" to "18 adet • Eşik 5", "Hızlı Şarj Adaptörü" to "3 adet • Kritik"),
    fixture("142", "Siparişler", SellerScreen.ORDERS, "Sipariş listesi" to "Mağaza siparişleri", "Sipariş ayrıntısı" to "Satıcı satırları"),
    fixture("156", "Sipariş Detayı", SellerScreen.ORDER_DETAIL, "Sipariş" to "#NS-240722-1842", "Durum" to "Hazırlanıyor"),
    fixture("185", "Finans", SellerScreen.FINANCE, "Finans özeti" to "Kullanılabilir bakiye", "Hesap hareketleri" to "Doğrulanmış kayıtlar"),
    fixture("205", "Analitik", SellerScreen.ANALYTICS, "Capability" to "Kapalı"),
    fixture("223", "Kampanyalar", SellerScreen.CAMPAIGNS, "Capability" to "Kapalı"),
    fixture("243", "Mağazam", SellerScreen.STORE, "Mağazan yayında" to "NovaStore Demo Mağaza", "Mağaza yönetimi" to "Mağaza Profilini Düzenle"),
    fixture("244", "Müşteri Önizlemesi", SellerScreen.STORE, "NovaStore Demo Mağaza" to "Müşteriye görünür", "Öne çıkan ürünler" to "Profili Düzenle"),
    fixture("245", "Ad ve Açıklama", SellerScreen.STORE, "Mağaza adı" to "NovaStore Demo Mağaza", "Mağaza açıklaması" to "Değişiklikleri Kaydet"),
    fixture("246", "Logo ve Kapak", SellerScreen.STORE, "Mağaza logosu" to "1:1 kare görünüm", "Kapak görseli" to "Kapak Görselini Değiştir"),
    fixture("247", "İletişim Bilgileri", SellerScreen.STORE, "Müşteriye görünen destek e-postası" to "Güvenli görünüm", "Görünürlük ayarları" to "Bilgileri Doğrula ve Kaydet"),
    fixture("248", "Kargo ve Teslimat", SellerScreen.STORE, "Hazırlama süresi" to "1–2 iş günü", "Müşteriye gösterilecek özet" to "Politikayı Kaydet"),
    fixture("249", "İade Politikası", SellerScreen.STORE, "Platform iade koşulları" to "Bağlayıcı koşullar", "Açıklamada bulunmaması gerekenler" to "Açıklamayı Kaydet"),
    fixture("250", "Çalışma Durumu", SellerScreen.STORE, "Açık" to "Mağazan sipariş alabilir.", "Geçici kapalı" to "Durumu Güncelle"),
    fixture("251", "Durum Onayı", SellerScreen.STORE, "Mağazayı geçici kapat?" to "Açık siparişleri tamamla", "Doğrula ve Geçici Kapat" to "Güvenli onay"),
    fixture("257", "Bildirim Merkezi", SellerScreen.NOTIFICATIONS, "Capability" to "Kapalı"),
    fixture("271", "Müşteri Mesajları", SellerScreen.CUSTOMER_MESSAGES, "Capability" to "Kapalı"),
    fixture("276", "Destek Geçmişi", SellerScreen.SUPPORT, "Geçmiş destek görüşmeleri" to "4 kayıt", "Seçili Görüşmeyi Aç" to "Satıcı destek kaydı"),
    CanonicalFixtureDefinition(
        reference = "282",
        title = "Ekip ve Yetkiler",
        screen = SellerScreen.TEAM,
        rows = listOf("4 etkin üye" to "Ekip Üyesi Davet Et"),
        team = SellerTeamPage(
            storeName = "NovaStore Demo Mağaza",
            sessionRoleCode = "owner",
            members = listOf(
                SellerTeamMember(201, "Ayşe Kaya", "owner", "active"),
                SellerTeamMember(202, "Deniz Aras", "manager", "active"),
                SellerTeamMember(203, "Ece Demir", "operator", "active"),
                SellerTeamMember(204, "Mert Yılmaz", "operator", "active")
            )
        )
    ),
    fixture("286", "Ekip Üyesi", SellerScreen.TEAM, "Ece Demir" to "Operasyon", "Atanan erişim" to "Yetkileri Düzenle"),
    fixture("288", "Davet Bekliyor", SellerScreen.TEAM, "N. K. için davet bekliyor" to "Bekleyen daveti iptal et", "Davet Bağlantısını Yenile" to "Güvenli işlem"),
    fixture("289", "Davet Kabul Edildi", SellerScreen.TEAM, "Ekip üyesi eklendi" to "Ece Demir", "Ekip Üyesini Görüntüle" to "Operasyon"),
    fixture("292", "Hesap ve Güvenlik", SellerScreen.SECURITY, "Aktif oturumlar" to "2 cihaz", "Son doğrulama" to "Bugün 10:24")
).associateBy { "ref_${it.reference}" }
