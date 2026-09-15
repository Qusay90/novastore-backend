'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

module.exports = async ({ pool, sensitive, originalConsole }) => {
    const connector = require('../../services/stockySystemConnectorService');
    const delivery = require('../../services/stockyOrderDeliveryService');
    const stockyRoot = process.env.NOVASTORE_R21_STOCKY_ROOT;
    assert(stockyRoot && path.isAbsolute(stockyRoot), 'An explicit disposable R21 Stocky source root is required.');
    const harnessPath = path.join(stockyRoot, 'tests', 'r21', 'stockyFixtureHarness.cjs');
    assert(fs.existsSync(harnessPath), 'The real Stocky fixture harness must exist; a mocked receiver is not sufficient.');
    const { startStockyFixture } = require(harnessPath);
    const { a, b, c, contexts: allContexts, createOrder } = await require('./stockySystemCommerceFixtures')({ pool, sensitive });
    const contexts = allContexts.filter(context => context.label !== 'C');
    const secrets = Object.fromEntries(contexts.map(context => [`r21-${context.label}`, crypto.randomBytes(48).toString('base64url')]));
    Object.values(secrets).forEach(secret => sensitive.add(secret));
    const stores = contexts.map(context => ({
        label: context.label,
        connectionKey: crypto.randomUUID(),
        remoteStoreId: `pc1-store-${context.storeId}`,
        keyId: 'r21-v1',
        secret: secrets[`r21-${context.label}`],
        // The fixture creates B's parent product but omits its exact variant mapping.
        products: context.products
    }));
    const environmentChanges = {
        NOVASTORE_STOCKY_SYSTEM_COMMERCE_ENABLED: 'true',
        NOVASTORE_STOCKY_SYSTEM_COMMERCE_WORKER_ENABLED: 'false',
        NOVASTORE_STOCKY_SYSTEM_COMMERCE_ACTIVATION_MODE: 'local',
        NOVASTORE_STOCKY_SYSTEM_COMMERCE_LOCAL_TRANSPORT_ENABLED: 'true',
        NOVASTORE_STOCKY_SYSTEM_COMMERCE_ALLOWED_HOSTS: '127.0.0.1',
        NOVASTORE_STOCKY_SYSTEM_COMMERCE_SECRETS_JSON: JSON.stringify(secrets)
    };
    sensitive.add(environmentChanges.NOVASTORE_STOCKY_SYSTEM_COMMERCE_SECRETS_JSON);
    const previousEnvironment = Object.fromEntries(Object.keys(environmentChanges).map(key => [key, process.env[key]]));
    let fixture;
    const transportEvidence = [];
    let checks = 0;
    const check = (condition, message) => { assert(condition, message); checks++; };
    try {
        fixture = await startStockyFixture({ stores });
        Object.assign(process.env, environmentChanges);
        const startupSafety = require('../../config/startupSafety').resolveStartupSafety(process.env);
        const runtime = connector.resolveStockySystemCommerceRuntime({ environment: process.env, startupSafety });
        const bindings = {};
        for (const context of contexts) {
            const store = stores.find(item => item.label === context.label);
            bindings[context.label] = await connector.createStockyConnectorBinding(pool, {
                id: store.connectionKey, organizationId: context.organizationId, storeId: context.storeId,
                remoteStoreId: store.remoteStoreId, endpointOrigin: fixture.origins[context.label],
                keyId: store.keyId, secretRef: `r21-${context.label}`
            }, { runtime });
        }
        await assert.rejects(connector.createStockyConnectorBinding(pool, {
            organizationId: a.organizationId, storeId: b.storeId, remoteStoreId: 'invalid-foreign',
            endpointOrigin: fixture.origins.A, keyId: 'r21-v1', secretRef: 'r21-A'
        }, { runtime }), error => error.code === 'STOCKY_CONNECTOR_STORE_BINDING_INVALID'); checks++;
        await assert.rejects(pool.query('UPDATE stocky_connector_connections SET store_id=$1,revision=revision+1 WHERE id=$2', [b.storeId, bindings.A.id]), /IMMUTABLE/); checks++;

        const nativeTransport = connector.createSafeStockyTransport({ timeoutMs: 5000 });
        const realTransport = async input => {
            const response = await nativeTransport(input);
            let result;
            try { result = JSON.parse(response.rawBody); } catch (_) { result = {}; }
            transportEvidence.push({ method: input.method, path: new URL(input.url).pathname, status: response.statusCode, signed: Boolean(connector.getHeader(response.headers, connector.RESPONSE_SIGNATURE_HEADER)), code: result.code || null, processingStatus: result.data?.processing_status || null, reasonCode: result.data?.reason_code || null });
            return response;
        };
        const eventFor = async order => {
            const rows = (await pool.query("SELECT * FROM seller_outbox_events WHERE event_type='stocky.order.created' AND organization_id=$1 AND aggregate_id=$2 ORDER BY created_at,id", [order.context.organizationId, String(order.id)])).rows;
            check(rows.length === 1, 'Each canonical assigned order must atomically create exactly one Stocky event.');
            const serialized = JSON.stringify(rows[0].payload_redacted);
            for (const forbidden of ['R21-PRIVATE', 'r21-private@example.test', '+905000000021', 'customer_name', 'address', 'phone', 'email']) check(!serialized.includes(forbidden), 'The order outbox must omit recipient fields and values.');
            return rows[0];
        };
        const resultsFor = async event => (await pool.query('SELECT * FROM stocky_connector_event_results WHERE outbox_event_id=$1 ORDER BY created_at,id', [event.id])).rows;
        const reconcile = (event, transport = realTransport) => delivery.reconcileStockyOrderEvent({ database: pool, eventId: event.id, runtime, transport });
        const state = async label => {
            const value = await fixture.readState(label);
            assert(Array.isArray(value.inventory) && value.inventory.length > 0, 'Actual Stocky inventory rows are required for retry assertions.');
            return value;
        };
        const saleCount = value => { assert(Array.isArray(value.sales), 'Fixture sales inventory is required.'); return value.sales.length; };
        const request = async (connection, method, requestPath, body = '') => {
            const signed = connector.signStockyRequest({ method, path: requestPath, body, connection, runtime });
            const response = await realTransport({ url: signed.url, method, headers: signed.headers, body, runtime });
            connector.verifyStockyResponse({ statusCode: response.statusCode, path: requestPath, rawBody: response.rawBody, headers: response.headers, connection, runtime, expectedNonce: signed.nonce, expectedTimestamp: signed.timestamp });
            return { ...response, json: JSON.parse(response.rawBody), signed };
        };

        const beforeA = await state('A');
        const beforeB = await state('B');
        check(saleCount(beforeA) === 0 && saleCount(beforeB) === 0, 'Both disposable stores start empty.');
        const unboundOrder = await createOrder(c);
        const unboundEvents = await pool.query("SELECT id FROM seller_outbox_events WHERE event_type='stocky.order.created' AND organization_id=$1 AND aggregate_id=$2", [c.organizationId, String(unboundOrder.id)]);
        check(unboundEvents.rowCount === 0, 'An unconnected store keeps canonical checkout working without a Stocky event.');
        const first = await createOrder(a);
        const firstEvent = await eventFor(first);
        const frozenFirst = JSON.stringify(firstEvent.payload_redacted);
        const firstDelivery = await reconcile(firstEvent);
        const firstResults = await resultsFor(firstEvent);
        check(firstResults.length === 1 && firstResults[0].processing_status === 'committed', `PC1 must persist an exact committed receipt (${JSON.stringify({ errorCode: firstDelivery.errorCode, processingStatus: firstDelivery.processingStatus, httpStatus: firstDelivery.httpStatus })}).`);
        let currentA = await state('A');
        check(saleCount(currentA) === 1 && saleCount(await state('B')) === 0, 'Only Store A receives Store A order.');
        check(currentA.sales.every(sale => sale.statut !== 'completed' && sale.payment_statut !== 'paid' && Number(sale.paid_amount) === 0), 'Connector ingestion must not fabricate POS completion/payment.');
        await reconcile(firstEvent);
        check((await resultsFor(firstEvent)).length === 1 && saleCount(await state('A')) === 1, 'Receipt/event replay is idempotent.');
        const acknowledged = await request(bindings.A, 'GET', `${connector.STATUS_PATH_PREFIX}${firstEvent.id}`);
        check(acknowledged.statusCode === 200 && acknowledged.json.data.receipt_status === 'acknowledged', 'Stocky result outbox is acknowledged only after durable PC1 receipt.');
        const duplicateWire = await request(bindings.A, 'POST', connector.EVENT_PATH, connector.stableStringify(firstEvent.payload_redacted.envelope));
        check(duplicateWire.statusCode === 200 && duplicateWire.json.data.replayed === true, 'The actual receiver recognizes an exact signed duplicate.');
        const nonceReplay = await realTransport({ url: duplicateWire.signed.url, method: 'POST', headers: duplicateWire.signed.headers, body: connector.stableStringify(firstEvent.payload_redacted.envelope), runtime });
        check(nonceReplay.statusCode === 409, 'Reusing an authenticated nonce is rejected.');
        const incompatible = structuredClone(firstEvent.payload_redacted.envelope);
        incompatible.order.number += '-conflict';
        const conflict = await request(bindings.A, 'POST', connector.EVENT_PATH, connector.stableStringify(incompatible));
        check(conflict.statusCode === 409 && saleCount(await state('A')) === 1, 'Same event with incompatible signed payload cannot replace the committed order.');
        const foreignPayload = structuredClone(firstEvent.payload_redacted.envelope);
        foreignPayload.event_id = crypto.randomUUID();
        foreignPayload.store_id = bindings.B.remote_store_id;
        const foreignWrite = await request(bindings.A, 'POST', connector.EVENT_PATH, connector.stableStringify(foreignPayload));
        check((foreignWrite.statusCode >= 400 || (foreignWrite.statusCode === 202 && foreignWrite.json.data.processing_status === 'manual_required' && foreignWrite.json.data.reason_code === 'store_binding_mismatch')) && saleCount(await state('B')) === 0, 'Request body cannot choose the other store authority; the receiver rejects or records an explicit binding-mismatch manual result.');
        const outOfOrder = structuredClone(firstEvent.payload_redacted.envelope);
        outOfOrder.event_id = crypto.randomUUID();
        outOfOrder.event_version = 2;
        outOfOrder.order.id = 'r21-unseen-out-of-order';
        outOfOrder.order.number = outOfOrder.order.id;
        const outOfOrderResponse = await request(bindings.A, 'POST', connector.EVENT_PATH, connector.stableStringify(outOfOrder));
        check(outOfOrderResponse.statusCode === 202 && outOfOrderResponse.json.data.processing_status === 'manual_required' && saleCount(await state('A')) === 1, 'A future initial order version is held for manual review without inventory/order mutation.');
        const invalid = structuredClone(firstEvent.payload_redacted.envelope);
        invalid.event_id = crypto.randomUUID();
        invalid.order.payment_status = 'INVENTED_PAYMENT';
        const rejected = await request(bindings.A, 'POST', connector.EVENT_PATH, connector.stableStringify(invalid));
        check(rejected.statusCode === 422 && saleCount(await state('A')) === 1, 'Permanent canonical status validation rejection is signed and does not create an order.');

        const second = await createOrder(a, { kind: 'variant' });
        const secondEvent = await eventFor(second);
        let lostPost = false;
        const loseAfterCommit = async input => {
            const response = await realTransport(input);
            if (!lostPost && input.method === 'POST' && new URL(input.url).pathname === connector.EVENT_PATH) {
                lostPost = true;
                const error = new Error('Synthetic response loss after Stocky commit'); error.code = 'ECONNRESET'; throw error;
            }
            return response;
        };
        await reconcile(secondEvent, loseAfterCommit);
        check(lostPost, 'Response-loss fault was actually exercised.');
        const afterLostPost = await state('A');
        check(saleCount(afterLostPost) === 2, 'Stocky committed once before response loss.');
        await reconcile(secondEvent);
        const afterRecovery = await state('A');
        check(saleCount(afterRecovery) === 2, 'Retry after response loss creates no duplicate sale.');
        check(JSON.stringify(afterRecovery.inventory) === JSON.stringify(afterLostPost.inventory), 'Recovery must not decrement Stocky inventory again.');
        check((await resultsFor(secondEvent)).filter(row => row.processing_status === 'committed').length === 1, 'Lost response must not lose the committed processing result.');

        const bOrder = await createOrder(b);
        const bEvent = await eventFor(bOrder);
        await reconcile(bEvent);
        check(saleCount(await state('B')) === 1 && saleCount(await state('A')) === 2, 'Store B receives only its own order.');
        const denied = await request(bindings.B, 'GET', `${connector.STATUS_PATH_PREFIX}${firstEvent.id}`);
        check(denied.statusCode === 404, 'Foreign connection cannot read another tenant event.');
        const wrongHostConnection = { ...bindings.A, endpoint_origin: bindings.B.endpoint_origin };
        const wrongHostSigned = connector.signStockyRequest({ method: 'GET', path: `${connector.STATUS_PATH_PREFIX}${firstEvent.id}`, connection: wrongHostConnection, runtime });
        const wrongHostResponse = await realTransport({ url: wrongHostSigned.url, method: 'GET', headers: wrongHostSigned.headers, runtime });
        check(wrongHostResponse.statusCode === 401, 'A connection key is rejected in the other tenant.');

        const manual = await createOrder(b, { kind: 'variant' });
        const manualEvent = await eventFor(manual);
        await reconcile(manualEvent);
        const manualResults = await resultsFor(manualEvent);
        check(manualResults.length === 1 && manualResults[0].processing_status === 'manual_required', 'An unmapped exact variant produces manual_required.');
        check(saleCount(await state('B')) === 1, 'Manual processing does not create a fake sale.');
        const manualAttempt = await pool.query("SELECT COUNT(*)::int AS n FROM seller_outbox_delivery_attempts WHERE outbox_event_id=$1 AND outcome='delivered'", [manualEvent.id]);
        check(manualAttempt.rows[0].n === 0, 'HTTP 2xx manual_required must not persist delivered business success.');
        const manualStatus = await request(bindings.B, 'GET', `${connector.STATUS_PATH_PREFIX}${manualEvent.id}`);
        check(manualStatus.json.data.processing_status === 'manual_required' && manualStatus.json.data.receipt_status === 'acknowledged', 'Receipt acknowledgement is separate from business completion.');

        const ackOrder = await createOrder(a);
        const ackEvent = await eventFor(ackOrder);
        let lostAck = false;
        const loseAck = async input => {
            const response = await realTransport(input);
            if (!lostAck && input.method === 'POST' && new URL(input.url).pathname.endsWith('/receipt')) {
                lostAck = true;
                const error = new Error('Synthetic receipt acknowledgement response loss'); error.code = 'ECONNRESET'; throw error;
            }
            return response;
        };
        await reconcile(ackEvent, loseAck);
        check(lostAck, 'Lost ACK response scenario was actually exercised.');
        await reconcile(ackEvent);
        check((await resultsFor(ackEvent)).length === 1 && saleCount(await state('A')) === 3, 'ACK recovery does not reapply the result/order.');

        for (const fault of ['timeout', 'temporary_5xx']) {
            const order = await createOrder(a);
            const event = await eventFor(order);
            let injected = false;
            await reconcile(event, async input => {
                if (!injected) {
                    injected = true;
                    if (fault === 'temporary_5xx') return { statusCode: 503, headers: {}, rawBody: '{"success":false}' };
                    const error = new Error('Synthetic transport timeout'); error.code = 'ETIMEDOUT'; throw error;
                }
                return realTransport(input);
            });
            check(injected && (await resultsFor(event)).length === 0, 'A transient transport failure must not create a successful receipt.');
            await reconcile(event);
            check((await resultsFor(event)).some(row => row.processing_status === 'committed'), 'Durable retry recovers a transient transport failure.');
        }

        const parallel = await createOrder(a);
        const parallelEvent = await eventFor(parallel);
        const countBeforeParallel = saleCount(await state('A'));
        await Promise.all([reconcile(parallelEvent), reconcile(parallelEvent)]);
        await reconcile(parallelEvent);
        check(saleCount(await state('A')) === countBeforeParallel + 1 && (await resultsFor(parallelEvent)).length === 1, 'Concurrent delivery creates one sale and one processing receipt.');

        const poison = await createOrder(a);
        const poisonEvent = await eventFor(poison);
        let validationFault = false;
        await reconcile(poisonEvent, async input => {
            if (input.method === 'POST' && new URL(input.url).pathname === connector.EVENT_PATH) {
                validationFault = true;
                // Contract-skew fault at the real receiver: preserve nonce/request scope,
                // but send an authenticated invalid canonical status to obtain a genuine signed 422.
                const body = structuredClone(poisonEvent.payload_redacted.envelope);
                body.order.payment_status = 'UNSUPPORTED_CONTRACT_STATE';
                const invalidBody = connector.stableStringify(body);
                const signed = connector.signStockyRequest({ method: 'POST', path: connector.EVENT_PATH, body: invalidBody, connection: bindings.A, runtime, nonce: connector.getHeader(input.headers, connector.NONCE_HEADER), timestamp: Number(connector.getHeader(input.headers, connector.TIMESTAMP_HEADER)) });
                return realTransport({ ...input, body: invalidBody, headers: signed.headers });
            }
            return realTransport(input);
        });
        const deadLetter = await pool.query("SELECT id FROM seller_outbox_delivery_attempts WHERE outbox_event_id=$1 AND outcome='dead_letter'", [poisonEvent.id]);
        check(validationFault && deadLetter.rowCount > 0 && (await resultsFor(poisonEvent)).length === 0, 'A signed permanent validation failure becomes a durable dead letter without a success receipt.');
        const nextOrder = await createOrder(a);
        const nextEvent = await eventFor(nextOrder);
        const workerResult = await delivery.deliverNextStockyOrderEvent({ database: pool, runtime, transport: realTransport });
        check(workerResult.eventId === nextEvent.id && (await resultsFor(nextEvent)).some(row => row.processing_status === 'committed'), 'A permanent invalid event does not starve the next order in the worker queue.');

        const rollbackOrder = await createOrder(a, { rollback: true });
        const rolledBack = await pool.query("SELECT COUNT(*)::int AS n FROM seller_outbox_events WHERE event_type='stocky.order.created' AND aggregate_id=$1", [String(rollbackOrder.id)]);
        check(rolledBack.rows[0].n === 0, 'Rolled back canonical order must not leave a deliverable event.');
        await pool.query("UPDATE orders SET payment_status='FAILED' WHERE id=$1", [first.id]);
        const persistedFirst = (await pool.query('SELECT payload_redacted FROM seller_outbox_events WHERE id=$1', [firstEvent.id])).rows[0];
        check(JSON.stringify(persistedFirst.payload_redacted) === frozenFirst, 'An event retry preserves the original snapshot bytes after canonical state changes.');
        assert.equal(typeof fixture.resolveManualVariant, 'function', 'The fixture must exercise the accepted Stocky manual replay result transition.');
        await fixture.resolveManualVariant('B', manualEvent.id);
        const manualResolution = await delivery.deliverNextStockyOrderEvent({ database: pool, runtime, transport: realTransport });
        const revisedResults = await resultsFor(manualEvent);
        check(manualResolution.eventId === manualEvent.id && revisedResults.length === 2 && revisedResults[1].processing_status === 'committed' && Number(revisedResults[1].result_revision) > Number(revisedResults[0].result_revision), 'The worker discovers and acknowledges a newer committed result after accepted Stocky manual replay.');
        const revisedStatus = await request(bindings.B, 'GET', `${connector.STATUS_PATH_PREFIX}${manualEvent.id}`);
        check(revisedStatus.json.data.receipt_status === 'acknowledged', 'A successful later result must not remain pending forever after the earlier manual receipt.');
        const pausedOrder = await createOrder(a);
        const pausedEvent = await eventFor(pausedOrder);
        const beforePaused = saleCount(await state('A'));
        await pool.query("UPDATE stocky_connector_connections SET status='disabled',disabled_at=NOW(),revision=revision+1 WHERE id=$1", [bindings.A.id]);
        await assert.rejects(reconcile(pausedEvent), error => error.code === 'STOCKY_CONNECTOR_BINDING_DISABLED'); checks++;
        const activeBOrder = await createOrder(b);
        const activeBEvent = await eventFor(activeBOrder);
        const afterDisabled = await delivery.deliverNextStockyOrderEvent({ database: pool, runtime, transport: realTransport });
        check(afterDisabled.eventId === activeBEvent.id && saleCount(await state('A')) === beforePaused, 'A disabled connection receives no queued data and cannot block another active store.');
        const finalB = await state('B');
        check(saleCount(finalB) === 3, 'Store B contains only its own simple orders and resolved variant order.');

        originalConsole.log(JSON.stringify({ test: 'stockySystemCommerceUat', result: 'PASS', checks, receiver: 'REAL_STOCKY_PHP_SQLITE', producer: 'CANONICAL_PC1_POSTGRES_OUTBOX', responseLossRetry: 'PASS', receiptAckLoss: 'PASS', twoStoreIsolation: 'PASS', duplicateStockyOrders: 0, duplicateStockDecrementFromRetry: 0, falseTransportBusinessSuccess: 0, recipientExposure: 0, S01: 'BLOCKED_BY_S10', productOrderE2E: 'PARTIAL_S01_NOT_IMPLEMENTED', providerCalls: 0, productionWrites: 0 }));
    } catch (error) {
        originalConsole.error(JSON.stringify({ test: 'stockySystemCommerceUat', safeTransportEvidence: transportEvidence.slice(-12) }));
        if (fixture?.readDiagnostics) originalConsole.error(JSON.stringify({ stockyFixtureDiagnostics: await fixture.readDiagnostics() }));
        throw error;
    } finally {
        for (const [key, value] of Object.entries(previousEnvironment)) {
            if (value === undefined) delete process.env[key]; else process.env[key] = value;
        }
        if (fixture) await fixture.close();
    }
};
