const pool = require('../config/db');
const { createNotification } = require('./notificationController');

// 1. Yeni Sipariş Oluşturma
const createOrder = async (req, res) => {
    try {
        // userId parametresini de yakalıyoruz
        const { fullName, email, phone, address, totalAmount, cartItems, userId } = req.body;
        const itemsJson = JSON.stringify(cartItems);

        // user_id bilgisini de veritabanına ekliyoruz (Misafirse null olarak kaydedilir)
        const newOrder = await pool.query(
            `INSERT INTO orders 
            (total_amount, status, customer_name, email, phone, address, items, user_id) 
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
            [totalAmount, 'Onay Bekliyor', fullName, email, phone, address, itemsJson, userId || null]
        );

        const orderId = newOrder.rows[0].id;
        const { io } = require('../server');

        // Kullanıcıya sipariş alındı bildirimi
        if (userId) {
            await createNotification(
                userId,
                'order_update',
                `✅ #${orderId} numaralı siparişiniz alındı ve inceleniyor.`,
                io
            );
        }

        // Admin'e yeni sipariş bildirimi
        await createNotification(
            null,
            'new_order',
            `🛒 Yeni sipariş alındı! Sipariş No: #${orderId} — Müşteri: ${fullName}`,
            io
        );

        res.status(201).json({ mesaj: "Siparişiniz başarıyla alındı!", siparisNo: orderId });
    } catch (err) {
        console.error("Sipariş hatası:", err.message);
        res.status(500).json({ error: "Sipariş oluşturulurken bir hata meydana geldi." });
    }
};

// 2. Tüm Siparişleri Getir (Admin İçin)
const getAllOrders = async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM orders ORDER BY created_at DESC');
        res.status(200).json(result.rows);
    } catch (err) {
        res.status(500).json({ error: "Siparişler getirilemedi." });
    }
};

// 3. YENİ: Sadece Belirli Bir Kullanıcının Siparişlerini Getir (Hesabım Sayfası İçin)
const getUserOrders = async (req, res) => {
    try {
        const { userId } = req.params;
        const result = await pool.query('SELECT * FROM orders WHERE user_id = $1 ORDER BY created_at DESC', [userId]);
        res.status(200).json(result.rows);
    } catch (err) {
        res.status(500).json({ error: "Geçmiş siparişler getirilemedi." });
    }
};

// ... önceki kodlar (createOrder, getAllOrders, getUserOrders) aynı kalıyor ...

// 4. YENİ: Sipariş Durumunu Güncelleme (Admin Yetkisi)
const updateOrderStatus = async (req, res) => {
    try {
        const { id } = req.params; // Güncellenecek siparişin numarası
        const { status } = req.body; // Yeni durum (Örn: "Kargoya Verildi")

        const updatedOrder = await pool.query(
            'UPDATE orders SET status = $1 WHERE id = $2 RETURNING *',
            [status, id]
        );

        if (updatedOrder.rows.length === 0) {
            return res.status(404).json({ error: "Sipariş bulunamadı." });
        }

        // Eğer siparişin sahibi varsa, gerçek zamanlı bildirim gönder
        const updatedRow = updatedOrder.rows[0];
        if (updatedRow.user_id) {
            const { io } = require('../server');
            const statusMessages = {
                'Onay Bekliyor': '⏳ Siparişiniz onay bekliyor.',
                'Hazırlanıyor': '📦 Siparişiniz hazırlanıyor.',
                'Kargoya Verildi': '🚚 Siparişiniz kargoya verildi!',
                'Teslim Edildi': '✅ Siparişiniz teslim edildi, keyifli kullanımlar!',
                'İptal Edildi': '❌ Siparişiniz iptal edildi.'
            };
            const msg = statusMessages[status] || `📋 Sipariş #${id} durumu: ${status}`;
            await createNotification(updatedRow.user_id, 'order_update', msg, io);
        }

        res.status(200).json({ mesaj: "Sipariş durumu başarıyla güncellendi!" });
    } catch (err) {
        console.error("Durum güncelleme hatası:", err.message);
        res.status(500).json({ error: "Sipariş durumu güncellenirken hata oluştu." });
    }
};

// 5. YENİ: Sipariş Silme (Admin Yetkisi)
const deleteOrder = async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query('DELETE FROM orders WHERE id = $1 RETURNING *', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Sipariş bulunamadı." });
        }
        res.status(200).json({ mesaj: "Sipariş başarıyla silindi." });
    } catch (err) {
        console.error("Sipariş silme hatası:", err.message);
        res.status(500).json({ error: "Sipariş silinirken hata oluştu." });
    }
};

// Modülleri dışarı aktarırken yeni fonksiyonumuzu da ekliyoruz:
module.exports = { createOrder, getAllOrders, getUserOrders, updateOrderStatus, deleteOrder };