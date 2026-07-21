const { resolveRuntimeIdentity } = require('../services/runtimeIdentityService');

const LIVE_RESPONSE = Object.freeze({ status: 'live' });
const READY_RESPONSE = Object.freeze({ status: 'ready' });
const UNAVAILABLE_RESPONSE = Object.freeze({ status: 'unavailable' });

const createRuntimeMetaController = ({ database, environment = process.env } = {}) => {
    const getDatabase = () => database || require('../config/db');

    const getLive = (req, res) => res.status(200).json(LIVE_RESPONSE);

    const getReady = async (req, res) => {
        try {
            const identity = resolveRuntimeIdentity(environment);
            if (!identity.available) {
                return res.status(503).json(UNAVAILABLE_RESPONSE);
            }

            const result = await getDatabase().query('SELECT 1 AS ready');
            if (
                !result ||
                !Array.isArray(result.rows) ||
                result.rows.length !== 1 ||
                result.rows[0]?.ready !== 1
            ) {
                return res.status(503).json(UNAVAILABLE_RESPONSE);
            }

            return res.status(200).json(READY_RESPONSE);
        } catch (_) {
            return res.status(503).json(UNAVAILABLE_RESPONSE);
        }
    };

    const getVersion = (req, res) => {
        res.set('Cache-Control', 'no-store');
        try {
            const identity = resolveRuntimeIdentity(environment);
            if (!identity.available) {
                return res.status(503).json(UNAVAILABLE_RESPONSE);
            }

            return res.status(200).json({
                revision: identity.revision,
                provider: identity.provider
            });
        } catch (_) {
            return res.status(503).json(UNAVAILABLE_RESPONSE);
        }
    };

    return { getLive, getReady, getVersion };
};

module.exports = { createRuntimeMetaController };
