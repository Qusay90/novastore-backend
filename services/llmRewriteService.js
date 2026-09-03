const { createAiProvider, getProviderResultMetadata } = require('./aiProviderService');
const { NovaBotProviderUnavailableError } = require('./novabotCapabilityService');
const {
    DEFAULT_NOVABOT_MODE_ID,
    buildNovabotSystemPrompt,
    getNovabotMode,
    requireNovabotModeId
} = require('./novabotModeRegistry');
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

const runAgentSession = async ({ userMessage, history = [], modeId, user, provider: injectedProvider = null }) => {
    const canonicalModeId = requireNovabotModeId(modeId, { allowDefault: true });
    const mode = getNovabotMode(canonicalModeId);
    try {
        const provider = injectedProvider || createAiProvider();
        const allowedToolNames = new Set(mode.allowedToolNames);
        const boundExecuteTool = (name, args) => {
            if (!allowedToolNames.has(name)) throw new Error('NovaBot aracı bu mod için kullanılamıyor.');
            return executeTool(name, args, { user });
        };
        const result = await provider.runAgent({
            systemPrompt: buildNovabotSystemPrompt(canonicalModeId),
            userMessage,
            history,
            executeTool: boundExecuteTool,
            generationConfig: mode.generationConfig,
            allowedToolNames: mode.allowedToolNames,
            maxToolRounds: mode.maxToolRounds
        });
        const providerMetadata = getProviderResultMetadata(result);
        const supportsConversationModes = providerMetadata
            ? providerMetadata.supportsConversationModes
            : provider.supportsConversationModes === true;
        if (canonicalModeId !== DEFAULT_NOVABOT_MODE_ID && !supportsConversationModes) {
            throw new NovaBotProviderUnavailableError();
        }
        return result;
    } catch (err) {
        if (err instanceof NovaBotProviderUnavailableError) throw err;
        if (canonicalModeId !== DEFAULT_NOVABOT_MODE_ID) throw new NovaBotProviderUnavailableError();
        console.error('NovaBot agent execution failed safely.', { code: err?.code || 'NOVABOT_AGENT_ERROR' });
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
