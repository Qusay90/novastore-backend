const pool = require('../config/db');

const getDashboardStats = async (req, res) => {
    try {
        // 1. Toplam Ciro (İptal edilenleri sayma)
        const revenueResult = await pool.query("SELECT COALESCE(SUM(total_amount), 0) as total_revenue FROM orders WHERE status != 'İptal Edildi'");

        // 2. Toplam Sipariş Sayısı
        const ordersCountResult = await pool.query("SELECT COUNT(*) as total_orders FROM orders");

        // 3. Toplam Ürün Sayısı
        const productsCountResult = await pool.query("SELECT COUNT(*) as total_products FROM products");

        // 4. Toplam Müşteri Sayısı (Admin hariç tutulabilir ama şimdilik hepsini sayalım)
        const usersCountResult = await pool.query("SELECT COUNT(*) as total_users FROM users");

        res.status(200).json({
            totalRevenue: parseFloat(revenueResult.rows[0].total_revenue).toFixed(2),
            totalOrders: parseInt(ordersCountResult.rows[0].total_orders),
            totalProducts: parseInt(productsCountResult.rows[0].total_products),
            totalUsers: parseInt(usersCountResult.rows[0].total_users)
        });

    } catch (err) {
        console.error("Dashboard istatistik hatası:", err.message);
        res.status(500).json({ error: "İstatistikler getirilemedi." });
    }
};

module.exports = { getDashboardStats };