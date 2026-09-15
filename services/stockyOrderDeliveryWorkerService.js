'use strict';

const { resolveStartupSafety } = require('../config/startupSafety');
const { deliverNextStockyOrderEvent } = require('./stockyOrderDeliveryService');
const { createSafeStockyTransport, resolveStockySystemCommerceRuntime } = require('./stockySystemConnectorService');

let timer = null;
let running = false;

const boundedInteger = (value, fallback, minimum, maximum) => {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? Math.max(minimum, Math.min(parsed, maximum)) : fallback;
};

const resolveWorkerRuntime = ({ environment = process.env, startupSafety } = {}) => (
    resolveStockySystemCommerceRuntime({
        environment,
        startupSafety: startupSafety || resolveStartupSafety(environment)
    })
);

const runStockyOrderDeliveryWorkerCycle = async ({
    database,
    runtime,
    transport = createSafeStockyTransport(),
    limit = 25
} = {}) => {
    if (!database || typeof database.query !== 'function') throw new TypeError('Stocky worker database is required.');
    if (!runtime?.enabled || !runtime?.workerEnabled) {
        return Object.freeze({ processed: 0, skipped: 'STOCKY_SYSTEM_COMMERCE_WORKER_DISABLED' });
    }
    if (running) return Object.freeze({ processed: 0, skipped: 'ALREADY_RUNNING' });
    running = true;
    try {
        const maximum = boundedInteger(limit, 25, 1, 100);
        const deliveries = [];
        for (let index = 0; index < maximum; index += 1) {
            const result = await deliverNextStockyOrderEvent({ database, runtime, transport });
            if (!result.processed) break;
            deliveries.push(result);
        }
        return Object.freeze({ processed: deliveries.length, deliveries: Object.freeze(deliveries) });
    } finally {
        running = false;
    }
};

const startStockyOrderDeliveryWorker = ({
    database,
    runtime,
    environment = process.env,
    transport = createSafeStockyTransport(),
    unref = true
} = {}) => {
    if (timer) return false;
    const effectiveRuntime = runtime || resolveWorkerRuntime({ environment });
    if (!effectiveRuntime.enabled || !effectiveRuntime.workerEnabled) return false;
    if (!database || typeof database.query !== 'function') throw new TypeError('Stocky worker database is required.');
    const intervalMs = boundedInteger(environment.NOVASTORE_STOCKY_SYSTEM_COMMERCE_WORKER_INTERVAL_MS, 5000, 1000, 60000);
    const batchSize = boundedInteger(environment.NOVASTORE_STOCKY_SYSTEM_COMMERCE_WORKER_BATCH_SIZE, 25, 1, 100);
    const tick = () => runStockyOrderDeliveryWorkerCycle({
        database,
        runtime: effectiveRuntime,
        transport,
        limit: batchSize
    }).catch((error) => {
        console.error('Stocky order delivery worker transient failure:', String(error?.code || error?.name || 'STOCKY_WORKER_FAILED'));
    });
    timer = setInterval(tick, intervalMs);
    if (unref) timer.unref?.();
    setImmediate(tick);
    return true;
};

const stopStockyOrderDeliveryWorker = () => {
    if (!timer) return false;
    clearInterval(timer);
    timer = null;
    return true;
};

module.exports = Object.freeze({
    resolveWorkerRuntime,
    runStockyOrderDeliveryWorkerCycle,
    startStockyOrderDeliveryWorker,
    stopStockyOrderDeliveryWorker
});
