const assert = require('assert');
const http = require('http');
const path = require('path');
const express = require('express');
const jwt = require('jsonwebtoken');
const { spawn } = require('child_process');
const pool = require('../config/db');
const createCoreSchema = require('../models/createCoreDb');
const { resolveStartupSafety } = require('../config/startupSafety');
const { assertSafeSeedTarget } = require('../scripts/seedMarketplaceCategories');
const { flattenTree, planOrApplySeed, runMarketplaceCategorySeed } =
    require('../services/marketplaceCategorySeedService');
const { buildLocalServerEnv } = require('./helpers/localServerProcess');
const { seedCurrentAdminUsers } = require('./helpers/seedCurrentAdminUsers');
const adminRoutes = require('../routes/adminCategoryRoutes');
const publicRoutes = require('../routes/publicCategoryRoutes');

const root = path.join(__dirname, '..');
const records = flattenTree();
process.env.JWT_SECRET = 'marketplace-category-seed-smoke-secret';

const parseRequiredDatabaseUrl = (value) => {
    assert(String(value || '').trim(), 'An explicit guarded DATABASE_URL is required.');
    try {
        return new URL(value);
    } catch (_) {
        assert.fail('The guarded DATABASE_URL must be a valid URL.');
    }
};

const decodeUrlCredential = (value, label) => {
    try {
        return decodeURIComponent(value || '');
    } catch (_) {
        assert.fail(`The guarded database ${label} must be valid URL encoding.`);
    }
};

const withDatabaseUrl = (databaseUrl, mutate) => {
    const candidate = new URL(databaseUrl.href);
    mutate(candidate);
    return candidate.toString();
};

const assertSeedGuardRejects = (baseEnv, overrides, scenario) => {
    assert.throws(
        () => assertSafeSeedTarget({ ...baseEnv, ...overrides }),
        /Marketplace category seed refused unsafe target/,
        `Seed CLI guard must reject ${scenario}.`
    );
};

const adminHeaders = {
    Authorization: `Bearer ${jwt.sign(
        { id: 1, role: 'admin' },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
    )}`
};

const startApi = async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/admin/categories', adminRoutes);
    app.use('/api/public/categories', publicRoutes);
    const server = http.createServer(app);
    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
    });
    return {
        server,
        base: `http://127.0.0.1:${server.address().port}`
    };
};

const runChild = (args, env, timeoutMs = 30000) => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
        cwd: root,
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true
    });
    let output = '';
    child.stdout.on('data', (chunk) => { output += chunk.toString(); });
    child.stderr.on('data', (chunk) => { output += chunk.toString(); });
    const timer = setTimeout(() => {
        child.kill();
        reject(new Error(`Seed child timed out: ${output}`));
    }, timeoutMs);
    child.once('exit', (code) => {
        clearTimeout(timer);
        resolve({ code, output });
    });
});

(async () => {
    const safety = resolveStartupSafety(process.env);
    const databaseUrl = parseRequiredDatabaseUrl(process.env.DATABASE_URL);
    const explicitPort = databaseUrl.port;
    const numericPort = Number(explicitPort);
    const urlUser = decodeUrlCredential(databaseUrl.username, 'username');
    const urlPassword = decodeUrlCredential(databaseUrl.password, 'password');

    assert.strictEqual(safety.canStart, true);
    assert.strictEqual(safety.safeLocalDatabase, true);
    assert.strictEqual(safety.shouldRunSchemaInit, true);
    assert.strictEqual(databaseUrl.protocol, 'postgresql:');
    assert.strictEqual(databaseUrl.hostname, '127.0.0.1');
    assert.strictEqual(safety.target.host, '127.0.0.1');
    assert.strictEqual(safety.target.database, 'novastore_category_v2_test');
    assert(/^\d+$/.test(explicitPort), 'The guarded database port must be explicit and numeric.');
    assert(
        Number.isInteger(numericPort) && numericPort >= 1024 && numericPort <= 65535,
        'The guarded database port must be in the high-port range.'
    );
    assert.notStrictEqual(explicitPort, '55432');
    assert.strictEqual(String(safety.target.port), explicitPort);
    assert.strictEqual(String(process.env.DB_PORT || ''), explicitPort);
    assert.strictEqual(process.env.DB_HOST, databaseUrl.hostname);
    assert.strictEqual(process.env.DB_NAME, databaseUrl.pathname.replace(/^\/+/, ''));
    assert(urlUser && process.env.DB_USER === urlUser, 'Database username parity check failed.');
    assert(urlPassword && process.env.DB_PASSWORD === urlPassword, 'Database password parity check failed.');
    assert.strictEqual(String(process.env.DB_SSL || '').toLowerCase(), 'false');

    const guardedChildOverrides = Object.freeze({
        DATABASE_URL: process.env.DATABASE_URL,
        DB_HOST: process.env.DB_HOST,
        DB_PORT: process.env.DB_PORT,
        DB_NAME: process.env.DB_NAME,
        DB_USER: process.env.DB_USER,
        DB_PASSWORD: process.env.DB_PASSWORD,
        DB_SSL: process.env.DB_SSL
    });
    assert.deepStrictEqual(
        Object.keys(guardedChildOverrides).sort(),
        ['DATABASE_URL', 'DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD', 'DB_SSL'].sort()
    );

    const guardedChildEnv = buildLocalServerEnv(guardedChildOverrides);
    assert.strictEqual(guardedChildEnv.SKIP_SCHEMA_INIT, 'true');
    assert.strictEqual(guardedChildEnv.NOVASTORE_ALLOW_SCHEMA_INIT, 'false');
    const childSafety = assertSafeSeedTarget(guardedChildEnv);
    assert.strictEqual(childSafety.target.label, safety.target.label);

    const alternatePort = explicitPort === '65535'
        ? '65534'
        : String(numericPort + 1);
    assertSeedGuardRejects(guardedChildEnv, {
        DATABASE_URL: withDatabaseUrl(databaseUrl, (candidate) => {
            candidate.hostname = 'remote.invalid';
        }),
        DB_HOST: 'remote.invalid'
    }, 'a remote hostname');
    assertSeedGuardRejects(guardedChildEnv, {
        DATABASE_URL: withDatabaseUrl(databaseUrl, (candidate) => {
            candidate.hostname = 'localhost';
        }),
        DB_HOST: 'localhost'
    }, 'a non-exact loopback hostname');
    assertSeedGuardRejects(guardedChildEnv, {
        DATABASE_URL: withDatabaseUrl(databaseUrl, (candidate) => {
            candidate.pathname = '/wrong_test_database';
        }),
        DB_NAME: 'wrong_test_database'
    }, 'the wrong database');
    assertSeedGuardRejects(guardedChildEnv, {
        DB_PORT: alternatePort
    }, 'URL and DB_PORT mismatch');
    assertSeedGuardRejects(guardedChildEnv, {
        DB_USER: `${urlUser}_mismatch`
    }, 'URL and DB_USER mismatch');
    assertSeedGuardRejects(guardedChildEnv, {
        DB_PASSWORD: `${urlPassword}_mismatch`
    }, 'URL and DB_PASSWORD mismatch');
    assertSeedGuardRejects(guardedChildEnv, {
        DATABASE_URL: withDatabaseUrl(databaseUrl, (candidate) => {
            candidate.port = '';
        }),
        DB_PORT: ''
    }, 'a missing explicit port');
    assertSeedGuardRejects(guardedChildEnv, {
        DB_PORT: 'not-a-port'
    }, 'an invalid explicit port');

    assert.strictEqual(records.length, 279);
    assert.strictEqual(records.filter((record) => record.depth === 0).length, 10);
    assert.strictEqual(new Set(records.map((record) => record.slug)).size, records.length);
    assert(records.some((record) =>
        record.key === 'Anne, Bebek & Oyuncak > Hamile Giyim & Ürünleri' &&
        record.sort_order === 4
    ));
    assert(records.some((record) =>
        record.key === 'Anne, Bebek & Oyuncak > Oyuncak' &&
        record.sort_order === 5
    ));

    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await createCoreSchema();
    await seedCurrentAdminUsers(pool);

    const seedUpgradeClient = await pool.connect();
    try {
        await seedUpgradeClient.query('BEGIN');
        const legacyRoot = await seedUpgradeClient.query(`
            INSERT INTO categories (
                name, slug, path, depth, sort_order,
                is_active, is_customer_visible, hide_when_empty
            )
            VALUES (
                'Seed Test Root.', 'seed-test-root-old', 'seed-test-root-old', 0, 0,
                TRUE, TRUE, TRUE
            )
            RETURNING id
        `);
        const legacyRootId = Number(legacyRoot.rows[0].id);
        const legacyLeaf = await seedUpgradeClient.query(`
            INSERT INTO categories (
                name, parent_id, slug, path, depth, sort_order,
                is_active, is_customer_visible, hide_when_empty
            )
            VALUES (
                'Seed Test Leaf.', $1, 'seed-test-leaf-old',
                'seed-test-root-old/seed-test-leaf-old', 1, 0,
                TRUE, TRUE, TRUE
            )
            RETURNING id
        `, [legacyRootId]);
        const legacyLeafId = Number(legacyLeaf.rows[0].id);
        await seedUpgradeClient.query(
            'INSERT INTO category_stats (category_id) VALUES ($1), ($2)',
            [legacyRootId, legacyLeafId]
        );
        const upgradeTree = [{
            name: 'Seed Test Root',
            children: [{ name: 'Seed Test Leaf', children: [] }]
        }];
        const upgradeReport = await planOrApplySeed(seedUpgradeClient, {
            apply: true,
            tree: upgradeTree
        });
        assert.strictEqual(upgradeReport.added.length, 0);
        assert.strictEqual(upgradeReport.updated.length, 2);
        assert.strictEqual(upgradeReport.conflicts.length, 0);
        assert.strictEqual(upgradeReport.aliases_created, 2);
        const upgradedRows = await seedUpgradeClient.query(`
            SELECT id, name, slug, path, depth
            FROM categories
            WHERE id = ANY($1::INTEGER[])
            ORDER BY id
        `, [[legacyRootId, legacyLeafId]]);
        assert.deepStrictEqual(
            upgradedRows.rows.map((row) => ({
                id: Number(row.id),
                name: row.name,
                slug: row.slug,
                path: row.path,
                depth: Number(row.depth)
            })),
            [
                {
                    id: legacyRootId,
                    name: 'Seed Test Root',
                    slug: 'seed-test-root',
                    path: 'seed-test-root',
                    depth: 0
                },
                {
                    id: legacyLeafId,
                    name: 'Seed Test Leaf',
                    slug: 'seed-test-leaf',
                    path: 'seed-test-root/seed-test-leaf',
                    depth: 1
                }
            ]
        );
        const repeatedUpgrade = await planOrApplySeed(seedUpgradeClient, {
            apply: true,
            tree: upgradeTree
        });
        assert.strictEqual(repeatedUpgrade.added.length, 0);
        assert.strictEqual(repeatedUpgrade.updated.length, 0);
        assert.strictEqual(repeatedUpgrade.existing.length, 2);
        assert.strictEqual(repeatedUpgrade.conflicts.length, 0);
        assert.strictEqual(repeatedUpgrade.aliases_created, 0);
    } finally {
        await seedUpgradeClient.query('ROLLBACK');
        seedUpgradeClient.release();
    }

    const sentinelCategory = await pool.query(`
        INSERT INTO categories (
            name, slug, path, depth, sort_order,
            is_active, is_customer_visible, hide_when_empty
        )
        VALUES ('Korunan Kategori', 'korunan-kategori', 'korunan-kategori', 0, 999, TRUE, TRUE, TRUE)
        RETURNING id
    `);
    const sentinelCategoryId = Number(sentinelCategory.rows[0].id);
    await pool.query(
        'INSERT INTO category_stats (category_id) VALUES ($1)',
        [sentinelCategoryId]
    );
    const sentinelProduct = await pool.query(`
        INSERT INTO products (name, price, stock, category, categories)
        VALUES (
            'Korunan Ürün', 10, 4, 'Korunan Kategori',
            ARRAY['Korunan Kategori']::TEXT[]
        )
        RETURNING id
    `);
    const sentinelProductId = Number(sentinelProduct.rows[0].id);

    const beforeDryRun = await pool.query(`
        SELECT
            (SELECT COUNT(*)::INTEGER FROM categories) AS categories,
            (SELECT COUNT(*)::INTEGER FROM products) AS products,
            (SELECT COUNT(*)::INTEGER FROM category_stats) AS stats
    `);
    const dryRun = await runMarketplaceCategorySeed(pool);
    assert.strictEqual(dryRun.mode, 'dry-run');
    assert.strictEqual(dryRun.added.length, records.length);
    assert.strictEqual(dryRun.conflicts.length, 0);
    const afterDryRun = await pool.query(`
        SELECT
            (SELECT COUNT(*)::INTEGER FROM categories) AS categories,
            (SELECT COUNT(*)::INTEGER FROM products) AS products,
            (SELECT COUNT(*)::INTEGER FROM category_stats) AS stats
    `);
    assert.deepStrictEqual(afterDryRun.rows[0], beforeDryRun.rows[0]);

    const defaultCli = await runChild(
        ['scripts/seedMarketplaceCategories.js'],
        buildLocalServerEnv(guardedChildOverrides)
    );
    assert.strictEqual(defaultCli.code, 0, defaultCli.output);
    assert.match(defaultCli.output, /"mode": "dry-run"/);
    assert.match(defaultCli.output, /"total_seed_categories": 279/);
    assert(
        defaultCli.output.includes(`"target": "${safety.target.label}"`),
        'Seed child must report the exact parent database target.'
    );
    assert.deepStrictEqual(
        (await pool.query('SELECT COUNT(*)::INTEGER AS count FROM categories')).rows[0],
        { count: 1 }
    );

    const remoteCli = await runChild(
        ['scripts/seedMarketplaceCategories.js', '--apply'],
        buildLocalServerEnv({
            DATABASE_URL: 'postgresql://test:test@remote.invalid:5432/postgres',
            DB_HOST: 'remote.invalid',
            DB_PORT: '5432',
            DB_NAME: 'postgres',
            DB_USER: 'test',
            DB_PASSWORD: 'test',
            NOVASTORE_SAFE_LOCAL_BACKEND: 'false',
            NOVASTORE_ALLOW_REMOTE_DB: 'false',
            NODE_OPTIONS: `--require=${path.join(__dirname, 'helpers', 'blockPgLoad.js')}`
        })
    );
    assert.notStrictEqual(remoteCli.code, 0);
    assert.match(remoteCli.output, /Marketplace category seed refused unsafe target/);
    assert.doesNotMatch(remoteCli.output, /pg must not load/);

    const firstApply = await runMarketplaceCategorySeed(pool, { apply: true });
    assert.strictEqual(firstApply.added.length, records.length);
    assert.strictEqual(firstApply.existing.length, 0);
    assert.strictEqual(firstApply.updated.length, 0);
    assert.strictEqual(firstApply.conflicts.length, 0);
    assert.strictEqual(firstApply.stats_created, records.length);

    const seededRows = await pool.query(`
        SELECT id, name, parent_id, slug, path, depth
        FROM categories
        WHERE slug = ANY($1::TEXT[])
    `, [records.map((record) => record.slug)]);
    assert.strictEqual(seededRows.rowCount, records.length);
    const seededBySlug = new Map(seededRows.rows.map((row) => [row.slug, row]));
    const recordByKey = new Map(records.map((record) => [record.key, record]));
    records.forEach((record) => {
        const row = seededBySlug.get(record.slug);
        assert(row, `Missing seeded slug: ${record.slug}`);
        assert.strictEqual(row.name, record.name);
        assert.strictEqual(row.path, record.path);
        assert.strictEqual(Number(row.depth), record.depth);
        const parentRecord = record.parentKey ? recordByKey.get(record.parentKey) : null;
        const expectedParentId = parentRecord
            ? Number(seededBySlug.get(parentRecord.slug).id)
            : null;
        assert.strictEqual(row.parent_id === null ? null : Number(row.parent_id), expectedParentId);
    });

    const uniqueness = await pool.query(`
        SELECT
            COUNT(*)::INTEGER AS total,
            COUNT(DISTINCT LOWER(slug))::INTEGER AS unique_slugs,
            COUNT(DISTINCT LOWER(path))::INTEGER AS unique_paths
        FROM categories
        WHERE slug = ANY($1::TEXT[])
    `, [records.map((record) => record.slug)]);
    assert.deepStrictEqual(uniqueness.rows[0], {
        total: records.length,
        unique_slugs: records.length,
        unique_paths: records.length
    });

    const repeatedNames = await pool.query(`
        SELECT name, COUNT(*)::INTEGER AS count,
               COUNT(DISTINCT parent_id)::INTEGER AS parent_count
        FROM categories
        WHERE name IN ('Giyim', 'Üst Giyim', 'Alt Giyim', 'Takım')
        GROUP BY name
    `);
    assert(repeatedNames.rows.some((row) => row.name === 'Giyim' && row.count === 2));
    assert(repeatedNames.rows.every((row) => row.count === row.parent_count));

    const stats = await pool.query(`
        SELECT COUNT(*)::INTEGER AS count
        FROM category_stats stats
        JOIN categories category ON category.id=stats.category_id
        WHERE category.slug = ANY($1::TEXT[])
    `, [records.map((record) => record.slug)]);
    assert.strictEqual(stats.rows[0].count, records.length);

    const preserved = await pool.query(`
        SELECT
            EXISTS(SELECT 1 FROM categories WHERE id=$1 AND slug='korunan-kategori') AS category_ok,
            EXISTS(SELECT 1 FROM products WHERE id=$2 AND name='Korunan Ürün') AS product_ok
    `, [sentinelCategoryId, sentinelProductId]);
    assert.deepStrictEqual(preserved.rows[0], { category_ok: true, product_ok: true });

    const legacyColumns = await pool.query(`
        SELECT COUNT(*)::INTEGER AS count
        FROM information_schema.columns
        WHERE table_schema='public' AND table_name='products'
          AND column_name IN ('category', 'categories')
    `);
    assert.strictEqual(legacyColumns.rows[0].count, 2);

    const api = await startApi();
    try {
        const publicResponse = await fetch(`${api.base}/api/public/categories?format=flat`);
        assert.strictEqual(publicResponse.status, 200);
        assert.deepStrictEqual(await publicResponse.json(), []);

        const adminResponse = await fetch(`${api.base}/api/admin/categories?format=flat`, {
            headers: adminHeaders
        });
        assert.strictEqual(adminResponse.status, 200);
        const adminCategories = await adminResponse.json();
        assert.strictEqual(adminCategories.length, records.length + 1);
        assert(adminCategories.some((category) => category.slug === 'moda-ve-giyim'));
        assert(adminCategories.some((category) => category.slug === 'elektronik'));
    } finally {
        await new Promise((resolve) => api.server.close(resolve));
    }

    const countBeforeSecondApply = Number(
        (await pool.query('SELECT COUNT(*)::INTEGER AS count FROM categories')).rows[0].count
    );
    const secondApply = await runMarketplaceCategorySeed(pool, { apply: true });
    assert.strictEqual(secondApply.added.length, 0);
    assert.strictEqual(secondApply.updated.length, 0);
    assert.strictEqual(secondApply.existing.length, records.length);
    assert.strictEqual(secondApply.conflicts.length, 0);
    assert.strictEqual(secondApply.stats_created, 0);
    assert.strictEqual(
        Number((await pool.query('SELECT COUNT(*)::INTEGER AS count FROM categories')).rows[0].count),
        countBeforeSecondApply
    );

    const guardedParent = await pool.query(`
        INSERT INTO categories (
            name, slug, path, depth, is_active, is_customer_visible
        )
        VALUES (
            'Ürün Bağlı Seed Parent', 'urun-bagli-seed-parent',
            'urun-bagli-seed-parent', 0, TRUE, TRUE
        )
        RETURNING id
    `);
    const guardedParentId = Number(guardedParent.rows[0].id);
    await pool.query(
        'INSERT INTO category_stats (category_id) VALUES ($1)',
        [guardedParentId]
    );
    await pool.query(`
        INSERT INTO product_categories (product_id, category_id, is_primary)
        VALUES ($1, $2, TRUE)
    `, [sentinelProductId, guardedParentId]);
    const guardedTree = [{
        name: 'Ürün Bağlı Seed Parent',
        children: [{ name: 'Eklenmemesi Gereken Child', children: [] }]
    }];
    const guardedDryRun = await runMarketplaceCategorySeed(pool, { tree: guardedTree });
    assert.strictEqual(guardedDryRun.conflicts.length, 1);
    assert.strictEqual(guardedDryRun.conflicts[0].reason, 'parent_has_products');
    await assert.rejects(
        () => runMarketplaceCategorySeed(pool, { apply: true, tree: guardedTree }),
        (error) => error.code === 'MARKETPLACE_CATEGORY_SEED_CONFLICT'
    );
    assert.strictEqual(
        Number((await pool.query(
            `SELECT COUNT(*)::INTEGER AS count
             FROM categories WHERE slug='eklenmemesi-gereken-child'`
        )).rows[0].count),
        0
    );

    console.log(`marketplace category seed smoke passed (${records.length} categories)`);
})().catch((error) => {
    console.error(error);
    process.exitCode = 1;
}).finally(async () => {
    await pool.end();
});
