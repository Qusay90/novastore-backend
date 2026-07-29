const { resolveRuntimeIdentity } = require('../services/runtimeIdentityService');
const {
    resolveDatabaseTarget,
    resolveStartupSafety
} = require('../config/startupSafety');
const { resolveStagingRuntimePolicy } = require('../config/stagingRuntimePolicy');

const LIVE_RESPONSE = Object.freeze({ status: 'live' });
const READY_RESPONSE = Object.freeze({ status: 'ready' });
const UNAVAILABLE_RESPONSE = Object.freeze({ status: 'unavailable' });
const REMOTE_METADATA_KEYS = Object.freeze([
    'attested',
    'database',
    'host',
    'local',
    'port',
    'remoteRelease',
    'tlsEnabled',
    'tlsVerified'
]);
const REMOTE_READINESS_QUERY =
    'SELECT 1 AS ready, current_database() AS database, inet_server_port() AS port';

const metadataHasExactShape = (metadata) => {
    let keys;
    let descriptors;
    try {
        keys = Reflect.ownKeys(metadata || {});
        descriptors = Object.getOwnPropertyDescriptors(metadata || {});
    } catch (_) {
        return false;
    }
    return !(
        !metadata ||
        typeof metadata !== 'object' ||
        !Object.isFrozen(metadata) ||
        Object.getPrototypeOf(metadata) !== null ||
        keys.some((key) => typeof key !== 'string') ||
        JSON.stringify([...keys].sort()) !== JSON.stringify(REMOTE_METADATA_KEYS) ||
        !Object.values(descriptors).every((descriptor) => (
            Object.prototype.hasOwnProperty.call(descriptor, 'value') &&
            descriptor.enumerable === true &&
            descriptor.writable === false &&
            descriptor.configurable === false
        ))
    );
};

const metadataMatchesTarget = (metadata, target) => {
    if (!metadataHasExactShape(metadata)) return false;
    return (
        metadata.host === target.host &&
        metadata.port === target.port &&
        metadata.database === target.database &&
        metadata.local === target.local &&
        metadata.remoteRelease === target.remoteRelease &&
        metadata.tlsEnabled === target.tlsEnabled &&
        metadata.tlsVerified === target.tlsVerified &&
        metadata.attested === target.attested
    );
};

const remoteReadinessResultMatches = (result, target) => {
    if (!result || !Array.isArray(result.rows) || result.rows.length !== 1) return false;
    const row = result.rows[0];
    if (
        row?.ready !== 1 ||
        row.database !== target.database ||
        !Number.isInteger(Number(row.port)) ||
        Number(row.port) < 1 ||
        Number(row.port) > 65535
    ) return false;

    // Supabase transaction-pooler clients use 6543 while PostgreSQL reports
    // the connected backend's 5432 port. Every other target remains exact.
    const expectedServerPort = (
        target.port === 6543 &&
        /\.pooler\.supabase\.com$/i.test(target.host)
    ) ? 5432 : target.port;
    return Number(row.port) === expectedServerPort;
};

const createRuntimeMetaController = ({ database, environment = process.env } = {}) => {
    const getDatabase = () => database || require('../config/db');

    const getLive = (req, res) => res.status(200).json(LIVE_RESPONSE);

    const getReady = async (req, res) => {
        try {
            const stagingRuntimePolicy = resolveStagingRuntimePolicy(environment);
            if (!stagingRuntimePolicy.canStart) {
                return res.status(503).json(UNAVAILABLE_RESPONSE);
            }

            const identity = resolveRuntimeIdentity(environment);
            if (!identity.available) {
                return res.status(503).json(UNAVAILABLE_RESPONSE);
            }

            const resolvedTarget = resolveDatabaseTarget(environment);
            const activeDatabase = getDatabase();
            if (resolvedTarget.remoteRelease) {
                const startupSafety = resolveStartupSafety(environment);
                if (!startupSafety.canStart) {
                    return res.status(503).json(UNAVAILABLE_RESPONSE);
                }
                if (typeof activeDatabase?.getRuntimeTargetMetadata !== 'function') {
                    return res.status(503).json(UNAVAILABLE_RESPONSE);
                }
                const metadata = activeDatabase.getRuntimeTargetMetadata();
                if (!metadataMatchesTarget(metadata, resolvedTarget)) {
                    return res.status(503).json(UNAVAILABLE_RESPONSE);
                }

                const result = await activeDatabase.query(REMOTE_READINESS_QUERY);
                if (!remoteReadinessResultMatches(result, resolvedTarget)) {
                    return res.status(503).json(UNAVAILABLE_RESPONSE);
                }
                return res.status(200).json(READY_RESPONSE);
            }

            if (typeof activeDatabase?.getRuntimeTargetMetadata === 'function') {
                const metadata = activeDatabase.getRuntimeTargetMetadata();
                if (
                    !metadataHasExactShape(metadata) ||
                    metadata.remoteRelease === true ||
                    (
                        resolvedTarget.hasDatabaseConfig &&
                        !metadataMatchesTarget(metadata, resolvedTarget)
                    )
                ) {
                    return res.status(503).json(UNAVAILABLE_RESPONSE);
                }
            }

            const result = await activeDatabase.query('SELECT 1 AS ready');
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

module.exports = {
    REMOTE_READINESS_QUERY,
    createRuntimeMetaController
};
