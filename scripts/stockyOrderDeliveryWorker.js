'use strict';

const database = require('../config/db');
const { resolveStartupSafety } = require('../config/startupSafety');
const { assertRuntimeDatabaseIdentity } = require('../services/runtimeDatabaseIdentityService');
const {
    resolveWorkerRuntime,
    runStockyOrderDeliveryWorkerCycle,
    startStockyOrderDeliveryWorker,
    stopStockyOrderDeliveryWorker
} = require('../services/stockyOrderDeliveryWorkerService');

const run = async ({ environment = process.env } = {}) => {
    const startupSafety = resolveStartupSafety(environment);
    const runtime = resolveWorkerRuntime({ environment, startupSafety });
    if (!runtime.enabled || !runtime.workerEnabled) {
        return Object.freeze({ started: false, reason: 'STOCKY_SYSTEM_COMMERCE_WORKER_DISABLED' });
    }
    if (!startupSafety.shouldVerifyDbConnection) throw new Error('RUNTIME_DATABASE_IDENTITY_REQUIRED');
    await assertRuntimeDatabaseIdentity({ database, target: startupSafety.target });
    if (String(environment.NOVASTORE_STOCKY_SYSTEM_COMMERCE_WORKER_ONCE || '').trim().toLowerCase() === 'true') {
        const result = await runStockyOrderDeliveryWorkerCycle({ database, runtime });
        await database.end?.();
        return Object.freeze({ started: true, once: true, ...result });
    }
    const started = startStockyOrderDeliveryWorker({ database, runtime, environment, unref: false });
    if (!started) return Object.freeze({ started: false, reason: 'STOCKY_SYSTEM_COMMERCE_WORKER_NOT_STARTED' });
    const shutdown = async () => {
        stopStockyOrderDeliveryWorker();
        await database.end?.();
    };
    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
    return Object.freeze({ started: true, once: false });
};

if (require.main === module) {
    run()
        .then((result) => process.stdout.write(`${JSON.stringify(result)}\n`))
        .catch((error) => {
            process.stderr.write(`${JSON.stringify({ status: 'FAIL', code: String(error?.code || 'STOCKY_WORKER_FAILED') })}\n`);
            process.exitCode = 1;
        });
}

module.exports = Object.freeze({ run });
