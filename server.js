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
const { simpleRateLimit, sanitizeBody } = require('./middlewares/securityMiddleware');
const {
    createStagingAccessGate,
    createStagingEngineAccessGate
} = require('./middlewares/stagingAccessGate');
const { assertExternalSideEffectAllowed } = require('./config/stagingRuntimePolicy');
const pool = require('./config/db');
const { getAllowedOrigins } = require('./config/appConfig');
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

io.use(authenticateSocket);

io.on('connection', (socket) => {
    const joinedRooms = autoJoinAllowedRooms(socket);
    socketRevocationService.register(socket);
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
app.use(stagingAccessGate);
app.use(cors(corsOptions));
app.use(express.json({ limit: '1mb' }));
app.use(sanitizeBody);
app.use(simpleRateLimit({ windowMs: 60 * 1000, max: 240 }));

const runtimeMetaRoutes = require('./routes/runtimeMetaRoutes');
app.use('/api', runtimeMetaRoutes);

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
    '/profile.html',
    '/product.html'
]);
const COMMERCE_PRO_HASH_ROUTES = [
    /^\/urun-id\/\d+\/?$/,
    /^\/arama\/?$/,
    /^\/favoriler\/?$/,
    /^\/sepet\/?$/,
    /^\/hesabim(?:\/(?:adresler|kuponlar|bildirimler|guvenlik|siparisler(?:\/[^/]+)?))?\/?$/,
    /^\/(?:giris|kayit|sifremi-unuttum|sifre-sifirla)\/?$/,
    /^\/odeme\/(?:teslimat|odeme|onay)\/?$/,
    /^\/(?:yardim|siparis-takibi|iletisim)\/?$/
];
const COMMERCE_PRO_DOCUMENT_ROUTES = /^\/(?:kategori|urun|koleksiyon)\/(?:[^/]+(?:\/[^/]+)*)\/?$/;

const requestSearch = (req) => {
    const queryIndex = req.originalUrl.indexOf('?');
    return queryIndex === -1 ? '' : req.originalUrl.slice(queryIndex);
};

app.use((req, res, next) => {
    if (!commerceProStorefrontEnabled || !['GET', 'HEAD'].includes(req.method)) return next();

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
        return res.sendFile(COMMERCE_PRO_STOREFRONT_ARTIFACT);
    }

    if (COMMERCE_PRO_HASH_ROUTES.some((pattern) => pattern.test(req.path))) {
        const canonicalHashPath = req.path.replace(/\/+$/g, '');
        return res.redirect(302, `/#${canonicalHashPath}${requestSearch(req)}`);
    }

    return next();
});

const ADMIN_COMMERCE_PRO_HTML_FILES = new Set([
    'admin-commerce-pro.html',
    'admin-commerce-pro-live.html'
]);
app.use(express.static(path.join(__dirname, 'frontend'), {
    setHeaders: (res, filePath) => {
        const ext = path.extname(filePath).toLowerCase();
        if (ext === '.html') {
            res.setHeader('Content-Type', 'text/html; charset=UTF-8');
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
            if (ADMIN_COMMERCE_PRO_HTML_FILES.has(path.basename(filePath).toLowerCase())) {
                res.setHeader('Content-Security-Policy', "frame-ancestors 'none'");
                res.setHeader('X-Frame-Options', 'DENY');
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

app.use((err, req, res, next) => {
    if (err && err.code === 'STAGING_EXTERNAL_SIDE_EFFECT_DISABLED') {
        return res.status(503).json({
            code: err.code,
            error: err.publicMessage || 'External side effect is disabled in staging.'
        });
    }

    console.error('Istek hatasi:', err && err.message ? err.message : err);

    if (res.headersSent) {
        return next(err);
    }

    const statusCode = Number(err && (err.statusCode || err.status)) || 500;
    const message = err && err.message ? err.message : 'Sunucu hatasi meydana geldi.';
    return res.status(statusCode).json({ error: message });
});

const prepareDatabase = async (startupSafety) => {
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

    await createCoreSchema();
    await createNotificationsTable();
    await createCommerceSchema();
    await createAnalyticsSchema();
};

const start = async () => {
    try {
        console.log(`Veritabani hedefi: ${startupSafety.target.label}`);
        await prepareDatabase(startupSafety);
        if (startupSafety.shouldVerifyDbConnection) await socketRevocationService.start();
    } catch (err) {
        console.error('Veritabani hazirlama hatasi:', pool.formatError(err));
        process.exitCode = 1;
        return;
    }

    // Sunucu
    const PORT = process.env.PORT || 5000;
    server.listen(PORT, () => {
        console.log(`NovaStore sunucusu ${PORT} portunda baslatildi.`);
        console.log('Socket.io hazir!');
    });
};

start();
