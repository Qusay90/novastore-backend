require('dotenv').config({ quiet: true });
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { simpleRateLimit, sanitizeBody } = require('./middlewares/securityMiddleware');
const pool = require('./config/db');
const { getAllowedOrigins } = require('./config/appConfig');
const { resolveStartupSafety } = require('./config/startupSafety');
const {
    authenticateSocket,
    autoJoinAllowedRooms,
    buildMessageTargetRoom,
    buildSafeMessagePayload,
    handleJoinRoom
} = require('./services/socketAuthService');

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

// io export
module.exports.io = io;

io.use(authenticateSocket);

io.on('connection', (socket) => {
    const joinedRooms = autoJoinAllowedRooms(socket);
    console.log(`Socket baglantisi kuruldu: ${socket.id} user=${socket.user.id} role=${socket.user.role}`);

    socket.on('join_room', (room, ack) => {
        const result = handleJoinRoom(socket, room, ack);
        if (result.ok) {
            console.log(`Socket ${socket.id} -> ${result.room} odasina katildi`);
        }
    });

    socket.on('send_message', (data = {}, ack) => {
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

        io.to(targetRoom).emit('receive_message', buildSafeMessagePayload(socket.user, data));
        if (typeof ack === 'function') ack({ ok: true, room: targetRoom });
    });

    socket.on('disconnect', () => {
        console.log(`Socket baglantisi kesildi: ${socket.id} rooms=${joinedRooms.join(',')}`);
    });
});

// Middleware
app.use(cors(corsOptions));
app.use(express.json({ limit: '1mb' }));
app.use(sanitizeBody);
app.use(simpleRateLimit({ windowMs: 60 * 1000, max: 240 }));
app.get('/favicon.ico', (req, res) => {
    res.type('image/png');
    res.sendFile(path.join(__dirname, 'frontend', 'favicon-96x96.png'));
});
app.use(express.static(path.join(__dirname, 'frontend'), {
    setHeaders: (res, filePath) => {
        const ext = path.extname(filePath).toLowerCase();
        if (ext === '.html') {
            res.setHeader('Content-Type', 'text/html; charset=UTF-8');
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
        } else if (ext === '.css') {
            res.setHeader('Content-Type', 'text/css; charset=UTF-8');
        } else if (ext === '.js') {
            res.setHeader('Content-Type', 'application/javascript; charset=UTF-8');
        }
    }
}));

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
    console.error('Istek hatasi:', err && err.message ? err.message : err);

    if (res.headersSent) {
        return next(err);
    }

    const statusCode = Number(err && (err.statusCode || err.status)) || 500;
    const message = err && err.message ? err.message : 'Sunucu hatasi meydana geldi.';
    return res.status(statusCode).json({ error: message });
});

// Veritabani tablolari
const createCoreSchema = require('./models/createCoreDb');
const createNotificationsTable = require('./models/createNotificationDb');
const createCommerceSchema = require('./models/createCommerceDb');
const createAnalyticsSchema = require('./models/createAnalyticsDb');

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

    await createCoreSchema();
    await createNotificationsTable();
    await createCommerceSchema();
    await createAnalyticsSchema();
};

const start = async () => {
    const startupSafety = resolveStartupSafety(process.env);
    startupSafety.warnings.forEach((warning) => console.warn(`Startup warning: ${warning}`));

    if (!startupSafety.canStart) {
        startupSafety.errors.forEach((error) => console.error(`Startup blocked: ${error}`));
        process.exitCode = 1;
        return;
    }

    try {
        console.log(`Veritabani hedefi: ${startupSafety.target.label}`);
        await prepareDatabase(startupSafety);
    } catch (err) {
        console.error('Veritabani hazirlama hatasi:', pool.formatError(err));
        if (startupSafety.safeLocalMode) {
            process.exitCode = 1;
            return;
        }
    }

    // Sunucu
    const PORT = process.env.PORT || 5000;
    server.listen(PORT, () => {
        console.log(`NovaStore sunucusu ${PORT} portunda baslatildi.`);
        console.log('Socket.io hazir!');
    });
};

start();
