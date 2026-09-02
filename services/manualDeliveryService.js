'use strict';

const pool = require('../config/db');
const {
    ORDER_STATUS,
    PAYMENT_STATUS,
    REFUND_STATUS,
    SHIPMENT_STATUS,
    resolveOrderStatus
} = require('../constants/orderStatus');
const { appendOrderEvent } = require('./orderService');
const { EVENT } = require('./notificationEventCatalog');
const { enqueueNotificationEvent } = require('./notificationOutboxService');
const {
    ManualDeliveryError,
    buildManualDeliveryEventPayload,
    normalizeManualDeliveryCommand,
    planManualDelivery,
    validateManualDeliveryReplay
} = require('./manualDeliveryPolicy');

const fetchDeliveryOrderForUpdate = async (client, orderId) => {
    const result = await client.query(
        `SELECT id,
                user_id,
                status,
                payment_status,
                refund_status,
                shipment_status,
                shipment_provider,
                tracking_no,
                delivered_at
         FROM orders
         WHERE id = $1
         FOR UPDATE`,
        [orderId]
    );
    return result.rows?.[0] || null;
};

const fetchDeliveryShipmentForUpdate = async (client, orderId) => {
    const result = await client.query(
        `SELECT id,
                order_id,
                provider,
                tracking_no,
                tracking_url,
                shipment_status,
                eta_date,
                label_url,
                raw_payload,
                created_at,
                updated_at
         FROM shipments
         WHERE order_id = $1
         FOR UPDATE`,
        [orderId]
    );
    return result.rows?.[0] || null;
};

const fetchLatestManualDeliveryEvent = async (client, orderId) => {
    const result = await client.query(
        `SELECT payload
         FROM order_events
         WHERE order_id = $1
           AND event_type = 'MANUAL_DELIVERY_CONFIRMED'
         ORDER BY id DESC
         LIMIT 1`,
        [orderId]
    );
    return result.rows?.[0]?.payload || null;
};

const sellerProjectionLockError = () => new ManualDeliveryError(
    'Satıcı fulfillment kaydı başka bir işlem tarafından güncelleniyor.',
    {
        code: 'MANUAL_DELIVERY_SELLER_FULFILLMENT_BUSY',
        details: { refetchRequired: true }
    }
);

const fetchSellerDeliveryProjectionForUpdate = async (client, orderId) => {
    try {
        const orderResult = await client.query(
            `SELECT id,
                    organization_id,
                    store_id,
                    status,
                    revision
             FROM seller_orders
             WHERE canonical_order_id = $1
             ORDER BY organization_id, id
             FOR UPDATE NOWAIT`,
            [orderId]
        );
        const sellerOrders = Array.isArray(orderResult.rows) ? orderResult.rows : [];
        if (sellerOrders.length > 1) {
            throw new ManualDeliveryError('Çok satıcılı sipariş manuel teslim doğrulamasıyla kapatılamaz.', {
                code: 'MANUAL_DELIVERY_MULTI_SELLER_UNSUPPORTED',
                details: { sellerOrderCount: sellerOrders.length, refetchRequired: true }
            });
        }
        if (sellerOrders.length === 0) {
            return Object.freeze({ sellerOrder: null, packages: Object.freeze([]) });
        }

        const sellerOrder = sellerOrders[0];
        const packageResult = await client.query(
            `SELECT id,
                    organization_id,
                    store_id,
                    seller_order_id,
                    status,
                    carrier_name,
                    tracking_number,
                    revision
             FROM seller_fulfillment_packages
             WHERE organization_id = $1
               AND seller_order_id = $2
             ORDER BY id
             FOR UPDATE NOWAIT`,
            [sellerOrder.organization_id, sellerOrder.id]
        );
        return Object.freeze({
            sellerOrder: Object.freeze({ ...sellerOrder }),
            packages: Object.freeze((packageResult.rows || []).map((row) => Object.freeze({ ...row })))
        });
    } catch (error) {
        if (error?.code === '55P03') throw sellerProjectionLockError();
        throw error;
    }
};

const assessSellerDeliveryProjection = ({ projection, command, finalState = false }) => {
    const { sellerOrder, packages } = projection;
    if (!sellerOrder) {
        return Object.freeze({
            matchedCount: 0,
            packageCount: 0,
            consistent: true,
            changed: false
        });
    }
    if (packages.length !== 1) {
        throw new ManualDeliveryError('Satıcı siparişinin tekil fulfillment paketi doğrulanamadı.', {
            code: 'MANUAL_DELIVERY_SELLER_PACKAGE_CARDINALITY_CONFLICT',
            details: { packageCount: packages.length, refetchRequired: true }
        });
    }

    const expectedStatus = finalState ? 'delivered' : 'shipped';
    const sellerStatusMatches = String(sellerOrder.status || '').trim().toLowerCase() === expectedStatus;
    const packagesMatch = packages.every((pkg) => (
        String(pkg.status || '').trim().toLowerCase() === expectedStatus
        && String(pkg.carrier_name || '').trim() === command.provider
        && String(pkg.tracking_number || '').trim() === command.trackingNo
    ));
    if (!sellerStatusMatches || !packagesMatch) {
        throw new ManualDeliveryError('Satıcı fulfillment durumu kanonik gönderiyle eşleşmiyor.', {
            code: 'MANUAL_DELIVERY_SELLER_STATE_CONFLICT',
            details: { refetchRequired: true }
        });
    }
    return Object.freeze({
        matchedCount: 1,
        packageCount: packages.length,
        consistent: true,
        changed: !finalState
    });
};

const serializeDeliveryOrder = (order = {}) => ({
    id: Number(order.id),
    status: order.status,
    paymentStatus: order.payment_status,
    refundStatus: order.refund_status,
    shipmentStatus: order.shipment_status,
    shipmentProvider: order.shipment_provider,
    trackingNo: order.tracking_no,
    deliveredAt: order.delivered_at || null
});

const serializeDeliveryShipment = (shipment = {}) => ({
    id: Number(shipment.id),
    orderId: Number(shipment.order_id),
    provider: shipment.provider,
    trackingNo: shipment.tracking_no,
    trackingUrl: shipment.tracking_url || null,
    shipmentStatus: shipment.shipment_status,
    etaDate: shipment.eta_date || null,
    labelUrl: shipment.label_url || null
});

const recordManualDelivery = async ({ orderId, idempotencyKey, body, actor }) => {
    const command = normalizeManualDeliveryCommand({ orderId, idempotencyKey, body, actor });
    const client = await pool.connect();
    let transactionStarted = false;
    let transactionCommitted = false;
    try {
        await client.query('BEGIN');
        transactionStarted = true;

        const order = await fetchDeliveryOrderForUpdate(client, command.orderId);
        if (!order) {
            throw new ManualDeliveryError('Sipariş bulunamadı.', {
                code: 'MANUAL_DELIVERY_ORDER_NOT_FOUND',
                statusCode: 404
            });
        }
        const shipment = await fetchDeliveryShipmentForUpdate(client, command.orderId);
        const sellerProjection = await fetchSellerDeliveryProjectionForUpdate(client, command.orderId);

        if (resolveOrderStatus(order.status) === ORDER_STATUS.TESLIM_EDILDI) {
            const sellerSummary = assessSellerDeliveryProjection({
                projection: sellerProjection,
                command,
                finalState: true
            });
            const eventPayload = await fetchLatestManualDeliveryEvent(client, command.orderId);
            validateManualDeliveryReplay({
                order,
                shipment,
                eventPayload,
                command,
                sellerProjection: sellerSummary
            });
            await client.query('COMMIT');
            transactionCommitted = true;
            return {
                reused: true,
                userId: Number(order.user_id) || null,
                order: serializeDeliveryOrder(order),
                shipment: serializeDeliveryShipment(shipment),
                sellerProjection: sellerSummary
            };
        }

        const plan = planManualDelivery({ order, shipment, command });
        const sellerSummary = assessSellerDeliveryProjection({
            projection: sellerProjection,
            command,
            finalState: false
        });

        const shipmentUpdate = await client.query(
            `UPDATE shipments
             SET shipment_status = $1,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $2
               AND order_id = $3
               AND shipment_status = $4
               AND provider = $5
               AND tracking_no = $6
             RETURNING id,
                       order_id,
                       provider,
                       tracking_no,
                       tracking_url,
                       shipment_status,
                       eta_date,
                       label_url,
                       raw_payload,
                       created_at,
                       updated_at`,
            [
                plan.nextShipmentStatus,
                shipment.id,
                command.orderId,
                command.expectedShipmentStatus,
                command.provider,
                command.trackingNo
            ]
        );
        if (shipmentUpdate.rows?.length !== 1) {
            throw new ManualDeliveryError('Gönderi teslim durumuna geçirilemedi.', {
                code: 'MANUAL_DELIVERY_SHIPMENT_UPDATE_CONFLICT',
                details: { refetchRequired: true }
            });
        }

        if (sellerProjection.sellerOrder) {
            const packageUpdate = await client.query(
                `UPDATE seller_fulfillment_packages
                 SET status = 'delivered',
                     revision = revision + 1,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE organization_id = $1
                   AND seller_order_id = $2
                   AND status = 'shipped'
                   AND carrier_name = $3
                   AND tracking_number = $4
                 RETURNING id`,
                [
                    sellerProjection.sellerOrder.organization_id,
                    sellerProjection.sellerOrder.id,
                    command.provider,
                    command.trackingNo
                ]
            );
            if (packageUpdate.rows?.length !== sellerProjection.packages.length) {
                throw new ManualDeliveryError('Satıcı fulfillment paketi teslim durumuna geçirilemedi.', {
                    code: 'MANUAL_DELIVERY_SELLER_PACKAGE_UPDATE_CONFLICT',
                    details: { refetchRequired: true }
                });
            }
            const sellerOrderUpdate = await client.query(
                `UPDATE seller_orders
                 SET status = 'delivered',
                     revision = revision + 1,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE canonical_order_id = $1
                   AND organization_id = $2
                   AND id = $3
                   AND revision = $4
                   AND status = 'shipped'
                 RETURNING revision`,
                [
                    command.orderId,
                    sellerProjection.sellerOrder.organization_id,
                    sellerProjection.sellerOrder.id,
                    sellerProjection.sellerOrder.revision
                ]
            );
            if (sellerOrderUpdate.rows?.length !== 1) {
                throw new ManualDeliveryError('Satıcı siparişi teslim durumuna geçirilemedi.', {
                    code: 'MANUAL_DELIVERY_SELLER_ORDER_UPDATE_CONFLICT',
                    details: { refetchRequired: true }
                });
            }
            await client.query(
                `INSERT INTO seller_order_transitions
                    (organization_id, store_id, seller_order_id, package_id,
                     from_status, to_status, command, idempotency_key)
                 VALUES ($1, $2, $3, $4, 'shipped', 'delivered', 'delivery_confirm', $5)`,
                [
                    sellerProjection.sellerOrder.organization_id,
                    sellerProjection.sellerOrder.store_id,
                    sellerProjection.sellerOrder.id,
                    sellerProjection.packages[0].id,
                    command.idempotencyKey
                ]
            );
        }

        const orderUpdate = await client.query(
            `UPDATE orders
             SET status = $1,
                 shipment_status = $2,
                 delivered_at = CURRENT_TIMESTAMP,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $3
               AND status = $4
               AND shipment_status = $5
               AND payment_status = $6
               AND refund_status = $7
               AND shipment_provider = $8
               AND tracking_no = $9
             RETURNING id,
                       user_id,
                       status,
                       payment_status,
                       refund_status,
                       shipment_status,
                       shipment_provider,
                       tracking_no,
                       delivered_at`,
            [
                plan.nextOrderStatus,
                plan.nextShipmentStatus,
                command.orderId,
                command.expectedStatus,
                command.expectedShipmentStatus,
                PAYMENT_STATUS.PAID,
                REFUND_STATUS.NONE,
                command.provider,
                command.trackingNo
            ]
        );
        if (orderUpdate.rows?.length !== 1) {
            throw new ManualDeliveryError('Sipariş teslim durumuna geçirilemedi.', {
                code: 'MANUAL_DELIVERY_ORDER_UPDATE_CONFLICT',
                details: { refetchRequired: true }
            });
        }
        const updatedOrder = orderUpdate.rows[0];
        const updatedShipment = shipmentUpdate.rows[0];
        const eventPayload = buildManualDeliveryEventPayload({
            command,
            sellerProjection: sellerSummary
        });
        await appendOrderEvent(
            client,
            command.orderId,
            'MANUAL_DELIVERY_CONFIRMED',
            'Manuel teslim doğrulaması kaydedildi.',
            eventPayload
        );
        await enqueueNotificationEvent(client, {
            eventType: EVENT.ORDER_DELIVERED,
            aggregateType: 'order',
            aggregateId: command.orderId,
            sourceEventKey: `ORDER_DELIVERED:order:${command.orderId}:manual`,
            payload: { source: 'admin_manual_delivery_confirmation' }
        });

        await client.query('COMMIT');
        transactionCommitted = true;
        return {
            reused: false,
            userId: Number(updatedOrder.user_id) || null,
            order: serializeDeliveryOrder(updatedOrder),
            shipment: serializeDeliveryShipment(updatedShipment),
            sellerProjection: sellerSummary
        };
    } catch (error) {
        if (transactionStarted && !transactionCommitted) {
            await client.query('ROLLBACK').catch(() => {});
        }
        throw error;
    } finally {
        client.release();
    }
};

module.exports = {
    assessSellerDeliveryProjection,
    fetchDeliveryOrderForUpdate,
    fetchDeliveryShipmentForUpdate,
    fetchLatestManualDeliveryEvent,
    fetchSellerDeliveryProjectionForUpdate,
    recordManualDelivery,
    serializeDeliveryOrder,
    serializeDeliveryShipment
};
