const { ASSISTANT_INTENTS } = require('../constants/assistantIntents');
const { normalizeSearchText } = require('./catalogSearchService');
const { runAgentSession } = require('./llmRewriteService');
const {
    getCheaperProductsTool,
    searchProductsTool
} = require('./assistantToolRegistry');

const NOVABOT_MODES = Object.freeze({
    professional: {
        label: 'Profesyonel Mod',
        aliases: ['profesyonel', 'resmi', 'musteri hizmetleri'],
        intro: 'Net ve resmi şekilde yardımcı olayım.'
    },
    friendly: {
        label: 'Samimi Mod',
        aliases: ['samimi', 'sicak', 'normal'],
        intro: 'Sıcak ve anlaşılır şekilde yardımcı olayım.'
    },
    buddy: {
        label: 'Kanka Modu',
        aliases: ['kanka', 'arkadas', 'rahat'],
        intro: 'Kanka, mantıklı seçenekleri toparlayayım.'
    },
    funny: {
        label: 'Komik Mod',
        aliases: ['komik', 'eglenceli', 'esprili'],
        intro: 'Hafif esprili ama bilgi tarafını boşlamadan yardımcı olayım.'
    },
    witty: {
        label: 'Alayci Ama Saygili Mod',
        aliases: ['alayci', 'sivri', 'takil'],
        intro: 'Biraz takılırım ama saygıyı bozmadan net konuşurum.'
    },
    quick: {
        label: 'Hızlı Mod',
        aliases: ['hizli', 'kisa', 'net'],
        intro: 'Kısa ve net cevap vereyim.'
    },
    detailed: {
        label: 'Detaycı Mod',
        aliases: ['detayci', 'detayli', 'uzun anlat'],
        intro: 'Detaylarıyla karşılaştırıp anlatayım.'
    },
    technical: {
        label: 'Teknik Uzman Modu',
        aliases: ['teknik', 'uzman', 'performans'],
        intro: 'Teknik kriterlere odaklanayım.'
    },
    sales: {
        label: 'Satış Danışmanı Modu',
        aliases: ['satis', 'danisman', 'ihtiyac'],
        intro: 'İhtiyaç, bütçe ve kullanım amacına göre yönlendireyim.'
    }
});

const listModeCards = () => Object.entries(NOVABOT_MODES).map(([id, mode]) => ({
    id,
    title: mode.label,
    description: mode.intro
}));

const normalizeMode = (mode) => {
    const requested = normalizeSearchText(mode);
    if (NOVABOT_MODES[requested]) return requested;
    return Object.entries(NOVABOT_MODES).find(([, item]) => item.aliases.some((alias) => requested.includes(normalizeSearchText(alias))))?.[0] || 'friendly';
};

const detectRequestedMode = (message) => {
    const text = normalizeSearchText(message);
    return Object.entries(NOVABOT_MODES).find(([, mode]) => mode.aliases.some((alias) => text.includes(normalizeSearchText(alias))))?.[0] || null;
};

const resolveActiveMode = (message, context = {}) => {
    const requestedMode = detectRequestedMode(message);
    if (requestedMode) return requestedMode;
    return normalizeMode(context.selectedMode || context.mode || 'friendly');
};

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

const handleAssistantChat = async ({ message, user, history = [], context = {} }) => {
    const trimmedMessage = String(message || '').trim();
    const activeMode = resolveActiveMode(trimmedMessage, context);

    // If changing mode explicitly
    const requestedMode = detectRequestedMode(trimmedMessage);
    if (/modu degistir|mod degistir|mod sec|modu/.test(normalizeSearchText(trimmedMessage)) && requestedMode) {
        const title = NOVABOT_MODES[requestedMode].label;
        return {
            mode: requestedMode,
            modeLabel: title,
            availableModes: listModeCards(),
            intent: ASSISTANT_INTENTS.MODE_CHANGE,
            confidence: 1.0,
            reply: `${title} aktif. Bundan sonra bu tonda konuşacağım.`,
            message: `${title} aktif. Bundan sonra bu tonda konuşacağım.`,
            suggestions: ['Ucuz ürün bul', 'Ürün karşılaştır', 'İade/değişim'],
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

    if (!trimmedMessage) {
        return {
            mode: activeMode,
            modeLabel: NOVABOT_MODES[activeMode]?.label || NOVABOT_MODES.friendly.label,
            availableModes: listModeCards(),
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
            mode: 'professional',
            modeLabel: NOVABOT_MODES.professional.label,
            availableModes: listModeCards(),
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
            mode: activeMode,
            modeLabel: NOVABOT_MODES[activeMode]?.label || NOVABOT_MODES.friendly.label,
            availableModes: listModeCards(),
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
        mode: activeMode,
        user
    });

    let products = agentResult.products || [];
    if (!products.length) {
        products = await resolveFallbackProducts(trimmedMessage);
    }
    const hasToolFallbackProducts = products.length > 0 && !(agentResult.products || []).length;
    const socialFallbackReply = looksLikeProviderBusy(agentResult.text)
        ? buildSocialFallbackReply(trimmedMessage, activeMode)
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
        mode: activeMode,
        modeLabel: NOVABOT_MODES[activeMode]?.label || NOVABOT_MODES.friendly.label,
        availableModes: listModeCards(),
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
    NOVABOT_MODES,
    handleAssistantChat
};
