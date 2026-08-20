'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const tls = require('node:tls');

if (!process.argv.includes('--guard-only')) {
    console.error('sellerF1MigrationDisposableDbSmoke: BLOCKED');
    console.error('mode=guard-only is required; database execution requires separate authorization');
    process.exitCode = 1;
} else {
    const helperPath = path.join(__dirname, 'helpers', 'sellerF1DisposableDb.js');
    const helperSource = fs.readFileSync(helperPath, 'utf8');
    const cachedBeforeImport = new Set(Object.keys(require.cache));
    const helper = require('./helpers/sellerF1DisposableDb');
    const importedDuringHelperLoad = Object.keys(require.cache)
        .filter((cacheKey) => !cachedBeforeImport.has(cacheKey));

    let socketCalls = 0;
    let remoteTargetsRejected = 0;
    let pathEscapesRejected = 0;
    const originalNetConnect = net.connect;
    const originalNetCreateConnection = net.createConnection;
    const originalTlsConnect = tls.connect;

    const rejectSocket = () => {
        socketCalls += 1;
        throw new Error('socket operation is forbidden in guard-only mode');
    };

    try {
        net.connect = rejectSocket;
        net.createConnection = rejectSocket;
        tls.connect = rejectSocket;

        const validTarget = helper.validateDisposableDbTarget({
            host: '127.0.0.1',
            database: `${helper.TEST_DATABASE_PREFIX}guard_only`,
            port: 5432,
            ssl: false
        });
        assert.equal(validTarget.host, '127.0.0.1');
        assert.equal(validTarget.database, `${helper.TEST_DATABASE_PREFIX}guard_only`);

        for (const host of ['db.example.test', '192.168.1.10', 'host.docker.internal']) {
            assert.throws(
                () => helper.validateDisposableDbTarget({
                    host,
                    database: `${helper.TEST_DATABASE_PREFIX}remote_probe`,
                    password: 'never-disclose-this'
                }),
                (error) => error.code === 'SELLER_F1_DB_HOST_REJECTED' && !error.message.includes('never-disclose-this')
            );
            remoteTargetsRejected += 1;
        }

        for (const database of ['postgres', 'novastore_dev', 'novastore_seller_f1_test_production']) {
            assert.throws(
                () => helper.validateDisposableDbTarget({ host: 'localhost', database }),
                /SELLER_F1_DB_NAME_REJECTED/u
            );
        }

        const allowedMigrationPaths = helper.allowedMigrationNames;
        assert.throws(
            () => helper.authorizeMigrationApply({
                connection: validTarget,
                migrationPaths: allowedMigrationPaths
            }),
            /SELLER_F1_DB_OPERATION_EXPLICIT_OPT_IN_REQUIRED/u
        );
        assert.throws(
            () => helper.authorizeMigrationApply({
                allowDbOperation: true,
                connection: validTarget,
                migrationPaths: allowedMigrationPaths
            }),
            /SELLER_F1_MIGRATION_APPLY_AUTHORIZATION_REQUIRED/u
        );

        for (const migrationPath of ['../package.json', '../../outside.sql']) {
            assert.throws(
                () => helper.validateMigrationPath(migrationPath),
                /SELLER_F1_MIGRATION_PATH_ESCAPE_REJECTED/u
            );
            pathEscapesRejected += 1;
        }

        assert.throws(
            () => helper.validateMigrationPath('20260701_category_v2_additive_foundation.sql'),
            /SELLER_F1_MIGRATION_PATH_UNAUTHORIZED/u
        );
        assert.throws(
            () => helper.authorizeDisposableDbCleanup({
                allowDbOperation: true,
                connection: validTarget
            }),
            /SELLER_F1_DB_CLEANUP_AUTHORIZATION_REQUIRED/u
        );

        assert.doesNotMatch(helperSource, /require\(['"]pg['"]\)/u, 'helper must not import a database client');
        assert.equal(
            importedDuringHelperLoad.some((cacheKey) => /[\\/]node_modules[\\/]pg[\\/]/u.test(cacheKey)),
            false,
            'helper import must not load a database client'
        );
        assert.equal(socketCalls, 0, 'guard-only checks must not open a socket');
    } finally {
        net.connect = originalNetConnect;
        net.createConnection = originalNetCreateConnection;
        tls.connect = originalTlsConnect;
    }

    if (process.exitCode) {
        process.exitCode = 1;
    } else {
        console.log('sellerF1MigrationDisposableDbSmoke:');
        console.log('PASS');
        console.log('mode=guard-only');
        console.log('db-connections=0');
        console.log(`remote-targets-rejected=${remoteTargetsRejected}`);
        console.log(`path-escapes-rejected=${pathEscapesRejected}`);
    }
}
