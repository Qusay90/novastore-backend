const pool = require('../config/db');

const runOrderSupportQuery = async (query, params) => {
    const primary = `
        SELECT o.*, s.tracking_url, s.eta_date, s.shipment_status AS shipment_record_status
        FROM orders o
        LEFT JOIN shipments s ON s.order_id = o.id
        ${query}
    `;
    const fallback = `
        SELECT o.*
        FROM orders o
        ${query}
    `;

    try {
        return await pool.query(primary, params);
    } catch (err) {
        const message = String(err.message || '');
        const isSchemaMismatch = String(err.code || '').startsWith('42') && /(shipments|tracking_url|eta_date|shipment_status)/i.test(message);
        if (!isSchemaMismatch) throw err;
        return pool.query(fallback, params);
    }
};

const parseOrderIdFromMessage = (message) => {
    const match = String(message || '').match(/#?(\d{3,})/);
    return match ? Number(match[1]) : null;
};

const buildOrderSupportAnswer = (order) => {
    const pieces = [`Sipariş #${order.id} durumu: ${order.status || 'bilinmiyor'}.`];

    if (order.payment_status) {
        pieces.push(`Ödeme durumu: ${order.payment_status}.`);
    }
    if (order.shipment_status || order.shipment_record_status) {
        pieces.push(`Kargo durumu: ${order.shipment_status || order.shipment_record_status}.`);
    }
    if (order.tracking_no) {
        pieces.push(`Takip no: ${order.tracking_no}.`);
    }
    if (order.eta_date || order.estimated_delivery_date) {
        pieces.push(`Tahmini teslim: ${(order.eta_date || order.estimated_delivery_date).toString().slice(0, 10)}.`);
    }
    if (order.cancel_reason) {
        pieces.push(`İptal nedeni kaydı: ${order.cancel_reason}.`);
    }
    if (order.refund_status && order.refund_status !== 'NONE') {
        pieces.push(`İade veya geri ödeme durumu: ${order.refund_status}.`);
    }
    if (order.tracking_url) {
        pieces.push('Takip linki sistemde hazır.');
    }

    return pieces.join(' ');
};

const getOrderSupportContext = async ({ user, message }) => {
    if (!user || !Number.isInteger(Number(user.id))) {
        return {
            requiresAuth: true,
            answer: 'Sipariş bilgisi paylaşabilmem için hesabınıza giriş yapmış olmanız gerekiyor.'
        };
    }

    const requestedOrderId = parseOrderIdFromMessage(message);
    let result;

    if (requestedOrderId) {
        result = await runOrderSupportQuery('WHERE o.id = $1 AND o.user_id = $2 LIMIT 1', [requestedOrderId, user.id]);
    } else {
        result = await runOrderSupportQuery('WHERE o.user_id = $1 ORDER BY o.created_at DESC LIMIT 1', [user.id]);
    }

    if (!result.rows.length) {
        return {
            requiresAuth: false,
            answer: requestedOrderId
                ? `Hesabınızda #${requestedOrderId} numaralı bir sipariş bulamadım.`
                : 'Hesabınıza bağlı bir sipariş kaydı göremiyorum.'
        };
    }

    const order = result.rows[0];
    return {
        requiresAuth: false,
        order,
        answer: buildOrderSupportAnswer(order)
    };
};

module.exports = {
    getOrderSupportContext,
    parseOrderIdFromMessage
};
