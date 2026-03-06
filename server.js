require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);

// ─── Socket.io Kurulumu ───────────────────────────────
const io = new Server(server, {
    cors: { origin: '*' }
});

// io'yu diğer modüllerin kullanabilmesi için export ediyoruz
module.exports.io = io;

io.on('connection', (socket) => {
    console.log(`🔔 Socket bağlantısı kuruldu: ${socket.id}`);

    // Kullanıcı kendi odasına veya yöneticiler admin_room'a katılır
    socket.on('join_room', (room) => {
        socket.join(room);
        console.log(`📌 Socket ${socket.id} → ${room} odasına katıldı`);
    });

    // Anlık Mesajlaşma (Live Chat) Dinleyicisi
    socket.on('send_message', (data) => {
        // data = { sender_id, receiver_id, message, senderRole }
        // Admin'e gidiyorsa 'admin_room' a gönder, Müşteriye gidiyorsa 'user_<receiver_id>' ye gönder
        const targetRoom = data.receiver_id === 1 ? 'admin_room' : `user_${data.receiver_id}`;
        io.to(targetRoom).emit('receive_message', data);

        // Gönderenin UI'ını güncellemesi için kendi odasına da yayınlıyoruz (isteğe bağlı)
        const senderRoom = data.sender_id === 1 ? 'admin_room' : `user_${data.sender_id}`;
        // io.to(senderRoom).emit('receive_message', data); // (UI'dan kendisi eklemiyorsa eklenebilir)
    });

    socket.on('disconnect', () => {
        console.log(`🔌 Socket bağlantısı kesildi: ${socket.id}`);
    });
});

// ─── Middleware ───────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'frontend')));

// ─── Temel Rota ──────────────────────────────────────
app.get('/', (req, res) => {
    res.json({ mesaj: 'NovaStore API Başarıyla Çalışıyor! 🚀', durum: 'Aktif' });
});

// ─── API Rotaları ─────────────────────────────────────
const productRoutes = require('./routes/productRoutes');
app.use('/api/products', productRoutes);

const orderRoutes = require('./routes/orderRoutes');
app.use('/api/orders', orderRoutes);

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

// Bildirim Rotaları
const notificationRoutes = require('./routes/notificationRoutes');
app.use('/api/notifications', notificationRoutes);

// Canlı Destek (Mesajlaşma) Rotaları
const messageRoutes = require('./routes/messageRoutes');
app.use('/api/messages', messageRoutes);

// Ürün Soru & Cevap Rotaları (Satıcıya Sor)
const questionRoutes = require('./routes/questionRoutes');
app.use('/api/questions', questionRoutes);

// ─── Veritabanı Tablolarını Hazırla ──────────────────
const createNotificationsTable = require('./models/createNotificationDb');
createNotificationsTable();

// ─── Sunucuyu Başlat ──────────────────────────────────
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`🌟 NovaStore Sunucusu ${PORT} portunda başarıyla başlatıldı.`);
    console.log(`🔔 Socket.io hazır!`);
});