const pool = require('../config/db');
const { calculatePricing, round2 } = require('./pricingService');
const { ORDER_STATUS, PAYMENT_STATUS, REFUND_STATUS, SHIPMENT_STATUS, resolveOrderStatus } = require('../constants/orderStatus');

const extractAddressText = (address) => {
    if (!address) return '';
    if (typeof address === 'string') return address;

    const title = address.title ? `${address.title}: ` : '';
    const detail = [address.detail, address.district, address.city].filter(Boolean).join(', ');
    return `${title}${detail}`.trim();
};

const appendOrderEvent = async (client, orderId, eventType, message, payload = null) => {
    await client.query(
        `INSERT INTO order_events (order_id, event_type, message, payload)
         VALUES ($1, $2, $3, $4::jsonb)`,
        [orderId, eventType, message, payload ? JSON.stringify(payload) : null]
    );
};

const reserveStock = async (client, pricedItems) => {
    for (const item of pricedItems) {
        const updateResult = await client.query(
            `UPDATE products
             SET stock = stock - $1
             WHERE id = $2 AND stock >= $1
             RETURNING id, stock`,
            [item.quantity, item.id]
        );

        if (updateResult.rows.length === 0) {
            throw new Error(`Stok yetersiz: ${item.name}`);
        }
    }
};

const restockItems = async (client, items) => {
    if (!Array.isArray(items)) return;

    for (const item of items) {
        const productId = Number(item.id || item.product_id);
        const quantity = Number(item.quantity || 0);

        if (!Number.isInteger(productId) || quantity <= 0) continue;

        await client.query(
            'UPDATE products SET stock = stock + $1 WHERE id = $2',
            [quantity, productId]
        );
    }
};

const parseItems = (orderRow) => {
    if (!orderRow || !orderRow.items) return [];
    if (Array.isArray(orderRow.items)) return orderRow.items;

    try {
        return JSON.parse(orderRow.items);
    } catch (_) {
        return [];
    }
};

const createOrderWithReservation = async ({
    client = pool,
    userId = null,
    fullName,
    email,
    phone,
    address,
    cartItems,
    couponCode = null,
    paymentMethod = 'card'
}) => {
    const pricing = await calculatePricing({ cartItems, couponCode, client });

    await reserveStock(client, pricing.items);

    const paymentStatus = paymentMethod === 'havale'
        ? PAYMENT_STATUS.WAITING_TRANSFER
        : PAYMENT_STATUS.REQUIRES_ACTION;

    const orderInsert = await client.query(
        `INSERT INTO orders
            (user_id, total_amount, status, customer_name, email, phone, address, items, payment_status,
             payment_method, refund_status, shipment_status, currency)
         VALUES
            ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $12, $13)
         RETURNING *`,
        [
            userId,
            round2(pricing.totals.total),
            ORDER_STATUS.ONAY_BEKLIYOR,
            fullName,
            email,
            phone,
            extractAddressText(address),
            JSON.stringify(pricing.items),
            paymentStatus,
            paymentMethod,
            REFUND_STATUS.NONE,
            SHIPMENT_STATUS.NONE,
            pricing.totals.currency
        ]
    );

    const order = orderInsert.rows[0];

    await appendOrderEvent(client, order.id, 'ORDER_CREATED', 'Siparis olusturuldu.', {
        paymentMethod,
        totals: pricing.totals,
        campaigns: pricing.campaigns,
        coupon: pricing.coupon
    });

    return {
        order,
        pricing
    };
};

const markOrderCancelled = async ({
    client = pool,
    order,
    reasonCode,
    note = '',
    refundStatus = REFUND_STATUS.PENDING
}) => {
    const cancelledStatus = ORDER_STATUS.IPTAL_EDILDI;
    const parsedItems = parseItems(order);

    await client.query(
        `UPDATE orders
         SET status = $1,
             cancel_reason = $2,
             refund_status = $3,
             updated_at = NOW()
         WHERE id = $4`,
        [cancelledStatus, `${reasonCode}${note ? ` - ${note}` : ''}`, refundStatus, order.id]
    );

    await restockItems(client, parsedItems);

    await appendOrderEvent(client, order.id, 'ORDER_CANCELLED', 'Siparis iptal edildi.', {
        reasonCode,
        note,
        refundStatus
    });

    return cancelledStatus;
};

const updateOrderStatus = async ({ client = pool, orderId, status, shipmentStatus = null }) => {
    const resolvedStatus = resolveOrderStatus(status);
    if (!resolvedStatus) {
        throw new Error('Gecersiz siparis durumu.');
    }

    const updateResult = await client.query(
        `UPDATE orders
         SET status = $1,
             shipment_status = COALESCE($2, shipment_status),
             updated_at = NOW()
         WHERE id = $3
         RETURNING *`,
        [resolvedStatus, shipmentStatus, orderId]
    );

    if (updateResult.rows.length === 0) {
        throw new Error('Siparis bulunamadi.');
    }

    await appendOrderEvent(client, orderId, 'ORDER_STATUS_UPDATED', `Siparis durumu guncellendi: ${resolvedStatus}`, {
        status: resolvedStatus,
        shipmentStatus
    });

    return updateResult.rows[0];
};

module.exports = {
    appendOrderEvent,
    parseItems,
    restockItems,
    createOrderWithReservation,
    markOrderCancelled,
    updateOrderStatus
};
