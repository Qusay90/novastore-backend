const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const originalLoad = Module._load;

const rootDir = path.join(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(rootDir, relativePath), 'utf8');

const PROVIDER_KEYS = [
    'PAYTR_MERCHANT_ID',
    'PAYTR_MERCHANT_KEY',
    'PAYTR_MERCHANT_SALT',
    'IYZICO_WEBHOOK_SECRET',
    'RESEND_API_KEY',
    'NETGSM_USERCODE',
    'NETGSM_PASSWORD',
    'NETGSM_MSGHEADER',
    'CLOUDINARY_CLOUD_NAME',
    'CLOUDINARY_API_KEY',
    'CLOUDINARY_API_SECRET',
    'GEMINI_API_KEY',
    'OPENAI_API_KEY'
];

for (const key of PROVIDER_KEYS) delete process.env[key];

const syntheticStagingEnv = (overrides = {}) => ({
    NOVASTORE_DEPLOY_ENV: 'staging',
    NOVASTORE_STAGING_ACCESS_GATE_ENABLED: 'true',
    NOVASTORE_STAGING_ACCESS_USERNAME: 'synthetic-p4d1b-user',
    NOVASTORE_STAGING_ACCESS_PASSWORD_HASH: `$2b$12$${'A'.repeat(53)}`,
    NOVASTORE_STAGING_ACCESS_SESSION_SECRET: 'synthetic-p4d1b-session-secret-for-tests-only',
    NOVASTORE_STAGING_EXTERNAL_SIDE_EFFECTS_DISABLED: 'true',
    NOVASTORE_ADMIN_CATALOG_PRODUCT_WRITE_ENABLED: 'false',
    NOVASTORE_ADMIN_CATALOG_STRUCTURE_WRITE_ENABLED: 'false',
    NOVASTORE_ADMIN_CANCEL_WRITE_ENABLED: 'false',
    NOVASTORE_MANUAL_FULFILLMENT_WRITE_ENABLED: 'false',
    AI_PROVIDER: 'mock',
    AI_PROVIDER_FALLBACK_ENABLED: 'false',
    SKIP_SCHEMA_INIT: 'true',
    NOVASTORE_ALLOW_SCHEMA_INIT: 'false',
    ...overrides
});

Object.assign(process.env, syntheticStagingEnv({
    NODE_ENV: 'test',
    DATABASE_URL: 'postgresql://novastore_test:novastore_test_only@127.0.0.1:55432/novastore_p4d1b_test',
    DB_HOST: '127.0.0.1',
    DB_PORT: '55432',
    DB_NAME: 'novastore_p4d1b_test',
    DB_USER: 'novastore_test',
    DB_PASSWORD: 'novastore_test_only',
    DB_SSL: 'false',
    NOVASTORE_ALLOW_REMOTE_DB: 'false'
}));

const {
    ADMIN_WRITE_ENV_KEYS,
    EXTERNAL_SIDE_EFFECT_KINDS,
    ExternalSideEffectBlockedError,
    assertExternalSideEffectAllowed,
    resolveStagingRuntimePolicy
} = require('../config/stagingRuntimePolicy');

const counts = { sideEffect: 0, runtime: 0 };

const check = async (section, name, fn) => {
    try {
        await fn();
        counts[section] += 1;
    } catch (error) {
        error.message = `${name}: ${error.message}`;
        throw error;
    }
};

const responseRecorder = () => {
    const state = { statusCode: null, payload: null };
    return {
        state,
        response: {
            status(code) {
                state.statusCode = code;
                return this;
            },
            json(payload) {
                state.payload = payload;
                return this;
            }
        }
    };
};

const expectBlocked = (effect, env = syntheticStagingEnv()) => {
    assert.throws(
        () => assertExternalSideEffectAllowed(effect, env),
        (error) => error instanceof ExternalSideEffectBlockedError && error.effect === effect
    );
};

(async () => {
    await check('sideEffect', '21 kill-switch missing or false rejects startup', () => {
        const missing = syntheticStagingEnv();
        delete missing.NOVASTORE_STAGING_EXTERNAL_SIDE_EFFECTS_DISABLED;
        assert.equal(resolveStagingRuntimePolicy(missing).canStart, false);
        assert.equal(resolveStagingRuntimePolicy(syntheticStagingEnv({
            NOVASTORE_STAGING_EXTERNAL_SIDE_EFFECTS_DISABLED: 'false'
        })).canStart, false);
    });

    await check('sideEffect', '22 exact true kill-switch permits safe startup policy', () => {
        const policy = resolveStagingRuntimePolicy(syntheticStagingEnv());
        assert.equal(policy.canStart, true);
        assert.equal(policy.externalSideEffectsDisabled, true);
    });

    let paymentProviderCalls = 0;
    let paymentDatabaseCalls = 0;
    const pool = require('../config/db');
    const originalPoolConnect = pool.connect;
    pool.connect = async () => {
        paymentDatabaseCalls += 1;
        throw new Error('staging payment guard reached the database');
    };

    const paymentProviderService = require('../services/paymentProviderService');
    const paytrPaymentService = require('../services/paytrPaymentService');
    const originalIyzicoInitialize = paymentProviderService.initializeIyzicoPayment;
    const originalPaytrPayload = paytrPaymentService.buildPaytrTokenPayload;
    const originalPaytrMock = paytrPaymentService.buildMockPaytrTokenResponse;
    paymentProviderService.initializeIyzicoPayment = async () => {
        paymentProviderCalls += 1;
        return {};
    };
    paytrPaymentService.buildPaytrTokenPayload = () => {
        paymentProviderCalls += 1;
        return {};
    };
    paytrPaymentService.buildMockPaytrTokenResponse = () => {
        paymentProviderCalls += 1;
        return {};
    };
    delete require.cache[require.resolve('../controllers/paymentController')];
    const paymentController = require('../controllers/paymentController');

    const initializeResult = responseRecorder();
    await paymentController.initializePayment({ body: {}, headers: {} }, initializeResult.response);

    await check('sideEffect', '23 payment initialize provider call count is zero', () => {
        assert.equal(initializeResult.state.statusCode, 503);
        assert.equal(paymentProviderCalls, 0);
    });

    await check('sideEffect', '24 payment initialize mutation count is zero', () => {
        assert.equal(paymentDatabaseCalls, 0);
    });

    await check('sideEffect', '25 capture and refund boundaries are blocked', async () => {
        const paytrResult = responseRecorder();
        const iyzicoResult = responseRecorder();
        await paymentController.webhookPaytr({ body: {}, headers: {} }, paytrResult.response);
        await paymentController.webhookIyzico({ body: {}, headers: {} }, iyzicoResult.response);
        assert.equal(paytrResult.state.statusCode, 503);
        assert.equal(iyzicoResult.state.statusCode, 503);
        assert.equal(paymentDatabaseCalls, 0);
        expectBlocked('payment_refund');
    });

    pool.connect = originalPoolConnect;
    paymentProviderService.initializeIyzicoPayment = originalIyzicoInitialize;
    paytrPaymentService.buildPaytrTokenPayload = originalPaytrPayload;
    paytrPaymentService.buildMockPaytrTokenResponse = originalPaytrMock;

    let resendConstructions = 0;
    let emailDatabaseCalls = 0;
    const originalPoolQuery = pool.query;
    pool.query = async () => {
        emailDatabaseCalls += 1;
        throw new Error('staging email guard reached the database');
    };

    Module._load = function patchedLoad(request, parent, isMain) {
        if (request === 'resend') {
            return {
                Resend: class SyntheticResend {
                    constructor() {
                        resendConstructions += 1;
                    }
                }
            };
        }
        return originalLoad.call(this, request, parent, isMain);
    };
    delete require.cache[require.resolve('../controllers/authController')];
    const authController = require('../controllers/authController');
    Module._load = originalLoad;

    await check('sideEffect', '26 email reset is blocked before token, database, and provider mutation', async () => {
        const result = responseRecorder();
        await authController.forgotPassword({ body: { email: 'synthetic@example.test' } }, result.response);
        assert.equal(result.state.statusCode, 503);
        assert.equal(emailDatabaseCalls, 0);
        assert.equal(resendConstructions, 0);
    });
    pool.query = originalPoolQuery;

    await check('sideEffect', '27 sms, push, and outbound notification effects are blocked before mutation', async () => {
        expectBlocked('sms_or_push');
        expectBlocked('outbound_notification');

        let messageDatabaseCalls = 0;
        const originalMessageConnect = pool.connect;
        const originalMessageQuery = pool.query;
        pool.connect = async () => {
            messageDatabaseCalls += 1;
            throw new Error('staging message guard reached the database');
        };
        pool.query = async () => {
            messageDatabaseCalls += 1;
            throw new Error('staging escalation guard reached the database');
        };

        delete require.cache[require.resolve('../controllers/messageController')];
        delete require.cache[require.resolve('../services/escalationService')];
        const messageController = require('../controllers/messageController');
        const { createEscalationMessage } = require('../services/escalationService');
        const result = responseRecorder();

        await messageController.sendMessage({
            body: { message: 'synthetic staging message' },
            user: { id: 42, role: 'customer' }
        }, result.response);

        assert.equal(result.state.statusCode, 503);
        assert.equal(result.state.payload.code, 'STAGING_EXTERNAL_SIDE_EFFECT_DISABLED');
        await assert.rejects(
            createEscalationMessage({ userId: 42, summary: 'synthetic staging handoff' }),
            ExternalSideEffectBlockedError
        );
        const { createNotification } = require('../controllers/notificationController');
        await assert.rejects(
            createNotification(null, 'synthetic', 'synthetic staging notification'),
            ExternalSideEffectBlockedError
        );

        Module._load = function patchedNotificationServerLoad(request, parent, isMain) {
            if (
                request === '../server' &&
                String(parent?.filename || '').endsWith('controllers\\notificationController.js')
            ) {
                return { io: null };
            }
            return originalLoad.call(this, request, parent, isMain);
        };
        delete require.cache[require.resolve('../controllers/notificationController')];
        const notificationController = require('../controllers/notificationController');
        const notificationResult = responseRecorder();
        try {
            await notificationController.sendTestNotification(
                { body: { type: 'synthetic', message: 'synthetic staging notification' } },
                notificationResult.response
            );
        } finally {
            Module._load = originalLoad;
        }
        assert.equal(notificationResult.state.statusCode, 503);
        assert.equal(notificationResult.state.payload.code, 'STAGING_EXTERNAL_SIDE_EFFECT_DISABLED');
        assert.equal(messageDatabaseCalls, 0);

        Module._load = function patchedAssistantAuthLoad(request, parent, isMain) {
            if (
                request === '../middlewares/authMiddleware' &&
                String(parent?.filename || '').endsWith('controllers\\assistantController.js')
            ) {
                return {
                    getUserFromRequestIfAny: async () => ({ id: 42, role: 'customer' }),
                    sendAuthError: () => { throw new Error('side-effect block reached auth error handler'); }
                };
            }
            return originalLoad.call(this, request, parent, isMain);
        };
        delete require.cache[require.resolve('../controllers/assistantController')];
        const assistantController = require('../controllers/assistantController');
        Module._load = originalLoad;
        const escalationResult = responseRecorder();
        await assistantController.escalate(
            { body: { summary: 'synthetic staging handoff' } },
            escalationResult.response
        );
        assert.equal(escalationResult.state.statusCode, 503);
        assert.equal(escalationResult.state.payload.code, 'STAGING_EXTERNAL_SIDE_EFFECT_DISABLED');

        pool.connect = originalMessageConnect;
        pool.query = originalMessageQuery;

        const assistantSource = read('controllers/assistantController.js');
        const assistantGuard = assistantSource.indexOf("assertExternalSideEffectAllowed('outbound_notification')");
        const assistantMutation = assistantSource.indexOf('createEscalationMessage({');
        assert.ok(assistantGuard >= 0 && assistantGuard < assistantMutation);

        const serverSource = read('server.js');
        const socketHandler = serverSource.indexOf("socket.on('send_message'");
        const socketGuard = serverSource.indexOf(
            "assertExternalSideEffectAllowed('outbound_notification')",
            socketHandler
        );
        const socketDispatch = serverSource.indexOf("emit('receive_message'", socketHandler);
        assert.ok(socketHandler >= 0 && socketGuard > socketHandler && socketGuard < socketDispatch);
    });

    await check('sideEffect', '28 webhook, outbox, and retry dispatch cannot bypass policy', async () => {
        expectBlocked('outbound_webhook');
        const notificationService = require('../services/notificationService');
        let emitCalls = 0;
        await assert.rejects(
            notificationService.emitWithRetry({
                io: { to: () => ({ emit: () => { emitCalls += 1; } }) },
                room: 'synthetic-room',
                eventName: 'synthetic-event',
                payload: {}
            }),
            ExternalSideEffectBlockedError
        );
        assert.equal(emitCalls, 0);
    });

    await check('sideEffect', '29 cloudinary SDK, upload, delete, and signing stay unused', async () => {
        let cloudinaryLoads = 0;
        Module._load = function patchedCloudinaryLoad(request, parent, isMain) {
            if (request === 'cloudinary') {
                cloudinaryLoads += 1;
                throw new Error('cloudinary SDK must not load in staging');
            }
            return originalLoad.call(this, request, parent, isMain);
        };
        delete require.cache[require.resolve('../config/cloudinary')];
        const cloudinaryConfig = require('../config/cloudinary');
        await assert.rejects(
            cloudinaryConfig.uploadReviewMediaFiles([{ buffer: Buffer.from('synthetic'), mimetype: 'image/png' }]),
            ExternalSideEffectBlockedError
        );
        await assert.rejects(
            cloudinaryConfig.cleanupCloudinaryAssets([{ public_id: 'synthetic-id' }]),
            ExternalSideEffectBlockedError
        );
        assert.throws(
            () => cloudinaryConfig.cloudinary.url('synthetic-id'),
            ExternalSideEffectBlockedError
        );
        assert.throws(
            () => cloudinaryConfig.cloudinary.uploader.explicit('synthetic-id', { type: 'upload' }),
            ExternalSideEffectBlockedError
        );
        Module._load = originalLoad;
        assert.equal(cloudinaryLoads, 0);
    });

    await check('sideEffect', '30 external AI construction and call count is zero', () => {
        let fetchCalls = 0;
        const originalFetch = global.fetch;
        global.fetch = async () => {
            fetchCalls += 1;
            throw new Error('external AI network call attempted');
        };
        const { GeminiProvider, OpenAIProvider, OllamaProvider } = require('../services/aiProviderService');
        assert.throws(() => new GeminiProvider(), ExternalSideEffectBlockedError);
        assert.throws(() => new OpenAIProvider(), ExternalSideEffectBlockedError);
        assert.throws(() => new OllamaProvider(), ExternalSideEffectBlockedError);
        global.fetch = originalFetch;
        assert.equal(fetchCalls, 0);
    });

    await check('sideEffect', '31 mock failure cannot fall back to an external AI provider', async () => {
        const { createAiProvider } = require('../services/aiProviderService');
        const provider = createAiProvider();
        assert.equal(provider.providers.length, 1);
        assert.equal(provider.providers[0].name, 'mock');
        provider.providers[0].runAgent = async () => {
            throw new Error('synthetic mock failure');
        };
        const result = await provider.runAgent({});
        assert.equal(provider.providers.length, 1);
        assert.equal(result.products.length, 0);
    });

    await check('sideEffect', '32 background notification retry paths use the same policy', async () => {
        const { emitWithRetry } = require('../services/notificationService');
        await assert.rejects(
            emitWithRetry({ io: null, room: null, eventName: 'synthetic', payload: {}, retries: 3 }),
            ExternalSideEffectBlockedError
        );
    });

    await check('sideEffect', '33 forbidden provider secret presence is checked without reading values', () => {
        const env = syntheticStagingEnv();
        Object.defineProperty(env, 'RESEND_API_KEY', {
            configurable: true,
            enumerable: true,
            get() {
                throw new Error('provider secret value was read');
            }
        });
        const policy = resolveStagingRuntimePolicy(env);
        assert.equal(policy.canStart, false);
        assert.match(policy.errors.join('\n'), /RESEND_API_KEY/);
    });

    await check('sideEffect', '34 policy errors and public failures contain no secret material', () => {
        const marker = 'synthetic-secret-material-must-not-leak';
        const env = syntheticStagingEnv();
        Object.defineProperty(env, 'PAYTR_MERCHANT_KEY', {
            configurable: true,
            enumerable: true,
            value: marker
        });
        const policyText = resolveStagingRuntimePolicy(env).errors.join('\n');
        assert.doesNotMatch(policyText, new RegExp(marker));
        try {
            assertExternalSideEffectAllowed('payment_initialize', env);
        } catch (error) {
            assert.doesNotMatch(`${error.message} ${error.publicMessage}`, new RegExp(marker));
        }
    });

    await check('sideEffect', '35 staging does not synthesize provider success or payment tokens', () => {
        assert.equal(initializeResult.state.payload.code, 'STAGING_EXTERNAL_SIDE_EFFECT_DISABLED');
        assert.equal(Object.prototype.hasOwnProperty.call(initializeResult.state.payload, 'token'), false);
        assert.throws(
            () => originalPaytrMock({ merchantOid: 'synthetic', paymentAmount: 100 }),
            ExternalSideEffectBlockedError
        );
    });

    await check('sideEffect', '35a Netgsm selector and credential fields fail closed without reading secrets', () => {
        const selectorPolicy = resolveStagingRuntimePolicy(syntheticStagingEnv({
            SMS_PROVIDER: ' NeTgSm '
        }));
        assert.equal(selectorPolicy.canStart, false);
        assert.match(selectorPolicy.errors.join('\n'), /SMS_PROVIDER/);

        for (const key of ['NETGSM_USERCODE', 'NETGSM_PASSWORD', 'NETGSM_MSGHEADER']) {
            const env = syntheticStagingEnv();
            Object.defineProperty(env, key, {
                configurable: true,
                enumerable: true,
                get() {
                    throw new Error(`${key} value was read`);
                }
            });
            const policy = resolveStagingRuntimePolicy(env);
            assert.equal(policy.canStart, false, key);
            assert.match(policy.errors.join('\n'), new RegExp(key));
            assert.doesNotMatch(policy.errors.join('\n'), /value was read/);
        }
    });

    await check('sideEffect', '35b Netgsm staging policy performs no provider request and does not affect production', () => {
        let fetchCalls = 0;
        const originalFetch = global.fetch;
        global.fetch = async () => {
            fetchCalls += 1;
            throw new Error('Netgsm provider request must not occur during policy evaluation');
        };
        try {
            const stagingPolicy = resolveStagingRuntimePolicy(syntheticStagingEnv({
                SMS_PROVIDER: 'netgsm',
                NETGSM_USERCODE: 'synthetic-usercode',
                NETGSM_PASSWORD: 'synthetic-password',
                NETGSM_MSGHEADER: 'synthetic-header'
            }));
            assert.equal(stagingPolicy.canStart, false);

            const productionPolicy = resolveStagingRuntimePolicy({
                NODE_ENV: 'production',
                NOVASTORE_DEPLOY_ENV: 'production',
                SMS_PROVIDER: 'netgsm',
                NETGSM_USERCODE: 'synthetic-usercode',
                NETGSM_PASSWORD: 'synthetic-password',
                NETGSM_MSGHEADER: 'synthetic-header'
            });
            assert.equal(productionPolicy.canStart, true);
        } finally {
            global.fetch = originalFetch;
        }
        assert.equal(fetchCalls, 0);
    });

    await check('runtime', '36 missing or enabled admin write flags reject startup', () => {
        for (const key of ADMIN_WRITE_ENV_KEYS) {
            const missing = syntheticStagingEnv();
            delete missing[key];
            assert.equal(resolveStagingRuntimePolicy(missing).canStart, false, `${key} missing must fail`);
            assert.equal(resolveStagingRuntimePolicy(syntheticStagingEnv({ [key]: 'true' })).canStart, false);
            assert.equal(resolveStagingRuntimePolicy(syntheticStagingEnv({ [key]: '1' })).canStart, false);
        }
    });

    await check('runtime', '37 four exact false admin write flags permit safe policy', () => {
        const policy = resolveStagingRuntimePolicy(syntheticStagingEnv());
        assert.equal(policy.canStart, true);
        assert.equal(ADMIN_WRITE_ENV_KEYS.length, 4);
    });

    await check('runtime', '38 real admin mutation routes consume capability guards', () => {
        const routeFiles = [
            'routes/adminCategoryRoutes.js',
            'routes/adminMenuRoutes.js',
            'routes/adminCollectionRoutes.js',
            'routes/adminAttributeRoutes.js'
        ];
        for (const file of routeFiles) {
            const source = read(file);
            assert.match(source, /catalogStructureWrite/);
            for (const line of source.split(/\r?\n/).filter((item) => /router\.(?:post|patch|delete)\(/.test(item))) {
                assert.match(line, /requireStagingCatalogStructureWrite/, `${file}: ${line}`);
            }
        }

        const productRoutes = read('routes/productRoutes.js');
        assert.match(productRoutes, /firstPartyCatalogWrite/);
        for (const line of productRoutes.split(/\r?\n/).filter((item) => /router\.(?:post|put|delete)\(/.test(item))) {
            assert.match(line, /requireStagingCatalogProductWrite/, `routes/productRoutes.js: ${line}`);
        }

        assert.match(read('routes/adminRoutes.js'), /firstPartyCatalogWrite/);
        assert.match(read('routes/orderRoutes.js'), /orderCancelWrite/);
        assert.match(read('routes/shipmentRoutes.js'), /manualShipmentWrite/);

        const {
            requireAdminCommerceCapabilityInStaging
        } = require('../middlewares/adminCommerceCapability');
        for (const capability of [
            'firstPartyCatalogWrite',
            'catalogStructureWrite',
            'orderCancelWrite',
            'manualShipmentWrite'
        ]) {
            let nextCalls = 0;
            const result = responseRecorder();
            requireAdminCommerceCapabilityInStaging(capability)(
                {},
                result.response,
                () => { nextCalls += 1; }
            );
            assert.equal(result.state.statusCode, 503, capability);
            assert.equal(nextCalls, 0, capability);
        }
    });

    await check('runtime', '39 staging startup excludes legacy schema initializer imports', () => {
        const serverSource = read('server.js');
        assert.doesNotMatch(serverSource, /models\/initDb/);
        const guardIndex = serverSource.indexOf('if (!startupSafety.shouldRunSchemaInit)');
        const firstSchemaImport = serverSource.indexOf("require('./models/createCoreDb')");
        assert.ok(guardIndex >= 0 && firstSchemaImport > guardIndex);
    });

    await check('runtime', '40 npm start performs no migration or bootstrap', () => {
        const packageJson = JSON.parse(read('package.json'));
        assert.equal(packageJson.scripts.start, 'node server.js');
        assert.doesNotMatch(packageJson.scripts.start, /migrat|bootstrap|initDb/i);
    });

    await check('runtime', '41 guarded migration CLI commands remain available and separate', () => {
        const packageJson = JSON.parse(read('package.json'));
        assert.equal(packageJson.scripts['staging:migrate:plan'], 'node scripts/stagingMigrationCli.js plan');
        assert.equal(packageJson.scripts['staging:migrate:status'], 'node scripts/stagingMigrationCli.js status');
        assert.equal(packageJson.scripts['staging:migrate'], 'node scripts/stagingMigrationCli.js apply');
        assert.equal(packageJson.scripts['staging:bootstrap'], 'node scripts/stagingBootstrapCli.js');
    });

    await check('runtime', '42 migration manifest remains the exact committed 15-file foundation', () => {
        const manifest = JSON.parse(read('scripts/staging-migrations/manifest.json'));
        assert.equal(manifest.length, 15);
        assert.equal(new Set(manifest.map((item) => item.path)).size, 15);
        assert.deepEqual(
            manifest.at(-1),
            {
                id: '20260721_auth_session_registry',
                path: 'migrations/20260721_auth_session_registry.sql',
                sha256: 'afa1ec4af7b38fd627ec3552d6f5e137da798feb81375c716b0cab45d1ca2e84',
                mode: 'transactional',
                transactionWrapper: false
            }
        );
    });

    await check('runtime', '43 local and production behavior stays outside staging policy', () => {
        assert.equal(resolveStagingRuntimePolicy({ NODE_ENV: 'test' }).canStart, true);
        assert.equal(resolveStagingRuntimePolicy({ NODE_ENV: 'production' }).canStart, true);
        assert.equal(resolveStagingRuntimePolicy({
            NODE_ENV: 'production',
            NOVASTORE_STAGING_ACCESS_GATE_ENABLED: 'true'
        }).canStart, false);
        assert.equal(assertExternalSideEffectAllowed('email', { NODE_ENV: 'test' }), true);
        assert.equal(EXTERNAL_SIDE_EFFECT_KINDS.length, 10);

        const {
            requireAdminCommerceCapabilityInStaging
        } = require('../middlewares/adminCommerceCapability');
        const previousDeployEnvironment = process.env.NOVASTORE_DEPLOY_ENV;
        let nextCalls = 0;
        try {
            process.env.NOVASTORE_DEPLOY_ENV = 'local';
            requireAdminCommerceCapabilityInStaging('catalogStructureWrite')(
                {},
                responseRecorder().response,
                () => { nextCalls += 1; }
            );
        } finally {
            process.env.NOVASTORE_DEPLOY_ENV = previousDeployEnvironment;
        }
        assert.equal(nextCalls, 1);
    });

    assert.deepEqual(counts, { sideEffect: 17, runtime: 8 });
    console.log(`stagingRuntimeSafetySmoke: PASS side-effect=${counts.sideEffect}/17 runtime=${counts.runtime}/8`);
})().catch((error) => {
    Module._load = originalLoad;
    console.error(error);
    process.exitCode = 1;
});
