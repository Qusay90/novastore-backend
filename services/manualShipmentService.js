const pool = require('../config/db');
const { appendOrderEvent } = require('./orderService');
const { EVENT } = require('./notificationEventCatalog');
const { enqueueNotificationEvent } = require('./notificationOutboxService');
const {
    ManualShipmentError,
    buildManualShipmentMetadata,
    decideManualShipmentReplay,
    normalizeManualShipmentCommand,
    planManualShipment
} = require('./manualShipmentPolicy');

const fetchOrderForUpdate = async (client, orderId) => {
    const result = await client.query(
        `SELECT id,
                user_id,
                status,
                payment_status,
                payment_ref,
                refund_status,
                shipment_status,
                shipment_provider,
                tracking_no
         FROM orders
         WHERE id = $1
         FOR UPDATE`,
        [orderId]
    );
    return result.rows[0] || null;
};

const fetchShipmentForUpdate = async (client, orderId) => {
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
    return result.rows[0] || null;
};

const fetchPaymentsForUpdate = async (client, orderId) => {
    const result = await client.query(
        `SELECT id,
                provider,
                payment_ref,
                status,
                raw_request,
                raw_response,
                created_at,
                updated_at
         FROM payments
         WHERE order_id = $1
         ORDER BY id DESC
         FOR UPDATE`,
        [orderId]
    );
    return result.rows;
};

const assertAdminManualShipmentAuthority = async (client, orderId) => {
    const result = await client.query(
        `SELECT id
         FROM seller_orders
         WHERE canonical_order_id = $1
         ORDER BY id
         LIMIT 1`,
        [orderId]
    );
    if (result.rows?.length > 0) {
        throw new ManualShipmentError('Satıcı siparişi için kargo devri yalnız satıcı fulfillment akışından yapılabilir.', {
            code: 'MANUAL_SHIPMENT_SELLER_OWNED_ORDER',
            statusCode: 409
        });
    }
};

const serializeShipment = (shipment = {}) => ({
    id: Number(shipment.id),
    orderId: Number(shipment.order_id),
    provider: shipment.provider,
    trackingNo: shipment.tracking_no,
    trackingUrl: shipment.tracking_url || null,
    shipmentStatus: shipment.shipment_status,
    etaDate: shipment.eta_date || null,
    carrierApiExecuted: false,
    carrierConfirmed: false,
    labelGenerated: false,
    labelUrl: null
});

const serializeOrder = (order = {}) => ({
    id: Number(order.id),
    status: order.status,
    paymentStatus: order.payment_status,
    refundStatus: order.refund_status,
    shipmentStatus: order.shipment_status,
    shipmentProvider: order.shipment_provider,
    trackingNo: order.tracking_no
});

const recordManualShipment = async ({ orderId, idempotencyKey, body, actor }) => {
    const command = normalizeManualShipmentCommand({
        orderId,
        idempotencyKey,
        body,
        actor
    });
    const client = await pool.connect();
    let transactionStarted = false;
    let transactionCommitted = false;

    try {
        await client.query('BEGIN');
        transactionStarted = true;

        const order = await fetchOrderForUpdate(client, command.orderId);
        if (!order) {
            throw new ManualShipmentError('Sipariş bulunamadı.', {
                code: 'MANUAL_SHIPMENT_ORDER_NOT_FOUND',
                statusCode: 404
            });
        }

        await assertAdminManualShipmentAuthority(client, command.orderId);

        // Lock ordering is deliberate: order -> seller-ownership guard -> shipment -> every payment row.
        // The order lock serializes first-write races even when no shipment row exists yet.
        const existingShipment = await fetchShipmentForUpdate(client, command.orderId);
        const payments = await fetchPaymentsForUpdate(client, command.orderId);
        const replayDecision = decideManualShipmentReplay({ existingShipment, command });
        if (replayDecision.reused) {
            await client.query('COMMIT');
            transactionCommitted = true;
            return {
                reused: true,
                userId: Number(order.user_id) || null,
                order: serializeOrder(order),
                shipment: serializeShipment(existingShipment)
            };
        }

        const plan = planManualShipment({ order, payments, command });
        const metadata = buildManualShipmentMetadata({ command });
        const shipmentInsert = await client.query(
            `INSERT INTO shipments
                (order_id, provider, tracking_no, tracking_url, shipment_status, eta_date, label_url, raw_payload)
             VALUES
                ($1, $2, $3, NULL, $4, NULL, NULL, $5::jsonb)
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
                command.orderId,
                command.provider,
                command.trackingNo,
                plan.shipmentStatus,
                JSON.stringify(metadata)
            ]
        );
        const shipment = shipmentInsert.rows[0];

        const orderUpdate = await client.query(
            `UPDATE orders
             SET status = $1,
                 shipment_status = $2,
                 shipment_provider = $3,
                 tracking_no = $4,
                 updated_at = NOW()
             WHERE id = $5
             RETURNING id,
                       user_id,
                       status,
                       payment_status,
                       payment_ref,
                       refund_status,
                       shipment_status,
                       shipment_provider,
                       tracking_no`,
            [
                plan.nextStatus,
                plan.shipmentStatus,
                command.provider,
                command.trackingNo,
                command.orderId
            ]
        );
        if (orderUpdate.rows.length !== 1) {
            throw new ManualShipmentError('Sipariş gönderim durumu güncellenemedi.', {
                code: 'MANUAL_SHIPMENT_ORDER_UPDATE_FAILED',
                statusCode: 500
            });
        }
        const updatedOrder = orderUpdate.rows[0];

        await appendOrderEvent(
            client,
            command.orderId,
            'MANUAL_SHIPMENT_RECORDED',
            'Manuel taşıyıcı devir kaydı oluşturuldu.',
            {
                source: metadata.source,
                idempotencyKey: command.idempotencyKey,
                requestFingerprint: command.requestFingerprint,
                actor: metadata.actor,
                beforeStatus: plan.currentStatus,
                afterStatus: plan.nextStatus,
                shipmentStatus: plan.shipmentStatus,
                reasonCode: 'MANUAL_HANDOFF_CONFIRMED',
                handoffConfirmed: true,
                provider: command.provider,
                trackingHash: metadata.trackingHash,
                trackingLast4: metadata.trackingLast4,
                activePaymentId: plan.activePaymentId,
                carrierApiExecuted: false,
                carrierConfirmed: false,
                labelGenerated: false
            }
        );
        await enqueueNotificationEvent(client, {
            eventType: EVENT.SHIPMENT_CREATED,
            aggregateType: 'order',
            aggregateId: command.orderId,
            sourceEventKey: `SHIPMENT_CREATED:order:${command.orderId}:shipment:${shipment.id}`,
            payload: { source: 'manual_handoff_confirmed' }
        });

        await client.query('COMMIT');
        transactionCommitted = true;
        return {
            reused: false,
            userId: Number(updatedOrder.user_id) || null,
            order: serializeOrder(updatedOrder),
            shipment: serializeShipment(shipment)
        };
    } catch (error) {
        if (transactionStarted && !transactionCommitted) {
            await client.query('ROLLBACK').catch(() => {});
        }
        if (error?.code === '23505') {
            throw new ManualShipmentError('Sipariş için kargo kaydı zaten var.', {
                code: 'MANUAL_SHIPMENT_ALREADY_EXISTS'
            });
        }
        throw error;
    } finally {
        client.release();
    }
};

module.exports = {
    assertAdminManualShipmentAuthority,
    fetchOrderForUpdate,
    fetchPaymentsForUpdate,
    fetchShipmentForUpdate,
    recordManualShipment,
    serializeOrder,
    serializeShipment
};
