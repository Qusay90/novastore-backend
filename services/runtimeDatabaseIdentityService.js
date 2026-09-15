'use strict';

const RUNTIME_DATABASE_IDENTITY_QUERY =
    'SELECT current_database() AS database, inet_server_port() AS port';
const METADATA_KEYS = Object.freeze([
    'attested',
    'database',
    'host',
    'local',
    'port',
    'remoteRelease',
    'tlsEnabled',
    'tlsVerified'
]);

class RuntimeDatabaseIdentityError extends Error {
    constructor() {
        super('RUNTIME_DATABASE_IDENTITY_INVALID');
        this.name = 'RuntimeDatabaseIdentityError';
        this.code = 'RUNTIME_DATABASE_IDENTITY_INVALID';
    }
}

const invalid = () => { throw new RuntimeDatabaseIdentityError(); };

const metadataHasExactShape = (metadata) => {
    try {
        const descriptors = Object.getOwnPropertyDescriptors(metadata || {});
        return Boolean(
            metadata &&
            typeof metadata === 'object' &&
            Object.isFrozen(metadata) &&
            Object.getPrototypeOf(metadata) === null &&
            JSON.stringify(Reflect.ownKeys(metadata).sort()) === JSON.stringify(METADATA_KEYS) &&
            Object.values(descriptors).every((descriptor) => (
                Object.prototype.hasOwnProperty.call(descriptor, 'value') &&
                descriptor.enumerable === true &&
                descriptor.writable === false &&
                descriptor.configurable === false
            ))
        );
    } catch (_) {
        return false;
    }
};

const metadataMatchesTarget = (metadata, target) => metadataHasExactShape(metadata) && (
    metadata.host === target?.host &&
    metadata.port === target?.port &&
    metadata.database === target?.database &&
    metadata.local === target?.local &&
    metadata.remoteRelease === target?.remoteRelease &&
    metadata.tlsEnabled === target?.tlsEnabled &&
    metadata.tlsVerified === target?.tlsVerified &&
    metadata.attested === target?.attested
);

const expectedServerPort = (target) => (
    target?.port === 6543 && /\.pooler\.supabase\.com$/iu.test(String(target?.host || ''))
        ? 5432
        : target?.port
);

const assertRuntimeDatabaseIdentity = async ({ database, target } = {}) => {
    if (
        !database ||
        typeof database.query !== 'function' ||
        typeof database.getRuntimeTargetMetadata !== 'function' ||
        !metadataMatchesTarget(database.getRuntimeTargetMetadata(), target)
    ) invalid();

    let result;
    try {
        result = await database.query(RUNTIME_DATABASE_IDENTITY_QUERY);
    } catch (_) {
        invalid();
    }
    const row = result?.rows?.length === 1 ? result.rows[0] : null;
    if (
        !row ||
        row.database !== target.database ||
        !Number.isInteger(Number(row.port)) ||
        Number(row.port) < 1 ||
        Number(row.port) > 65535 ||
        (!target.local && Number(row.port) !== expectedServerPort(target))
    ) invalid();

    return Object.freeze({ database: row.database, port: Number(row.port) });
};

module.exports = Object.freeze({
    METADATA_KEYS,
    RUNTIME_DATABASE_IDENTITY_QUERY,
    RuntimeDatabaseIdentityError,
    assertRuntimeDatabaseIdentity,
    metadataHasExactShape,
    metadataMatchesTarget
});
