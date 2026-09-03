const { ASSISTANT_INTENTS } = require('../constants/assistantIntents');
const { normalizeSearchText } = require('./catalogSearchService');
const { runAgentSession } = require('./llmRewriteService');
const {
    getCheaperProductsTool,
    searchProductsTool
} = require('./assistantToolRegistry');
const {
    assertNovabotModeAvailable,
    resolveNovabotCapability
} = require('./novabotCapabilityService');
const {
    NOVABOT_MODE_REGISTRY,
    getNovabotMode
} = require('./novabotModeRegistry');

const LIVE_SUPPORT_PATTERN = /canli destek|canli destege|canli destegi|gercek kisi|musteri temsilcisi|insan destegi|temsilciye bagla|destek ekibine bagla/;
const CART_PATTERN = /sepetimde ne var|sepetim|sepeti goster|sepetimi goster|sepetimi kontrol/;
const PRODUCT_SEARCH_PATTERN = /urun|oner|bul|goster|ara|ucuz|uygun|butce|fiyat|kampanya|indirim|karsilastir|en cok satan/;
const CHEAP_PRODUCT_PATTERN = /ucuz|uygun|butce|ekonomik|fiyat performans|indirim/;
const SOCIAL_CHAT_PATTERN = /nasilsin|naber|ne haber|iyi misin|selam|merhaba|iyiyim|tesekkur/;

const toProductCard = (product) => ({
    type: 'product',
    productId: product.id,
    title: product.name,
    imageUrl: product.imageUrl || '',
    price: product.price,
    oldPrice: product.oldPrice,
    currency: 'TRY',
    inStock: Number(product.stock || 0) > 0,
    stock: product.stock,
    rating: product.averageRating,
    reviewCount: product.reviewCount,
    category: product.category,
    actions: ['add_to_cart', 'view_details', 'favorite', 'compare']
});

const buildProductSearchReply = (products) => {
    if (!products.length) {
        return 'Bu aramaya uygun ürün bulamadım. İstersen bütçe, kategori veya marka yazarak tekrar arayabiliriz.';
    }
    const lead = products.slice(0, 3).map((product, index) => (
        `${index + 1}. ${product.name} - ${Number(product.price || 0).toLocaleString('tr-TR')} TL`
    )).join('\n');
    return `Aramana göre canlı katalogdan şu seçenekleri buldum:\n${lead}\nİstersen bunları karşılaştırabilir veya birini sepete eklemek için onay akışını başlatabilirim.`;
};

const resolveFallbackProducts = async (message) => {
    const normalized = normalizeSearchText(message);
    if (!PRODUCT_SEARCH_PATTERN.test(normalized)) return [];
    if (CHEAP_PRODUCT_PATTERN.test(normalized)) {
        return getCheaperProductsTool({ message, limit: 4 });
    }
    return searchProductsTool(message, {}, 4);
};

const looksLikeProviderBusy = (text = '') => {
    const normalized = normalizeSearchText(text);
    return normalized.includes('isteklerinize cevap veremiyorum')
        || normalized.includes('tam yanit uretemedi')
        || normalized.includes('tekrar deneyebilir');
};

const buildSocialFallbackReply = (message, mode) => {
    if (!SOCIAL_CHAT_PATTERN.test(normalizeSearchText(message))) return null;
    if (mode === 'quick') return 'İyiyim, teşekkür ederim. Sana nasıl yardımcı olayım?';
    if (mode === 'buddy') return 'İyiyim kanka, teşekkür ederim. Sen nasılsın? Ürün, sepet, sipariş ya da canlı destek tarafında ne lazımsa buradayım.';
    if (mode === 'funny') return 'İyiyim, enerjim yerinde. Alışveriş evreninde bugün hangi göreve ışınlanıyoruz?';
    return 'İyiyim, teşekkür ederim. Sana ürün arama, sepet, sipariş, iade veya canlı destek konusunda yardımcı olabilirim.';
};

const handleAssistantChat = async ({
    message,
    user,
    history = [],
    modeId,
    provider = null,
    providerCapability = null
}) => {
    const trimmedMessage = String(message || '').trim();
    const capability = providerCapability || resolveNovabotCapability();
    const activeModeId = assertNovabotModeAvailable(modeId, capability);
    const activeMode = getNovabotMode(activeModeId);
    const availableModes = capability.modes.map((mode) => ({
        id: mode.id,
        label: mode.label,
        title: mode.label,
        description: mode.description
    }));

    if (!trimmedMessage) {
        return {
            modeId: activeModeId,
            mode: activeModeId,
            modeLabel: activeMode.label,
            availableModes,
            intent: ASSISTANT_INTENTS.GENERAL_CHAT,
            confidence: 1.0,
            reply: 'Merhaba, ben NovaBot. Ürün bulabilir, sepet/sipariş/iade/kargo konularında yardımcı olabilirim.',
            message: 'Merhaba, ben NovaBot. Ürün bulabilir, sepet/sipariş/iade/kargo konularında yardımcı olabilirim.',
            suggestions: ['Ucuz ürün bul', 'Ürün karşılaştır', 'Siparişimi sorgula', 'Bana hediye öner'],
            products: [],
            cards: [],
            comparison: null,
            requiresConfirmation: false,
            pendingAction: null,
            allowEscalation: false,
            escalated: false,
            citations: []
        };
    }

    if (LIVE_SUPPORT_PATTERN.test(normalizeSearchText(trimmedMessage))) {
        return {
            modeId: activeModeId,
            mode: activeModeId,
            modeLabel: activeMode.label,
            availableModes,
            intent: ASSISTANT_INTENTS.LIVE_SUPPORT,
            confidence: 1.0,
            reply: 'Seni canlı desteğe aktarabilirim. Temsilciye geçmeden önce onaylaman yeterli; konuşma özetini destek ekibine ileteceğim.',
            message: 'Seni canlı desteğe aktarabilirim. Temsilciye geçmeden önce onaylaman yeterli; konuşma özetini destek ekibine ileteceğim.',
            suggestions: ['Evet, canlı desteğe bağlan', 'Vazgeç'],
            products: [],
            cards: [],
            comparison: null,
            requiresConfirmation: true,
            pendingAction: { type: 'live_support', reason: trimmedMessage },
            allowEscalation: true,
            escalated: false,
            citations: []
        };
    }

    if (CART_PATTERN.test(normalizeSearchText(trimmedMessage))) {
        return {
            modeId: activeModeId,
            mode: activeModeId,
            modeLabel: activeMode.label,
            availableModes,
            intent: ASSISTANT_INTENTS.SHOW_CART,
            confidence: 1.0,
            reply: 'Sepetin Android uygulamasında yerel olarak tutuluyor. Sepet sekmesini açarak ürünlerini, adetleri ve toplam tutarı görebilirsin.',
            message: 'Sepetin Android uygulamasında yerel olarak tutuluyor. Sepet sekmesini açarak ürünlerini, adetleri ve toplam tutarı görebilirsin.',
            suggestions: ['Sepet sekmesine git', 'Ucuz ürün bul', 'Canlı desteğe bağlan'],
            products: [],
            cards: [],
            comparison: null,
            requiresConfirmation: false,
            pendingAction: null,
            allowEscalation: false,
            escalated: false,
            citations: []
        };
    }

    // Call autonomous LLM agent session
    const agentResult = await runAgentSession({
        userMessage: trimmedMessage,
        history,
        modeId: activeModeId,
        user,
        provider
    });

    let products = agentResult.products || [];
    if (!products.length) {
        products = await resolveFallbackProducts(trimmedMessage);
    }
    const hasToolFallbackProducts = products.length > 0 && !(agentResult.products || []).length;
    const socialFallbackReply = looksLikeProviderBusy(agentResult.text)
        ? buildSocialFallbackReply(trimmedMessage, activeModeId)
        : null;
    const reply = hasToolFallbackProducts
        ? buildProductSearchReply(products)
        : socialFallbackReply
            ? socialFallbackReply
        : looksLikeProviderBusy(agentResult.text)
            ? 'Şu an NovaBot tarafında kısa bir yoğunluk var ama buradayım. Ürün arama, sepet, sipariş veya canlı destek için devam edebilirim.'
            : agentResult.text;

    const suggestions = ['Sohbet et', 'Bana telefon öner', 'Canlı desteğe bağlan'];
    const cards = products.map(toProductCard);

    return {
        modeId: activeModeId,
        mode: activeModeId,
        modeLabel: activeMode.label,
        availableModes,
        intent: products.length ? ASSISTANT_INTENTS.PRODUCT_SEARCH : ASSISTANT_INTENTS.GENERAL_CHAT,
        confidence: 1.0,
        reply,
        message: reply,
        suggestions,
        products,
        cards,
        comparison: agentResult.comparison || null,
        requiresConfirmation: agentResult.requiresConfirmation || false,
        pendingAction: agentResult.pendingAction || null,
        allowEscalation: agentResult.allowEscalation || false,
        escalated: false,
        citations: products.map((product) => ({
            label: product.name,
            url: product.productUrl || ''
        }))
    };
};

module.exports = {
    ASSISTANT_INTENTS,
    NOVABOT_MODES: NOVABOT_MODE_REGISTRY,
    handleAssistantChat
};
