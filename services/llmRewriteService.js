const { createAiProvider } = require('./aiProviderService');
const { getPolicyAnswer } = require('./policyService');
const { getOrderSupportContext } = require('./orderSupportService');
const {
    compareProductsTool,
    getCartTool,
    getCheaperProductsTool,
    getProductDetailsTool,
    getRecommendationsTool,
    getSimilarProductsTool,
    resolveProductsByIds,
    searchProductsTool
} = require('./assistantToolRegistry');

const buildSystemPrompt = (mode) => {
    let modeInstruction = "";
    switch (mode) {
        case 'professional':
            modeInstruction = "Resmi, net, son derece kibar ve kurumsal bir müşteri hizmetleri temsilcisi gibi konuş.";
            break;
        case 'buddy':
            modeInstruction = "Bir kanka, dost veya yakın arkadaş gibi konuş. Samimi, rahat ve içten ol ama saygıyı bozma.";
            break;
        case 'funny':
            modeInstruction = "Esprili, enerjik, neşeli ve komik bir dille konuş.";
            break;
        case 'witty':
            modeInstruction = "Alaycı ama saygılı, hafif iğneleyici ve zeki espriler yapan bir tarzda konuş. Asla hakaret etme.";
            break;
        case 'quick':
            modeInstruction = "Çok kısa, net, direkt ve gereksiz uzatmadan cevaplar ver. Net bilgilere odaklan.";
            break;
        case 'detailed':
            modeInstruction = "Detaylara önem ver. Avantaj, dezavantaj, fiyat/performans dengesi ve ürün detaylarını uzun uzadıya anlat.";
            break;
        case 'technical':
            modeInstruction = "Teknik özelliklere, parametrelere ve mühendislik detaylarına odaklanarak konuş.";
            break;
        case 'sales':
            modeInstruction = "Satış danışmanı gibi davran. Kullanıcı bütçesine ve ihtiyacına göre ikna edici öneriler yap.";
            break;
        case 'friendly':
        default:
            modeInstruction = "Sıcak, günlük, samimi ve son derece anlaşılır bir dille konuş. Emojiler kullanabilirsin.";
            break;
    }

    return [
        "Sen NovaStore e-ticaret uygulamasının yapay zeka alışveriş asistanı NovaBot'sun.",
        "Görevin, kullanıcıların alışveriş deneyimini geliştirmek, ürün bulmalarına yardımcı olmak, sepet/sipariş/iade/kargo konularındaki sorularını yanıtlamaktır.",
        "Kullanıcıyla sohbet et, tavsiyeler ver ve sorularını yanıtla.",
        `Davranış modu talimatı: ${modeInstruction}`,
        "Kullanıcı ürün ararsa search_products aracını kullan. Sepetini sorarsa get_cart aracını kullan. Canlı desteğe bağlanmak isterse tekrar sebep sormadan connect_to_live_support aracını kullan ve uygulamanın onay akışını başlat.",
        "Sepete ekleme, sepetten çıkarma ve canlı destek gibi işlemler için mutlaka araç çağır; bu araçlar kullanıcıdan onay bekleyen pendingAction döndürür.",
        "Yalnızca doğrulanmış canlı verileri ve ürün bilgilerini kullan. Fiyat, stok veya sipariş bilgisi uydurma.",
        "Türkçe karakterleri ASCII benzerlerine çevirme; 'cikar' değil 'çıkar', 'goster' değil 'göster', 'urun' değil 'ürün' yaz. Doğal ve akıcı bir Türkçe kullan."
    ].join(' ');
};

const executeTool = async (name, args, { user } = {}) => {
    switch (name) {
        case 'search_products': {
            const products = args.sortByCheap
                ? await getCheaperProductsTool({ message: args.query })
                : await searchProductsTool(args.query, { maxPrice: args.maxPrice }, 4);
            return {
                products,
                output: products.map(p => `${p.name} - ${p.price} TL (ID: ${p.id}, stok: ${p.stock})`).join('\n')
            };
        }
        case 'get_product_details': {
            const product = await getProductDetailsTool(args.productId);
            return {
                products: product ? [product] : [],
                output: product 
                    ? `${product.name} detayları: Fiyat: ${product.price} TL, Stok: ${product.stock}, Puan: ${product.averageRating}/5, ID: ${product.id}`
                    : 'Ürün bulunamadı.'
            };
        }
        case 'compare_products': {
            const products = await resolveProductsByIds(args.productIds);
            return {
                products,
                comparison: products.length >= 2 ? {
                    rows: products.slice(0, 3).map((p) => ({
                        productId: p.id,
                        title: p.name,
                        price: p.price,
                        brand: p.category || 'NovaStore',
                        stock: p.stock,
                        rating: p.averageRating,
                        bestFor: p.stock > 0 ? 'Stokta görünen seçenek' : 'Stok bilgisi sınırlı seçenek'
                    }))
                } : null,
                output: `Karşılaştırılan ürünler: ${products.map(p => p.name).join(', ')}`
            };
        }
        case 'get_similar_products': {
            const products = await getSimilarProductsTool(args.productId, 4);
            return {
                products,
                output: products.map(p => `${p.name} (ID: ${p.id})`).join('\n')
            };
        }
        case 'add_to_cart': {
            return {
                requiresConfirmation: true,
                pendingAction: { type: 'add_to_cart', productId: args.productId, quantity: args.quantity || 1 },
                output: `Sepete ekleme talebi oluşturuldu. Ürün ID: ${args.productId}. Kullanıcıdan onay bekleniyor.`
            };
        }
        case 'remove_from_cart': {
            return {
                requiresConfirmation: true,
                pendingAction: { type: 'remove_from_cart', productId: args.productId },
                output: `Sepetten çıkarma talebi oluşturuldu. Ürün ID: ${args.productId}. Kullanıcıdan onay bekleniyor.`
            };
        }
        case 'get_cart': {
            const cart = getCartTool();
            return {
                output: cart.message
            };
        }
        case 'get_order_status': {
            const orderContext = await getOrderSupportContext({ user, message: args.orderId ? `siparis ${args.orderId}` : 'siparislerim' });
            return {
                output: orderContext.answer
            };
        }
        case 'connect_to_live_support': {
            return {
                requiresConfirmation: true,
                pendingAction: { type: 'live_support', reason: args.reason },
                allowEscalation: true,
                output: `Canlı desteğe bağlanma talebi oluşturuldu. Sebep: ${args.reason}. Kullanıcıdan onay bekleniyor.`
            };
        }
        case 'get_shipping_or_return_policy': {
            const policy = await getPolicyAnswer(args.topic);
            return {
                output: policy.answer
            };
        }
        default:
            throw new Error(`Bilinmeyen araç: ${name}`);
    }
};

const runAgentSession = async ({ userMessage, history = [], mode, user }) => {
    const provider = createAiProvider();
    const systemPrompt = buildSystemPrompt(mode);
    const boundExecuteTool = (name, args) => executeTool(name, args, { user });

    try {
        const result = await provider.runAgent({
            systemPrompt,
            userMessage,
            history,
            executeTool: boundExecuteTool
        });
        return result;
    } catch (err) {
        console.error("Agent execution error:", err);
        return {
            text: "Şu an NovaBot tarafında kısa bir yoğunluk var ama buradayım. Ürün arama, sepet, sipariş veya canlı destek için devam edebilirim.",
            products: [],
            comparison: null,
            requiresConfirmation: false,
            pendingAction: null,
            allowEscalation: false
        };
    }
};

module.exports = {
    runAgentSession
};
