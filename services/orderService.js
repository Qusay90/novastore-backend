const pool = require('../config/db');
const { calculatePricing, round2 } = require('./pricingService');
const { syncCategoryStatsForProducts } = require('./categoryStatsService');
const { ORDER_STATUS, PAYMENT_STATUS, REFUND_STATUS, SHIPMENT_STATUS, resolveOrderStatus } = require('../constants/orderStatus');
const {
    STOCK_RESERVATION_STATE,
    OrderLifecycleError,
    getStockReservationState
} = require('./orderLifecyclePolicy');

const PUBLIC_CANCELLATION_REASONS = Object.freeze({
    CUSTOMER_REQUEST: 'Müşteri talebi',
    DUPLICATE_ORDER: 'Mükerrer sipariş',
    INVENTORY_UNAVAILABLE: 'Stok veya tedarik engeli',
    DELIVERY_ADDRESS_UNRESOLVED: 'Teslimat adresi çözülemedi',
    POLICY_OR_FRAUD_REVIEW: 'Güvenlik veya politika incelemesi'
});

const getPublicCancellationReason = (reasonCode) => (
    PUBLIC_CANCELLATION_REASONS[String(reasonCode || '').trim().toUpperCase()]
    || 'Sipariş iptal edildi'
);

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
    const changedProductIds = [];
    for (const item of pricedItems) {
        const updateResult = await client.query(
            `UPDATE products
             SET stock = stock - $1,
                 revision = revision + 1,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $2 AND stock >= $1
             RETURNING id, stock`,
            [item.quantity, item.id]
        );

        if (updateResult.rows.length === 0) {
            throw new Error(`Stok yetersiz: ${item.name}`);
        }
        changedProductIds.push(item.id);
    }
    await syncCategoryStatsForProducts(client, changedProductIds);
};

const restockItems = async (client, items) => {
    if (!Array.isArray(items)) return;

    const changedProductIds = [];
    for (const item of items) {
        const productId = Number(item.id || item.product_id || item.productId);
        const quantity = Number(item.quantity || 0);

        if (!Number.isInteger(productId) || quantity <= 0) continue;

        await client.query(
            `UPDATE products
             SET stock = stock + $1,
                 revision = revision + 1,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $2`,
            [quantity, productId]
        );
        changedProductIds.push(productId);
    }
    await syncCategoryStatsForProducts(client, changedProductIds);
};

const releaseStockReservation = async ({ client = pool, payment, items, reasonCode }) => {
    if (!payment || !Number.isInteger(Number(payment.id))) {
        throw new OrderLifecycleError('Stok rezervasyonuna bağlı ödeme kaydı geçersiz.', {
            code: 'ORDER_STOCK_RESERVATION_PAYMENT_INVALID'
        });
    }
    if (getStockReservationState(payment) !== STOCK_RESERVATION_STATE.RESERVED) {
        throw new OrderLifecycleError('Aktif stok rezervasyonu doğrulanamadı.', {
            code: 'ORDER_STOCK_RESERVATION_NOT_ACTIVE'
        });
    }

    const parsedItems = Array.isArray(items) ? items : [];
    if (parsedItems.length === 0) {
        throw new OrderLifecycleError('Stok serbest bırakma için sipariş satırı bulunamadı.', {
            code: 'ORDER_STOCK_RELEASE_ITEMS_INVALID'
        });
    }

    const normalizedItems = parsedItems.map((item) => ({
        productId: Number(item?.id ?? item?.product_id ?? item?.productId),
        quantity: Number(item?.quantity)
    }));
    if (normalizedItems.some(({ productId, quantity }) => (
        !Number.isInteger(productId) || productId <= 0 || !Number.isInteger(quantity) || quantity <= 0
    ))) {
        throw new OrderLifecycleError('Sipariş satırları stok serbest bırakma için güvenli değil.', {
            code: 'ORDER_STOCK_RELEASE_ITEMS_INVALID'
        });
    }

    const changedProductIds = [];
    for (const item of normalizedItems) {
        const result = await client.query(
            `UPDATE products
             SET stock = stock + $1,
                 revision = revision + 1,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $2
             RETURNING id, stock`,
            [item.quantity, item.productId]
        );
        if (result.rows.length !== 1) {
            throw new OrderLifecycleError('Stok serbest bırakılacak ürün bulunamadı.', {
                code: 'ORDER_STOCK_RELEASE_PRODUCT_MISSING',
                details: { productId: item.productId }
            });
        }
        changedProductIds.push(item.productId);
    }
    await syncCategoryStatsForProducts(client, changedProductIds);

    const releaseMetadata = {
        stockReserved: false,
        stockReleasedAt: new Date().toISOString(),
        stockReleaseReason: String(reasonCode || 'ORDER_CANCELLED'),
        stockReleaseCommand: 'cancel'
    };
    const paymentUpdate = await client.query(
        `UPDATE payments
         SET raw_request = COALESCE(raw_request, '{}'::jsonb) || $1::jsonb,
             updated_at = NOW()
         WHERE id = $2
         RETURNING id`,
        [JSON.stringify(releaseMetadata), Number(payment.id)]
    );
    if (paymentUpdate.rows.length !== 1) {
        throw new OrderLifecycleError('Stok rezervasyonu ödeme kaydına işlenemedi.', {
            code: 'ORDER_STOCK_RELEASE_PAYMENT_UPDATE_FAILED'
        });
    }

    return Object.freeze({
        paymentId: Number(payment.id),
        productCount: changedProductIds.length,
        releasedAt: releaseMetadata.stockReleasedAt
    });
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

const normalizeOrderItemSnapshots = (items) => {
    if (!Array.isArray(items)) {
        return { snapshots: [], invalidCount: 1 };
    }

    const snapshots = [];
    let invalidCount = 0;
    items.forEach((item, index) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
            invalidCount += 1;
            return;
        }
        const productId = Number(item.id ?? item.product_id ?? item.productId);
        const quantity = Number(item.quantity);
        const unitPrice = Number(item.price ?? item.unit_price ?? item.unitPrice ?? 0);
        if (!Number.isInteger(quantity) || quantity <= 0) {
            invalidCount += 1;
            return;
        }
        snapshots.push({
            source_item_index: index,
            product_id: Number.isInteger(productId) && productId > 0 ? productId : null,
            product_name: String(item.name || item.product_name || 'Legacy product').trim().slice(0, 255) ||
                'Legacy product',
            quantity,
            unit_price: Number.isFinite(unitPrice) && unitPrice >= 0 ? round2(unitPrice) : 0
        });
    });
    return { snapshots, invalidCount };
};

const syncOrderItemsForOrder = async (client, orderId, items, { issueReason = 'live_sync_unreadable' } = {}) => {
    const parsedOrderId = Number(orderId);
    if (!Number.isInteger(parsedOrderId) || parsedOrderId <= 0) {
        throw new Error('Order item sync için geçerli order id zorunludur.');
    }
    const { snapshots, invalidCount } = normalizeOrderItemSnapshots(items);
    let syncedCount = 0;

    if (snapshots.length > 0) {
        const result = await client.query(`
            INSERT INTO order_items (
                order_id,
                product_id,
                product_name,
                quantity,
                unit_price,
                total_price,
                source_item_index,
                created_at
            )
            SELECT
                customer_order.id,
                product.id,
                snapshot.product_name,
                snapshot.quantity,
                snapshot.unit_price,
                snapshot.quantity * snapshot.unit_price,
                snapshot.source_item_index,
                COALESCE(customer_order.created_at, CURRENT_TIMESTAMP)
            FROM jsonb_to_recordset($2::jsonb) AS snapshot(
                source_item_index INTEGER,
                product_id INTEGER,
                product_name TEXT,
                quantity INTEGER,
                unit_price NUMERIC
            )
            JOIN orders customer_order ON customer_order.id = $1
            LEFT JOIN products product ON product.id = snapshot.product_id
            ON CONFLICT (order_id, source_item_index) DO UPDATE
            SET product_id = EXCLUDED.product_id,
                product_name = EXCLUDED.product_name,
                quantity = EXCLUDED.quantity,
                unit_price = EXCLUDED.unit_price,
                total_price = EXCLUDED.total_price
            RETURNING id
        `, [parsedOrderId, JSON.stringify(snapshots)]);
        syncedCount = result.rowCount ?? result.rows.length;
    }

    if (invalidCount > 0) {
        await client.query(`
            INSERT INTO order_item_backfill_issues (order_id, reason, source_items)
            VALUES ($1, $2, $3::jsonb)
            ON CONFLICT (order_id) DO UPDATE
            SET reason = EXCLUDED.reason,
                source_items = EXCLUDED.source_items,
                recorded_at = CURRENT_TIMESTAMP
        `, [parsedOrderId, issueReason, JSON.stringify(items ?? null)]);
    }

    return {
        order_id: parsedOrderId,
        source_count: Array.isArray(items) ? items.length : 0,
        synced_count: syncedCount,
        invalid_count: invalidCount
    };
};

const reconcileOrderItemsForOrder = async (client, orderId) => {
    const parsedOrderId = Number(orderId);
    if (!Number.isInteger(parsedOrderId) || parsedOrderId <= 0) {
        throw new Error('Reconciliation için geçerli order id zorunludur.');
    }
    const orderResult = await client.query(`
        SELECT id, items, payment_status, status
        FROM orders
        WHERE id = $1
        FOR UPDATE
    `, [parsedOrderId]);
    if (orderResult.rows.length === 0) {
        const error = new Error('Reconciliation siparişi bulunamadı.');
        error.statusCode = 404;
        throw error;
    }
    const order = orderResult.rows[0];
    if (order.payment_status !== PAYMENT_STATUS.PAID) {
        return {
            order_id: parsedOrderId,
            reconciled: false,
            reason: 'order_not_paid',
            synced_count: 0,
            invalid_count: 0
        };
    }
    const result = await syncOrderItemsForOrder(client, parsedOrderId, parseItems(order), {
        issueReason: 'reconciliation_unreadable'
    });
    return {
        ...result,
        reconciled: true
    };
};

const createOrderWithReservation = async ({
    client = pool,
    userId = null,
    analyticsSessionKey = null,
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
             payment_method, refund_status, shipment_status, currency, analytics_session_key)
         VALUES
            ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $12, $13, $14)
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
            pricing.totals.currency,
            analyticsSessionKey
        ]
    );

    const order = orderInsert.rows[0];

    await appendOrderEvent(client, order.id, 'ORDER_CREATED', 'Sipariş oluşturuldu.', {
        analyticsSessionKey,
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

const createPendingPaymentOrder = async ({
    client = pool,
    userId = null,
    analyticsSessionKey = null,
    fullName,
    email,
    phone,
    address,
    cartItems,
    couponCode = null,
    paymentMethod = 'card'
}) => {
    const pricing = await calculatePricing({ cartItems, couponCode, client });

    const paymentStatus = paymentMethod === 'havale'
        ? PAYMENT_STATUS.WAITING_TRANSFER
        : PAYMENT_STATUS.REQUIRES_ACTION;

    const orderInsert = await client.query(
        `INSERT INTO orders
            (user_id, total_amount, status, customer_name, email, phone, address, items, payment_status,
             payment_method, refund_status, shipment_status, currency, analytics_session_key)
         VALUES
            ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $12, $13, $14)
         RETURNING *`,
        [
            userId,
            round2(pricing.totals.total),
            ORDER_STATUS.ODEME_BEKLIYOR,
            fullName,
            email,
            phone,
            extractAddressText(address),
            JSON.stringify(pricing.items),
            paymentStatus,
            paymentMethod,
            REFUND_STATUS.NONE,
            SHIPMENT_STATUS.NONE,
            pricing.totals.currency,
            analyticsSessionKey
        ]
    );

    const order = orderInsert.rows[0];

    await appendOrderEvent(client, order.id, 'PAYMENT_INTENT_CREATED', 'Ödeme bekleyen ara kayıt oluşturuldu.', {
        analyticsSessionKey,
        paymentMethod,
        totals: pricing.totals,
        campaigns: pricing.campaigns,
        coupon: pricing.coupon,
        stockReserved: false
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
    refundStatus = REFUND_STATUS.PENDING,
    stockRelease = null,
    actor = null,
    idempotencyKey = null,
    requestFingerprint = null
}) => {
    const cancelledStatus = ORDER_STATUS.IPTAL_EDILDI;
    const beforeStatus = resolveOrderStatus(order?.status) || order?.status || null;
    const beforeRefundStatus = order?.refund_status || REFUND_STATUS.NONE;
    const normalizedActor = actor && typeof actor === 'object'
        ? {
            id: Number.isInteger(Number(actor.id)) ? Number(actor.id) : null,
            role: String(actor.role || 'unknown')
        }
        : { id: null, role: 'unknown' };

    await client.query(
        `UPDATE orders
         SET status = $1,
             cancel_reason = $2,
             refund_status = $3,
             updated_at = NOW()
         WHERE id = $4`,
        [cancelledStatus, getPublicCancellationReason(reasonCode), refundStatus, order.id]
    );

    await appendOrderEvent(client, order.id, 'ORDER_CANCELLED', 'Sipariş iptal edildi.', {
        reasonCode,
        note,
        refundStatus,
        stockRelease,
        command: 'cancel',
        idempotencyKey,
        requestFingerprint,
        actor: normalizedActor,
        before: {
            status: beforeStatus,
            refundStatus: beforeRefundStatus
        },
        after: {
            status: cancelledStatus,
            refundStatus
        },
        providerRefund: {
            executed: false,
            manualReviewRequired: refundStatus === REFUND_STATUS.PENDING
        }
    });

    return cancelledStatus;
};

module.exports = {
    appendOrderEvent,
    getPublicCancellationReason,
    parseItems,
    normalizeOrderItemSnapshots,
    syncOrderItemsForOrder,
    reconcileOrderItemsForOrder,
    reserveStock,
    restockItems,
    releaseStockReservation,
    createPendingPaymentOrder,
    createOrderWithReservation,
    markOrderCancelled
};
