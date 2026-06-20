const assert = require('node:assert/strict');

const { handleAssistantChat } = require('../services/assistantOrchestrator');
const { OpenAIProvider, parseToolArguments } = require('../services/aiProviderService');
const { normalizeAssistantResponse } = require('../controllers/assistantController');

const createJsonResponse = (payload, { ok = true, status = 200, retryAfter = null } = {}) => ({
    ok,
    status,
    headers: {
        get: (name) => (String(name).toLowerCase() === 'retry-after' ? retryAfter : null)
    },
    json: async () => payload
});

const withFetch = async (handler, run) => {
    const originalFetch = global.fetch;
    global.fetch = handler;
    try {
        await run();
    } finally {
        global.fetch = originalFetch;
    }
};

const withEnv = async (updates, run) => {
    const previous = {};
    for (const key of Object.keys(updates)) {
        previous[key] = process.env[key];
        process.env[key] = updates[key];
    }

    try {
        await run();
    } finally {
        for (const key of Object.keys(updates)) {
            if (previous[key] === undefined) {
                delete process.env[key];
            } else {
                process.env[key] = previous[key];
            }
        }
    }
};

const runGemini429ToMockFallbackSmoke = async () => {
    await withEnv({
        AI_PROVIDER: 'gemini',
        AI_PROVIDER_FALLBACK_ENABLED: 'true',
        AI_PROVIDER_FALLBACKS: 'mock',
        GEMINI_API_KEY: 'smoke-test-key'
    }, async () => {
        await withFetch(async () => createJsonResponse({
            error: {
                code: 429,
                message: 'RESOURCE_EXHAUSTED_retry_12s',
                status: 'RESOURCE_EXHAUSTED',
                details: []
            }
        }, { ok: false, status: 429, retryAfter: '12' }), async () => {
            const response = normalizeAssistantResponse(await handleAssistantChat({
                message: 'nasılsın',
                history: [],
                context: { selectedMode: 'friendly' }
            }));

            assert.equal(response.requiresConfirmation, false);
            assert.equal(Array.isArray(response.products), true);
            assert.equal(Array.isArray(response.cards), true);
            assert.equal(response.comparison, null);
            assert.equal(response.pendingAction, null);
            assert.match(response.reply, /NovaBot|yardımcı|devam/i);
        });
    });
};

const runMalformedToolArgumentsSmoke = async () => {
    const repaired = parseToolArguments("{query:'telefon', sortByCheap:true,}", {
        provider: 'openai',
        toolName: 'search_products'
    });
    assert.deepEqual(repaired, { query: 'telefon', sortByCheap: true });

    await withEnv({
        OPENAI_API_KEY: 'smoke-test-key'
    }, async () => {
        let fetchCount = 0;
        let seenArgs = null;

        await withFetch(async () => {
            fetchCount += 1;
            if (fetchCount === 1) {
                return createJsonResponse({
                    choices: [{
                        message: {
                            role: 'assistant',
                            content: null,
                            tool_calls: [{
                                id: 'call_smoke_1',
                                type: 'function',
                                function: {
                                    name: 'search_products',
                                    arguments: "{query:'telefon', sortByCheap:true,}"
                                }
                            }]
                        }
                    }]
                });
            }

            return createJsonResponse({
                choices: [{
                    message: {
                        role: 'assistant',
                        content: 'Canlı katalogdan seçenekleri hazırladım.'
                    }
                }]
            });
        }, async () => {
            const provider = new OpenAIProvider();
            const result = await provider.runAgent({
                systemPrompt: 'NovaBot smoke test',
                userMessage: 'telefon öner',
                history: [],
                executeTool: async (_name, args) => {
                    seenArgs = args;
                    return {
                        products: [{ id: 1, name: 'Smoke Telefon', price: 1000, stock: 5 }],
                        output: 'Smoke Telefon - 1000 TL'
                    };
                }
            });

            assert.deepEqual(seenArgs, { query: 'telefon', sortByCheap: true });
            assert.equal(result.products.length, 1);
            assert.match(result.text, /seçenekleri/i);
        });
    });
};

(async () => {
    await runGemini429ToMockFallbackSmoke();
    await runMalformedToolArgumentsSmoke();
    console.log('novabot fallback smoke passed');
})().catch((err) => {
    console.error(err);
    process.exitCode = 1;
});
