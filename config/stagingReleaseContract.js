const {
    ADMIN_WRITE_ENV_KEYS,
    EXTERNAL_SIDE_EFFECT_KINDS,
    FORBIDDEN_PROVIDER_CREDENTIAL_KEYS,
    STAGING_ACCESS_ENV_KEYS,
    resolveStagingRuntimePolicy
} = require('./stagingRuntimePolicy');
const { resolveDatabaseTarget } = require('./startupSafety');
const { LOCAL_TEST_CAPABILITY } = require('../scripts/staging-migrations/guard');
const { resolveRuntimeIdentity } = require('../services/runtimeIdentityService');

const RUNTIME_IDENTITY_ENV_KEYS = Object.freeze([
    'RENDER_GIT_COMMIT',
    'RAILWAY_GIT_COMMIT_SHA'
]);

const DATABASE_TARGET_ATTESTATION_ENV_KEYS = Object.freeze([
    'DATABASE_URL',
    'NOVASTORE_EXPECTED_DATABASE_HOST',
    'NOVASTORE_EXPECTED_DATABASE_NAME'
]);

const MIGRATION_GUARD_ENV_KEYS = Object.freeze([
    'NOVASTORE_DEPLOY_ENV',
    'NOVASTORE_STAGING_MIGRATIONS_ENABLED',
    'NOVASTORE_ALLOW_REMOTE_DB',
    ...DATABASE_TARGET_ATTESTATION_ENV_KEYS
]);

const SCHEMA_INIT_SAFETY_ENV_KEYS = Object.freeze([
    'SKIP_SCHEMA_INIT',
    'NOVASTORE_ALLOW_SCHEMA_INIT'
]);

const AI_POLICY_ENV_KEYS = Object.freeze([
    'AI_PROVIDER',
    'AI_PROVIDER_FALLBACK_ENABLED'
]);

const RELEASE_CAPABILITY_ENV_KEYS = Object.freeze([
    'NOVASTORE_STAGING_BOOTSTRAP_ENABLED',
    LOCAL_TEST_CAPABILITY
]);

const VERIFICATION_OPERATOR_ENV_KEYS = Object.freeze([
    'NOVASTORE_STAGING_VERIFY_TARGET',
    'NOVASTORE_STAGING_VERIFY_REMOTE_ENABLED',
    'NOVASTORE_STAGING_VERIFY_EXPECTED_HOST',
    'NOVASTORE_STAGING_VERIFY_EXPECTED_REVISION',
    'NOVASTORE_STAGING_VERIFY_USERNAME',
    'NOVASTORE_STAGING_VERIFY_PASSWORD'
]);

const SECRET_NAMES = Object.freeze([
    'DATABASE_URL',
    'JWT_SECRET',
    'NOVASTORE_STAGING_ACCESS_USERNAME',
    'NOVASTORE_STAGING_ACCESS_PASSWORD_HASH',
    'NOVASTORE_STAGING_ACCESS_SESSION_SECRET',
    'NOVASTORE_STAGING_VERIFY_USERNAME',
    'NOVASTORE_STAGING_VERIFY_PASSWORD'
]);

const REQUIRED_EXACT_VALUES = Object.freeze({
    NOVASTORE_DEPLOY_ENV: 'staging',
    NOVASTORE_STAGING_MIGRATIONS_ENABLED: 'true',
    NOVASTORE_ALLOW_REMOTE_DB: 'true',
    NOVASTORE_STAGING_ACCESS_GATE_ENABLED: 'true',
    NOVASTORE_STAGING_EXTERNAL_SIDE_EFFECTS_DISABLED: 'true',
    AI_PROVIDER: 'mock',
    AI_PROVIDER_FALLBACK_ENABLED: 'false',
    NOVASTORE_ADMIN_CATALOG_PRODUCT_WRITE_ENABLED: 'false',
    NOVASTORE_ADMIN_CATALOG_STRUCTURE_WRITE_ENABLED: 'false',
    NOVASTORE_ADMIN_CANCEL_WRITE_ENABLED: 'false',
    NOVASTORE_MANUAL_FULFILLMENT_WRITE_ENABLED: 'false',
    SKIP_SCHEMA_INIT: 'true',
    NOVASTORE_ALLOW_SCHEMA_INIT: 'false'
});

const uniqueSorted = (values) => Object.freeze([...new Set(values)].sort());

const REQUIRED_NAMES = uniqueSorted([
    ...RUNTIME_IDENTITY_ENV_KEYS,
    ...MIGRATION_GUARD_ENV_KEYS,
    ...STAGING_ACCESS_ENV_KEYS,
    'NOVASTORE_STAGING_EXTERNAL_SIDE_EFFECTS_DISABLED',
    ...AI_POLICY_ENV_KEYS,
    ...ADMIN_WRITE_ENV_KEYS,
    ...SCHEMA_INIT_SAFETY_ENV_KEYS,
    'JWT_SECRET'
]);

const FORBIDDEN_PROVIDER_CREDENTIAL_NAMES = FORBIDDEN_PROVIDER_CREDENTIAL_KEYS;
const FULL_REVISION_PATTERN = /^[0-9a-f]{40}$/;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/;

const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key);
const exactString = (value) => typeof value === 'string' ? value : '';

class StagingReleaseContractError extends Error {
    constructor(code, names = []) {
        super('Staging release contract validation failed.');
        this.name = 'StagingReleaseContractError';
        this.code = code;
        this.names = Object.freeze([...names]);
    }
}

const assertNoDuplicateNames = () => {
    const groups = [
        REQUIRED_NAMES,
        SECRET_NAMES,
        FORBIDDEN_PROVIDER_CREDENTIAL_NAMES,
        VERIFICATION_OPERATOR_ENV_KEYS
    ];
    for (const group of groups) {
        if (new Set(group).size !== group.length) {
            throw new StagingReleaseContractError('DUPLICATE_CONTRACT_NAME');
        }
    }
    return true;
};

const validateRequiredSecrets = (environment) => {
    const invalid = [];
    const jwtSecret = exactString(environment.JWT_SECRET);
    if (
        jwtSecret.length < 32 ||
        jwtSecret.length > 256 ||
        CONTROL_CHARACTER_PATTERN.test(jwtSecret)
    ) invalid.push('JWT_SECRET');
    if (invalid.length > 0) {
        throw new StagingReleaseContractError('INVALID_REQUIRED_SECRET', invalid);
    }
};

const validateStagingReleaseEnvironment = (
    environment,
    { allowBootstrapCapability = false } = {}
) => {
    if (!environment || typeof environment !== 'object') {
        throw new StagingReleaseContractError('INVALID_ENVIRONMENT_INPUT');
    }
    assertNoDuplicateNames();

    const missing = REQUIRED_NAMES.filter((name) => (
        !RUNTIME_IDENTITY_ENV_KEYS.includes(name) && !hasOwn(environment, name)
    ));
    if (missing.length > 0) {
        throw new StagingReleaseContractError('MISSING_REQUIRED_NAME', missing);
    }

    const exactMismatches = Object.entries(REQUIRED_EXACT_VALUES)
        .filter(([name, expected]) => exactString(environment[name]) !== expected)
        .map(([name]) => name);
    if (exactMismatches.length > 0) {
        throw new StagingReleaseContractError('REQUIRED_EXACT_VALUE_MISMATCH', exactMismatches);
    }

    const forbiddenPresent = FORBIDDEN_PROVIDER_CREDENTIAL_NAMES.filter((name) => hasOwn(environment, name));
    if (forbiddenPresent.length > 0) {
        throw new StagingReleaseContractError('FORBIDDEN_PROVIDER_CREDENTIAL_PRESENT', forbiddenPresent);
    }

    if (hasOwn(environment, LOCAL_TEST_CAPABILITY)) {
        throw new StagingReleaseContractError('LOCAL_TEST_CAPABILITY_FORBIDDEN', [LOCAL_TEST_CAPABILITY]);
    }
    const bootstrapCapabilityPresent = hasOwn(environment, 'NOVASTORE_STAGING_BOOTSTRAP_ENABLED');
    if (
        (allowBootstrapCapability && (
            !bootstrapCapabilityPresent ||
            environment.NOVASTORE_STAGING_BOOTSTRAP_ENABLED !== 'true'
        )) ||
        (!allowBootstrapCapability && bootstrapCapabilityPresent)
    ) {
        throw new StagingReleaseContractError(
            'BOOTSTRAP_CAPABILITY_NOT_AUTHORIZED',
            ['NOVASTORE_STAGING_BOOTSTRAP_ENABLED']
        );
    }

    validateRequiredSecrets(environment);

    const runtimePolicy = resolveStagingRuntimePolicy(environment);
    if (!runtimePolicy.canStart || !runtimePolicy.isStaging) {
        throw new StagingReleaseContractError('RUNTIME_POLICY_REJECTED');
    }

    const identity = resolveRuntimeIdentity(environment);
    if (!identity.available || !FULL_REVISION_PATTERN.test(identity.revision)) {
        throw new StagingReleaseContractError('RUNTIME_IDENTITY_REJECTED', RUNTIME_IDENTITY_ENV_KEYS);
    }

    let target;
    try {
        target = resolveDatabaseTarget(environment);
    } catch (_) {
        throw new StagingReleaseContractError('DATABASE_TARGET_ATTESTATION_REJECTED');
    }
    if (
        !target.remoteRelease ||
        !target.attested ||
        !target.tlsEnabled ||
        !target.tlsVerified ||
        target.database !== 'novastore_staging' ||
        target.errorCodes.length > 0
    ) {
        throw new StagingReleaseContractError('REMOTE_STAGING_TARGET_REQUIRED');
    }

    return Object.freeze({
        ready: true,
        revision: identity.revision,
        runtimeProvider: identity.provider,
        databaseMode: 'staging',
        bootstrapCapabilityAuthorized: allowBootstrapCapability
    });
};

const buildNamesOnlyReleaseContract = () => Object.freeze({
    requiredNames: REQUIRED_NAMES,
    requiredExactValueNames: Object.freeze(Object.keys(REQUIRED_EXACT_VALUES).sort()),
    secretNames: SECRET_NAMES,
    forbiddenProviderCredentialNames: FORBIDDEN_PROVIDER_CREDENTIAL_NAMES,
    runtimeIdentityNames: RUNTIME_IDENTITY_ENV_KEYS,
    releaseCapabilityNames: RELEASE_CAPABILITY_ENV_KEYS,
    verificationOperatorNames: VERIFICATION_OPERATOR_ENV_KEYS,
    externalSideEffectKinds: EXTERNAL_SIDE_EFFECT_KINDS
});

module.exports = {
    AI_POLICY_ENV_KEYS,
    DATABASE_TARGET_ATTESTATION_ENV_KEYS,
    FORBIDDEN_PROVIDER_CREDENTIAL_NAMES,
    MIGRATION_GUARD_ENV_KEYS,
    RELEASE_CAPABILITY_ENV_KEYS,
    REQUIRED_EXACT_VALUES,
    REQUIRED_NAMES,
    RUNTIME_IDENTITY_ENV_KEYS,
    SCHEMA_INIT_SAFETY_ENV_KEYS,
    SECRET_NAMES,
    StagingReleaseContractError,
    VERIFICATION_OPERATOR_ENV_KEYS,
    assertNoDuplicateNames,
    buildNamesOnlyReleaseContract,
    validateStagingReleaseEnvironment
};
