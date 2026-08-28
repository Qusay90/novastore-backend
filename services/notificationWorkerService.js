'use strict';

const pool = require('../config/db');
const { deliverPendingAndroidPushBatch } = require('./androidPushDeliveryService');
const { createFcmHttpV1Provider } = require('./androidPushProviderService');
const { deliverPendingWebPushBatch } = require('./notificationDeliveryService');
const { dispatchNotificationOutboxBatch } = require('./notificationOutboxService');
const { createWebPushProvider } = require('./webPushProviderService');

let timer = null;
let running = false;

const runNotificationWorkerCycle = async ({
    database = pool,
    io = null,
    provider = null,
    webPushProvider = null,
    androidPushProvider = null
} = {}) => {
    if (running) return Object.freeze({ skipped: 'ALREADY_RUNNING' });
    running = true;
    try {
        const outbox = await dispatchNotificationOutboxBatch({ database, io, limit: 50 });
        const webPush = await deliverPendingWebPushBatch({
            database,
            provider: webPushProvider || provider || createWebPushProvider(),
            limit: 50
        });
        const androidPush = await deliverPendingAndroidPushBatch({
            database,
            provider: androidPushProvider || createFcmHttpV1Provider(),
            limit: 50
        });
        return Object.freeze({ outboxProcessed: outbox.length, webPush, androidPush });
    } finally {
        running = false;
    }
};

const startNotificationWorker = ({ database = pool, getIo = () => null, env = process.env } = {}) => {
    if (timer) return false;
    if (String(env.NOVASTORE_NOTIFICATION_WORKER_ENABLED || 'true').trim().toLowerCase() === 'false') return false;
    const requested = Number(env.NOVASTORE_NOTIFICATION_WORKER_INTERVAL_MS);
    const intervalMs = Number.isSafeInteger(requested) ? Math.max(2000, Math.min(requested, 60000)) : 5000;
    const tick = () => runNotificationWorkerCycle({ database, io: getIo() }).catch((error) => {
        console.error('Bildirim işleyicisi geçici hata:', String(error?.code || error?.name || 'NOTIFICATION_WORKER_FAILED'));
    });
    timer = setInterval(tick, intervalMs);
    timer.unref?.();
    setImmediate(tick);
    return true;
};

const stopNotificationWorker = () => {
    if (!timer) return false;
    clearInterval(timer);
    timer = null;
    return true;
};

module.exports = Object.freeze({
    runNotificationWorkerCycle,
    startNotificationWorker,
    stopNotificationWorker
});
