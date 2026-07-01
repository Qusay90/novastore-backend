const assert = require('assert');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const createCoreSchema = require('../models/createCoreDb');
const { resolveStartupSafety } = require('../config/startupSafety');
const {
    createProduct,
    updateProduct,
    getAllProducts,
    getProductById,
    deleteProduct
} = require('../controllers/productController');
const { reserveStock, restockItems } = require('../services/orderService');
const {
    readCategoryStats,
    reconcileCategoryStats
} = require('../services/categoryStatsService');
const { listPublicCategories } = require('../services/categoryService');

process.env.JWT_SECRET = 'category-lifecycle-smoke-secret';

const createResponse = () => ({
    statusCode: 200,
    body: undefined,
    status(code) {
        this.statusCode = code;
        return this;
    },
    json(payload) {
        this.body = payload;
        return this;
    }
});

const invoke = async (handler, req) => {
    const response = createResponse();
    await handler({ headers: {}, files: [], query: {}, params: {}, body: {}, ...req }, response);
    return response;
};

const productBody = (overrides = {}) => ({
    name: 'Lifecycle Product',
    description: 'Category lifecycle smoke product',
    price: 100,
    oldPrice: 120,
    stock: 1,
    ...overrides
});

const statsFor = async (categoryId) => {
    const rows = await readCategoryStats(pool);
    return rows.find((row) => row.category_id === categoryId);
};

(async () => {
    const safety = resolveStartupSafety(process.env);
    assert.strictEqual(safety.safeLocalDatabase, true);
    assert.strictEqual(safety.shouldRunSchemaInit, true);
    assert.strictEqual(safety.target.database, 'novastore_category_v2_test');

    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await createCoreSchema();

    const rootResult = await pool.query(`
        INSERT INTO categories (name, slug, path, depth)
        VALUES ('Lifecycle Root', 'lifecycle-root', 'lifecycle-root', 0)
        RETURNING id
    `);
    const rootId = Number(rootResult.rows[0].id);
    const leafResult = await pool.query(
        `INSERT INTO categories (name, parent_id, slug, path, depth, sort_order)
         VALUES
            ('Lifecycle Leaf A', $1, 'lifecycle-leaf-a', 'lifecycle-root/lifecycle-leaf-a', 1, 1),
            ('Lifecycle Leaf B', $1, 'lifecycle-leaf-b', 'lifecycle-root/lifecycle-leaf-b', 1, 2)
         RETURNING id, name`,
        [rootId]
    );
    const leafA = Number(leafResult.rows.find((row) => row.name.endsWith('A')).id);
    const leafB = Number(leafResult.rows.find((row) => row.name.endsWith('B')).id);

    const activeWithoutCategory = await invoke(createProduct, {
        body: productBody({ publicationStatus: 'active' })
    });
    assert.strictEqual(activeWithoutCategory.statusCode, 400);
    assert.match(activeWithoutCategory.body.error, /primaryCategoryId/);

    const draftWithoutCategory = await invoke(createProduct, {
        body: productBody({ name: 'Draft without category', publicationStatus: 'draft' })
    });
    assert.strictEqual(draftWithoutCategory.statusCode, 201);
    assert.deepStrictEqual(draftWithoutCategory.body.product.categoryIds, []);
    const activateUnassignedDraft = await invoke(updateProduct, {
        params: { id: draftWithoutCategory.body.product.id },
        body: productBody({ name: 'Draft without category', publicationStatus: 'active' })
    });
    assert.strictEqual(activateUnassignedDraft.statusCode, 400);
    assert.match(activateUnassignedDraft.body.error, /primaryCategoryId/);

    const parentRejected = await invoke(createProduct, {
        body: productBody({ categoryIds: [rootId], primaryCategoryId: rootId })
    });
    assert.strictEqual(parentRejected.statusCode, 400);

    const primaryRejected = await invoke(createProduct, {
        body: productBody({ categoryIds: [leafA], primaryCategoryId: leafB })
    });
    assert.strictEqual(primaryRejected.statusCode, 400);

    const created = await invoke(createProduct, {
        body: productBody({
            categoryIds: [leafA, leafB],
            primaryCategoryId: leafA,
            publicationStatus: 'active',
            isCustomerVisible: true
        })
    });
    assert.strictEqual(created.statusCode, 201);
    const productId = Number(created.body.product.id);
    assert.deepStrictEqual(created.body.product.categoryIds, [leafA, leafB]);
    assert.strictEqual(created.body.product.primaryCategoryId, leafA);
    assert.deepStrictEqual(created.body.product.categories, ['Lifecycle Leaf A', 'Lifecycle Leaf B']);

    let rootStats = await statsFor(rootId);
    assert.strictEqual(rootStats.subtree_visible_product_count, 1);
    assert.strictEqual(rootStats.subtree_sellable_product_count, 1);
    assert.strictEqual((await statsFor(leafA)).visible_product_count, 1);
    assert.strictEqual((await statsFor(leafB)).visible_product_count, 1);

    const stockZero = await invoke(updateProduct, {
        params: { id: productId },
        body: productBody({
            stock: 0,
            categoryIds: [leafA, leafB],
            primaryCategoryId: leafA,
            publicationStatus: 'active',
            isCustomerVisible: true
        })
    });
    assert.strictEqual(stockZero.statusCode, 200);
    rootStats = await statsFor(rootId);
    assert.strictEqual(rootStats.subtree_visible_product_count, 1);
    assert.strictEqual(rootStats.subtree_sellable_product_count, 0);
    assert.strictEqual((await listPublicCategories({ format: 'flat' })).length, 3);

    const inactive = await invoke(updateProduct, {
        params: { id: productId },
        body: productBody({
            stock: 0,
            categoryIds: [leafA, leafB],
            primaryCategoryId: leafA,
            publicationStatus: 'inactive',
            isCustomerVisible: true
        })
    });
    assert.strictEqual(inactive.statusCode, 200);
    assert.strictEqual((await statsFor(rootId)).subtree_visible_product_count, 0);
    assert.strictEqual((await listPublicCategories({ format: 'flat' })).length, 0);

    const pending = await invoke(updateProduct, {
        params: { id: productId },
        body: productBody({
            stock: 0,
            categoryIds: [leafA, leafB],
            primaryCategoryId: leafA,
            publicationStatus: 'pending_approval',
            isCustomerVisible: true
        })
    });
    assert.strictEqual(pending.statusCode, 200);
    assert.strictEqual((await statsFor(rootId)).subtree_visible_product_count, 0);

    const softDeleted = await invoke(updateProduct, {
        params: { id: productId },
        body: productBody({
            stock: 1,
            categoryIds: [leafA, leafB],
            primaryCategoryId: leafA,
            publicationStatus: 'active',
            isCustomerVisible: true,
            deletedAt: '2026-07-01T00:00:00.000Z'
        })
    });
    assert.strictEqual(softDeleted.statusCode, 200);
    assert.strictEqual((await statsFor(rootId)).subtree_visible_product_count, 0);
    assert.strictEqual((await invoke(getProductById, { params: { id: productId } })).statusCode, 404);

    const restored = await invoke(updateProduct, {
        params: { id: productId },
        body: productBody({
            stock: 1,
            categoryIds: [leafB],
            primaryCategoryId: leafB,
            publicationStatus: 'active',
            isCustomerVisible: true,
            deletedAt: null
        })
    });
    assert.strictEqual(restored.statusCode, 200);
    assert.strictEqual((await statsFor(leafA)).visible_product_count, 0);
    assert.strictEqual((await statsFor(leafB)).visible_product_count, 1);

    const hidden = await invoke(updateProduct, {
        params: { id: productId },
        body: productBody({
            categoryIds: [leafB],
            primaryCategoryId: leafB,
            publicationStatus: 'active',
            isCustomerVisible: false
        })
    });
    assert.strictEqual(hidden.statusCode, 200);
    assert.strictEqual((await statsFor(rootId)).subtree_visible_product_count, 0);
    assert.strictEqual((await invoke(getProductById, { params: { id: productId } })).statusCode, 404);

    await invoke(updateProduct, {
        params: { id: productId },
        body: productBody({
            categoryIds: [leafB],
            primaryCategoryId: leafB,
            publicationStatus: 'active',
            isCustomerVisible: true
        })
    });

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await reserveStock(client, [{ id: productId, quantity: 1, name: 'Lifecycle Product' }]);
        await client.query('COMMIT');
    } finally {
        client.release();
    }
    assert.strictEqual((await statsFor(rootId)).subtree_visible_product_count, 1);
    assert.strictEqual((await statsFor(rootId)).subtree_sellable_product_count, 0);

    const publicDetail = await invoke(getProductById, { params: { id: productId } });
    assert.strictEqual(publicDetail.statusCode, 200);
    assert.strictEqual(publicDetail.body.is_purchasable, false);

    const restockClient = await pool.connect();
    try {
        await restockClient.query('BEGIN');
        await restockItems(restockClient, [{ id: productId, quantity: 1 }]);
        await restockClient.query('COMMIT');
    } finally {
        restockClient.release();
    }
    assert.strictEqual((await statsFor(rootId)).subtree_sellable_product_count, 1);

    const legacyCreated = await invoke(createProduct, {
        body: productBody({
            name: 'Out of stock second',
            price: 50,
            stock: 0,
            category: 'Lifecycle Leaf B',
            categories: ['Lifecycle Leaf B']
        })
    });
    assert.strictEqual(legacyCreated.statusCode, 201);
    assert.deepStrictEqual(legacyCreated.body.product.categoryIds, [leafB]);
    const secondProductId = Number(legacyCreated.body.product.id);

    const publicList = await invoke(getAllProducts, {});
    assert.strictEqual(publicList.statusCode, 200);
    assert.strictEqual(publicList.body[0].id, productId);
    assert.strictEqual(publicList.body.at(-1).is_purchasable, false);
    assert(!Object.hasOwn(publicList.body[0], 'categoryIds'));
    assert(!Object.hasOwn(publicList.body[0], 'primaryCategoryId'));

    const rootCategoryProducts = await invoke(getAllProducts, {
        query: { categorySlug: 'lifecycle-root' }
    });
    assert.strictEqual(rootCategoryProducts.statusCode, 200);
    assert.deepStrictEqual(
        rootCategoryProducts.body.map((product) => Number(product.id)),
        [productId, secondProductId]
    );
    assert.strictEqual(rootCategoryProducts.body[0].is_purchasable, true);
    assert.strictEqual(rootCategoryProducts.body[1].is_purchasable, false);

    const categoryIdProducts = await invoke(getAllProducts, {
        query: { categoryId: rootId }
    });
    assert.strictEqual(categoryIdProducts.statusCode, 200);
    assert.deepStrictEqual(
        categoryIdProducts.body.map((product) => Number(product.id)),
        [productId, secondProductId]
    );

    const missingCategoryProducts = await invoke(getAllProducts, {
        query: { categorySlug: 'missing-category' }
    });
    assert.strictEqual(missingCategoryProducts.statusCode, 404);

    await pool.query(
        `UPDATE products
         SET publication_status = 'pending_approval'
         WHERE id = $1`,
        [secondProductId]
    );
    await reconcileCategoryStats(pool);
    const filteredList = await invoke(getAllProducts, {});
    assert(!filteredList.body.some((product) => Number(product.id) === secondProductId));
    const adminList = await invoke(getAllProducts, {
        headers: {
            authorization: `Bearer ${jwt.sign(
                { id: 1, role: 'admin' },
                process.env.JWT_SECRET,
                { expiresIn: '1h' }
            )}`
        }
    });
    assert(adminList.body.some((product) => Number(product.id) === secondProductId));
    const adminLinkedProduct = adminList.body.find((product) => Number(product.id) === productId);
    assert.deepStrictEqual(adminLinkedProduct.categoryIds, [leafB]);
    assert.strictEqual(adminLinkedProduct.primaryCategoryId, leafB);

    const preservedLegacyFields = await pool.query(
        'SELECT category, categories FROM products WHERE id = $1',
        [productId]
    );
    assert.strictEqual(preservedLegacyFields.rows[0].category, 'Lifecycle Leaf B');
    assert.deepStrictEqual(preservedLegacyFields.rows[0].categories, ['Lifecycle Leaf B']);

    await pool.query(
        'UPDATE category_stats SET subtree_visible_product_count = 999 WHERE category_id = $1',
        [rootId]
    );
    const reconciliation = await reconcileCategoryStats(pool);
    assert(reconciliation.drift.some((row) => row.category_id === rootId));
    assert.strictEqual((await statsFor(rootId)).subtree_visible_product_count, 1);

    const deleted = await invoke(deleteProduct, { params: { id: productId } });
    assert.strictEqual(deleted.statusCode, 200);
    assert.strictEqual((await statsFor(rootId)).subtree_visible_product_count, 0);

    console.log(`category lifecycle smoke passed against ${safety.target.label}`);
    await pool.end();
})().catch(async (error) => {
    console.error(error);
    try {
        await pool.end();
    } catch (_) {
        // Pool may already be closed.
    }
    process.exitCode = 1;
});
