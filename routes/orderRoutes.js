const express = require('express');
const router = express.Router();
const { createOrder, getAllOrders, getUserOrders, updateOrderStatus, deleteOrder } = require('../controllers/orderController');

router.post('/', createOrder);
router.get('/', getAllOrders);
router.get('/user/:userId', getUserOrders);

// YENİ: Adminin sipariş durumunu güncelleyeceği yol
router.put('/:id/status', updateOrderStatus);
router.delete('/:id', deleteOrder);

module.exports = router;