const express = require('express');
const router = express.Router();
const {
    createOrder,
    getAllOrders,
    getUserOrders,
    updateOrderStatus,
    cancelOrder,
    deleteOrder
} = require('../controllers/orderController');
const { authenticate, requireAdmin, requireSelfOrAdmin } = require('../middlewares/authMiddleware');
const { requireCurrentAdmin, requireCurrentAdminIfClaimed } = require('../middlewares/currentAdmin');

// Legacy direct order creation is disabled; checkout must initialize payment first.
router.post('/', createOrder);

router.get('/', authenticate, requireAdmin, requireCurrentAdmin, getAllOrders);
router.get('/user/:userId', authenticate, requireSelfOrAdmin('userId'), requireCurrentAdminIfClaimed, getUserOrders);

// Kullanici veya admin siparis iptal edebilir (teslim edilmeyen)
router.post('/:id/cancel', authenticate, requireCurrentAdminIfClaimed, cancelOrder);

// Admin siparis yonetimi
router.put('/:id/status', authenticate, requireAdmin, requireCurrentAdmin, updateOrderStatus);
router.delete('/:id', authenticate, requireAdmin, requireCurrentAdmin, deleteOrder);

module.exports = router;
