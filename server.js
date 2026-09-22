require('dotenv').config({ quiet: true });
const {
    applyDevelopmentPreviewFallback,
    resolveStartupSafety
} = require('./config/startupSafety');

const previewFallback = applyDevelopmentPreviewFallback(process.env);
if (previewFallback.applied) {
    console.warn(
        `Startup preview: UI-only localhost modu etkin. ` +
        `Uzak Supabase hedefi kullanilmayacak; DB dogrulamasi ve schema init atlanacak. ` +
        `Onceki hedef: ${previewFallback.originalTarget.label}`
    );
}

const startupSafety = resolveStartupSafety(process.env);
startupSafety.warnings.forEach((warning) => console.warn(`Startup warning: ${warning}`));

if (!startupSafety.canStart) {
    startupSafety.errors.forEach((error) => console.error(`Startup blocked: ${error}`));
    process.exit(1);
}

const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { requestContext, simpleRateLimit, sanitizeBody } = require('./middlewares/securityMiddleware');
const {
    createStagingAccessGate,
    createStagingEngineAccessGate
} = require('./middlewares/stagingAccessGate');
const { assertExternalSideEffectAllowed } = require('./config/stagingRuntimePolicy');
const pool = require('./config/db');
const {
    resolveStockySystemCommerceRuntime
} = require('./services/stockySystemConnectorService');
const {
    startStockyOrderDeliveryWorker,
    stopStockyOrderDeliveryWorker
} = require('./services/stockyOrderDeliveryWorkerService');
const { resolveThemeDeliveryRuntime } = require('./services/themeStockyDeliveryService');
const { startThemeDeliveryWorker } = require('./services/themeStockyDeliveryWorkerService');
let themeDeliveryWorker = null;
const {
    startNotificationWorker,
    stopNotificationWorker
} = require('./services/notificationWorkerService');
const { getAllowedOrigins } = require('./config/appConfig');
const { getTrustedProxyHops } = require('./config/proxyTrustConfig');
const { getPublicCategoryBySlug } = require('./services/categoryService');
const { getPublicCollection } = require('./services/collectionService');
const {
    authenticateSocket,
    autoJoinAllowedRooms,
    buildMessageTargetRoom,
    buildSafeMessagePayload,
    handleJoinRoom,
    revalidateSocketSession
} = require('./services/socketAuthService');
const { socketRevocationService } = require('./services/socketRevocationService');

const app = express();
const trustedProxyHops = getTrustedProxyHops(process.env);
if (trustedProxyHops > 0) app.set('trust proxy', trustedProxyHops);
const server = http.createServer(app);

const allowedOrigins = getAllowedOrigins();
const corsOptions = {
    origin: allowedOrigins,
    credentials: allowedOrigins !== '*'
};

// Socket.io
const io = new Server(server, {
    cors: corsOptions
});

const stagingAccessGate = createStagingAccessGate({ environment: process.env });
const stagingEngineAccessGate = createStagingEngineAccessGate({ environment: process.env });
io.engine.use(stagingEngineAccessGate);

// io export
module.exports.io = io;

io.use(socketRevocationService.guardSocketAuthentication);
io.use(authenticateSocket);

io.on('connection', (socket) => {
    if (!socketRevocationService.register(socket)) return;
    const joinedRooms = autoJoinAllowedRooms(socket);
    console.log(`Socket baglantisi kuruldu: ${socket.id} user=${socket.user.id} role=${socket.user.role}`);

    socket.on('join_room', async (room, ack) => {
        try {
            await revalidateSocketSession(socket);
            const result = handleJoinRoom(socket, room, ack);
            if (result.ok) console.log(`Socket ${socket.id} -> ${result.room} odasina katildi`);
        } catch (error) {
            const payload = {
                ok: false,
                code: error.data?.code || 'SOCKET_SESSION_REVOKED',
                message: 'Socket session is not active.'
            };
            if (typeof ack === 'function') ack(payload);
            socket.emit('socket_error', payload);
            socket.disconnect(true);
        }
    });

    socket.on('send_message', async (data = {}, ack) => {
        try {
            await revalidateSocketSession(socket);
            const targetRoom = buildMessageTargetRoom(socket.user, data);
            if (!targetRoom) {
                const payload = {
                    ok: false,
                    code: 'MESSAGE_FORBIDDEN',
                    message: 'Bu mesaj hedefi için yetkiniz yok.'
                };
                if (typeof ack === 'function') ack(payload);
                socket.emit('socket_error', payload);
                return;
            }

            assertExternalSideEffectAllowed('outbound_notification');
            io.to(targetRoom).emit('receive_message', buildSafeMessagePayload(socket.user, data));
            if (typeof ack === 'function') ack({ ok: true, room: targetRoom });
        } catch (error) {
            if (error && error.code === 'STAGING_EXTERNAL_SIDE_EFFECT_DISABLED') {
                const payload = {
                    ok: false,
                    code: error.code,
                    message: error.publicMessage || 'External side effect is disabled in staging.'
                };
                if (typeof ack === 'function') ack(payload);
                socket.emit('socket_error', payload);
                return;
            }

            const payload = {
                ok: false,
                code: error.data?.code || 'SOCKET_SESSION_REVOKED',
                message: 'Socket session is not active.'
            };
            if (typeof ack === 'function') ack(payload);
            socket.emit('socket_error', payload);
            socket.disconnect(true);
        }
    });

    socket.on('disconnect', () => {
        console.log(`Socket baglantisi kesildi: ${socket.id} rooms=${joinedRooms.join(',')}`);
    });
});

// Middleware
app.use(requestContext);
app.use(stagingAccessGate);
const themePlatformEnabled = String(process.env.NOVASTORE_THEME_PLATFORM_ENABLED || '').toLowerCase() === 'true';
const themeRuntimeComposition=require('./services/themePlatformRuntimeComposition').createThemeRuntimeComposition({database:pool});
const { createThemeStorefrontHostGuard } = require('./services/themePlatformCommerceService');
app.use(createThemeStorefrontHostGuard({ database: pool, enabled: themePlatformEnabled,
    servePublished:themeRuntimeComposition.serve,
    trustedPlatformHosts: String(process.env.NOVASTORE_THEME_PLATFORM_TRUSTED_HOSTS || 'localhost,127.0.0.1,[::1]').split(',').map(value => value.trim()).filter(Boolean) }));
app.use(cors(corsOptions));
// Large parsing is confined to authenticated Theme Platform import/upload routes;
// all other existing API bodies retain their established 1 MiB boundary.
if (themePlatformEnabled) {
    app.use('/api/admin/theme-platform/experience/packages', require('./middlewares/authMiddleware').authenticateAdmin, express.json({ limit: '24mb' }));
    app.use(/^\/api\/(?:admin|seller\/v1)\/theme-platform\/services\/[a-f0-9-]+\/stored-assets$/u, express.json({ limit: '7mb' }));
}
app.use('/api/theme-seller-bridge/dispatch', express.json({ limit: '7mb',verify:(req,_res,bytes)=>{req.themeBridgeBodyBytes=bytes.length;} }));
app.use(express.json({ limit: '1mb' }));
app.use(sanitizeBody);
app.use(simpleRateLimit({ windowMs: 60 * 1000, max: 240 }));

const runtimeMetaRoutes = require('./routes/runtimeMetaRoutes');
app.use('/api', runtimeMetaRoutes);
const publicLegalRoutes = require('./routes/publicLegalRoutes');
app.use('/api/public/legal', publicLegalRoutes);

app.get('/favicon.ico', (req, res) => {
    res.type('image/png');
    res.sendFile(path.join(__dirname, 'frontend', 'favicon-96x96.png'));
});

const COMMERCE_PRO_STOREFRONT_ARTIFACT = path.join(
    __dirname,
    'frontend',
    'commerce-pro',
    'index.html'
);
const storefrontMode = String(process.env.NOVASTORE_STOREFRONT_MODE || '').trim().toLowerCase();
const commerceProStorefrontEnabled = storefrontMode !== 'legacy';

if (storefrontMode && !['commerce-pro', 'legacy'].includes(storefrontMode)) {
    console.warn(
        `Bilinmeyen NOVASTORE_STOREFRONT_MODE=${storefrontMode}; ` +
        'varsayilan Commerce Pro storefront kullanilacak.'
    );
}

const COMMERCE_PRO_DOCUMENT_ALIASES = new Set([
    '/',
    '/index.html',
    '/login.html',
    '/forgot-password.html',
    '/reset-password.html',
    '/checkout.html',
    '/payment-result.html',
    '/profile.html',
    '/product.html'
]);
const COMMERCE_PRO_HASH_ROUTES = [
    /^\/urun-id\/\d+\/?$/,
    /^\/arama\/?$/,
    /^\/favoriler\/?$/,
    /^\/sepet\/?$/,
    /^\/hesabim(?:\/(?:adresler|kuponlar|bildirimler|sorularim|degerlendirmelerim|takip-ettigim-magazalar|guvenlik|destek|siparisler(?:\/[^/]+)?))?\/?$/,
    /^\/(?:giris|kayit|sifremi-unuttum|sifre-sifirla)\/?$/,
    /^\/odeme\/(?:teslimat|odeme|onay|sonuc)\/?$/,
    /^\/(?:yardim|siparis-takibi|iletisim|destek|hakkimizda|gizlilik-politikasi|kvkk-aydinlatma-metni|cerez-politikasi|kullanim-ve-uyelik-kosullari|on-bilgilendirme-formu|mesafeli-satis-sozlesmesi|iptal-iade-cayma-politikasi|teslimat-ve-kargo-kosullari|islem-rehberi|pazaryeri-bilgilendirmesi|satici-sozlesmesi)\/?$/
];
const COMMERCE_PRO_DOCUMENT_ROUTES = /^\/(?:kategori|urun|koleksiyon|magaza)\/(?:[^/]+(?:\/[^/]+)*)\/?$/;

const requestSearch = (req) => {
    const queryIndex = req.originalUrl.indexOf('?');
    return queryIndex === -1 ? '' : req.originalUrl.slice(queryIndex);
};

const setDenyFrameHeaders = (res) => {
    res.setHeader('Content-Security-Policy', "frame-ancestors 'none'");
    res.setHeader('X-Frame-Options', 'DENY');
};

if (themePlatformEnabled) {
    // A nested workshop session must return to the existing root Admin login.
    // No user supplied next/URL is forwarded by this fallback.
    app.get('/studio-pro/admin-login.html', (_req, res) => {
        setDenyFrameHeaders(res);
        res.set('Cache-Control', 'private, no-store');
        res.redirect(302, '/admin-login.html?reason=session-expired&next=admin-commerce-pro-live.html');
    });
    // The complete original authoring UI opens in a new tab. Its own preview
    // frames and trusted, source-preserved gallery need same-origin framing.
    // Only the seller-offers panel uses the authenticated Admin API adapter.
    app.use('/studio-pro', (req, res, next) => {
        res.set('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self' data:; connect-src 'self'; frame-src 'self' blob:; frame-ancestors 'self'; object-src 'none'; base-uri 'self'; form-action 'self'");
        res.set('X-Frame-Options', 'SAMEORIGIN');
        res.set('X-Content-Type-Options', 'nosniff');
        res.set('Referrer-Policy', 'no-referrer');
        res.set('Cache-Control', 'private, no-store');
        next();
    }, express.static(path.join(__dirname, 'studio-core', 'dist-workshop'), { index: 'index.html' }));
    // Only the dedicated Studio entries permit same-origin embedding. Existing
    // Admin, storefront and payment frame-deny policies remain unchanged.
    app.use('/theme-studio', (req, res, next) => {
        res.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data: https:; font-src 'self'; connect-src 'self'; frame-src 'self' blob:; frame-ancestors 'self'; object-src 'none'; base-uri 'self'");
        res.set('X-Frame-Options', 'SAMEORIGIN');
        res.set('Cache-Control', 'private, no-store');
        next();
    }, express.static(path.join(__dirname, 'studio-core', 'dist'), { index: 'index.html' }));
    app.use('/seller-theme', (req, res, next) => { setDenyFrameHeaders(res); res.set('Cache-Control', 'private, no-store'); next(); },
        express.static(path.join(__dirname, 'seller-theme-web', 'dist'), { index: 'index.html' }));
    app.get('/admin-commerce-pro-live.html', (_req, res) => {
        setDenyFrameHeaders(res); res.set('Cache-Control', 'private, no-store');
        res.sendFile(path.join(__dirname, 'admin-commerce-pro', 'dist-integrated', 'integrated.html'));
    });
    app.use('/assets', express.static(path.join(__dirname, 'admin-commerce-pro', 'dist-integrated', 'assets')));
    for (const assetName of ['icons.js', 'favicon-96x96.png']) {
        app.get(`/${assetName}`, (_req, res) => {
            res.sendFile(path.join(__dirname, 'admin-commerce-pro', 'dist-integrated', assetName));
        });
    }
}

const sendCommerceProStorefront = (res) => {
    setDenyFrameHeaders(res);
    return res.sendFile(COMMERCE_PRO_STOREFRONT_ARTIFACT);
};

app.use((req, res, next) => {
    if (!['GET', 'HEAD'].includes(req.method)) return next();

    if (['/checkout.html', '/payment-result.html'].includes(req.path)) {
        return sendCommerceProStorefront(res);
    }

    if (!commerceProStorefrontEnabled) return next();

    if (/^\/category\/(?:[^/]+(?:\/[^/]+)*)\/?$/.test(req.path)) {
        const requestedPath = req.path.slice('/category/'.length).replace(/^\/+|\/+$/g, '');
        let canonicalPath;
        try {
            canonicalPath = requestedPath
                .split('/')
                .map((segment) => encodeURIComponent(decodeURIComponent(segment)))
                .join('/');
        } catch (_) {
            return next();
        }
        return res.redirect(301, `/kategori/${canonicalPath}${requestSearch(req)}`);
    }

    if (COMMERCE_PRO_DOCUMENT_ALIASES.has(req.path) || COMMERCE_PRO_DOCUMENT_ROUTES.test(req.path)) {
        return sendCommerceProStorefront(res);
    }

    if (COMMERCE_PRO_HASH_ROUTES.some((pattern) => pattern.test(req.path))) {
        const canonicalHashPath = req.path.replace(/\/+$/g, '');
        return res.redirect(302, `/#${canonicalHashPath}${requestSearch(req)}`);
    }

    return next();
});

const DENY_FRAME_HTML_FILES = new Set([
    'admin-commerce-pro.html',
    'admin-commerce-pro-live.html',
    'paytr-checkout.html'
]);
const BLOCKED_STOREFRONT_PREVIEW_PREFIXES = Object.freeze([
    '/commerce-pro-preview',
    '/commerce-pro-integration-preview'
]);
app.use((req, res, next) => {
    let normalizedPath;
    try {
        const decodedPath = decodeURIComponent(req.path);
        if (/[\u0000-\u001f\u007f]/.test(decodedPath)) {
            return res.status(400).type('text/plain').send('Bad request');
        }
        normalizedPath = path.posix.normalize(decodedPath.replace(/\\/g, '/')).toLowerCase();
    } catch (_) {
        return res.status(400).type('text/plain').send('Bad request');
    }

    if (BLOCKED_STOREFRONT_PREVIEW_PREFIXES.some((prefix) => (
        normalizedPath === prefix || normalizedPath.startsWith(`${prefix}/`)
    ))) {
        return res.status(404).type('text/plain').send('Not found');
    }
    return next();
});
app.use(express.static(path.join(__dirname, 'frontend'), {
    setHeaders: (res, filePath) => {
        const ext = path.extname(filePath).toLowerCase();
        if (ext === '.html') {
            res.setHeader('Content-Type', 'text/html; charset=UTF-8');
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
            if (
                DENY_FRAME_HTML_FILES.has(path.basename(filePath).toLowerCase())
                || path.resolve(filePath) === path.resolve(COMMERCE_PRO_STOREFRONT_ARTIFACT)
            ) {
                setDenyFrameHeaders(res);
            }
        } else if (ext === '.css') {
            res.setHeader('Content-Type', 'text/css; charset=UTF-8');
        } else if (ext === '.js') {
            res.setHeader('Content-Type', 'application/javascript; charset=UTF-8');
        }
    }
}));

const sendCategoryPage = (res, statusCode = 200) => {
    res.status(statusCode);
    return res.sendFile(path.join(__dirname, 'frontend', 'categories.html'));
};

app.get(/^\/(?:kategori|category)\/(.+)/, async (req, res) => {
    const requestedPath = String(req.params[0] || '').replace(/^\/+|\/+$/g, '');
    if (!requestedPath) return sendCategoryPage(res);

    const usesAlternatePrefix = req.path.toLocaleLowerCase('tr-TR').startsWith('/category/');
    if (usesAlternatePrefix) {
        return res.redirect(301, `/kategori/${requestedPath.split('/').map(encodeURIComponent).join('/')}`);
    }

    if (requestedPath.includes('/')) return sendCategoryPage(res);

    try {
        const detail = await getPublicCategoryBySlug(requestedPath);
        if (detail.redirect) {
            return res.redirect(
                detail.redirect.status,
                `/kategori/${encodeURIComponent(detail.redirect.canonical_slug)}`
            );
        }
        const canonicalSlug = String(detail.category?.slug || '');
        if (canonicalSlug && (
            canonicalSlug !== requestedPath.toLocaleLowerCase('tr-TR')
        )) {
            return res.redirect(301, `/kategori/${encodeURIComponent(canonicalSlug)}`);
        }
        return sendCategoryPage(res);
    } catch (error) {
        if (error.statusCode === 404) return sendCategoryPage(res, 404);
        console.error('Kategori sayfa rotasi hatasi:', error.message);
        return sendCategoryPage(res, 500);
    }
});

app.get('/koleksiyon/:slug', async (req, res) => {
    try {
        await getPublicCollection(req.params.slug, { page: 1, limit: 1 });
        return res.sendFile(path.join(__dirname, 'frontend', 'collections.html'));
    } catch (error) {
        if (error.statusCode === 404) {
            return res.status(404).sendFile(path.join(__dirname, 'frontend', 'collections.html'));
        }
        console.error('Koleksiyon sayfa rotasi hatasi:', error.message);
        return res.status(500).sendFile(path.join(__dirname, 'frontend', 'collections.html'));
    }
});

// Temel rota
app.get('/', (req, res) => {
    res.json({ mesaj: 'NovaStore API Basariyla Calisiyor!', durum: 'Aktif' });
});

// API rotalari
const productRoutes = require('./routes/productRoutes');
app.use('/api/products', productRoutes);

const favoriteRoutes = require('./routes/favoriteRoutes');
app.use('/api/favorites', favoriteRoutes);

const sharedStateRoutes = require('./routes/sharedStateRoutes');
app.use('/api/shared-state', sharedStateRoutes);

const orderRoutes = require('./routes/orderRoutes');
app.use('/api/orders', orderRoutes);

const paymentRoutes = require('./routes/paymentRoutes');
app.use('/api/payments', paymentRoutes);

const addressRoutes = require('./routes/addressRoutes');
app.use('/api/addresses', addressRoutes);

const shipmentRoutes = require('./routes/shipmentRoutes');
app.use('/api/shipments', shipmentRoutes);

const returnRoutes = require('./routes/returnRoutes');
app.use('/api/returns', returnRoutes);

const campaignRoutes = require('./routes/campaignRoutes');
app.use('/api/campaigns', campaignRoutes);

const authRoutes = require('./routes/authRoutes');
app.use('/api/auth', authRoutes);

const reviewRoutes = require('./routes/reviewRoutes');
app.use('/api/reviews', reviewRoutes);

const userRoutes = require('./routes/userRoutes');
app.use('/api/users', userRoutes);

const adminCategoryRoutes = require('./routes/adminCategoryRoutes');
app.use('/api/admin/categories', adminCategoryRoutes);

const adminRoutes = require('./routes/adminRoutes');
app.use('/api/admin', adminRoutes);

const publicCategoryRoutes = require('./routes/publicCategoryRoutes');
app.use('/api/public/categories', publicCategoryRoutes);

const publicNavigationRoutes = require('./routes/publicNavigationRoutes');
app.use('/api/public/navigation', publicNavigationRoutes);

const publicCollectionRoutes = require('./routes/publicCollectionRoutes');
app.use('/api/public/collections', publicCollectionRoutes);

const publicStoreRoutes = require('./routes/publicStoreRoutes');
app.use('/api/public/stores', publicStoreRoutes);

const storeFollowRoutes = require('./routes/storeFollowRoutes');
app.use('/api/store-follows', storeFollowRoutes);

const adminMenuRoutes = require('./routes/adminMenuRoutes');
app.use('/api/admin', adminMenuRoutes);

const adminCollectionRoutes = require('./routes/adminCollectionRoutes');
app.use('/api/admin', adminCollectionRoutes);

const adminAttributeRoutes = require('./routes/adminAttributeRoutes');
app.use('/api/admin', adminAttributeRoutes);

const categoryRoutes = require('./routes/categoryRoutes');
app.use('/api/categories', categoryRoutes);

const notificationRoutes = require('./routes/notificationRoutes');
app.use('/api/notifications', notificationRoutes);

const messageRoutes = require('./routes/messageRoutes');
app.use('/api/messages', messageRoutes);

const assistantRoutes = require('./routes/assistantRoutes');
app.use('/api/assistant', assistantRoutes);

const analyticsRoutes = require('./routes/analyticsRoutes');
app.use('/api/analytics', analyticsRoutes);

const questionRoutes = require('./routes/questionRoutes');
app.use('/api/questions', questionRoutes);

const merchantRoutes = require('./routes/merchantRoutes');
app.use('/api/merchant', merchantRoutes);
app.use('/merchant', merchantRoutes);

const { resolveSellerApiActivationPolicy } = require('./config/sellerApiActivationPolicy');
const { assertRuntimeDatabaseIdentity } = require('./services/runtimeDatabaseIdentityService');
const { createSellerTransportSecurityMiddleware } = require('./middlewares/sellerTransportSecurity');
const configuredBindHost = String(process.env.NOVASTORE_BIND_HOST || '').trim();
// Additive, default-off foundation. This flag never runs migrations or publishes themes.
const { createAdminThemeRouter, createSellerThemeRouter } = require('./routes/themePlatformRoutes');
app.use('/api/admin/theme-platform', createAdminThemeRouter({ database: pool, enabled: themePlatformEnabled,composition:themeRuntimeComposition }));
const themeDeliveryRuntime = resolveThemeDeliveryRuntime({ environment: process.env, startupSafety });
const themeSellerBridgeEnabled = themePlatformEnabled && themeDeliveryRuntime.enabled
    && process.env.NOVASTORE_STOCKY_THEME_SELLER_BRIDGE_ENABLED === 'true';
app.use('/api/theme-seller-bridge', require('./routes/themeSellerBridgeRoutes').createThemeSellerBridgeRouter({
    database: pool, enabled: themeSellerBridgeEnabled, runtime: themeDeliveryRuntime
}));
app.use('/api/theme-storefront', require('./routes/themeStorefrontRoutes').createThemeStorefrontRouter({ database: pool, enabled: themePlatformEnabled,
    customerRuntimeAuthority:themeRuntimeComposition.customerRuntimeAuthority,
    referenceAdapter: document => require('./services/themePlatformStudioDocument').commerceReferences(document),
    assetReader: async (client, scope, assetId) => {
        const asset = (await client.query("SELECT * FROM theme_assets WHERE id=$1 AND service_id=$2 AND status='READY' AND storage_backend='local-v1'", [assetId, scope.service_id])).rows[0];
        if (!asset) throw Object.assign(new Error('THEME_ASSET_UNAVAILABLE'), { code: 'THEME_ASSET_UNAVAILABLE', statusCode: 404 });
        const storage = require('./services/themePlatformAssetStorage').createThemeAssetStorage({ rootDir: process.env.NOVASTORE_THEME_ASSET_ROOT });
        return { bytes: await storage.readOwned({ serviceId: scope.service_id, storageKey: asset.storage_key, digest: asset.digest }), mimeType: asset.detected_mime };
    } }));
const sellerApiActivation = resolveSellerApiActivationPolicy({
    environment: process.env,
    startupSafety,
    bindHost: configuredBindHost,
    trustedProxyHops
});
const sellerApiRouter = express.Router();
app.use('/api/seller/v1', sellerApiRouter);
const sellerFeature = (name) => sellerApiActivation.enabled &&
    String(process.env[name] || '').toLowerCase() === 'true';

let sellerRoutesConfigured = false;
const configureSellerRoutes = () => {
    if (!sellerApiActivation.enabled || sellerRoutesConfigured) return;
    const { createSellerContextRouter } = require('./routes/sellerContextRoutes');
    const { createSellerAuthRouter } = require('./routes/sellerAuthRoutes');
    const { createSellerPasswordRecoveryRouter } = require('./routes/sellerPasswordRecoveryRoutes');
    const { createSellerApplicationRouter } = require('./routes/sellerApplicationRoutes');
    const { createSellerBusinessRouter } = require('./routes/sellerBusinessRoutes');
    const { createSellerNotificationRouter } = require('./routes/sellerNotificationRoutes');
    const { createSellerAuthMiddleware } = require('./middlewares/sellerAuthMiddleware');
    const { createSellerApplicantAuth } = require('./middlewares/sellerApplicantAuth');
    const { createSellerTenantContextMiddleware } = require('./middlewares/sellerTenantContext');
    const { createSellerAccessTokenService } = require('./services/sellerAccessTokenService');
    const loginService = require('./services/sellerLoginService');
    const { createSellerAuthController } = require('./controllers/sellerAuthController');
    const { createSellerPasswordRecoveryController } = require('./controllers/sellerPasswordRecoveryController');
    const { createSellerApplicationController } = require('./controllers/sellerApplicationController');
    const { createSellerContextController } = require('./controllers/sellerContextController');
    const { createSellerBusinessController } = require('./controllers/sellerBusinessController');
    const storeService = require('./services/sellerStoreService');
    const publicStoreService = require('./services/publicStoreProjectionService');
    const offerInventoryService = require('./services/sellerOfferInventoryService');
    const orderService = require('./services/sellerOrderFulfillmentService');
    const financeService = require('./services/sellerFinanceService');
    const supportService = require('./services/sellerSupportService');
    const reputationService = require('./services/sellerReputationService');
    const { listMembersForStoreScope } = require('./services/sellerTeamReadService');
    const { createSellerPasswordRecoveryService } = require('./services/sellerPasswordRecoveryService');
    const { createSellerPasswordRecoveryDeliveryBoundary } = require('./services/sellerPasswordRecoveryDeliveryBoundary');
    const { createSellerApplicationService } = require('./services/sellerApplicationService');
    const { getSellerApplicationTermsAuthority } = require('./config/sellerApplicationTerms');

    app.locals.sellerDatabase = pool;
    const sellerE2eTraceEnabled = sellerApiActivation.mode === 'local' &&
        sellerFeature('SELLER_E2E_TRACE_ENABLED') &&
        String(process.env.NODE_ENV || '').toLowerCase() === 'development' &&
        String(process.env.NOVASTORE_SAFE_LOCAL_BACKEND || '').toLowerCase() === 'true' &&
        String(process.env.NOVASTORE_ALLOW_REMOTE_DB || '').toLowerCase() !== 'true';
    const tokenService = createSellerAccessTokenService({
        secret: process.env.SELLER_ACCESS_TOKEN_SECRET,
        expiresIn: sellerE2eTraceEnabled
            ? (process.env.SELLER_E2E_ACCESS_TOKEN_EXPIRES_IN || '15m')
            : '15m'
    });
    const auth = createSellerAuthMiddleware({ verifyAccessToken: tokenService.verify });
    const syntheticRecoveryEnabled = sellerFeature('SELLER_PASSWORD_RECOVERY_SYNTHETIC_DELIVERY') &&
        ['test', 'development'].includes(String(process.env.NODE_ENV || '').toLowerCase()) &&
        String(process.env.NOVASTORE_SAFE_LOCAL_BACKEND || '').toLowerCase() === 'true' &&
        String(process.env.NOVASTORE_ALLOW_REMOTE_DB || '').toLowerCase() !== 'true';
    const recoveryDelivery = createSellerPasswordRecoveryDeliveryBoundary({ syntheticEnabled: syntheticRecoveryEnabled });
    const passwordRecoveryService = createSellerPasswordRecoveryService({
        database: pool,
        secret: process.env.SELLER_PASSWORD_RECOVERY_SECRET,
        deliveryBoundary: recoveryDelivery.deliver
    });
    const applicationService = createSellerApplicationService({
        database: pool,
        secret: process.env.SELLER_APPLICATION_AUTH_SECRET,
        termsAuthority: getSellerApplicationTermsAuthority()
    });
    const applicantAuth = createSellerApplicantAuth({ service: applicationService });
    const tenant = createSellerTenantContextMiddleware();
    const contextController = createSellerContextController({
        readOrganization: async (context) => (
            await pool.query(
                'SELECT id, external_key, display_name, status FROM seller_organizations WHERE id = $1 AND status = $2',
                [context.organizationId, 'active']
            )
        ).rows[0],
        listRoles: async (context) => (
            await pool.query(
                'SELECT id, code, name, is_assignable FROM seller_roles WHERE id = $1 AND is_active = TRUE',
                [context.roleId]
            )
        ).rows,
        listMembers: (context, options) => listMembersForStoreScope(pool, context, options)
    });
    const businessController = createSellerBusinessController({
        storeService,
        publicStoreService,
        offerInventoryService,
        orderService,
        financeService,
        supportService,
        reputationService
    });
    const authController = createSellerAuthController({ loginService, tokenService });
    const passwordRecoveryController = createSellerPasswordRecoveryController({ service: passwordRecoveryService });
    const applicationController = createSellerApplicationController({ service: applicationService });

    app.locals.sellerPasswordRecoverySyntheticDelivery = recoveryDelivery;

    if (sellerE2eTraceEnabled) {
        sellerApiRouter.use((req, res, next) => {
            res.once('finish', () => {
                console.log(`SELLER_E2E_HTTP ${req.method} ${req.path} ${res.statusCode}`);
            });
            next();
        });
    }

    sellerApiRouter.use(createSellerTransportSecurityMiddleware({
        required: sellerApiActivation.requiresSecureTransport,
        trustedIngressCidrs: sellerApiActivation.trustedIngressCidrs
    }));
    sellerApiRouter.use('/theme-platform', createSellerThemeRouter({
        database: pool, enabled: themePlatformEnabled, auth, tenant
    }));
    sellerApiRouter.use(createSellerAuthRouter({ auth, controller: authController }));
    sellerApiRouter.use(createSellerPasswordRecoveryRouter({ controller: passwordRecoveryController }));
    sellerApiRouter.use(createSellerApplicationRouter({
        controller: applicationController,
        applicantAuth,
        auth,
        tenant
    }));
    sellerApiRouter.use(createSellerContextRouter({ enabled: true, auth, tenant, controller: contextController }));
    sellerApiRouter.use(createSellerNotificationRouter({ enabled: true, auth, tenant }));
    sellerApiRouter.use(createSellerBusinessRouter({
        enabled: true,
        auth,
        tenant,
        controller: businessController,
        features: Object.freeze({
            offerWrite: sellerFeature('SELLER_OFFER_WRITE_ENABLED'),
            orderWrite: sellerFeature('SELLER_ORDER_WRITE_ENABLED'),
            financeRead: sellerFeature('SELLER_FINANCE_READ_ENABLED')
        })
    }));
    sellerRoutesConfigured = true;
};

app.use((err, req, res, next) => {
    if (err && err.code === 'STAGING_EXTERNAL_SIDE_EFFECT_DISABLED') {
        return res.status(503).json({
            code: err.code,
            error: err.publicMessage || 'External side effect is disabled in staging.',
            requestId: req.requestId
        });
    }

    console.error('Istek hatasi:', err && err.message ? err.message : err);

    if (res.headersSent) {
        return next(err);
    }

    const requestedStatusCode = Number(err && (err.statusCode || err.status)) || 500;
    const statusCode = requestedStatusCode >= 400 && requestedStatusCode < 600 ? requestedStatusCode : 500;
    const message = statusCode >= 500
        ? 'Sunucu hatası meydana geldi.'
        : (err && err.message ? err.message : 'İstek işlenemedi.');
    return res.status(statusCode).json({ error: message, requestId: req.requestId });
});

const prepareDatabase = async (startupSafety, stockyCommerceRuntime) => {
    if (!startupSafety.shouldVerifyDbConnection) {
        console.log('Veritabani baglantisi ve schema init SKIP_SCHEMA_INIT=true ile atlandi.');
        return;
    }

    await pool.query('SELECT 1');
    console.log(`Veritabani baglantisi dogrulandi: ${pool.getTargetLabel()}`);

    if (!startupSafety.shouldRunSchemaInit) {
        console.log('Schema init guvenlik guard nedeniyle atlandi.');
        return;
    }

    const createCoreSchema = require('./models/createCoreDb');
    const createNotificationsTable = require('./models/createNotificationDb');
    const createCommerceSchema = require('./models/createCommerceDb');
    const createAnalyticsSchema = require('./models/createAnalyticsDb');
    const {
        applyLocalMain6sOperationMigrations
    } = require('./models/applyLocalMain6sOperationMigrations');
    const {
        applyLocalSellerMigrations
    } = require('./models/applyLocalSellerMigrations');

    await createCoreSchema();
    await createNotificationsTable();
    await createCommerceSchema();
    await createAnalyticsSchema();
    if (sellerApiActivation.enabled || stockyCommerceRuntime.enabled) {
        await applyLocalSellerMigrations();
    }
    await applyLocalMain6sOperationMigrations();
};

const start = async () => {
    try {
        const stockyCommerceRuntime = resolveStockySystemCommerceRuntime({
            environment: process.env,
            startupSafety
        });
        console.log(`Veritabani hedefi: ${startupSafety.target.label}`);
        await prepareDatabase(startupSafety, stockyCommerceRuntime);
        if ((sellerApiActivation.requiresConnectedDatabaseIdentity || stockyCommerceRuntime.enabled || themeDeliveryRuntime.enabled)
            && !startupSafety.shouldVerifyDbConnection) {
            throw new Error('RUNTIME_DATABASE_IDENTITY_REQUIRED');
        }
        if (sellerApiActivation.requiresConnectedDatabaseIdentity || stockyCommerceRuntime.enabled || themeDeliveryRuntime.enabled) {
            await assertRuntimeDatabaseIdentity({ database: pool, target: startupSafety.target });
        }
        configureSellerRoutes();
        if (themeDeliveryRuntime.enabled) {
            const schema = (await pool.query("SELECT to_regclass('theme_stocky_deliveries') IS NOT NULL AS delivery, to_regclass('theme_seller_bridge_sessions') IS NOT NULL AS bridge")).rows[0];
            if (!schema?.delivery || (themeSellerBridgeEnabled && !schema?.bridge)) throw new Error('THEME_DELIVERY_SCHEMA_REQUIRED');
        }
        if (!startupSafety.localPreviewMode) await socketRevocationService.start();
        if (startupSafety.shouldVerifyDbConnection) {
            startNotificationWorker({ database: pool, getIo: () => io });
            startStockyOrderDeliveryWorker({
                database: pool,
                runtime: stockyCommerceRuntime,
                environment: process.env
            });
            themeDeliveryWorker = startThemeDeliveryWorker({ database: pool, runtime: themeDeliveryRuntime });
        }
    } catch (err) {
        console.error('Veritabani hazirlama hatasi:', pool.formatError(err));
        process.exitCode = 1;
        return;
    }

    // Sunucu
    const PORT = process.env.PORT || 5000;
    const bindHost = configuredBindHost || undefined;
    server.listen(PORT, bindHost, () => {
        console.log(`NovaStore sunucusu ${PORT} portunda baslatildi.`);
        console.log('Socket.io hazir!');
    });
};

let shutdownPromise = null;
const shutdown = () => {
    if (shutdownPromise) return shutdownPromise;
    shutdownPromise = (async () => {
        stopStockyOrderDeliveryWorker();
        await themeDeliveryWorker?.stop();
        stopNotificationWorker();
        await socketRevocationService.stop();
        await new Promise((resolve) => {
            if (!server.listening) return resolve();
            return server.close(resolve);
        });
        await pool.end?.();
    })();
    return shutdownPromise;
};

for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => {
        shutdown()
            .then(() => { process.exitCode = 0; })
            .catch((error) => {
                console.error('Sunucu kapatma hatasi:', pool.formatError(error));
                process.exitCode = 1;
            });
    });
}

start();
