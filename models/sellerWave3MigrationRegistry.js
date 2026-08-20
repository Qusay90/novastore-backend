'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { F1A_MIGRATIONS, verifyMigrationFiles: verifyF1MigrationFiles } = require('./sellerF1MigrationRegistry');

const repositoryRoot = path.resolve(__dirname, '..');
const migration = Object.freeze({
    id: 'seller-wave3-005-business-verticals',
    order: 5,
    relativePath: 'migrations/20260806_seller_wave3_business_verticals.sql',
    sha256: '601da619c629ac8a98b86468eb2df2d1d62ab5464d9df5e35573edc401532993',
    previousMigrationId: 'seller-f1b-004-bootstrap-operator-authorizations',
    transactionExpectation: 'REQUIRED',
    rerunnableExpectation: 'SECOND_APPLY_REQUIRED'
});

class SellerWave3MigrationRegistryError extends Error {
    constructor(code) {
        super(code);
        this.name = 'SellerWave3MigrationRegistryError';
        this.code = code;
    }
}

const fail = (code) => { throw new SellerWave3MigrationRegistryError(code); };

const resolveMigrationPath = (relativePath) => {
    if (relativePath !== migration.relativePath || path.isAbsolute(relativePath) || relativePath.includes('\\') || relativePath.split('/').includes('..')) {
        fail('SELLER_WAVE3_REGISTRY_PATH_REJECTED');
    }
    const resolved = path.resolve(repositoryRoot, ...relativePath.split('/'));
    if (path.relative(repositoryRoot, resolved).split(path.sep).join('/') !== relativePath) fail('SELLER_WAVE3_REGISTRY_PATH_REJECTED');
    return resolved;
};

const validateDescriptor = (descriptor = migration) => {
    if (!descriptor || typeof descriptor !== 'object' || Array.isArray(descriptor)) fail('SELLER_WAVE3_REGISTRY_DESCRIPTOR_REQUIRED');
    if (
        descriptor.id !== migration.id ||
        descriptor.order !== migration.order ||
        descriptor.relativePath !== migration.relativePath ||
        descriptor.sha256 !== migration.sha256 ||
        descriptor.previousMigrationId !== migration.previousMigrationId ||
        descriptor.transactionExpectation !== 'REQUIRED' ||
        descriptor.rerunnableExpectation !== 'SECOND_APPLY_REQUIRED'
    ) fail('SELLER_WAVE3_REGISTRY_DESCRIPTOR_REJECTED');
    return migration;
};

const verifyMigrationFiles = () => {
    verifyF1MigrationFiles();
    const descriptor = validateDescriptor();
    const filePath = resolveMigrationPath(descriptor.relativePath);
    let bytes;
    try {
        const stats = fs.lstatSync(filePath);
        if (stats.isSymbolicLink() || !stats.isFile()) fail('SELLER_WAVE3_REGISTRY_FILE_REJECTED');
        bytes = fs.readFileSync(filePath);
    } catch (error) {
        if (error instanceof SellerWave3MigrationRegistryError) throw error;
        fail('SELLER_WAVE3_REGISTRY_FILE_MISSING');
    }
    if (crypto.createHash('sha256').update(bytes).digest('hex') !== descriptor.sha256) fail('SELLER_WAVE3_REGISTRY_CHECKSUM_MISMATCH');
    return Object.freeze([...F1A_MIGRATIONS, descriptor].map((item) => Object.freeze({
        id: item.id,
        order: item.order,
        relativePath: item.relativePath,
        sha256: item.sha256
    })));
};

module.exports = Object.freeze({
    SellerWave3MigrationRegistryError,
    WAVE3_MIGRATION: migration,
    WAVE3_MIGRATIONS: Object.freeze([migration]),
    resolveMigrationPath,
    validateDescriptor,
    verifyMigrationFiles
});
