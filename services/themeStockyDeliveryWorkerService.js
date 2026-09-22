'use strict';

const { createThemeDeliveryWorker } = require('./themeStockyDeliveryService');

// Each process has at most one cycle per worker; independent processes are
// coordinated by the durable PostgreSQL lease, not by this timer.
function startThemeDeliveryWorker({ database, runtime, intervalMs = 5000, unref = true }) {
    if (!runtime?.enabled || !runtime?.workerEnabled) return null;
    const worker = createThemeDeliveryWorker({ database, runtime });
    let stopped = false, active = null;
    const tick = () => {
        if (stopped || active) return;
        active = worker.tick().catch(() => {
            // No upstream bodies, connection secrets or assertion material in logs.
            console.error('THEME_DELIVERY_WORKER_CYCLE_FAILED');
        }).finally(() => { active = null; });
    };
    const interval = Number.isSafeInteger(intervalMs) ? Math.max(1000, Math.min(60000, intervalMs)) : 5000;
    const timer = setInterval(tick, interval);
    if (unref) timer.unref();
    tick();
    return Object.freeze({ async stop() { stopped = true; clearInterval(timer); if (active) await active; } });
}

module.exports = Object.freeze({ startThemeDeliveryWorker });
