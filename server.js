require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { simpleRateLimit, sanitizeBody } = require('./middlewares/securityMiddleware');

const app = express();
const server = http.createServer(app);

const parseAllowedOrigins = () => {
    const raw = process.env.CLIENT_ORIGIN || '*';
    if (raw === '*') return '*';
    return raw.split(',').map((o) => o.trim()).filter(Boolean);
};

const allowedOrigins = parseAllowedOrigins();
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


const questionRoutes = require('./routes/questionRoutes');
app.use('/api/questions', questionRoutes);

const merchantRoutes = require('./routes/merchantRoutes');
app.use('/api/merchant', merchantRoutes);
app.use('/merchant', merchantRoutes);

// Veritabani tablolari
const createNotificationsTable = require('./models/createNotificationDb');
const createCommerceSchema = require('./models/createCommerceDb');

(async () => {
    try {
        await createNotificationsTable();
        await createCommerceSchema();
    } catch (err) {
        console.error('Veritabani hazirlama hatasi:', err.message);
    }
})();

// Sunucu
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`NovaStore sunucusu ${PORT} portunda baslatildi.`);
    console.log('Socket.io hazir!');
});


