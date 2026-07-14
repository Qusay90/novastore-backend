const assert = require('node:assert/strict');
const {
    ORDER_STATUS,
    PAYMENT_STATUS,
    REFUND_STATUS,
    SHIPMENT_STATUS
} = require('../constants/orderStatus');
const {
    ManualShipmentError,
    buildManualShipmentMetadata,
    decideManualShipmentReplay,
    hasOpenPaymentReconciliation,
    normalizeManualShipmentCommand,
    planManualShipment,
    selectFulfillmentPayment
} = require('../services/manualShipmentPolicy');

const expectManualShipmentError = (fn, code, statusCode = 409) => {
    assert.throws(fn, (error) => {
        assert(error instanceof ManualShipmentError);
        assert.equal(error.code, code);
        assert.equal(error.statusCode, statusCode);
        return true;
    });
};

const baseBody = () => ({
    expected_status: ORDER_STATUS.HAZIRLANIYOR,
    handoff_confirmed: true,
    provider: 'Yurtiçi Kargo',
    tracking_no: 'YK-2026-000123'
});

const createCommand = (overrides = {}) => normalizeManualShipmentCommand({
    orderId: 7001,
    idempotencyKey: 'shipment-7001-attempt-1',
    body: baseBody(),
    actor: { id: 17, role: 'admin' },
    ...overrides
});

const activePayment = (overrides = {}) => ({
    id: 5001,
    provider: 'paytr',
    payment_ref: 'PAY-7001',
    status: PAYMENT_STATUS.PAID,
    raw_request: JSON.stringify({ stockReserved: true, finalizesOnWebhook: true }),
    ...overrides
});

const order = (overrides = {}) => ({
    id: 7001,
    status: ORDER_STATUS.HAZIRLANIYOR,
    payment_status: PAYMENT_STATUS.PAID,
    payment_ref: 'PAY-7001',
    refund_status: REFUND_STATUS.NONE,
    shipment_status: SHIPMENT_STATUS.NONE,
    shipment_provider: null,
    tracking_no: null,
    ...overrides
});

(() => {
    const command = createCommand();
    assert.equal(command.orderId, 7001);
    assert.equal(command.provider, 'Yurtiçi Kargo');
    assert.equal(command.trackingNo, 'YK-2026-000123');
    assert.equal(command.expectedStatus, ORDER_STATUS.HAZIRLANIYOR);
    assert.equal(command.handoffConfirmed, true);
    assert.match(command.requestFingerprint, /^[a-f0-9]{64}$/);
    assert(Object.isFrozen(command));
    assert(Object.isFrozen(command.actor));

    const aliasCommand = createCommand({
        body: {
            expectedStatus: ORDER_STATUS.HAZIRLANIYOR,
            handoffConfirmed: true,
            provider: 'Aras Kargo',
            trackingNo: 'ARAS-991'
        }
    });
    assert.equal(aliasCommand.provider, 'Aras Kargo');
    assert.equal(aliasCommand.trackingNo, 'ARAS-991');

    expectManualShipmentError(
        () => createCommand({ idempotencyKey: '' }),
        'MANUAL_SHIPMENT_IDEMPOTENCY_KEY_INVALID',
        400
    );
    expectManualShipmentError(
        () => createCommand({ idempotencyKey: 12345678 }),
        'MANUAL_SHIPMENT_IDEMPOTENCY_KEY_INVALID',
        400
    );
    expectManualShipmentError(
        () => createCommand({ idempotencyKey: 'not safe key' }),
        'MANUAL_SHIPMENT_IDEMPOTENCY_KEY_INVALID',
        400
    );
    expectManualShipmentError(
        () => createCommand({ body: { ...baseBody(), tracking_url: 'https://example.test' } }),
        'MANUAL_SHIPMENT_CARRIER_FIELDS_REJECTED',
        400
    );
    expectManualShipmentError(
        () => createCommand({ body: { ...baseBody(), carrierPayload: { accepted: true } } }),
        'MANUAL_SHIPMENT_CARRIER_FIELDS_REJECTED',
        400
    );
    expectManualShipmentError(
        () => createCommand({ body: { ...baseBody(), note: 'unsupported' } }),
        'MANUAL_SHIPMENT_UNSUPPORTED_FIELD',
        400
    );
    expectManualShipmentError(
        () => createCommand({ body: { ...baseBody(), handoff_confirmed: false } }),
        'MANUAL_SHIPMENT_HANDOFF_CONFIRMATION_REQUIRED',
        400
    );
    expectManualShipmentError(
        () => createCommand({ body: { ...baseBody(), expected_status: ORDER_STATUS.KARGOYA_VERILDI } }),
        'MANUAL_SHIPMENT_EXPECTED_STATUS_INVALID',
        400
    );
    expectManualShipmentError(
        () => createCommand({ body: { ...baseBody(), tracking_no: 'https://tracking.test/123' } }),
        'MANUAL_SHIPMENT_TRACKING_NO_INVALID',
        400
    );
    expectManualShipmentError(
        () => createCommand({ body: { ...baseBody(), provider: '<img src=x onerror=alert(1)>' } }),
        'MANUAL_SHIPMENT_PROVIDER_INVALID',
        400
    );
    expectManualShipmentError(
        () => createCommand({ body: { ...baseBody(), provider: 12345 } }),
        'MANUAL_SHIPMENT_PROVIDER_INVALID',
        400
    );
    expectManualShipmentError(
        () => createCommand({ body: { ...baseBody(), tracking_no: '\"><img-src-x-onerror-alert-1>' } }),
        'MANUAL_SHIPMENT_TRACKING_NO_INVALID',
        400
    );
    expectManualShipmentError(
        () => createCommand({ actor: { id: 17, role: 'customer' } }),
        'MANUAL_SHIPMENT_ADMIN_REQUIRED',
        403
    );
    expectManualShipmentError(
        () => createCommand({
            body: {
                ...baseBody(),
                trackingNo: 'DIFFERENT'
            }
        }),
        'MANUAL_SHIPMENT_AMBIGUOUS_FIELD',
        400
    );

    const safeInactivePayment = activePayment({
        id: 4999,
        payment_ref: 'PAY-OLD',
        status: PAYMENT_STATUS.FAILED,
        raw_request: JSON.stringify({ stockReserved: false, finalizesOnWebhook: true })
    });
    assert.equal(
        selectFulfillmentPayment({
            order: order(),
            payments: [activePayment(), safeInactivePayment]
        }).id,
        5001
    );

    const plan = planManualShipment({
        order: order(),
        payments: [activePayment(), safeInactivePayment],
        command
    });
    assert.deepEqual(plan, {
        currentStatus: ORDER_STATUS.HAZIRLANIYOR,
        nextStatus: ORDER_STATUS.KARGOYA_VERILDI,
        shipmentStatus: SHIPMENT_STATUS.IN_TRANSIT,
        activePaymentId: 5001
    });
    assert(Object.isFrozen(plan));

    assert.throws(
        () => planManualShipment({
            order: order({ status: ORDER_STATUS.KARGOYA_VERILDI }),
            payments: [activePayment()],
            command
        }),
        (error) => {
            assert(error instanceof ManualShipmentError);
            assert.equal(error.code, 'ORDER_STATUS_CONFLICT');
            assert.equal(error.details.refetchRequired, true);
            return true;
        }
    );
    for (const shipmentConflict of [
        { shipment_status: SHIPMENT_STATUS.IN_TRANSIT },
        { shipment_provider: 'Aras Kargo' },
        { tracking_no: 'PREEXISTING-TRACKING' },
        { shipment_status: null }
    ]) {
        expectManualShipmentError(
            () => planManualShipment({
                order: order(shipmentConflict),
                payments: [activePayment()],
                command
            }),
            'MANUAL_SHIPMENT_ORDER_SHIPMENT_CONFLICT'
        );
    }
    expectManualShipmentError(
        () => planManualShipment({
            order: order({ payment_status: PAYMENT_STATUS.REQUIRES_ACTION }),
            payments: [activePayment()],
            command
        }),
        'MANUAL_SHIPMENT_ORDER_PAYMENT_NOT_PAID'
    );
    expectManualShipmentError(
        () => planManualShipment({
            order: order({ refund_status: REFUND_STATUS.PENDING }),
            payments: [activePayment()],
            command
        }),
        'MANUAL_SHIPMENT_REFUND_CONFLICT'
    );
    expectManualShipmentError(
        () => selectFulfillmentPayment({ order: order(), payments: [] }),
        'MANUAL_SHIPMENT_PAYMENT_PROOF_MISSING'
    );
    expectManualShipmentError(
        () => selectFulfillmentPayment({
            order: order(),
            payments: [activePayment({ status: PAYMENT_STATUS.REQUIRES_ACTION })]
        }),
        'MANUAL_SHIPMENT_PAYMENT_NOT_PAID'
    );
    expectManualShipmentError(
        () => selectFulfillmentPayment({
            order: order(),
            payments: [activePayment({ raw_request: JSON.stringify({ stockReserved: false }) })]
        }),
        'MANUAL_SHIPMENT_STOCK_RESERVATION_INVALID'
    );
    expectManualShipmentError(
        () => selectFulfillmentPayment({
            order: order(),
            payments: [activePayment(), activePayment({
                id: 4998,
                payment_ref: 'PAY-OTHER',
                status: PAYMENT_STATUS.PAID,
                raw_request: JSON.stringify({ stockReserved: true })
            })]
        }),
        'MANUAL_SHIPMENT_PAYMENT_HISTORY_CONFLICT'
    );

    const reconciliationPayment = activePayment({
        raw_request: JSON.stringify({
            stockReserved: true,
            reconciliationRequired: true,
            reconciliationTask: { status: 'OPEN' }
        })
    });
    assert.equal(hasOpenPaymentReconciliation(reconciliationPayment), true);
    assert.equal(hasOpenPaymentReconciliation(activePayment()), false);
    expectManualShipmentError(
        () => selectFulfillmentPayment({ order: order(), payments: [reconciliationPayment] }),
        'MANUAL_SHIPMENT_RECONCILIATION_OPEN'
    );

    const metadata = buildManualShipmentMetadata({
        command,
        now: '2026-07-14T12:00:00.000Z'
    });
    assert.equal(metadata.source, 'admin_manual_fulfillment');
    assert.equal(metadata.actor.id, 17);
    assert.equal(metadata.idempotencyKey, command.idempotencyKey);
    assert.equal(metadata.requestFingerprint, command.requestFingerprint);
    assert.equal(metadata.trackingLast4, '0123');
    assert.match(metadata.trackingHash, /^[a-f0-9]{64}$/);
    assert.equal(metadata.carrierApiExecuted, false);
    assert.equal(metadata.carrierConfirmed, false);
    assert.equal(metadata.labelGenerated, false);

    const existingShipment = {
        id: 88,
        order_id: 7001,
        provider: command.provider,
        tracking_no: command.trackingNo,
        tracking_url: null,
        label_url: null,
        shipment_status: SHIPMENT_STATUS.IN_TRANSIT,
        raw_payload: JSON.stringify(metadata)
    };
    assert.deepEqual(decideManualShipmentReplay({ existingShipment: null, command }), { reused: false });
    assert.deepEqual(decideManualShipmentReplay({ existingShipment, command }), { reused: true });

    expectManualShipmentError(
        () => decideManualShipmentReplay({
            existingShipment,
            command: createCommand({ idempotencyKey: 'shipment-7001-attempt-2' })
        }),
        'MANUAL_SHIPMENT_ALREADY_EXISTS'
    );
    expectManualShipmentError(
        () => decideManualShipmentReplay({
            existingShipment,
            command: createCommand({
                body: { ...baseBody(), tracking_no: 'YK-2026-CHANGED' }
            })
        }),
        'MANUAL_SHIPMENT_IDEMPOTENCY_CONFLICT'
    );
    expectManualShipmentError(
        () => decideManualShipmentReplay({
            existingShipment,
            command: createCommand({ actor: { id: 99, role: 'admin' } })
        }),
        'MANUAL_SHIPMENT_IDEMPOTENCY_CONFLICT'
    );

    console.log('manual shipment policy smoke passed');
})();
