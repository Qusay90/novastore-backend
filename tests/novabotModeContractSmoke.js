'use strict';

process.env.NODE_ENV = 'test';
process.env.NOVASTORE_SAFE_LOCAL_BACKEND = 'true';
process.env.NOVASTORE_ALLOW_REMOTE_DB = 'false';
process.env.SKIP_SCHEMA_INIT = 'true';
process.env.NOVASTORE_ALLOW_SCHEMA_INIT = 'false';
process.env.DATABASE_URL = 'postgresql://novastore_test:novastore_test_only@127.0.0.1:55432/novastore_novabot_modes_test';
process.env.DB_HOST = '127.0.0.1';
process.env.DB_PORT = '55432';
process.env.DB_NAME = 'novastore_novabot_modes_test';
process.env.DB_USER = 'novastore_test';
process.env.DB_PASSWORD = 'novastore_test_only';
process.env.DB_SSL = 'false';
process.env.JWT_SECRET = 'novabot-mode-contract-smoke-secret';
process.env.AI_PROVIDER = 'mock';
process.env.AI_PROVIDER_FALLBACK_ENABLED = 'false';
delete process.env.GEMINI_API_KEY;
delete process.env.OPENAI_API_KEY;

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const {
    NOVABOT_MODE_REGISTRY,
    buildNovabotSystemPrompt,
    requireNovabotModeId
} = require('../services/novabotModeRegistry');
const {
    assertNovabotModeAvailable,
    resolveNovabotCapability
} = require('../services/novabotCapabilityService');
const { handleAssistantChat } = require('../services/assistantOrchestrator');
const { capability, chat, normalizeAssistantResponse } = require('../controllers/assistantController');
const { simpleRateLimit } = require('../middlewares/securityMiddleware');

const EXPECTED_MODE_IDS = Object.freeze([
    'professional',
    'friendly',
    'buddy',
    'funny',
    'witty',
    'quick',
    'detailed',
    'technical',
    'sales'
]);

const providerResult = (text) => ({
    text,
    products: [],
    comparison: null,
    requiresConfirmation: false,
    pendingAction: null,
    allowEscalation: false
});

const makeResponse = () => ({
    statusCode: 200,
    body: null,
    headers: {},
    status(code) {
        this.statusCode = code;
        return this;
    },
    setHeader(name, value) {
        this.headers[name] = value;
    },
    json(body) {
        this.body = body;
        return body;
    }
});

const run = async () => {
    const modes = Object.values(NOVABOT_MODE_REGISTRY);
    assert.deepEqual(Object.keys(NOVABOT_MODE_REGISTRY), EXPECTED_MODE_IDS);
    assert.equal(new Set(modes.map((mode) => mode.profileId)).size, EXPECTED_MODE_IDS.length);
    assert.equal(new Set(modes.map((mode) => mode.modelPolicyId)).size, EXPECTED_MODE_IDS.length);
    assert.equal(new Set(modes.map((mode) => mode.toolPolicyId)).size, 1);
    assert.equal(new Set(modes.map((mode) => mode.safetyPolicyId)).size, 1);
    assert.equal(new Set(EXPECTED_MODE_IDS.map((modeId) => (
        crypto.createHash('sha256').update(buildNovabotSystemPrompt(modeId)).digest('hex')
    ))).size, EXPECTED_MODE_IDS.length, 'her kanonik mod farklı sunucu profili üretmeli');
    assert.throws(() => requireNovabotModeId('unknown-mode'), { code: 'NOVABOT_MODE_UNSUPPORTED' });
    assert.throws(() => requireNovabotModeId(' technical '), { code: 'NOVABOT_MODE_INVALID' });

    const providerAbsent = resolveNovabotCapability({ env: {
        AI_PROVIDER: 'mock',
        AI_PROVIDER_FALLBACK_ENABLED: 'false'
    } });
    assert.equal(providerAbsent.available, true, 'deterministik temel sohbet kullanılabilir kalmalı');
    assert.deepEqual(providerAbsent.provider, { configured: false, ready: false });
    assert.equal(providerAbsent.modeSelectionAvailable, false);
    assert.deepEqual(providerAbsent.modes.map((mode) => mode.id), ['friendly']);
    assert.equal(providerAbsent.unavailableReason, 'ADVANCED_PROVIDER_NOT_SELECTED');

    const fakeSecret = 'unit-test-secret-never-returned';
    const fakePrivateModel = 'private-model-never-returned';
    const providerReady = resolveNovabotCapability({ env: {
        AI_PROVIDER: 'gemini',
        AI_PROVIDER_FALLBACK_ENABLED: 'true',
        AI_PROVIDER_FALLBACKS: 'mock',
        GEMINI_API_KEY: fakeSecret,
        GEMINI_MODEL: fakePrivateModel
    } });
    assert.deepEqual(providerReady.provider, { configured: true, ready: true });
    assert.equal(providerReady.modeSelectionAvailable, true);
    assert.deepEqual(providerReady.modes.map((mode) => mode.id), EXPECTED_MODE_IDS);
    assert.doesNotMatch(JSON.stringify(providerReady), new RegExp(`${fakeSecret}|${fakePrivateModel}`));

    const providerMissingKey = resolveNovabotCapability({ env: {
        AI_PROVIDER: 'gemini',
        AI_PROVIDER_FALLBACK_ENABLED: 'false'
    } });
    assert.deepEqual(providerMissingKey.provider, { configured: false, ready: false });
    assert.deepEqual(providerMissingKey.modes.map((mode) => mode.id), ['friendly']);
    assert.equal(providerMissingKey.unavailableReason, 'ADVANCED_PROVIDER_NOT_CONFIGURED');

    const safeFallbackReady = resolveNovabotCapability({ env: {
        AI_PROVIDER: 'gemini',
        AI_PROVIDER_FALLBACK_ENABLED: 'true',
        AI_PROVIDER_FALLBACKS: 'openai,mock',
        OPENAI_API_KEY: fakeSecret
    } });
    assert.equal(safeFallbackReady.provider.ready, true, 'mode-capable fallback zinciri keşfedilmeli');

    const mockPrimaryMustNotEscalateSpend = resolveNovabotCapability({ env: {
        AI_PROVIDER: 'mock',
        AI_PROVIDER_FALLBACK_ENABLED: 'true',
        AI_PROVIDER_FALLBACKS: 'gemini',
        GEMINI_API_KEY: fakeSecret
    } });
    assert.equal(mockPrimaryMustNotEscalateSpend.provider.ready, false, 'mock primary dış sağlayıcı harcamasını açmamalı');
    assert.deepEqual(mockPrimaryMustNotEscalateSpend.modes.map((mode) => mode.id), ['friendly']);

    assert.equal(assertNovabotModeAvailable('friendly', providerAbsent), 'friendly');
    assert.throws(
        () => assertNovabotModeAvailable('technical', providerAbsent),
        { code: 'NOVABOT_MODE_PROVIDER_UNAVAILABLE', statusCode: 503 }
    );

    const seenProfiles = [];
    const modeProvider = {
        name: 'configured-test-double',
        supportsConversationModes: true,
        async runAgent(request) {
            const fingerprint = crypto.createHash('sha256').update(request.systemPrompt).digest('hex').slice(0, 12);
            seenProfiles.push({
                fingerprint,
                generationConfig: request.generationConfig,
                toolNames: request.allowedToolNames,
                history: request.history
            });
            return providerResult(`TEST_PROFILE_${fingerprint}`);
        }
    };

    const replies = [];
    for (const modeId of EXPECTED_MODE_IDS) {
        const response = await handleAssistantChat({
            message: 'Bugün bana nasıl yardımcı olabilirsin?',
            history: [{ role: 'user', message: `yalnız-${modeId}` }],
            modeId,
            user: { id: 41, principal: 'customer' },
            provider: modeProvider,
            providerCapability: providerReady
        });
        assert.equal(response.modeId, modeId);
        assert.equal(response.mode, modeId);
        assert.equal(response.availableModes.length, EXPECTED_MODE_IDS.length);
        replies.push(response.reply);
    }
    assert.equal(new Set(seenProfiles.map((item) => item.fingerprint)).size, EXPECTED_MODE_IDS.length);
    assert.equal(new Set(replies).size, EXPECTED_MODE_IDS.length);
    assert.equal(seenProfiles.every((item) => item.toolNames.length === 10), true);

    const isolationCalls = [];
    const isolationProvider = {
        name: 'isolation-test-double',
        supportsConversationModes: true,
        async runAgent(request) {
            isolationCalls.push({
                history: request.history.map((item) => item.message)
            });
            return providerResult(`history:${request.history.map((item) => item.message).join('|')}`);
        }
    };
    const customerA = await handleAssistantChat({
        message: 'A oturumu',
        history: [{ role: 'user', message: 'A-PRIVATE' }],
        modeId: 'friendly',
        user: { id: 41, principal: 'customer' },
        provider: isolationProvider,
        providerCapability: providerReady
    });
    const customerB = await handleAssistantChat({
        message: 'B oturumu',
        history: [{ role: 'user', message: 'B-PRIVATE' }],
        modeId: 'friendly',
        user: { id: 42, principal: 'customer' },
        provider: isolationProvider,
        providerCapability: providerReady
    });
    const guest = await handleAssistantChat({
        message: 'Misafir oturumu',
        history: [],
        modeId: 'friendly',
        user: null,
        provider: isolationProvider,
        providerCapability: providerReady
    });
    assert.match(customerA.reply, /history:A-PRIVATE/);
    assert.doesNotMatch(customerA.reply, /B-PRIVATE/);
    assert.match(customerB.reply, /history:B-PRIVATE/);
    assert.doesNotMatch(customerB.reply, /A-PRIVATE/);
    assert.equal(guest.reply, 'history:');
    assert.deepEqual(isolationCalls.map((item) => item.history), [['A-PRIVATE'], ['B-PRIVATE'], []]);

    const safeResponse = normalizeAssistantResponse({
        reply: 'Güvenli yanıt',
        modeId: 'friendly',
        providerSecret: fakeSecret,
        rawSystemPrompt: 'INTERNAL_PROMPT_SENTINEL',
        providerModel: fakePrivateModel,
        tools: ['arbitrary_tool']
    });
    assert.doesNotMatch(JSON.stringify(safeResponse), /unit-test-secret|INTERNAL_PROMPT_SENTINEL|private-model|arbitrary_tool/);

    const capabilityResponse = makeResponse();
    capability({}, capabilityResponse);
    assert.equal(capabilityResponse.statusCode, 200);
    assert.deepEqual(capabilityResponse.body.provider, { configured: false, ready: false });

    const unsupportedResponse = makeResponse();
    await chat({
        body: { message: 'Test', modeId: 'unknown-mode' },
        headers: {},
        method: 'POST',
        originalUrl: '/api/assistant/chat',
        path: '/chat'
    }, unsupportedResponse);
    assert.equal(unsupportedResponse.statusCode, 400);
    assert.equal(unsupportedResponse.body.code, 'NOVABOT_MODE_UNSUPPORTED');

    const unavailableResponse = makeResponse();
    await chat({
        body: { message: 'Test', modeId: 'technical' },
        headers: {},
        method: 'POST',
        originalUrl: '/api/assistant/chat',
        path: '/chat'
    }, unavailableResponse);
    assert.equal(unavailableResponse.statusCode, 503);
    assert.equal(unavailableResponse.body.code, 'NOVABOT_MODE_PROVIDER_UNAVAILABLE');
    assert.doesNotMatch(JSON.stringify(unavailableResponse.body), /GEMINI|OPENAI|API_KEY|model/i);

    const limiter = simpleRateLimit({ windowMs: 5 * 60 * 1000, max: 2, code: 'NOVABOT_RATE_LIMITED' });
    const request = { ip: `novabot-mode-contract-${Date.now()}`, path: '/chat' };
    let nextCount = 0;
    limiter({ ...request, body: { modeId: 'friendly' } }, makeResponse(), () => { nextCount += 1; });
    limiter({ ...request, body: { modeId: 'technical' } }, makeResponse(), () => { nextCount += 1; });
    const blocked = makeResponse();
    limiter({ ...request, body: { modeId: 'sales' } }, blocked, () => { nextCount += 1; });
    assert.equal(nextCount, 2, 'modeId değişimi ortak sohbet limitini aşamamalı');
    assert.equal(blocked.statusCode, 429);
    assert.deepEqual(blocked.body, {
        code: 'NOVABOT_RATE_LIMITED',
        error: 'Çok fazla istek gönderildi. Lütfen kısa süre sonra tekrar deneyin.'
    });
    assert.match(blocked.headers['Retry-After'], /^\d+$/);

    const publicClientSources = [
        'storefront-commerce-pro/src/AssistantWidget.jsx',
        'storefront-commerce-pro/src/adapters/assistantAdapter.js',
        'app/src/main/java/com/novastore/app/data/model/AssistantModels.kt',
        'app/src/main/java/com/novastore/app/core/network/NovaStoreApi.kt'
    ].map((file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8')).join('\n');
    assert.doesNotMatch(publicClientSources, /GEMINI_API_KEY|OPENAI_API_KEY|rawSystemPrompt|profileInstruction/);

    const providerSource = fs.readFileSync(path.join(__dirname, '..', 'services', 'aiProviderService.js'), 'utf8');
    assert.doesNotMatch(providerSource, /console\.(?:log|warn|error)\([^\n]*(?:apiKey|GEMINI_API_KEY|OPENAI_API_KEY)/i);
    assert.doesNotMatch(providerSource, /Gemini API Error|OpenAI API Error/);

    console.log('novabot mode contract smoke PASS: 9 server-owned modes, truthful fallback, isolated requests, safe capability');
};

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
