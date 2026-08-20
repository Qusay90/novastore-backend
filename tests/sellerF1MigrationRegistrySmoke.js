'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const net = require('node:net');
const path = require('node:path');
const tls = require('node:tls');

const repositoryRoot = path.resolve(__dirname, '..');
const registryPath = path.join(repositoryRoot, 'models', 'sellerF1MigrationRegistry.js');
const registrySource = fs.readFileSync(registryPath, 'utf8');
const expectedIds = [
    'seller-f1a-001-organizations-roles-memberships',
    'seller-f1a-002-store-bindings-invitations',
    'seller-f1a-003-sessions-audit-outbox',
    'seller-f1b-004-bootstrap-operator-authorizations'
];
const expectedPaths = [
    'migrations/20260730_seller_f1_organizations_roles_memberships.sql',
    'migrations/20260730_seller_f1_store_bindings_invitations.sql',
    'migrations/20260730_seller_f1_sessions_audit_outbox.sql',
    'migrations/20260806_seller_f1b_bootstrap_operator_authorizations.sql'
];
const expectedChecksums = [
    '85fabd7bd8d5c2928edf9c106d2d122e41111f685b88562b516c5565e2910374',
    '6dd588c002184f325f7334d180f9633fcc9d2d5077f4e0333f7f81c9778579be',
    '6b31ff5cea93d3ee2440ef4b78bb4df170267805508c6862ec20fe522ff5a152',
    'd589ea48291cfff1c337a3dc6ffca3c114a417c447c224026c8328ebad3aa84c'
];

const cloneDescriptors = (descriptors) => descriptors.map((descriptor) => ({
    ...descriptor,
    receiptChecksumPolicy: { ...descriptor.receiptChecksumPolicy }
}));

const assertRegistryError = (callback, code) => {
    assert.throws(callback, (error) => (
        error && error.code === code &&
        !String(error.message).includes('password') &&
        !String(error.message).includes('postgresql://')
    ));
};

const cachedBeforeImport = new Set(Object.keys(require.cache));
const originalLoad = Module._load;
const originalNetConnect = net.connect;
const originalNetCreateConnection = net.createConnection;
const originalTlsConnect = tls.connect;
let databaseImports = 0;
let socketCalls = 0;
let registry;

const rejectSocket = () => {
    socketCalls += 1;
    throw new Error('socket operation is forbidden during registry import');
};

try {
    Module._load = function guardedModuleLoad(request, parent, isMain) {
        if (request === 'pg') {
            databaseImports += 1;
            throw new Error('database module import is forbidden during registry import');
        }
        return originalLoad.call(this, request, parent, isMain);
    };
    net.connect = rejectSocket;
    net.createConnection = rejectSocket;
    tls.connect = rejectSocket;
    registry = require('../models/sellerF1MigrationRegistry');
} finally {
    Module._load = originalLoad;
    net.connect = originalNetConnect;
    net.createConnection = originalNetCreateConnection;
    tls.connect = originalTlsConnect;
}

try {
    const importedDuringRegistryLoad = Object.keys(require.cache)
        .filter((cacheKey) => !cachedBeforeImport.has(cacheKey));

    assert.equal(registry.REGISTRY_SCOPE, 'F1A_ISOLATED_VERIFICATION_REGISTRY');
    assert.equal(registry.F1A_MIGRATIONS.length, 4);
    assert.deepEqual(registry.F1A_MIGRATIONS.map((descriptor) => descriptor.order), [1, 2, 3, 4]);
    assert.deepEqual(registry.F1A_MIGRATIONS.map((descriptor) => descriptor.id), expectedIds);
    assert.deepEqual(registry.F1A_MIGRATIONS.map((descriptor) => descriptor.relativePath), expectedPaths);
    assert.deepEqual(registry.F1A_MIGRATIONS.map((descriptor) => descriptor.sha256), expectedChecksums);
    assert.deepEqual(registry.EXPECTED_MIGRATION_IDS, expectedIds);
    assert.deepEqual(registry.EXPECTED_MIGRATION_RELATIVE_PATHS, expectedPaths);
    assert.equal(Object.isFrozen(registry), true);
    assert.equal(Object.isFrozen(registry.F1A_MIGRATIONS), true);
    registry.F1A_MIGRATIONS.forEach((descriptor) => {
        assert.equal(Object.isFrozen(descriptor), true);
        assert.equal(Object.isFrozen(descriptor.receiptChecksumPolicy), true);
        assert.match(descriptor.relativePath, /^migrations\//u);
        assert.equal(path.isAbsolute(descriptor.relativePath), false);
        assert.equal(descriptor.relativePath.includes('..'), false);
    });
    assert.throws(() => registry.F1A_MIGRATIONS.push({}), TypeError);

    const verified = registry.verifyMigrationFiles();
    assert.equal(verified.length, 4);
    assert.deepEqual(verified.map((descriptor) => descriptor.sha256), expectedChecksums);
    assert.equal(verified.every(Object.isFrozen), true);

    assertRegistryError(
        () => registry.resolveMigrationPath('../package.json'),
        'SELLER_F1_REGISTRY_PATH_ESCAPE_REJECTED'
    );
    assertRegistryError(
        () => registry.resolveMigrationPath(path.resolve(repositoryRoot, expectedPaths[0])),
        'SELLER_F1_REGISTRY_PATH_ESCAPE_REJECTED'
    );

    const duplicateIds = cloneDescriptors(registry.F1A_MIGRATIONS);
    duplicateIds[1].id = duplicateIds[0].id;
    assertRegistryError(
        () => registry.validateMigrationDescriptors(duplicateIds),
        'SELLER_F1_REGISTRY_DUPLICATE_ID'
    );

    const duplicateOrders = cloneDescriptors(registry.F1A_MIGRATIONS);
    duplicateOrders[1].order = duplicateOrders[0].order;
    assertRegistryError(
        () => registry.validateMigrationDescriptors(duplicateOrders),
        'SELLER_F1_REGISTRY_DUPLICATE_ORDER'
    );

    const missingOrder = cloneDescriptors(registry.F1A_MIGRATIONS);
    missingOrder[3].order = 5;
    assertRegistryError(
        () => registry.validateMigrationDescriptors(missingOrder),
        'SELLER_F1_REGISTRY_ORDER_CONTINUITY_REJECTED'
    );

    const invalidPredecessor = cloneDescriptors(registry.F1A_MIGRATIONS);
    invalidPredecessor[1].previousMigrationId = 'seller-f1a-unknown';
    assertRegistryError(
        () => registry.validateMigrationDescriptors(invalidPredecessor),
        'SELLER_F1_REGISTRY_PREDECESSOR_REJECTED'
    );

    const unexpectedFifthMigration = [
        ...cloneDescriptors(registry.F1A_MIGRATIONS),
        { ...cloneDescriptors(registry.F1A_MIGRATIONS)[0], id: 'seller-f1b-005-unexpected', order: 5 }
    ];
    assertRegistryError(
        () => registry.validateMigrationDescriptors(unexpectedFifthMigration),
        'SELLER_F1_REGISTRY_SET_REJECTED'
    );

    const missingFileIo = {
        lstatSync() {
            const error = new Error('missing');
            error.code = 'ENOENT';
            throw error;
        },
        readFileSync: fs.readFileSync
    };
    assertRegistryError(
        () => registry.verifyMigrationFiles(registry.F1A_MIGRATIONS, missingFileIo),
        'SELLER_F1_REGISTRY_MIGRATION_FILE_MISSING'
    );

    const checksumMismatchIo = {
        lstatSync: fs.lstatSync,
        readFileSync: () => Buffer.from('synthetic checksum mismatch', 'utf8')
    };
    assertRegistryError(
        () => registry.verifyMigrationFiles(registry.F1A_MIGRATIONS, checksumMismatchIo),
        'SELLER_F1_REGISTRY_CHECKSUM_MISMATCH'
    );

    const symbolicLinkIo = {
        lstatSync: () => ({
            isFile: () => true,
            isSymbolicLink: () => true
        }),
        readFileSync: fs.readFileSync
    };
    assertRegistryError(
        () => registry.verifyMigrationFiles(registry.F1A_MIGRATIONS, symbolicLinkIo),
        'SELLER_F1_REGISTRY_MIGRATION_FILE_REJECTED'
    );

    assert.doesNotMatch(registrySource, /process\.env|DATABASE_URL|require\(['"]pg['"]\)|config\/db|createCoreSchema|createCoreDb|server\.js/u);
    assert.equal(databaseImports, 0);
    assert.equal(socketCalls, 0);
    assert.equal(
        importedDuringRegistryLoad.some((cacheKey) => /[\\/]node_modules[\\/]pg[\\/]/u.test(cacheKey)),
        false
    );

    console.log('sellerF1MigrationRegistrySmoke:');
    console.log('PASS');
    console.log('migrations=4');
    console.log('order=1,2,3,4');
    console.log('checksums=4');
    console.log('db-connections=0');
    console.log('startup-registration=0');
} catch (error) {
    console.error('sellerF1MigrationRegistrySmoke: FAIL');
    console.error(error.stack || error.message);
    process.exitCode = 1;
}
