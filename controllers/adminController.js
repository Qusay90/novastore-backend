const pool = require('../config/db');
const { ORDER_STATUS } = require('../constants/orderStatus');

const getDashboardStats = async (req, res) => {
    try {
        // 1. Toplam Ciro (iptal edilenler haric)
        const revenueResult = await pool.query(
            'SELECT COALESCE(SUM(total_amount), 0) AS total_revenue FROM orders WHERE status != $1',
            [ORDER_STATUS.IPTAL_EDILDI]
        );

        // 2. Toplam Siparis Sayisi
        const ordersCountResult = await pool.query('SELECT COUNT(*) AS total_orders FROM orders');

        // 3. Toplam Urun Sayisi
        const productsCountResult = await pool.query('SELECT COUNT(*) AS total_products FROM products');

        // 4. Toplam Musteri Sayisi
        const usersCountResult = await pool.query("SELECT COUNT(*) AS total_users FROM users WHERE role = 'customer'");

        res.status(200).json({
            totalRevenue: parseFloat(revenueResult.rows[0].total_revenue).toFixed(2),
            totalOrders: parseInt(ordersCountResult.rows[0].total_orders, 10),
            totalProducts: parseInt(productsCountResult.rows[0].total_products, 10),
            totalUsers: parseInt(usersCountResult.rows[0].total_users, 10)
        });
    } catch (err) {
        console.error('Dashboard istatistik hatasi:', err.message);
        res.status(500).json({ error: 'Istatistikler getirilemedi.' });
    }
};

module.exports = { getDashboardStats };
