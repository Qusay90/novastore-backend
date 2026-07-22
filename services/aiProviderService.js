const { getAiProviderConfig } = require('../config/appConfig');
const {
    ExternalSideEffectBlockedError,
    assertExternalSideEffectAllowed
} = require('../config/stagingRuntimePolicy');

const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';
const DEFAULT_OLLAMA_MODEL = 'llama3.1';
const FALLBACK_PROVIDER_NAMES = new Set(['mock', 'ollama', 'gemini', 'openai']);

class AiProviderFallbackError extends Error {
    constructor(message, { provider, statusCode = null, retryAfterMs = null, payload = null } = {}) {
        super(message);
        this.name = 'AiProviderFallbackError';
        this.provider = provider;
        this.statusCode = statusCode;
        this.retryAfterMs = retryAfterMs;
        this.payload = payload;
    }
}

const safeJson = async (response) => {
    try {
        return await response.json();
    } catch (_) {
        return null;
    }
};

const tryParseJsonObject = (value) => {
    if (!value) return {};
    if (typeof value === 'object' && !Array.isArray(value)) return value;

    const raw = String(value).trim();
    if (!raw) return {};

    try {
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch (_) {
        return null;
    }
};

const parseToolArguments = (value, { provider = 'unknown', toolName = 'unknown' } = {}) => {
    const parsed = tryParseJsonObject(value);
    if (parsed) return parsed;

    const raw = String(value || '').trim();
    const repaired = raw
        .replace(/([{,]\s*)([A-Za-z_$][\w$-]*)(\s*:)/g, '$1"$2"$3')
        .replace(/:\s*'([^']*)'/g, (_, content) => `:${JSON.stringify(content)}`)
        .replace(/,\s*}/g, '}')
        .replace(/,\s*]/g, ']');

    const repairedParsed = tryParseJsonObject(repaired);
    if (repairedParsed) {
        console.warn(`AI provider repaired malformed tool arguments: provider=${provider} tool=${toolName}`);
        return repairedParsed;
    }

    console.warn(`AI provider ignored malformed tool arguments: provider=${provider} tool=${toolName}`);
    return {};
};

const extractGeminiText = (payload) => {
    const parts = payload && payload.candidates && payload.candidates[0]
        && payload.candidates[0].content && payload.candidates[0].content.parts;
    if (!Array.isArray(parts)) return null;
    return parts.map((part) => part.text).filter(Boolean).join('\n').trim() || null;
};

const extractOllamaText = (payload) => {
    if (!payload) return null;
    if (payload.message && payload.message.content) return String(payload.message.content).trim();
    if (payload.response) return String(payload.response).trim();
    return null;
};

const getPayloadStatus = (payload) => payload?.error?.status || null;

const normalizeAssistantText = (value) => String(value || '')
    .toLowerCase()
    .replace(/ı/g, 'i')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c');

const parseRetryAfterMs = (response, payload) => {
    const retryAfterHeader = response.headers?.get?.('retry-after');
    const retryAfterSeconds = Number(retryAfterHeader);
    if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
        return Math.ceil(retryAfterSeconds * 1000);
    }

    const message = String(payload?.error?.message || '');
    const match = message.match(/retry in\s+([0-9.]+)s/i);
    if (!match) return null;

    const seconds = Number(match[1]);
    return Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds * 1000) : null;
};

const buildProviderUnavailableResult = (providerName) => ({
    text: `${providerName} şu an yanıt veremiyor. Ürün arama, sepet, sipariş veya canlı destek için deterministik NovaBot akışıyla devam edebilirim.`,
    products: [],
    comparison: null,
    requiresConfirmation: false,
    pendingAction: null,
    allowEscalation: true
});

const OPENAI_TOOLS = [
    {
        type: "function",
        function: {
            name: "search_products",
            description: "NovaStore ürün kataloğunda arama yapar. İsim, kategori, marka veya özellik belirtilerek ürünler bulunabilir. Sonuçlar ürün listesi döner.",
            parameters: {
                type: "object",
                properties: {
                    query: { type: "string", description: "Aranacak kelime, kategori veya marka" },
                    maxPrice: { type: "number", description: "Maksimum fiyat sınırı (TL)" },
                    sortByCheap: { type: "boolean", description: "True verilirse ucuzdan pahalıya sıralar" }
                },
                required: ["query"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "get_product_details",
            description: "Belirli bir ürünün detaylarını (isim, fiyat, stok durumu, ortalama puan, yorum sayısı vb.) getirir.",
            parameters: {
                type: "object",
                properties: {
                    productId: { type: "integer", description: "Detayları istenecek ürünün ID'si" }
                },
                required: ["productId"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "compare_products",
            description: "Belirtilen ürün ID'lerine sahip ürünleri fiyat, puan, stok gibi kriterlerle yan yana karşılaştırır.",
            parameters: {
                type: "object",
                properties: {
                    productIds: {
                        type: "array",
                        items: { type: "integer" },
                        description: "Karşılaştırılacak ürünlerin ID listesi"
                    }
                },
                required: ["productIds"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "get_similar_products",
            description: "Belirtilen ürünün kategorisine ve adına benzer alternatif/benzer ürünleri getirir.",
            parameters: {
                type: "object",
                properties: {
                    productId: { type: "integer", description: "Referans ürünün ID'si" }
                },
                required: ["productId"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "add_to_cart",
            description: "Belirtilen ürünü kullanıcının alışveriş sepetine ekleme talebi oluşturur. Bu işlem kullanıcıdan onay isteyecektir.",
            parameters: {
                type: "object",
                properties: {
                    productId: { type: "integer", description: "Sepete eklenecek ürünün ID'si" },
                    quantity: { type: "integer", description: "Eklenecek adet" }
                },
                required: ["productId"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "remove_from_cart",
            description: "Belirtilen ürünü sepetten çıkarma talebi oluşturur. Kullanıcıdan onay isteyecektir.",
            parameters: {
                type: "object",
                properties: {
                    productId: { type: "integer", description: "Sepetten çıkarılacak ürünün ID'si" }
                },
                required: ["productId"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "get_cart",
            description: "Kullanıcının Android uygulamasındaki yerel sepet bilgisinin uygulama tarafında gösterildiğini belirtir ve sepet sekmesine yönlendirme bilgisi verir.",
            parameters: {
                type: "object",
                properties: {}
            }
        }
    },
    {
        type: "function",
        function: {
            name: "get_order_status",
            description: "Kullanıcının siparişlerinin durumunu, teslimat veya kargo takip bilgilerini getirir. (Giriş yapmış kullanıcılar için).",
            parameters: {
                type: "object",
                properties: {
                    orderId: { type: "integer", description: "Opsiyonel sipariş ID'si" }
                }
            }
        }
    },
    {
        type: "function",
        function: {
            name: "connect_to_live_support",
            description: "Kullanıcıyı canlı destek ekibine aktarma talebi oluşturur. Kullanıcıdan onay isteyecektir.",
            parameters: {
                type: "object",
                properties: {
                    reason: { type: "string", description: "Canlı desteğe bağlanma sebebi/özeti" }
                },
                required: ["reason"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "get_shipping_or_return_policy",
            description: "İade politikası, kargo ve teslimat ücretleri, ödeme seçenekleri, gizlilik, KVKK veya aktif kampanyalar/kuponlar hakkında resmi bilgi getirir.",
            parameters: {
                type: "object",
                properties: {
                    topic: {
                        type: "string",
                        description: "Bilgi istenen konu başlığı (kvkk, privacy, returns, payment, shipping, campaigns)"
                    }
                },
                required: ["topic"]
            }
        }
    }
];

const GEMINI_TOOLS = [
    {
        functionDeclarations: [
            {
                name: "search_products",
                description: "NovaStore ürün kataloğunda arama yapar. İsim, kategori, marka veya özellik belirtilerek ürünler bulunabilir. Sonuçlar ürün listesi döner.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        query: { type: "STRING", description: "Aranacak kelime, kategori veya marka" },
                        maxPrice: { type: "NUMBER", description: "Maksimum fiyat sınırı (TL)" },
                        sortByCheap: { type: "BOOLEAN", description: "True verilirse ucuzdan pahalıya sıralar" }
                    },
                    required: ["query"]
                }
            },
            {
                name: "get_product_details",
                description: "Belirli bir ürünün detaylarını (isim, fiyat, stok durumu, ortalama puan, yorum sayısı vb.) getirir.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        productId: { type: "INTEGER", description: "Detayları istenecek ürünün ID'si" }
                    },
                    required: ["productId"]
                }
            },
            {
                name: "compare_products",
                description: "Belirtilen ürün ID'lerine sahip ürünleri fiyat, puan, stok gibi kriterlerle yan yana karşılaştırır.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        productIds: {
                            type: "ARRAY",
                            items: { type: "INTEGER" },
                            description: "Karşılaştırılacak ürünlerin ID listesi"
                        }
                    },
                    required: ["productIds"]
                }
            },
            {
                name: "get_similar_products",
                description: "Belirtilen ürünün kategorisine ve adına benzer alternatif/benzer ürünleri getirir.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        productId: { type: "INTEGER", description: "Referans ürünün ID'si" }
                    },
                    required: ["productId"]
                }
            },
            {
                name: "add_to_cart",
                description: "Belirtilen ürünü kullanıcının alışveriş sepetine ekleme talebi oluşturur. Bu işlem kullanıcıdan onay isteyecektir.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        productId: { type: "INTEGER", description: "Sepete eklenecek ürünün ID'si" },
                        quantity: { type: "INTEGER", description: "Eklenecek adet" }
                    },
                    required: ["productId"]
                }
            },
            {
                name: "remove_from_cart",
                description: "Belirtilen ürünü sepetten çıkarma talebi oluşturur. Kullanıcıdan onay isteyecektir.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        productId: { type: "INTEGER", description: "Sepetten çıkarılacak ürünün ID'si" }
                    },
                    required: ["productId"]
                }
            },
            {
                name: "get_cart",
                description: "Kullanıcının Android uygulamasındaki yerel sepet bilgisinin uygulama tarafında gösterildiğini belirtir ve sepet sekmesine yönlendirme bilgisi verir.",
                parameters: {
                    type: "OBJECT",
                    properties: {}
                }
            },
            {
                name: "get_order_status",
                description: "Kullanıcının siparişlerinin durumunu, teslimat veya kargo takip bilgilerini getirir. (Giriş yapmış kullanıcılar için).",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        orderId: { type: "INTEGER", description: "Opsiyonel sipariş ID'si" }
                    }
                }
            },
            {
                name: "connect_to_live_support",
                description: "Kullanıcıyı canlı destek ekibine aktarma talebi oluşturur. Kullanıcıdan onay isteyecektir.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        reason: { type: "STRING", description: "Canlı desteğe bağlanma sebebi/özeti" }
                    },
                    required: ["reason"]
                }
            },
            {
                name: "get_shipping_or_return_policy",
                description: "İade politikası, kargo ve teslimat ücretleri, ödeme seçenekleri, gizlilik, KVKK veya aktif kampanyalar/kuponlar hakkında resmi bilgi getirir.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        topic: {
                            type: "STRING",
                            description: "Bilgi istenen konu başlığı (kvkk, privacy, returns, payment, shipping, campaigns)"
                        }
                    },
                    required: ["topic"]
                }
            }
        ]
    }
];

class MockAssistantProvider {
    constructor() {
        this.name = 'mock';
    }

    async runAgent({ userMessage, executeTool }) {
        const text = normalizeAssistantText(userMessage);
        const safeExecuteTool = async (name, args) => {
            if (typeof executeTool !== 'function') return null;
            try {
                return await executeTool(name, args);
            } catch (err) {
                console.warn(`Mock provider tool fallback failed: tool=${name} error=${err.message || err}`);
                return null;
            }
        };

        if (/canli destek|musteri temsilcisi|temsilci|insan destek/.test(text)) {
            const reason = String(userMessage || 'Canlı destek').trim() || 'Canlı destek';
            const toolResult = await safeExecuteTool('connect_to_live_support', { reason });
            return {
                text: 'Seni canlı desteğe aktarabilirim. Onay verirsen konuşma özetini destek ekibine ileteceğim.',
                products: [],
                comparison: null,
                requiresConfirmation: true,
                pendingAction: toolResult?.pendingAction || { type: 'live_support', reason },
                allowEscalation: true
            };
        }

        if (/sepet/.test(text)) {
            const toolResult = await safeExecuteTool('get_cart', {});
            return {
                text: toolResult?.output || 'Sepetini uygulamadaki Sepet sekmesinden kontrol edebilirsin.',
                products: [],
                comparison: null,
                requiresConfirmation: false,
                pendingAction: null,
                allowEscalation: false
            };
        }

        if (/siparis|kargo|teslimat|takip/.test(text)) {
            const orderIdMatch = text.match(/(?:siparis|#)\s*(\d+)/);
            const args = orderIdMatch ? { orderId: Number(orderIdMatch[1]) } : {};
            const toolResult = await safeExecuteTool('get_order_status', args);
            return {
                text: toolResult?.output || 'Sipariş durumunu Hesabım > Siparişlerim ekranından kontrol edebilirsin.',
                products: [],
                comparison: null,
                requiresConfirmation: false,
                pendingAction: null,
                allowEscalation: true
            };
        }

        if (/iade|degisim|iptal|kvkk|gizlilik|odeme|fatura|kampanya|kupon/.test(text)) {
            const topic = /iade|degisim|iptal/.test(text)
                ? 'returns'
                : /odeme|fatura/.test(text)
                    ? 'payment'
                    : /kampanya|kupon/.test(text)
                        ? 'campaigns'
                        : 'privacy';
            const toolResult = await safeExecuteTool('get_shipping_or_return_policy', { topic });
            return {
                text: toolResult?.output || 'Bu konuda Hesabım içindeki yardım ve destek talepleri üzerinden ilerleyebilirsin.',
                products: [],
                comparison: null,
                requiresConfirmation: false,
                pendingAction: null,
                allowEscalation: true
            };
        }

        if (/urun|oner|bul|goster|ara|ucuz|uygun|butce|fiyat|indirim|karsilastir|telefon|hediye/.test(text)) {
            const toolResult = await safeExecuteTool('search_products', {
                query: userMessage,
                sortByCheap: /ucuz|uygun|butce|indirim/.test(text)
            });
            const products = Array.isArray(toolResult?.products) ? toolResult.products : [];
            const intro = products.length
                ? 'Canlı katalogdan uygun seçenekleri buldum. İstersen birini detaylandırabilir, karşılaştırabilir veya sepete ekleme onayı başlatabilirim.'
                : 'Bu aramaya uygun ürün bulamadım. Bütçe, kategori veya marka yazarak tekrar deneyebiliriz.';
            return {
                text: intro,
                products,
                comparison: null,
                requiresConfirmation: false,
                pendingAction: null,
                allowEscalation: true
            };
        }

        return {
            text: 'Gemini tarafında yoğunluk olsa bile NovaBot ayakta. Ürün arama, sipariş, iade, sepet veya canlı destek için buradan devam edebilirim.',
            products: [],
            comparison: null,
            requiresConfirmation: false,
            pendingAction: null,
            allowEscalation: true
        };
    }
}

class OllamaProvider {
    constructor() {
        assertExternalSideEffectAllowed('external_ai');
        this.name = 'ollama';
        this.baseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
        this.model = process.env.OLLAMA_MODEL || DEFAULT_OLLAMA_MODEL;
    }

    async runAgent({ userMessage }) {
        assertExternalSideEffectAllowed('external_ai');
        return {
            text: `Ollama aracılığıyla yanıt (Ajan desteği yok): ${userMessage}`,
            products: [],
            comparison: null,
            requiresConfirmation: false,
            pendingAction: null,
            allowEscalation: false
        };
    }
}

class GeminiProvider {
    constructor() {
        assertExternalSideEffectAllowed('external_ai');
        this.name = 'gemini';
        this.apiKey = process.env.GEMINI_API_KEY;
        this.model = process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;
        this.baseUrl = process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta';
    }

    async runAgent({ systemPrompt, userMessage, history = [], executeTool }) {
        assertExternalSideEffectAllowed('external_ai');
        if (!this.apiKey) {
            throw new AiProviderFallbackError('Gemini API anahtarı bulunamadı.', {
                provider: this.name
            });
        }

        const contents = [];
        for (const item of history) {
            contents.push({
                role: item.role === 'user' ? 'user' : 'model',
                parts: [{ text: item.message }]
            });
        }
        contents.push({
            role: 'user',
            parts: [{ text: userMessage }]
        });

        let loopCount = 0;
        const maxLoops = 5;

        const accumulated = {
            products: [],
            comparison: null,
            requiresConfirmation: false,
            pendingAction: null,
            allowEscalation: false
        };

        while (loopCount < maxLoops) {
            loopCount++;
            const response = await fetch(`${this.baseUrl.replace(/\/$/, '')}/models/${encodeURIComponent(this.model)}:generateContent`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-goog-api-key': this.apiKey
                },
                body: JSON.stringify({
                    systemInstruction: {
                        parts: [{ text: systemPrompt }]
                    },
                    contents,
                    tools: GEMINI_TOOLS,
                    generationConfig: {
                        temperature: 0.45
                    }
                })
            });

            if (!response.ok) {
                const errJson = await safeJson(response);
                console.error("Gemini API Error:", errJson);
                throw new AiProviderFallbackError('Gemini API yanıt veremedi.', {
                    provider: this.name,
                    statusCode: response.status,
                    retryAfterMs: parseRetryAfterMs(response, errJson),
                    payload: errJson
                });
            }

            const payload = await safeJson(response);
            const candidate = payload?.candidates?.[0];
            const modelContent = candidate?.content;
            if (!modelContent) break;

            contents.push(modelContent);

            const parts = modelContent.parts || [];
            const functionCalls = parts.filter(p => p.functionCall);

            if (functionCalls.length === 0) {
                const text = parts.map(p => p.text).filter(Boolean).join('\n').trim();
                return {
                    text,
                    ...accumulated
                };
            }

            const functionResponses = [];
            for (const call of functionCalls) {
                const { name, args } = call.functionCall;
                try {
                    const result = await executeTool(name, args);
                    
                    if (result.products) accumulated.products.push(...result.products);
                    if (result.comparison) accumulated.comparison = result.comparison;
                    if (result.requiresConfirmation) accumulated.requiresConfirmation = true;
                    if (result.pendingAction) accumulated.pendingAction = result.pendingAction;
                    if (result.allowEscalation) accumulated.allowEscalation = true;

                    functionResponses.push({
                        response: { output: result.output || result }
                    });
                } catch (err) {
                    console.error(`Error running Gemini tool ${name}:`, err);
                    functionResponses.push({
                        response: { output: { error: err.message } }
                    });
                }
            }

            contents.push({
                role: 'function',
                parts: functionResponses.map((res, i) => ({
                    functionResponse: {
                        name: functionCalls[i].functionCall.name,
                        response: res.response
                    }
                }))
            });
        }

        const pendingType = accumulated.pendingAction?.type;
        const fallbackText = pendingType === 'live_support'
            ? 'Canlı desteğe geçiş için onayını bekliyorum.'
            : pendingType === 'add_to_cart'
                ? 'Sepete ekleme işlemi için onayını bekliyorum.'
                : 'Gemini şu an tam yanıt üretemedi. İstersen tekrar deneyebilir veya canlı desteğe bağlanabilirsin.';
        return {
            text: fallbackText,
            ...accumulated,
            allowEscalation: accumulated.allowEscalation || !pendingType
        };
    }
}

class OpenAIProvider {
    constructor() {
        assertExternalSideEffectAllowed('external_ai');
        this.name = 'openai';
        this.apiKey = process.env.OPENAI_API_KEY;
        this.model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
        this.baseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
    }

    async runAgent({ systemPrompt, userMessage, history = [], executeTool }) {
        assertExternalSideEffectAllowed('external_ai');
        if (!this.apiKey) {
            throw new AiProviderFallbackError('OpenAI API anahtarı bulunamadı.', {
                provider: this.name
            });
        }

        const openAiMessages = [
            { role: 'system', content: systemPrompt }
        ];
        for (const item of history) {
            openAiMessages.push({
                role: item.role === 'user' ? 'user' : 'assistant',
                content: item.message
            });
        }
        openAiMessages.push({
            role: 'user',
            content: userMessage
        });

        let loopCount = 0;
        const maxLoops = 5;

        const accumulated = {
            products: [],
            comparison: null,
            requiresConfirmation: false,
            pendingAction: null,
            allowEscalation: false
        };

        while (loopCount < maxLoops) {
            loopCount++;
            const response = await fetch(`${this.baseUrl.replace(/\/$/, '')}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`
                },
                body: JSON.stringify({
                    model: this.model,
                    messages: openAiMessages,
                    tools: OPENAI_TOOLS,
                    temperature: 0.45
                })
            });

            if (!response.ok) {
                const errJson = await safeJson(response);
                console.error("OpenAI API Error:", errJson);
                throw new AiProviderFallbackError('OpenAI API yanıt veremedi.', {
                    provider: this.name,
                    statusCode: response.status,
                    retryAfterMs: parseRetryAfterMs(response, errJson),
                    payload: errJson
                });
            }

            const payload = await safeJson(response);
            const choice = payload?.choices?.[0];
            const message = choice?.message;
            if (!message) break;

            openAiMessages.push(message);

            if (!message.tool_calls || message.tool_calls.length === 0) {
                return {
                    text: message.content ? message.content.trim() : "",
                    ...accumulated
                };
            }

            for (const toolCall of message.tool_calls) {
                const name = toolCall.function.name;
                const args = parseToolArguments(toolCall.function.arguments, {
                    provider: this.name,
                    toolName: name
                });
                try {
                    const result = await executeTool(name, args);
                    
                    if (result.products) accumulated.products.push(...result.products);
                    if (result.comparison) accumulated.comparison = result.comparison;
                    if (result.requiresConfirmation) accumulated.requiresConfirmation = true;
                    if (result.pendingAction) accumulated.pendingAction = result.pendingAction;
                    if (result.allowEscalation) accumulated.allowEscalation = true;

                    openAiMessages.push({
                        role: 'tool',
                        tool_call_id: toolCall.id,
                        name: name,
                        content: JSON.stringify(result.output || result)
                    });
                } catch (err) {
                    console.error(`Error running OpenAI tool ${name}:`, err);
                    openAiMessages.push({
                        role: 'tool',
                        tool_call_id: toolCall.id,
                        name: name,
                        content: JSON.stringify({ error: err.message })
                    });
                }
            }
        }

        const pendingType = accumulated.pendingAction?.type;
        const fallbackText = pendingType === 'live_support'
            ? 'Canlı desteğe geçiş için onayını bekliyorum.'
            : pendingType === 'add_to_cart'
                ? 'Sepete ekleme işlemi için onayını bekliyorum.'
                : 'Asistan şu an tam yanıt üretemedi. İstersen tekrar deneyebilir veya canlı desteğe bağlanabilirsin.';
        return {
            text: fallbackText,
            ...accumulated,
            allowEscalation: accumulated.allowEscalation || !pendingType
        };
    }
}

const createSingleAiProvider = (provider) => {
    if (provider === 'ollama') return new OllamaProvider();
    if (provider === 'gemini') return new GeminiProvider();
    if (provider === 'openai') return new OpenAIProvider();
    return new MockAssistantProvider();
};

class FallbackAiProvider {
    constructor({ primaryProvider, fallbackProviders, fallbackEnabled }) {
        this.name = primaryProvider;
        this.providers = [primaryProvider]
            .concat(fallbackEnabled ? fallbackProviders : [])
            .filter((provider, index, list) => FALLBACK_PROVIDER_NAMES.has(provider) && list.indexOf(provider) === index)
            .map(createSingleAiProvider);

        if (!this.providers.length) {
            this.providers = [new MockAssistantProvider()];
        }
    }

    async runAgent(args) {
        let lastError = null;

        for (const provider of this.providers) {
            try {
                const result = await provider.runAgent(args);
                if (provider.name !== this.name) {
                    console.warn(`AI provider fallback active: ${this.name} -> ${provider.name}`);
                }
                return result;
            } catch (err) {
                if (err instanceof ExternalSideEffectBlockedError) throw err;
                lastError = err;
                if (!(err instanceof AiProviderFallbackError)) {
                    console.warn(`AI provider fallback requested: provider=${provider.name} error=${err.message || err}`);
                    continue;
                }

                const status = err.statusCode ? ` status=${err.statusCode}` : '';
                const providerStatus = getPayloadStatus(err.payload);
                const errorStatus = providerStatus ? ` providerStatus=${providerStatus}` : '';
                const retry = err.retryAfterMs ? ` retryAfterMs=${err.retryAfterMs}` : '';
                console.warn(`AI provider fallback requested: provider=${provider.name}${status}${errorStatus}${retry}`);
            }
        }

        console.warn('AI provider fallback exhausted:', lastError?.message || lastError);
        return buildProviderUnavailableResult(this.name);
    }
}

const createAiProvider = () => new FallbackAiProvider(getAiProviderConfig());

module.exports = {
    AiProviderFallbackError,
    FallbackAiProvider,
    GeminiProvider,
    MockAssistantProvider,
    OllamaProvider,
    OpenAIProvider,
    createAiProvider,
    parseToolArguments
};
