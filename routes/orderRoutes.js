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

// Guest checkout acik kalir, token varsa controller user'i dogrular
router.post('/', createOrder);

router.get('/', authenticate, requireAdmin, getAllOrders);
router.get('/user/:userId', authenticate, requireSelfOrAdmin('userId'), getUserOrders);

// Kullanici veya admin siparis iptal edebilir (teslim edilmeyen)
router.post('/:id/cancel', authenticate, cancelOrder);

// Admin siparis yonetimi
router.put('/:id/status', authenticate, requireAdmin, updateOrderStatus);
router.delete('/:id', authenticate, requireAdmin, deleteOrder);

module.exports = router;
