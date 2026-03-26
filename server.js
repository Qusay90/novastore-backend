require('dotenv').config({ quiet: true });
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { simpleRateLimit, sanitizeBody } = require('./middlewares/securityMiddleware');
const pool = require('./config/db');
const { getAllowedOrigins } = require('./config/appConfig');

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

io.on('connection', (socket) => {
    console.log(`Socket baglantisi kuruldu: ${socket.id}`);

    socket.on('join_room', (room) => {
        socket.join(room);
        console.log(`Socket ${socket.id} -> ${room} odasina katildi`);
    });

    socket.on('send_message', (data) => {
        const isAdminTarget = data.receiver_role === 'admin' || data.receiver_id === 1 || data.receiver_id === 'admin';
        const targetRoom = isAdminTarget ? 'admin_room' : `user_${data.receiver_id}`;
        io.to(targetRoom).emit('receive_message', data);
    });

    socket.on('disconnect', () => {
        console.log(`Socket baglantisi kesildi: ${socket.id}`);
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

const orderRoutes = require('./routes/orderRoutes');
app.use('/api/orders', orderRoutes);

const paymentRoutes = require('./routes/paymentRoutes');
app.use('/api/payments', paymentRoutes);

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

const adminRoutes = require('./routes/adminRoutes');
app.use('/api/admin', adminRoutes);

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

(async () => {
    try {
        await pool.query('SELECT 1');
        console.log(`Veritabani baglantisi dogrulandi: ${pool.getTargetLabel()}`);
        await createCoreSchema();
        await createNotificationsTable();
        await createCommerceSchema();
        await createAnalyticsSchema();
    } catch (err) {
        console.error('Veritabani hazirlama hatasi:', pool.formatError(err));
    }
})();

// Sunucu
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`NovaStore sunucusu ${PORT} portunda baslatildi.`);
    console.log('Socket.io hazir!');
});
