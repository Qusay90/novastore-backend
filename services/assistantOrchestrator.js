const { ASSISTANT_INTENTS } = require('../constants/assistantIntents');
const {
    compareProductsByText,
    getProductDetails,
    normalizeSearchText,
    searchProducts
} = require('./catalogSearchService');
const { summarizeProductReviews } = require('./reviewInsightService');
const { getPolicyAnswer } = require('./policyService');
const { getOrderSupportContext } = require('./orderSupportService');
const { rewriteDraftReply } = require('./llmRewriteService');

const SOCIAL_PATTERNS = {
    gratitude: /tesekkur|tesekkurler|sag ol|eyvallah|eline saglik|cok iyi oldu|yardimci oldun/,
    compliment: /harikasin|super|mukemmel|adamsin|kralsin|efsanesin|site cok guzel|cok iyisin|begendim|iyi is cikarmissin/,
    greeting: /merhaba|selam|gunaydin|iyi aksamlar|nasilsin|naber|orada misin|iyi gunler/
};

const detectIntent = (message) => {
    const text = normalizeSearchText(message);

    if (SOCIAL_PATTERNS.gratitude.test(text) || SOCIAL_PATTERNS.compliment.test(text) || SOCIAL_PATTERNS.greeting.test(text)) {
        return ASSISTANT_INTENTS.SOCIAL_CHAT;
    }
    if (/canli destek|gercek kisi|musteri temsilcisi|insan destegi/.test(text)) {
        return ASSISTANT_INTENTS.ESCALATE_TO_HUMAN;
    }
    if (/karsilastir|farki ne|hangisi daha iyi|\bvs\b/.test(text)) {
        return ASSISTANT_INTENTS.PRODUCT_COMPARE;
    }
    if (/yorum|degerlendirme|puan|memnun/.test(text)) {
        return ASSISTANT_INTENTS.REVIEW_INSIGHT;
    }
    if (/siparis|kargom|takip no|teslimat durum|refund|geri odeme/.test(text)) {
        return ASSISTANT_INTENTS.ORDER_SUPPORT;
    }
    if (/iade|kvkk|gizlilik|odeme|3d|havale|kampanya|kupon|kargo|teslim/.test(text)) {
        return /kampanya|kupon|indirim/.test(text)
            ? ASSISTANT_INTENTS.CAMPAIGN_SUPPORT
            : ASSISTANT_INTENTS.POLICY_SUPPORT;
    }
    if (/oner|onerir misin|bul|ara|laptop|mouse|kulaklik|gozluk|kavak|makine|urun/.test(text)) {
        return ASSISTANT_INTENTS.PRODUCT_SEARCH;
    }
    return ASSISTANT_INTENTS.GENERAL_HELP;
};

const formatMoney = (value) => `${Number(value || 0).toFixed(2)} TL`;

const productReason = (product) => {
    const reasons = [];
    if (Number(product.stock || 0) > 0) reasons.push('stokta');
    if (Number(product.averageRating || 0) > 0) reasons.push(`${Number(product.averageRating).toFixed(1)}/5 puan`);
    if (Number(product.reviewCount || 0) > 0) reasons.push(`${product.reviewCount} yorum`);
    if (product.oldPrice && Number(product.oldPrice) > Number(product.price)) reasons.push('indirimli fiyat');
    return reasons.length > 0 ? reasons.join(', ') : 'kategori eslesmesi';
};

const shouldUseContextProduct = (message) => {
    const text = normalizeSearchText(message);
    return /bu urun|bu model|bunun|buna|buradaki|inceledigim/.test(text);
};

const buildSocialReply = (message) => {
    const text = normalizeSearchText(message);

    if (SOCIAL_PATTERNS.gratitude.test(text)) {
        return {
            reply: 'Rica ederim, memnun oldum. Isterseniz hemen size uygun bir urun bulayim ya da iki secenegi hizlica karsilastirayim.',
            suggestions: ['Bana uygun urun oner', 'Iki urunu karsilastir', 'Yorumlari iyi olanlari goster'],
            products: []
        };
    }

    if (SOCIAL_PATTERNS.compliment.test(text)) {
        return {
            reply: 'Cok naziksiniz, tesekkur ederim. Guzel bir secim yapmaniz icin buradayim; isterseniz butceyi veya kullanim amacinizi yazin, en mantikli secenekleri cikarayim.',
            suggestions: ['Fiyat performans urun oner', 'Hediye icin urun bul', 'Kargo ve iade kosullari'],
            products: []
        };
    }

    if (/nasilsin|naber/.test(text)) {
        return {
            reply: 'Iyiyim, tesekkur ederim. Size hizli ve net yardimci olayim; ne aradiginizi kisaca yazmaniz yeterli.',
            suggestions: ['Bugun en cok tercih edilenler', '1000 TL alti urun oner', 'Canli destege baglan'],
            products: []
        };
    }

    return {
        reply: 'Merhaba, hos geldiniz. Isterseniz ihtiyacinizi birlikte netlestirelim; ben size uygun urunleri, yorum ozetlerini ve fiyat avantajlarini hizlica cikarayim.',
        suggestions: ['Bana uygun urun oner', 'Yorumlari iyi urunleri goster', 'Kargo ve iade kosullari'],
        products: []
    };
};

const buildProductSearchReply = (products, userMessage, fallback = false) => {
    if (!products.length) {
        return {
            reply: 'Kriterinize tam uyan bir urun bulamadim. Ama guzel bir baslangic yaptiniz; butceyi, kullanim amacini ya da kategoriyi biraz daha net yazarsaniz listeyi hizla daraltayim.',
            suggestions: ['1000 TL alti urun oner', 'fiyat performans urun goster', 'yorumlari iyi olanlari listele'],
            products: []
        };
    }

    const normalizedMessage = normalizeSearchText(userMessage);
    const warmLead = /butce|fiyat|oyun|ofis|gunluk|profesyonel|hediye/.test(normalizedMessage)
        ? 'Guzel bir kriter seti vermissiniz.'
        : 'Istediginize yakin secenekleri toparladim.';
    const intro = fallback
        ? `${warmLead} Tam eslesme az oldugu icin en yakin alternatifleri cikardim:`
        : `${warmLead} Size en alakali urunleri cikardim:`;

    const lines = products.map((product, index) => `${index + 1}. ${product.name} - ${formatMoney(product.price)} (${productReason(product)})`);

    return {
        reply: `${intro}\n${lines.join('\n')}`,
        suggestions: ['Bunlari karsilastir', 'Yorum ozetini goster', 'Daha uygun fiyatli alternatif ver'],
        products
    };
};

const buildComparisonReply = (products) => {
    if (products.length < 2) {
        return {
            reply: 'Karari saglam vermek istemeniz cok iyi. Net bir karsilastirma yapmam icin en az iki urun belirtmeniz yeterli. Ornek: "mouse ile kulaklik karsilastir".',
            suggestions: ['mouse ile kulaklik karsilastir', 'en iyi iki urunu karsilastir'],
            products
        };
    }

    const lines = products.slice(0, 3).map((product) => (
        `${product.name}: ${formatMoney(product.price)}, stok ${product.stock}, puan ${Number(product.averageRating || 0).toFixed(1)}/5, yorum ${product.reviewCount}`
    ));

    const sortedByPrice = [...products].sort((left, right) => left.price - right.price);
    const sortedByRating = [...products].sort((left, right) => right.averageRating - left.averageRating || right.reviewCount - left.reviewCount);
    const recommendation = `Daha dusuk butce icin ${sortedByPrice[0].name}, yorum ve puan tarafinda daha guvenli tercih icin ${sortedByRating[0].name} one cikiyor.`;

    return {
        reply: `Karari netlestirelim.\n${lines.join('\n')}\n${recommendation}`,
        suggestions: ['Ilk urunun yorumlarini ozetle', 'Bana tek bir secim oner'],
        products
    };
};

const buildReviewReply = async ({ product, contextProductId }) => {
    const resolvedProduct = product || (contextProductId ? await getProductDetails(Number(contextProductId)) : null);
    if (!resolvedProduct) {
        return {
            reply: 'Yorumlara bakmak cok dogru bir adim. Hangi urunun yorumlarini ozetlememi istediginizi yazarsaniz net bir ozet cikarabilirim.',
            suggestions: ['Bu urunun yorumlari nasil?', 'En cok begenilen urun hangisi?'],
            products: []
        };
    }

    const summary = await summarizeProductReviews(resolvedProduct);
    let reply = `Satin almadan once yorumlara bakmaniz cok iyi. ${summary.summary}`;
    if (summary.recentComments.length > 0) {
        reply += ` Son yorumlardan ornekler: ${summary.recentComments.join(' | ')}`;
    }

    return {
        reply,
        suggestions: ['Bu urunu onerir misin?', 'Benzer urunler goster'],
        products: [resolvedProduct],
        reviewSummary: summary
    };
};

const buildGeneralReply = () => ({
    reply: 'Memnuniyetle yardimci olurum. Size urun bulma, karsilastirma, yorum ozeti, kargo, iade, odeme ve kampanya konularinda destek verebilirim. Ne aradiginizi bir cumleyle yazmaniz yeterli.',
    suggestions: ['1000 TL alti urun oner', 'Kargo ve iade kosullari neler?', 'Yorumlari iyi urunleri goster'],
    products: []
});

const buildEscalationReply = () => ({
    reply: 'Tabii, isterseniz sizi canli destek akisina alabilirim. Giris yaptiysaniz temsilciye bu konusmanin kisa ozetini de iletebilirim.',
    suggestions: ['Canli destege baglan', 'Once burada devam edelim'],
    products: [],
    allowEscalation: true
});

const buildProductContext = async (message, context) => {
    if (context && Number.isInteger(Number(context.productId))) {
        return getProductDetails(Number(context.productId));
    }

    const candidates = await searchProducts({ query: message, limit: 1 });
    return candidates[0] || null;
};

const handleAssistantChat = async ({ message, user, history = [], context = {} }) => {
    const trimmedMessage = String(message || '').trim();
    if (!trimmedMessage) {
        return buildGeneralReply();
    }

    const intent = detectIntent(trimmedMessage);
    let response;
    const llmContext = { historyCount: Array.isArray(history) ? history.length : 0 };

    switch (intent) {
        case ASSISTANT_INTENTS.SOCIAL_CHAT: {
            response = buildSocialReply(trimmedMessage);
            break;
        }
        case ASSISTANT_INTENTS.PRODUCT_SEARCH: {
            const useContextProduct = shouldUseContextProduct(trimmedMessage) && context.productId;
            const products = await searchProducts({
                query: trimmedMessage,
                limit: 4,
                productId: useContextProduct ? Number(context.productId) : null
            });
            response = buildProductSearchReply(products, trimmedMessage);
            llmContext.products = products;
            break;
        }
        case ASSISTANT_INTENTS.PRODUCT_COMPARE: {
            const products = await compareProductsByText(trimmedMessage, 3);
            response = buildComparisonReply(products);
            llmContext.products = products;
            break;
        }
        case ASSISTANT_INTENTS.REVIEW_INSIGHT: {
            const product = await buildProductContext(trimmedMessage, context);
            response = await buildReviewReply({ product, contextProductId: context.productId });
            llmContext.products = response.products;
            llmContext.reviewSummary = response.reviewSummary || null;
            break;
        }
        case ASSISTANT_INTENTS.ORDER_SUPPORT: {
            const orderContext = await getOrderSupportContext({ user, message: trimmedMessage });
            response = {
                reply: orderContext.answer,
                suggestions: orderContext.requiresAuth ? ['Giris yaptiktan sonra tekrar sor'] : ['Siparis detayini ac', 'Canli destege baglan'],
                products: [],
                allowEscalation: !orderContext.requiresAuth
            };
            llmContext.order = orderContext.order || null;
            break;
        }
        case ASSISTANT_INTENTS.CAMPAIGN_SUPPORT:
        case ASSISTANT_INTENTS.POLICY_SUPPORT: {
            const policy = await getPolicyAnswer(trimmedMessage);
            response = {
                reply: policy.answer,
                suggestions: ['Bana uygun urun oner', 'Canli destege baglan'],
                products: []
            };
            llmContext.policy = policy;
            break;
        }
        case ASSISTANT_INTENTS.ESCALATE_TO_HUMAN: {
            response = buildEscalationReply();
            break;
        }
        default: {
            response = buildGeneralReply();
            break;
        }
    }

    const rewrittenReply = await rewriteDraftReply({
        userMessage: trimmedMessage,
        draftReply: response.reply,
        intent,
        context: llmContext
    });

    return {
        mode: 'assistant',
        intent,
        confidence: 0.82,
        reply: rewrittenReply,
        suggestions: response.suggestions || [],
        products: response.products || [],
        allowEscalation: Boolean(response.allowEscalation),
        citations: (response.products || []).map((product) => ({
            label: product.name,
            url: product.productUrl
        }))
    };
};

module.exports = {
    ASSISTANT_INTENTS,
    handleAssistantChat
};