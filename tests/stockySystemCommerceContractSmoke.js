'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const {
    CONNECTION_HEADER,
    EVENT_PATH,
    KEY_ID_HEADER,
    REQUEST_NONCE_HEADER,
    REQUEST_TIMESTAMP_HEADER,
    RESPONSE_SIGNATURE_HEADER,
    STATUS_PATH_PREFIX,
    assertStockyRequestTarget,
    createSafeStockyTransport,
    isPublicAddress,
    resolveStockySystemCommerceRuntime,
    sha256Hex,
    signStockyRequest,
    verifyStockyResponse
} = require('../services/stockySystemConnectorService');
const { buildStockyOrderEnvelope } = require('../services/stockyOrderDeliveryService');
const { runStockyOrderDeliveryWorkerCycle } = require('../services/stockyOrderDeliveryWorkerService');

(async () => {
    const secret = 'r21-local-secret-material-0123456789abcdef';
    const environment = {
        NODE_ENV: 'test',
        NOVASTORE_SAFE_LOCAL_BACKEND: 'true',
        NOVASTORE_ALLOW_REMOTE_DB: 'false',
        NOVASTORE_STOCKY_SYSTEM_COMMERCE_ENABLED: 'true',
        NOVASTORE_STOCKY_SYSTEM_COMMERCE_WORKER_ENABLED: 'false',
        NOVASTORE_STOCKY_SYSTEM_COMMERCE_ACTIVATION_MODE: 'local',
        NOVASTORE_STOCKY_SYSTEM_COMMERCE_LOCAL_TRANSPORT_ENABLED: 'true',
        NOVASTORE_STOCKY_SYSTEM_COMMERCE_SECRETS_JSON: JSON.stringify({ local: secret })
    };
    const startupSafety = {
        canStart: true,
        safeLocalMode: true,
        safeLocalDatabase: true,
        target: { isLocalHost: true, remoteRelease: false }
    };
    const runtime = resolveStockySystemCommerceRuntime({ environment, startupSafety });
    assert.equal(runtime.enabled, true);
    assert.equal(runtime.workerEnabled, false);
    assert.equal(resolveStockySystemCommerceRuntime({ environment: {} }).enabled, false);

    const connection = {
        id: '7899b14a-8169-4e01-9a9d-56be95318b6f',
        endpoint_origin: 'http://127.0.0.1:49152',
        key_id: 'r21-v1',
        secret_ref: 'local',
        remote_store_id: 'stocky-store-a'
    };
    const eventId = 'd635a1cc-bd38-4b03-bdbd-4f9b035629b2';
    const statusPath = `${STATUS_PATH_PREFIX}${eventId}`;
    const signed = signStockyRequest({
        method: 'GET',
        path: statusPath,
        connection,
        runtime,
        nonce: 'abcdefghijklmnop',
        timestamp: 1789423200
    });
    assert.equal(new URL(signed.url).host, '127.0.0.1:49152');
    assert.throws(() => assertStockyRequestTarget({ method: 'GET', path: EVENT_PATH }), error => error.code === 'STOCKY_CONNECTOR_REQUEST_TARGET_INVALID');
    assert.throws(() => signStockyRequest({ method: 'GET', path: `${statusPath}?next=1`, connection, runtime }), error => error.code === 'STOCKY_CONNECTOR_REQUEST_TARGET_INVALID');

    const rawBody = JSON.stringify({ success: true, data: { processing_status: 'processing' } });
    const responseCanonical = [
        'v1-response',
        '200',
        statusPath,
        '127.0.0.1',
        connection.id,
        connection.key_id,
        String(signed.timestamp),
        signed.nonce,
        sha256Hex(rawBody)
    ].join('\n');
    const responseSignature = crypto.createHmac('sha256', secret).update(responseCanonical).digest('hex');
    const headers = {
        [CONNECTION_HEADER]: connection.id,
        [KEY_ID_HEADER]: connection.key_id,
        [REQUEST_TIMESTAMP_HEADER]: String(signed.timestamp),
        [REQUEST_NONCE_HEADER]: signed.nonce,
        [RESPONSE_SIGNATURE_HEADER]: `sha256=${responseSignature}`
    };
    assert.equal(verifyStockyResponse({
        statusCode: 200,
        path: statusPath,
        rawBody,
        headers,
        connection,
        runtime,
        expectedNonce: signed.nonce,
        expectedTimestamp: signed.timestamp
    }).bodySha256, sha256Hex(rawBody));
    assert.throws(() => verifyStockyResponse({
        statusCode: 201,
        path: statusPath,
        rawBody,
        headers,
        connection,
        runtime,
        expectedNonce: signed.nonce,
        expectedTimestamp: signed.timestamp
    }), error => error.code === 'STOCKY_CONNECTOR_RESPONSE_SIGNATURE_INVALID');

    for (const unsafe of [
        '127.0.0.1',
        '169.254.169.254',
        '0:0:0:0:0:ffff:127.0.0.1',
        '64:ff9b::a9fe:a9fe',
        'ff02::1'
    ]) assert.equal(isPublicAddress(unsafe), false, `${unsafe} must remain non-public`);
    assert.equal(isPublicAddress('8.8.8.8'), true);
    await assert.rejects(createSafeStockyTransport()({
        url: 'http://127.0.0.1:49152/health',
        method: 'GET',
        headers: {},
        runtime
    }), error => error.code === 'STOCKY_CONNECTOR_REQUEST_TARGET_INVALID');

    const common = {
        eventId,
        occurredAt: '2026-09-15T10:00:00.000Z',
        connection,
        canonicalOrder: {
            id: 810,
            status: 'Ödeme Bekliyor',
            payment_status: 'REQUIRES_ACTION',
            shipment_status: 'NONE',
            currency: 'TRY',
            created_at: '2026-09-15T09:59:00.000Z',
            items: [
                { id: 41, sku: 'SIMPLE-41', quantity: 1, price: '123.45' },
                { id: 42, variant_id: 4201, sku: 'VARIANT-42-M', quantity: 2, price: '234.56' }
            ]
        },
        sellerOrder: { id: 99 },
        allocation: {
            currency: 'TRY',
            grossMinor: 59257,
            items: [
                { sourceItemIndex: 0, productId: 41, offerId: 410, variantId: 4199, quantity: 1, unitPriceMinor: 12345 },
                { sourceItemIndex: 1, productId: 42, offerId: 420, variantId: 4201, quantity: 2, unitPriceMinor: 23456 }
            ]
        }
    };
    const envelope = buildStockyOrderEnvelope(common);
    assert.equal(envelope.order.lines[0].remote_variant_id, null);
    assert.equal(envelope.order.lines[1].remote_variant_id, '4201');
    assert.equal(envelope.order.lines[1].sku, null);
    assert.equal(envelope.order.grand_total, '592.57');
    assert.equal(JSON.stringify(envelope).includes('recipient'), false);
    assert.equal(Object.hasOwn(envelope, 'financial_facts'), false);
    assert.throws(() => buildStockyOrderEnvelope({
        ...common,
        allocation: {
            ...common.allocation,
            items: [common.allocation.items[0], { ...common.allocation.items[1], variantId: 4202 }]
        }
    }), error => error.code === 'STOCKY_ORDER_VARIANT_MISMATCH');

    const workerDisabled = await runStockyOrderDeliveryWorkerCycle({ database: { query() {} }, runtime });
    assert.equal(workerDisabled.skipped, 'STOCKY_SYSTEM_COMMERCE_WORKER_DISABLED');
    process.stdout.write('stockySystemCommerceContractSmoke: PASS\n');
})().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
