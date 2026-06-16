package com.novastore.app.feature.support

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.novastore.app.core.network.NovaStoreApi
import com.novastore.app.data.model.AssistantChatRequest
import com.novastore.app.data.model.AssistantContext
import com.novastore.app.data.model.AssistantEscalationRequest
import com.novastore.app.data.model.AssistantHistoryItem
import com.novastore.app.data.model.AssistantModeOption
import com.novastore.app.data.model.AssistantPendingAction
import com.novastore.app.data.model.AssistantProduct
import com.novastore.app.data.model.CartItem
import com.novastore.app.data.repository.AuthRepository
import com.novastore.app.data.repository.CartRepository
import com.novastore.app.data.repository.CustomerLocalRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import timber.log.Timber
import java.util.Locale
import java.util.UUID
import javax.inject.Inject

enum class SupportMessageRole {
    User,
    Assistant,
    System
}

data class NovaBotModeOption(
    val id: String,
    val title: String,
    val description: String
)

data class SupportChatMessage(
    val id: String = UUID.randomUUID().toString(),
    val role: SupportMessageRole,
    val message: String,
    val suggestions: List<String> = emptyList(),
    val products: List<AssistantProduct> = emptyList(),
    val comparisonRows: List<com.novastore.app.data.model.AssistantComparisonRow> = emptyList(),
    val allowEscalation: Boolean = false,
    val requiresConfirmation: Boolean = false,
    val pendingAction: AssistantPendingAction? = null,
    val createdAt: Long = System.currentTimeMillis()
)

data class SupportUiState(
    val messages: List<SupportChatMessage> = emptyList(),
    val draft: String = "",
    val selectedMode: String = "friendly",
    val selectedModeTitle: String = "Samimi Mod",
    val modeOptions: List<NovaBotModeOption> = defaultModeOptions,
    val lastProducts: List<AssistantProduct> = emptyList(),
    val compareProductIds: List<Int> = emptyList(),
    val pendingAction: AssistantPendingAction? = null,
    val isSending: Boolean = false,
    val isEscalating: Boolean = false,
    val escalationCreated: Boolean = false
)

private val defaultModeOptions = listOf(
    NovaBotModeOption("professional", "Profesyonel", "Resmi, net ve müşteri hizmetleri gibi konuşur."),
    NovaBotModeOption("friendly", "Samimi", "Sıcak, günlük ve anlaşılır bir dille yardım eder."),
    NovaBotModeOption("buddy", "Kanka", "Rahat ve samimi konuşur, saygıyı bozmaz."),
    NovaBotModeOption("funny", "Komik", "Hafif esprili ama bilgilendirici cevap verir."),
    NovaBotModeOption("witty", "Alaycı ama saygılı", "Biraz takılır, hakaret etmez."),
    NovaBotModeOption("quick", "Hızlı", "Kısa, net ve gereksiz uzatmadan cevap verir."),
    NovaBotModeOption("detailed", "Detaycı", "Avantaj, dezavantaj ve fiyat/performans anlatır."),
    NovaBotModeOption("technical", "Teknik uzman", "Teknik özelliklere odaklanır."),
    NovaBotModeOption("sales", "Satış danışmanı", "Bütçe ve ihtiyaca göre yönlendirir.")
)

private val turkishLocale = Locale("tr", "TR")

private val asciiTurkishReplacements = listOf(
    "iyiyim" to "iyiyim",
    "iyi" to "iyi",
    "tesekkurler" to "teşekkürler",
    "tesekkur" to "teşekkür",
    "bugun" to "bugün",
    "cok" to "çok",
    "kisaca" to "kısaca",
    "alti" to "altı",
    "altinda" to "altında",
    "ustunde" to "üstünde",
    "ustu" to "üstü",
    "uzeri" to "üzeri",
    "aradiginizi" to "aradığınızı",
    "aradiginiz" to "aradığınız",
    "aradigini" to "aradığını",
    "aradigin" to "aradığın",
    "yazmaniz" to "yazmanız",
    "yazmani" to "yazmanı",
    "yardim" to "yardım",
    "istediginize" to "istediğinize",
    "istedigin" to "istediğin",
    "alisveris" to "alışveriş",
    "yakin" to "yakın",
    "secenekleri" to "seçenekleri",
    "secenek" to "seçenek",
    "toparladim" to "toparladım",
    "toparlayayim" to "toparlayayım",
    "alakali" to "alakalı",
    "urunleri" to "ürünleri",
    "urununu" to "ürününü",
    "urunu" to "ürünü",
    "urunler" to "ürünler",
    "urun" to "ürün",
    "cikardim" to "çıkardım",
    "cikarmak" to "çıkarmak",
    "cikar" to "çıkar",
    "bunlari" to "bunları",
    "karsilastirma" to "karşılaştırma",
    "karsilastir" to "karşılaştır",
    "goster" to "göster",
    "ozetini" to "özetini",
    "ozeti" to "özeti",
    "odeme" to "ödeme",
    "siparis" to "sipariş",
    "canli" to "canlı",
    "destege" to "desteğe",
    "baglan" to "bağlan",
    "baglandi" to "bağlandı",
    "baglaniyor" to "bağlanıyor",
    "baglantini" to "bağlantını",
    "baglanti" to "bağlantı",
    "yardimci" to "yardımcı",
    "olayim" to "olayım",
    "olusturuluyor" to "oluşturuluyor",
    "olusturuldu" to "oluşturuldu",
    "olustur" to "oluştur",
    "butce" to "bütçe",
    "kullanim" to "kullanım",
    "amacini" to "amacını",
    "dogrulanmis" to "doğrulanmış",
    "anlayamadim" to "anlayamadım",
    "mantikli" to "mantıklı",
    "gercek" to "gerçek",
    "hizli" to "hızlı",
    "kisa" to "kısa",
    "musteri" to "müşteri",
    "konusacagim" to "konuşacağım",
    "konus" to "konuş",
    "ac" to "aç",
    "oner" to "öner",
    "oneri" to "öneri",
    "onay" to "onay",
    "iade" to "iade",
    "degisim" to "değişim"
)

private fun restoreTurkishCharacters(value: String): String {
    return asciiTurkishReplacements.fold(value) { current, (ascii, turkish) ->
        Regex("\\b${Regex.escape(ascii)}\\b", RegexOption.IGNORE_CASE).replace(current) { match ->
            if (match.value.firstOrNull()?.isUpperCase() == true) {
                turkish.replaceFirstChar { it.titlecase(turkishLocale) }
            } else {
                turkish
            }
        }
    }
}

private fun <T> safeList(value: List<T>?): List<T> = value ?: emptyList()

private fun AssistantModeOption.toNovaBotModeOption(): NovaBotModeOption? {
    val safeId = id?.takeIf { it.isNotBlank() } ?: return null
    return NovaBotModeOption(
        id = safeId,
        title = restoreTurkishCharacters(title.orEmpty().ifBlank { safeId }),
        description = restoreTurkishCharacters(description.orEmpty())
    )
}

@HiltViewModel
class SupportViewModel @Inject constructor(
    private val api: NovaStoreApi,
    private val authRepository: AuthRepository,
    private val cartRepository: CartRepository,
    private val customerLocalRepository: CustomerLocalRepository
) : ViewModel() {

    private val welcomeMessage = SupportChatMessage(
        role = SupportMessageRole.Assistant,
        message = "Merhaba, ben NovaBot. Ürün bulabilir, ürünleri karşılaştırabilir, sepet/sipariş/iade/kargo konularında yardımcı olabilir ve gerekirse canlı desteğe aktarabilirim.",
        suggestions = listOf(
            "Ucuz ürün bul",
            "Ürün karşılaştır",
            "Siparişimi sorgula",
            "İade/değişim",
            "Bana hediye öner"
        ),
        allowEscalation = true
    )

    private val _uiState = MutableStateFlow(SupportUiState(messages = listOf(welcomeMessage)))
    val uiState: StateFlow<SupportUiState> = _uiState.asStateFlow()

    fun resetConversation() {
        _uiState.value = SupportUiState(messages = listOf(welcomeMessage))
    }

    fun updateDraft(value: String) {
        _uiState.update { it.copy(draft = value) }
    }

    fun selectMode(modeId: String) {
        val option = defaultModeOptions.firstOrNull { it.id == modeId } ?: defaultModeOptions[1]
        _uiState.update {
            it.copy(
                selectedMode = option.id,
                selectedModeTitle = option.title,
                messages = (it.messages + SupportChatMessage(
                    role = SupportMessageRole.System,
                    message = "${option.title} aktif. NovaBot bundan sonra bu tonda sohbet edecek; ürün, sepet ve destek agent işleri de çalışmaya devam edecek."
                )).takeLast(30)
            )
        }
    }

    fun sendSuggestion(prompt: String) {
        val normalized = prompt.lowercase()
        when {
            normalized.contains("vazgec") || normalized.contains("vazgeç") -> cancelPendingAction()
            normalized.contains("evet") && _uiState.value.pendingAction != null -> confirmPendingAction()
            normalized.contains("canli") || normalized.contains("canlı") || normalized.contains("temsilci") -> requestLiveSupportConfirmation(prompt)
            normalized.contains("sepet sekmesine git") -> appendAssistantMessage(
                SupportChatMessage(role = SupportMessageRole.System, message = "Sepet sekmesini alttaki menüden açabilirsin.")
            )
            else -> sendMessage(prompt)
        }
    }

    fun sendDraft() {
        sendMessage(_uiState.value.draft)
    }

    fun sendMessage(rawMessage: String) {
        val message = rawMessage.trim()
        if (message.isEmpty() || _uiState.value.isSending || _uiState.value.isEscalating) return

        val normalized = message.lowercase()
        if (_uiState.value.pendingAction != null && (normalized.contains("evet") || normalized.contains("ekle"))) {
            appendUserMessage(message)
            confirmPendingAction()
            return
        }
        if (_uiState.value.pendingAction != null && (normalized.contains("vazgec") || normalized.contains("vazgeç") || normalized.contains("iptal"))) {
            appendUserMessage(message)
            cancelPendingAction()
            return
        }

        appendUserMessage(message, sending = true)

        viewModelScope.launch {
            runCatching {
                api.sendAssistantMessage(
                    AssistantChatRequest(
                        message = message,
                        history = buildHistory(),
                        context = buildContext()
                    )
                )
            }.onSuccess { response ->
                val products = safeList(response.products).ifEmpty { safeList(response.cards).map { it.toProduct() } }
                val reply = response.reply?.takeIf { it.isNotBlank() }
                    ?: response.message?.takeIf { it.isNotBlank() }
                    ?: "Bu konuda net bir cevap üretemedim. İstersen canlı destek ekibine aktarabilirim."

                val modeTitle = response.modeLabel?.takeIf { it.isNotBlank() }?.let(::restoreTurkishCharacters) ?: _uiState.value.selectedModeTitle
                val modeId = response.mode?.takeIf { it.isNotBlank() } ?: _uiState.value.selectedMode
                val modeOptions = safeList(response.availableModes).mapNotNull { it.toNovaBotModeOption() }
                appendAssistantMessage(
                    SupportChatMessage(
                        role = SupportMessageRole.Assistant,
                        message = restoreTurkishCharacters(reply),
                        suggestions = safeList(response.suggestions).map(::restoreTurkishCharacters),
                        products = products,
                        comparisonRows = safeList(response.comparison?.rows),
                        allowEscalation = response.allowEscalation,
                        requiresConfirmation = response.requiresConfirmation,
                        pendingAction = response.pendingAction
                    ),
                    lastProducts = products.takeIf { it.isNotEmpty() },
                    pendingAction = response.pendingAction,
                    selectedMode = modeId,
                    selectedModeTitle = modeTitle,
                    modeOptions = modeOptions.takeIf { it.isNotEmpty() }
                )
            }.onFailure { error ->
                Timber.e(error, "Assistant chat failed")
                appendAssistantMessage(
                    SupportChatMessage(
                        role = SupportMessageRole.Assistant,
                        message = "Sunucuya şu an bağlanamadım. Akıllı öneriler sınırlı olabilir ama tekrar deneyebilir veya canlı destek isteyebilirsin.",
                        suggestions = listOf("Tekrar dene", "Canlı desteğe bağlan"),
                        allowEscalation = true
                    )
                )
            }
        }
    }

    fun retryLastUserMessage() {
        val lastUserMessage = _uiState.value.messages.lastOrNull { it.role == SupportMessageRole.User }?.message
        if (!lastUserMessage.isNullOrBlank()) {
            sendMessage(lastUserMessage)
        }
    }

    fun requestAddToCart(product: AssistantProduct) {
        val productId = product.id ?: return
        _uiState.update {
            it.copy(
                pendingAction = AssistantPendingAction(type = "add_to_cart", productId = productId, quantity = 1),
                messages = (it.messages + SupportChatMessage(
                    role = SupportMessageRole.Assistant,
                    message = "${product.name.orEmpty().ifBlank { "Bu ürün" }} sepete eklensin mi?",
                    products = listOf(product),
                    suggestions = listOf("Evet, ekle", "Vazgeç"),
                    requiresConfirmation = true,
                    pendingAction = AssistantPendingAction(type = "add_to_cart", productId = productId, quantity = 1)
                )).takeLast(30)
            )
        }
    }

    fun toggleFavorite(product: AssistantProduct) {
        val productId = product.id ?: return
        viewModelScope.launch {
            val result = customerLocalRepository.toggleFavoriteSynced(productId)
            if (result.isFailure) {
                appendAssistantMessage(
                    SupportChatMessage(
                        role = SupportMessageRole.System,
                        message = "Favori işlemi tamamlanamadı. Lütfen tekrar dene."
                    )
                )
                return@launch
            }
            appendAssistantMessage(
            SupportChatMessage(
                role = SupportMessageRole.System,
                message = "${product.name.orEmpty().ifBlank { "Ürün" }} favori durumuna eklendi/güncellendi."
            )
            )
        }
    }

    fun addToCompare(product: AssistantProduct) {
        val productId = product.id ?: return
        val updated = (_uiState.value.compareProductIds + productId).distinct().takeLast(3)
        _uiState.update { it.copy(compareProductIds = updated) }
        if (updated.size >= 2) {
            sendMessage("Bu ikisini karşılaştır")
        } else {
            appendAssistantMessage(
                SupportChatMessage(
                    role = SupportMessageRole.System,
                    message = "Ürün karşılaştırma listesine eklendi. Bir ürün daha seçince yan yana karşılaştırırım."
                )
            )
        }
    }

    fun requestLiveSupportConfirmation(reason: String = "Canlı destek") {
        _uiState.update {
            it.copy(
                pendingAction = AssistantPendingAction(type = "live_support", reason = reason),
                messages = (it.messages + SupportChatMessage(
                    role = SupportMessageRole.Assistant,
                    message = "Seni canlı desteğe aktarmamı onaylıyor musun?",
                    suggestions = listOf("Evet, canlı desteğe bağlan", "Vazgeç"),
                    allowEscalation = true,
                    requiresConfirmation = true,
                    pendingAction = AssistantPendingAction(type = "live_support", reason = reason)
                )).takeLast(30)
            )
        }
    }

    fun escalateConversation() {
        requestLiveSupportConfirmation()
    }

    private fun confirmPendingAction() {
        val pending = _uiState.value.pendingAction ?: return
        when (pending.type) {
            "add_to_cart" -> addPendingProductToCart(pending)
            "live_support" -> createEscalation()
            else -> {
                appendAssistantMessage(SupportChatMessage(role = SupportMessageRole.System, message = "Bu işlem için önce net bir seçim gerekiyor."))
                _uiState.update { it.copy(pendingAction = null) }
            }
        }
    }

    private fun cancelPendingAction() {
        appendAssistantMessage(
            SupportChatMessage(
                role = SupportMessageRole.System,
                message = "İşlem iptal edildi."
            )
        )
        _uiState.update { it.copy(pendingAction = null) }
    }

    private fun addPendingProductToCart(pending: AssistantPendingAction) {
        val product = _uiState.value.lastProducts.firstOrNull { it.id == pending.productId }
            ?: _uiState.value.messages.asReversed().flatMap { it.products }.firstOrNull { it.id == pending.productId }
            ?: return

        viewModelScope.launch {
            val item = CartItem(
                productId = product.id ?: return@launch,
                name = product.name.orEmpty().ifBlank { "NovaStore ürünü" },
                price = product.price ?: 0.0,
                imageUrl = product.imageUrl,
                quantity = pending.quantity ?: 1
            )
            val result = cartRepository.addToCart(item)
            appendAssistantMessage(
                SupportChatMessage(
                    role = SupportMessageRole.System,
                    message = if (result.isSuccess) "Ürün sepetine eklendi." else "Ürün sepete eklenemedi. Lütfen tekrar dene.",
                    suggestions = listOf("Sepetimi kontrol et", "Daha ucuzunu göster")
                ),
                pendingAction = null
            )
        }
    }

    private fun createEscalation() {
        val state = _uiState.value
        if (state.isEscalating) return

        if (!authRepository.isLoggedIn) {
            appendAssistantMessage(
                SupportChatMessage(
                    role = SupportMessageRole.System,
                    message = "Canlı destek aktarımı için giriş yapman gerekiyor. Giriş yaptıktan sonra konuşma özetini temsilciye iletebilirim.",
                    suggestions = listOf("Siparişimi sorgula", "İade/değişim")
                ),
                pendingAction = null
            )
            return
        }

        val summary = buildEscalationSummary()
        if (summary.isBlank()) return

        _uiState.update { it.copy(isEscalating = true) }
        viewModelScope.launch {
            runCatching {
                api.escalateAssistantConversation(AssistantEscalationRequest(summary))
            }.onSuccess { response ->
                appendAssistantMessage(
                    SupportChatMessage(
                        role = SupportMessageRole.System,
                        message = response.message ?: "Konuşma özeti canlı destek ekibine iletildi. Temsilci en kısa sürede seninle ilgilenecek.",
                        suggestions = listOf("Yeni soru sor")
                    ),
                    escalationCreated = true,
                    pendingAction = null
                )
            }.onFailure { error ->
                Timber.e(error, "Assistant escalation failed")
                appendAssistantMessage(
                    SupportChatMessage(
                        role = SupportMessageRole.Assistant,
                        message = "Canlı destek talebi şu an oluşturulamadı. Lütfen bağlantını kontrol edip tekrar dene.",
                        suggestions = listOf("Canlı desteğe bağlan"),
                        allowEscalation = true
                    ),
                    pendingAction = null
                )
            }
        }
    }

    private fun appendUserMessage(message: String, sending: Boolean = false) {
        _uiState.update {
            it.copy(
                messages = (it.messages + SupportChatMessage(role = SupportMessageRole.User, message = message)).takeLast(30),
                draft = "",
                isSending = sending
            )
        }
    }

    private fun appendAssistantMessage(
        message: SupportChatMessage,
        escalationCreated: Boolean = false,
        lastProducts: List<AssistantProduct>? = null,
        pendingAction: AssistantPendingAction? = _uiState.value.pendingAction,
        selectedMode: String = _uiState.value.selectedMode,
        selectedModeTitle: String = _uiState.value.selectedModeTitle,
        modeOptions: List<NovaBotModeOption>? = null
    ) {
        _uiState.update {
            it.copy(
                messages = (it.messages + message).takeLast(30),
                lastProducts = lastProducts ?: it.lastProducts,
                pendingAction = pendingAction,
                selectedMode = selectedMode,
                selectedModeTitle = selectedModeTitle,
                modeOptions = modeOptions ?: it.modeOptions,
                isSending = false,
                isEscalating = false,
                escalationCreated = it.escalationCreated || escalationCreated
            )
        }
    }

    private fun buildContext(): AssistantContext {
        val state = _uiState.value
        val lastIds = (state.compareProductIds + state.lastProducts.mapNotNull { it.id }).distinct().takeLast(6)
        return AssistantContext(
            selectedMode = state.selectedMode,
            lastProductIds = lastIds,
            pendingAction = state.pendingAction
        )
    }

    private fun buildHistory(): List<AssistantHistoryItem> {
        return _uiState.value.messages
            .filter { it.role == SupportMessageRole.User || it.role == SupportMessageRole.Assistant }
            .takeLast(12)
            .map {
                AssistantHistoryItem(
                    role = if (it.role == SupportMessageRole.User) "user" else "assistant",
                    message = it.message
                )
            }
    }

    private fun buildEscalationSummary(): String {
        return _uiState.value.messages
            .filter { it.role == SupportMessageRole.User || it.role == SupportMessageRole.Assistant }
            .takeLast(8)
            .joinToString("\n") {
                val label = if (it.role == SupportMessageRole.User) "Kullanıcı" else "Asistan"
                "$label: ${it.message}"
            }
    }
}
