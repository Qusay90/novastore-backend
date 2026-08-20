'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const REGISTRY_SCOPE = 'F1A_ISOLATED_VERIFICATION_REGISTRY';
const repositoryRoot = path.resolve(__dirname, '..');
const migrationsDirectory = path.join(repositoryRoot, 'migrations');

class SellerF1MigrationRegistryError extends Error {
    constructor(code) {
        super(code);
        this.name = 'SellerF1MigrationRegistryError';
        this.code = code;
    }
}

const fail = (code) => {
    throw new SellerF1MigrationRegistryError(code);
};

const freezeDescriptor = (descriptor) => Object.freeze({
    ...descriptor,
    receiptChecksumPolicy: Object.freeze({
        ...descriptor.receiptChecksumPolicy
    })
});

const F1A_MIGRATIONS = Object.freeze([
    freezeDescriptor({
        id: 'seller-f1a-001-organizations-roles-memberships',
        order: 1,
        relativePath: 'migrations/20260730_seller_f1_organizations_roles_memberships.sql',
        sha256: '85fabd7bd8d5c2928edf9c106d2d122e41111f685b88562b516c5565e2910374',
        previousMigrationId: null,
        transactionExpectation: 'REQUIRED',
        rerunnableExpectation: 'SECOND_APPLY_REQUIRED',
        purpose: 'Seller organization, role, permission, and membership foundation.',
        receiptChecksumPolicy: {
            mode: 'FUTURE_DB_ENABLED_RUNNER_ONLY',
            receiptKey: 'seller-f1a-001-organizations-roles-memberships',
            checksumRequired: true,
            writeReceiptOnlyAfterVerifiedApply: true
        }
    }),
    freezeDescriptor({
        id: 'seller-f1a-002-store-bindings-invitations',
        order: 2,
        relativePath: 'migrations/20260730_seller_f1_store_bindings_invitations.sql',
        sha256: '6dd588c002184f325f7334d180f9633fcc9d2d5077f4e0333f7f81c9778579be',
        previousMigrationId: 'seller-f1a-001-organizations-roles-memberships',
        transactionExpectation: 'REQUIRED',
        rerunnableExpectation: 'SECOND_APPLY_REQUIRED',
        purpose: 'Seller-store binding, membership scope, and invitation foundation.',
        receiptChecksumPolicy: {
            mode: 'FUTURE_DB_ENABLED_RUNNER_ONLY',
            receiptKey: 'seller-f1a-002-store-bindings-invitations',
            checksumRequired: true,
            writeReceiptOnlyAfterVerifiedApply: true
        }
    }),
    freezeDescriptor({
        id: 'seller-f1a-003-sessions-audit-outbox',
        order: 3,
        relativePath: 'migrations/20260730_seller_f1_sessions_audit_outbox.sql',
        sha256: '6b31ff5cea93d3ee2440ef4b78bb4df170267805508c6862ec20fe522ff5a152',
        previousMigrationId: 'seller-f1a-002-store-bindings-invitations',
        transactionExpectation: 'REQUIRED',
        rerunnableExpectation: 'SECOND_APPLY_REQUIRED',
        purpose: 'Seller session, append-only audit, and outbox schema foundation.',
        receiptChecksumPolicy: {
            mode: 'FUTURE_DB_ENABLED_RUNNER_ONLY',
            receiptKey: 'seller-f1a-003-sessions-audit-outbox',
            checksumRequired: true,
            writeReceiptOnlyAfterVerifiedApply: true
        }
    }),
    freezeDescriptor({
        id: 'seller-f1b-004-bootstrap-operator-authorizations',
        order: 4,
        relativePath: 'migrations/20260806_seller_f1b_bootstrap_operator_authorizations.sql',
        sha256: 'd589ea48291cfff1c337a3dc6ffca3c114a417c447c224026c8328ebad3aa84c',
        previousMigrationId: 'seller-f1a-003-sessions-audit-outbox',
        transactionExpectation: 'REQUIRED',
        rerunnableExpectation: 'SECOND_APPLY_REQUIRED',
        purpose: 'Persistent one-time operator authorization for first-party seller bootstrap.',
        receiptChecksumPolicy: {
            mode: 'FUTURE_DB_ENABLED_RUNNER_ONLY',
            receiptKey: 'seller-f1b-004-bootstrap-operator-authorizations',
            checksumRequired: true,
            writeReceiptOnlyAfterVerifiedApply: true
        }
    })
]);

const EXPECTED_MIGRATION_RELATIVE_PATHS = Object.freeze(
    F1A_MIGRATIONS.map((descriptor) => descriptor.relativePath)
);
const EXPECTED_MIGRATION_IDS = Object.freeze(
    F1A_MIGRATIONS.map((descriptor) => descriptor.id)
);
const expectedDescriptorByPath = new Map(
    F1A_MIGRATIONS.map((descriptor) => [descriptor.relativePath, descriptor])
);

const requirePlainDescriptor = (descriptor) => {
    if (!descriptor || typeof descriptor !== 'object' || Array.isArray(descriptor)) {
        fail('SELLER_F1_REGISTRY_DESCRIPTOR_REQUIRED');
    }
    return descriptor;
};

const resolveMigrationPath = (relativePath) => {
    if (typeof relativePath !== 'string' || relativePath.length === 0) {
        fail('SELLER_F1_REGISTRY_PATH_REQUIRED');
    }

    if (
        path.isAbsolute(relativePath) ||
        relativePath.includes('\\') ||
        relativePath.split('/').includes('..')
    ) {
        fail('SELLER_F1_REGISTRY_PATH_ESCAPE_REJECTED');
    }

    if (!EXPECTED_MIGRATION_RELATIVE_PATHS.includes(relativePath)) {
        fail('SELLER_F1_REGISTRY_UNEXPECTED_MIGRATION');
    }

    const resolved = path.resolve(repositoryRoot, ...relativePath.split('/'));
    const repositoryRelative = path.relative(repositoryRoot, resolved).split(path.sep).join('/');
    const migrationRelative = path.relative(migrationsDirectory, resolved).split(path.sep).join('/');

    if (
        repositoryRelative !== relativePath ||
        migrationRelative.startsWith('../') ||
        path.isAbsolute(migrationRelative) ||
        migrationRelative.length === 0
    ) {
        fail('SELLER_F1_REGISTRY_PATH_ESCAPE_REJECTED');
    }

    return resolved;
};

const validateMigrationDescriptors = (descriptors) => {
    if (!Array.isArray(descriptors) || descriptors.length !== F1A_MIGRATIONS.length) {
        fail('SELLER_F1_REGISTRY_SET_REJECTED');
    }

    const ids = new Set();
    const orders = new Set();
    const relativePaths = new Set();

    for (const descriptor of descriptors) {
        const value = requirePlainDescriptor(descriptor);

        if (typeof value.id !== 'string' || value.id.length === 0) {
            fail('SELLER_F1_REGISTRY_ID_REQUIRED');
        }
        if (ids.has(value.id)) {
            fail('SELLER_F1_REGISTRY_DUPLICATE_ID');
        }
        ids.add(value.id);

        if (!Number.isInteger(value.order) || value.order < 1) {
            fail('SELLER_F1_REGISTRY_ORDER_REQUIRED');
        }
        if (orders.has(value.order)) {
            fail('SELLER_F1_REGISTRY_DUPLICATE_ORDER');
        }
        orders.add(value.order);

        if (typeof value.relativePath !== 'string' || value.relativePath.length === 0) {
            fail('SELLER_F1_REGISTRY_PATH_REQUIRED');
        }
        if (relativePaths.has(value.relativePath)) {
            fail('SELLER_F1_REGISTRY_DUPLICATE_PATH');
        }
        relativePaths.add(value.relativePath);

        if (!/^[a-f0-9]{64}$/u.test(value.sha256 || '')) {
            fail('SELLER_F1_REGISTRY_CHECKSUM_REQUIRED');
        }
        if (value.transactionExpectation !== 'REQUIRED') {
            fail('SELLER_F1_REGISTRY_TRANSACTION_EXPECTATION_REJECTED');
        }
        if (value.rerunnableExpectation !== 'SECOND_APPLY_REQUIRED') {
            fail('SELLER_F1_REGISTRY_RERUNNABLE_EXPECTATION_REJECTED');
        }
        if (typeof value.purpose !== 'string' || value.purpose.length === 0) {
            fail('SELLER_F1_REGISTRY_PURPOSE_REQUIRED');
        }
        if (
            !value.receiptChecksumPolicy ||
            typeof value.receiptChecksumPolicy !== 'object' ||
            value.receiptChecksumPolicy.mode !== 'FUTURE_DB_ENABLED_RUNNER_ONLY' ||
            value.receiptChecksumPolicy.checksumRequired !== true ||
            value.receiptChecksumPolicy.writeReceiptOnlyAfterVerifiedApply !== true ||
            value.receiptChecksumPolicy.receiptKey !== value.id
        ) {
            fail('SELLER_F1_REGISTRY_RECEIPT_POLICY_REJECTED');
        }
    }

    const ordered = [...descriptors].sort((left, right) => left.order - right.order);
    for (let index = 0; index < ordered.length; index += 1) {
        const descriptor = ordered[index];
        if (descriptor.order !== index + 1) {
            fail('SELLER_F1_REGISTRY_ORDER_CONTINUITY_REJECTED');
        }
        const expectedPredecessor = index === 0 ? null : ordered[index - 1].id;
        if (descriptor.previousMigrationId !== expectedPredecessor) {
            fail('SELLER_F1_REGISTRY_PREDECESSOR_REJECTED');
        }
    }

    for (const descriptor of ordered) {
        resolveMigrationPath(descriptor.relativePath);
        const expected = expectedDescriptorByPath.get(descriptor.relativePath);
        if (
            !expected ||
            descriptor.id !== expected.id ||
            descriptor.order !== expected.order ||
            descriptor.sha256 !== expected.sha256 ||
            descriptor.previousMigrationId !== expected.previousMigrationId
        ) {
            fail('SELLER_F1_REGISTRY_DESCRIPTOR_MISMATCH');
        }
    }

    return Object.freeze(ordered);
};

const verifyMigrationFiles = (descriptors = F1A_MIGRATIONS, io = fs) => {
    if (!io || typeof io.lstatSync !== 'function' || typeof io.readFileSync !== 'function') {
        fail('SELLER_F1_REGISTRY_IO_REQUIRED');
    }

    const validated = validateMigrationDescriptors(descriptors);

    return Object.freeze(validated.map((descriptor) => {
        const filePath = resolveMigrationPath(descriptor.relativePath);
        let stats;
        try {
            stats = io.lstatSync(filePath);
        } catch (_) {
            fail('SELLER_F1_REGISTRY_MIGRATION_FILE_MISSING');
        }

        if (stats.isSymbolicLink() || !stats.isFile()) {
            fail('SELLER_F1_REGISTRY_MIGRATION_FILE_REJECTED');
        }

        let bytes;
        try {
            bytes = io.readFileSync(filePath);
        } catch (_) {
            fail('SELLER_F1_REGISTRY_MIGRATION_FILE_MISSING');
        }

        const actualSha256 = crypto.createHash('sha256').update(bytes).digest('hex');
        if (actualSha256 !== descriptor.sha256) {
            fail('SELLER_F1_REGISTRY_CHECKSUM_MISMATCH');
        }

        return Object.freeze({
            id: descriptor.id,
            order: descriptor.order,
            relativePath: descriptor.relativePath,
            sha256: descriptor.sha256
        });
    }));
};

module.exports = Object.freeze({
    EXPECTED_MIGRATION_IDS,
    EXPECTED_MIGRATION_RELATIVE_PATHS,
    F1A_MIGRATIONS,
    REGISTRY_SCOPE,
    SellerF1MigrationRegistryError,
    resolveMigrationPath,
    validateMigrationDescriptors,
    verifyMigrationFiles
});
