const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const repositoryRoot = path.resolve(__dirname, '..', '..');
const defaultManifest = require('./manifest.json');
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const MIGRATION_ID_PATTERN = /^\d{8}_[a-z0-9_]+$/;

const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

const stripTransactionWrapper = (sql, migrationId) => {
    const match = sql.match(/^\s*BEGIN\s*;\s*([\s\S]*?)\s*COMMIT\s*;\s*$/i);
    if (!match) {
        throw new Error(`Migration ${migrationId} transaction wrapper does not match its manifest classification.`);
    }
    return match[1].trimEnd() + '\n';
};

const validateManifest = (manifest) => {
    if (!Array.isArray(manifest) || manifest.length === 0) {
        throw new Error('Migration manifest must be a non-empty array.');
    }

    const ids = new Set();
    const paths = new Set();
    let previousId = '';

    for (const entry of manifest) {
        if (!entry || typeof entry !== 'object') {
            throw new Error('Migration manifest contains a non-object entry.');
        }
        if (!MIGRATION_ID_PATTERN.test(entry.id || '')) {
            throw new Error('Migration manifest contains an invalid migration id.');
        }
        if (entry.id <= previousId) {
            throw new Error(`Migration manifest order is not strictly increasing at ${entry.id}.`);
        }
        previousId = entry.id;

        if (ids.has(entry.id)) throw new Error(`Duplicate migration id: ${entry.id}.`);
        ids.add(entry.id);

        const relativePath = String(entry.path || '').replace(/\\/g, '/');
        if (
            !relativePath.startsWith('migrations/') ||
            !relativePath.endsWith('.sql') ||
            path.posix.isAbsolute(relativePath) ||
            relativePath.split('/').includes('..')
        ) {
            throw new Error(`Invalid migration path for ${entry.id}.`);
        }
        if (paths.has(relativePath)) throw new Error(`Duplicate migration path: ${relativePath}.`);
        paths.add(relativePath);

        if (!SHA256_PATTERN.test(entry.sha256 || '')) {
            throw new Error(`Invalid SHA-256 for migration ${entry.id}.`);
        }
        if (entry.mode !== 'transactional') {
            throw new Error(`Unsupported migration mode for ${entry.id}; non-transactional execution is fail-closed.`);
        }
        if (typeof entry.transactionWrapper !== 'boolean') {
            throw new Error(`Missing transaction wrapper classification for ${entry.id}.`);
        }
    }

    return true;
};

const loadRegistry = ({ rootDir = repositoryRoot, manifest = defaultManifest } = {}) => {
    validateManifest(manifest);
    const migrationRoot = path.resolve(rootDir, 'migrations');

    return manifest.map((entry) => {
        const relativePath = entry.path.replace(/\\/g, '/');
        const absolutePath = path.resolve(rootDir, ...relativePath.split('/'));
        const relativeToMigrationRoot = path.relative(migrationRoot, absolutePath);
        if (relativeToMigrationRoot.startsWith('..') || path.isAbsolute(relativeToMigrationRoot)) {
            throw new Error(`Migration ${entry.id} resolves outside the migrations directory.`);
        }

        const bytes = fs.readFileSync(absolutePath);
        if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
            throw new Error(`Migration ${entry.id} contains a UTF-8 BOM.`);
        }
        if (bytes.includes(0x0d)) {
            throw new Error(`Migration ${entry.id} is not canonical LF bytes.`);
        }

        const actualSha256 = sha256(bytes);
        if (actualSha256 !== entry.sha256) {
            throw new Error(`Migration ${entry.id} checksum mismatch.`);
        }

        const rawSql = bytes.toString('utf8');
        const hasOuterWrapper = /^\s*BEGIN\s*;/i.test(rawSql) || /COMMIT\s*;\s*$/i.test(rawSql);
        if (!entry.transactionWrapper && hasOuterWrapper) {
            throw new Error(`Migration ${entry.id} has an unclassified transaction wrapper.`);
        }

        return Object.freeze({
            ...entry,
            path: relativePath,
            absolutePath,
            rawSql,
            executionSql: entry.transactionWrapper
                ? stripTransactionWrapper(rawSql, entry.id)
                : rawSql
        });
    });
};

module.exports = {
    MIGRATION_ID_PATTERN,
    SHA256_PATTERN,
    loadRegistry,
    repositoryRoot,
    sha256,
    stripTransactionWrapper,
    validateManifest
};
