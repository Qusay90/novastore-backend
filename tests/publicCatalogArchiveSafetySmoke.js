const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

process.env.NODE_ENV = 'test';
process.env.NOVASTORE_SAFE_LOCAL_BACKEND = 'true';
process.env.NOVASTORE_ALLOW_REMOTE_DB = 'false';
process.env.SKIP_SCHEMA_INIT = 'true';
process.env.NOVASTORE_ALLOW_SCHEMA_INIT = 'false';
process.env.DB_HOST = '127.0.0.1';
process.env.DB_PORT = '55432';
process.env.DB_NAME = 'novastore_public_catalog_archive_safety_test';
process.env.DB_USER = 'novastore_test';
process.env.DB_PASSWORD = 'novastore_test_only';
process.env.DB_SSL = 'false';
process.env.JWT_SECRET = 'novastore-public-catalog-archive-safety-secret';

const pool = require('../config/db');
const cloudinaryConfig = require('../config/cloudinary');

let reviewMediaUploadCalls = 0;
let reviewMediaCleanupCalls = 0;
cloudinaryConfig.uploadReviewMediaFiles = async (files) => {
    reviewMediaUploadCalls += 1;
    assert.strictEqual(files.length, 1);
    return [{
        secure_url: 'https://cdn.example.test/archive-race.png',
        public_id: 'archive-race',
        resource_type: 'image',
        mimetype: 'image/png'
    }];
};
cloudinaryConfig.cleanupCloudinaryAssets = async (files) => {
    reviewMediaCleanupCalls += 1;
    assert.strictEqual(files[0].public_id, 'archive-race');
};

const { loadProductsForCart } = require('../services/pricingService');
const { reserveStock } = require('../services/orderService');
const { getMerchantFeed } = require('../controllers/merchantController');
const { searchProducts } = require('../services/catalogSearchService');
const questionController = require('../controllers/questionController');
const { addReview, getProductReviews, getUserReviews } = require('../controllers/reviewController');
const {
    listFavorites,
    addFavorite,
    syncFavorites
} = require('../controllers/favoriteController');

const ACTIVE_PRODUCT = Object.freeze({
    id: 101,
    name: 'Aktif Urun',
    description: 'Aktif aciklama',
    price: 100,
    old_price: null,
    stock: 5,
    image_url: 'active.png',
    category: 'Test',
    categories: ['Test'],
    created_at: new Date('2026-07-14T10:00:00.000Z'),
    average_rating: 0,
    review_count: 0,
    publication_status: 'active',
    is_customer_visible: true,
    deleted_at: null
});

const ARCHIVED_PRODUCT = Object.freeze({
    ...ACTIVE_PRODUCT,
    id: 202,
    name: 'Arsiv Urun',
    image_url: 'archived.png',
    publication_status: 'archived',
    is_customer_visible: false
});

const assertPublicPredicate = (sql, alias) => {
    assert.match(sql, new RegExp(`${alias}\\.publication_status\\s*=\\s*'active'`, 'i'));
    assert.match(sql, new RegExp(`${alias}\\.is_customer_visible\\s*=\\s*TRUE`, 'i'));
    assert.match(sql, new RegExp(`${alias}\\.deleted_at\\s+IS\\s+NULL`, 'i'));
};

const createResponse = () => ({
    statusCode: 200,
    body: undefined,
    headers: {},
    status(code) {
        this.statusCode = code;
        return this;
    },
    set(name, value) {
        this.headers[name] = value;
        return this;
    },
    json(payload) {
        this.body = payload;
        return this;
    },
    send(payload) {
        this.body = payload;
        return this;
    }
});

const invoke = async (handler, req) => {
    const res = createResponse();
    await handler(req, res);
    return res;
};

const testPricingAndAtomicReservation = async () => {
    const pricingClient = {
        async query(sql) {
            assertPublicPredicate(sql, 'products');
            return { rows: [ACTIVE_PRODUCT], rowCount: 1 };
        }
    };

    const activeCart = await loadProductsForCart([{ productId: 101, quantity: 1 }], pricingClient);
    assert.strictEqual(activeCart.productMap.has(101), true);

    await assert.rejects(
        () => loadProductsForCart([
            { productId: 101, quantity: 1 },
            { productId: 202, quantity: 1 }
        ], pricingClient),
        /bulunamadı/
    );

    const reservationClient = {
        async query(sql) {
            assert.match(sql, /UPDATE products[\s\S]*SET stock = stock -/i);
            assertPublicPredicate(sql, 'products');
            return { rows: [], rowCount: 0 };
        }
    };

    await assert.rejects(
        () => reserveStock(reservationClient, [{ id: 202, quantity: 1, name: ARCHIVED_PRODUCT.name }]),
        /stok yetersiz/i
    );
};

const testMerchantFeed = async () => {
    let feedSql = '';
    pool.query = async (sql) => {
        feedSql = sql;
        assertPublicPredicate(sql, 'products');
        return { rows: [ACTIVE_PRODUCT], rowCount: 1 };
    };

    const response = await invoke(getMerchantFeed, {});
    assert.strictEqual(response.statusCode, 200);
    assert.match(response.headers['Content-Type'], /application\/xml/i);
    assert.match(response.body, /Aktif Urun/);
    assert.doesNotMatch(response.body, /Arsiv Urun/);
    assertPublicPredicate(feedSql, 'products');
};

const testSearchAndSchemaFallback = async () => {
    const primarySql = [];
    pool.query = async (sql) => {
        primarySql.push(sql);
        assertPublicPredicate(sql, 'p');
        return { rows: [ACTIVE_PRODUCT], rowCount: 1 };
    };

    const primaryProducts = await searchProducts({ query: '', limit: 10 });
    assert.deepStrictEqual(primaryProducts.map((product) => product.id), [101]);
    assert.strictEqual(primarySql.length, 1);

    const fallbackSql = [];
    pool.query = async (sql) => {
        fallbackSql.push(sql);
        assertPublicPredicate(sql, 'p');
        if (fallbackSql.length === 1) {
            const schemaError = new Error('column p.categories does not exist');
            schemaError.code = '42703';
            throw schemaError;
        }
        return {
            rows: [{
                ...ACTIVE_PRODUCT,
                old_price: null,
                categories: ['Kategorisiz'],
                category: 'Kategorisiz'
            }],
            rowCount: 1
        };
    };

    const fallbackProducts = await searchProducts({ query: '', limit: 10 });
    assert.deepStrictEqual(fallbackProducts.map((product) => product.id), [101]);
    assert.strictEqual(fallbackSql.length, 2);
    fallbackSql.forEach((sql) => assertPublicPredicate(sql, 'p'));

    let visibilitySchemaAttempts = 0;
    pool.query = async (sql) => {
        visibilitySchemaAttempts += 1;
        assertPublicPredicate(sql, 'p');
        const schemaError = new Error('column p.publication_status does not exist');
        schemaError.code = '42703';
        throw schemaError;
    };

    await assert.rejects(
        () => searchProducts({ query: '', limit: 10 }),
        /publication_status/
    );
    assert.strictEqual(
        visibilitySchemaAttempts,
        1,
        'missing archive-safety columns must fail closed instead of using an unfiltered fallback'
    );
};

const testFavorites = async () => {
    const favorites = [
        { user_id: 7, product_id: 101, created_at: new Date('2026-07-14T10:00:00.000Z') },
        { user_id: 7, product_id: 202, created_at: new Date('2026-07-14T11:00:00.000Z') }
    ];
    const products = new Map([
        [ACTIVE_PRODUCT.id, ACTIVE_PRODUCT],
        [ARCHIVED_PRODUCT.id, ARCHIVED_PRODUCT]
    ]);
    const isPublic = (product) => product
        && product.publication_status === 'active'
        && product.is_customer_visible === true
        && product.deleted_at === null;
    const favoriteRows = (userId) => favorites
        .filter((favorite) => favorite.user_id === userId && isPublic(products.get(favorite.product_id)))
        .map((favorite) => ({ ...favorite, ...products.get(favorite.product_id) }));

    const query = async (sql, params = []) => {
        if (/FROM favorites f\s+INNER JOIN products p/i.test(sql)) {
            assertPublicPredicate(sql, 'p');
            const rows = favoriteRows(params[0]);
            return { rows, rowCount: rows.length };
        }
        if (/SELECT id FROM products WHERE id = \$1/i.test(sql)) {
            assertPublicPredicate(sql, 'products');
            const product = products.get(Number(params[0]));
            const rows = isPublic(product) ? [{ id: product.id }] : [];
            return { rows, rowCount: rows.length };
        }
        if (/SELECT id FROM products WHERE id = ANY/i.test(sql)) {
            assertPublicPredicate(sql, 'products');
            const rows = params[0]
                .map((id) => products.get(Number(id)))
                .filter(isPublic)
                .map((product) => ({ id: product.id }));
            return { rows, rowCount: rows.length };
        }
        if (/INSERT INTO favorites/i.test(sql)) {
            const exists = favorites.some((favorite) => (
                favorite.user_id === params[0] && favorite.product_id === params[1]
            ));
            if (exists) return { rows: [], rowCount: 0 };
            const row = {
                user_id: params[0],
                product_id: params[1],
                created_at: new Date('2026-07-14T12:00:00.000Z')
            };
            favorites.push(row);
            return { rows: [row], rowCount: 1 };
        }
        if (/^(BEGIN|COMMIT|ROLLBACK)$/i.test(String(sql).trim())) {
            return { rows: [], rowCount: 0 };
        }
        throw new Error(`Unhandled favorite safety SQL: ${sql}`);
    };

    pool.query = query;
    pool.connect = async () => ({ query, release() {} });

    const request = (params = {}, body = {}) => ({
        user: { id: 7, role: 'customer' },
        params,
        body,
        headers: {}
    });

    const listed = await invoke(listFavorites, request());
    assert.deepStrictEqual(listed.body.productIds, [101]);
    assert.doesNotMatch(JSON.stringify(listed.body), /Arsiv Urun/);

    const archivedAdd = await invoke(addFavorite, request({ productId: '202' }));
    assert.strictEqual(archivedAdd.statusCode, 404);

    const synced = await invoke(syncFavorites, request({}, { productIds: [101, 202] }));
    assert.deepStrictEqual(synced.body.productIds, [101]);
    assert.deepStrictEqual(synced.body.ignoredProductIds, [202]);
};

const testPublicQuestions = async () => {
    pool.query = async (sql, params = []) => {
        const text = String(sql);

        if (/INSERT INTO product_questions/i.test(text)) {
            assert.match(text, /INSERT INTO product_questions[\s\S]*SELECT products\.id/i);
            assertPublicPredicate(text, 'products');
            assert.strictEqual(Number(params[0]), ARCHIVED_PRODUCT.id);
            return { rows: [], rowCount: 0 };
        }

        if (/WITH public_product AS/i.test(text)) {
            assertPublicPredicate(text, 'products');
            if (Number(params[0]) === ARCHIVED_PRODUCT.id) {
                return { rows: [], rowCount: 0 };
            }
            return {
                rows: [{
                    public_product_id: ACTIVE_PRODUCT.id,
                    id: 501,
                    product_id: ACTIVE_PRODUCT.id,
                    user_id: 7,
                    question: 'Aktif urun sorusu',
                    answer: null,
                    created_at: new Date('2026-07-14T13:00:00.000Z'),
                    answered_at: null,
                    user_name: 'Test Customer'
                }],
                rowCount: 1
            };
        }

        throw new Error(`Unhandled public question safety SQL: ${text}`);
    };

    const token = jwt.sign({ id: 7, role: 'customer' }, process.env.JWT_SECRET, { expiresIn: '1h' });
    const archivedAsk = await invoke(questionController.askQuestion, {
        body: { product_id: ARCHIVED_PRODUCT.id, question: 'Arsiv urune soru' },
        headers: { authorization: `Bearer ${token}` }
    });
    assert.strictEqual(archivedAsk.statusCode, 404);
    assert.strictEqual(archivedAsk.body.code, 'PRODUCT_NOT_FOUND');

    const archivedList = await invoke(questionController.getProductQuestions, {
        params: { productId: String(ARCHIVED_PRODUCT.id) }
    });
    assert.strictEqual(archivedList.statusCode, 404);
    assert.strictEqual(archivedList.body.code, 'PRODUCT_NOT_FOUND');

    const activeList = await invoke(questionController.getProductQuestions, {
        params: { productId: String(ACTIVE_PRODUCT.id) }
    });
    assert.strictEqual(activeList.statusCode, 200);
    assert.deepStrictEqual(activeList.body.map((question) => question.id), [501]);
    assert.strictEqual(activeList.body[0].user_name, 'TE*** CU***');
    assert.strictEqual('public_product_id' in activeList.body[0], false);
};

const testPublicReviewsAndArchiveRace = async () => {
    let visibility = 'archived';
    let connectCalls = 0;
    let began = 0;
    let committed = 0;
    let rolledBack = 0;

    pool.query = async (sql, params = []) => {
        const text = String(sql);

        if (/AS public_product_exists/i.test(text)) {
            assertPublicPredicate(text, 'products');
            return {
                rows: [{
                    public_product_exists: visibility !== 'archived',
                    has_delivered_order: visibility === 'public-delivered'
                }],
                rowCount: 1
            };
        }

        if (/SELECT id FROM reviews WHERE product_id = \$1 AND user_id = \$2/i.test(text)) {
            return { rows: [], rowCount: 0 };
        }

        if (/SELECT products\.id AS public_product_id/i.test(text)) {
            assertPublicPredicate(text, 'products');
            if (Number(params[0]) === ARCHIVED_PRODUCT.id) {
                return { rows: [], rowCount: 0 };
            }
            return {
                rows: [{
                    public_product_id: ACTIVE_PRODUCT.id,
                    id: null,
                    rating: null,
                    comment: null,
                    created_at: null,
                    full_name: null,
                    average: null,
                    total: '0'
                }],
                rowCount: 1
            };
        }

        throw new Error(`Unhandled public review safety SQL: ${text}`);
    };

    pool.connect = async () => {
        connectCalls += 1;
        return {
            async query(sql) {
                const text = String(sql).trim();
                if (text === 'BEGIN') {
                    began += 1;
                    return { rows: [], rowCount: 0 };
                }
                if (text === 'ROLLBACK') {
                    rolledBack += 1;
                    return { rows: [], rowCount: 0 };
                }
                if (text === 'COMMIT') {
                    committed += 1;
                    return { rows: [], rowCount: 0 };
                }
                if (/INSERT INTO reviews/i.test(text)) {
                    assert.match(text, /INSERT INTO reviews[\s\S]*SELECT products\.id/i);
                    assertPublicPredicate(text, 'products');
                    return { rows: [], rowCount: 0 };
                }
                throw new Error(`Unhandled review transaction safety SQL: ${text}`);
            },
            release() {}
        };
    };

    const reviewRequest = () => ({
        user: { id: 7, role: 'customer' },
        headers: { 'content-type': 'application/json' },
        body: {
            productId: ACTIVE_PRODUCT.id,
            rating: 5,
            comment: 'Arsiv yarisi testi'
        },
        files: [{ buffer: Buffer.from('local fake bytes'), mimetype: 'image/png' }]
    });

    const archivedBeforePermission = await invoke(addReview, reviewRequest());
    assert.strictEqual(archivedBeforePermission.statusCode, 404);
    assert.strictEqual(archivedBeforePermission.body.code, 'PRODUCT_NOT_FOUND');
    assert.strictEqual(reviewMediaUploadCalls, 0);
    assert.strictEqual(connectCalls, 0);

    visibility = 'public-delivered';
    const archivedDuringInsert = await invoke(addReview, reviewRequest());
    assert.strictEqual(archivedDuringInsert.statusCode, 404);
    assert.strictEqual(archivedDuringInsert.body.code, 'PRODUCT_NOT_FOUND');
    assert.strictEqual(reviewMediaUploadCalls, 1);
    assert.strictEqual(reviewMediaCleanupCalls, 1);
    assert.strictEqual(connectCalls, 1);
    assert.strictEqual(began, 1);
    assert.strictEqual(rolledBack, 1);
    assert.strictEqual(committed, 0);

    const archivedList = await invoke(getProductReviews, {
        params: { productId: String(ARCHIVED_PRODUCT.id) },
        headers: {}
    });
    assert.strictEqual(archivedList.statusCode, 404);
    assert.strictEqual(archivedList.body.code, 'PRODUCT_NOT_FOUND');

    const activeList = await invoke(getProductReviews, {
        params: { productId: String(ACTIVE_PRODUCT.id) },
        headers: {}
    });
    assert.strictEqual(activeList.statusCode, 200);
    assert.deepStrictEqual(activeList.body.reviews, []);
    assert.strictEqual(activeList.body.average, 0);
    assert.strictEqual(activeList.body.totalReviews, 0);
    assert.strictEqual(activeList.body.reviewPermission.code, 'AUTH_REQUIRED');
};

const testAuthenticatedHistoryRemainsAvailable = async () => {
    pool.query = async (sql) => {
        const text = String(sql);

        if (/FROM product_questions pq[\s\S]*WHERE pq\.user_id = \$1/i.test(text)) {
            assert.doesNotMatch(text, /publication_status|is_customer_visible|deleted_at/i);
            return {
                rows: [{
                    id: 601,
                    question: 'Arsiv soru gecmisi',
                    answer: 'Yanıt',
                    product_id: ARCHIVED_PRODUCT.id,
                    product_name: ARCHIVED_PRODUCT.name
                }],
                rowCount: 1
            };
        }

        if (/FROM product_questions pq[\s\S]*JOIN users u/i.test(text)) {
            assert.doesNotMatch(text, /publication_status|is_customer_visible|deleted_at/i);
            return {
                rows: [{
                    id: 601,
                    product_id: ARCHIVED_PRODUCT.id,
                    question: 'Arsiv soru gecmisi',
                    product_name: ARCHIVED_PRODUCT.name,
                    user_name: 'Test Customer'
                }],
                rowCount: 1
            };
        }

        if (/FROM reviews r[\s\S]*WHERE r\.user_id = \$1/i.test(text)) {
            assert.doesNotMatch(text, /publication_status|is_customer_visible|deleted_at/i);
            return {
                rows: [{
                    id: 701,
                    rating: 5,
                    comment: 'Arsiv yorum gecmisi',
                    product_name: ARCHIVED_PRODUCT.name,
                    product_id: ARCHIVED_PRODUCT.id
                }],
                rowCount: 1
            };
        }

        if (/FROM review_media/i.test(text)) {
            return { rows: [], rowCount: 0 };
        }

        throw new Error(`Unhandled history safety SQL: ${text}`);
    };

    const customerToken = jwt.sign({ id: 7, role: 'customer' }, process.env.JWT_SECRET, { expiresIn: '1h' });
    const ownQuestions = await invoke(questionController.getUserQuestions, {
        headers: { authorization: `Bearer ${customerToken}` }
    });
    assert.strictEqual(ownQuestions.statusCode, 200);
    assert.strictEqual(ownQuestions.body[0].product_id, ARCHIVED_PRODUCT.id);

    const ownReviews = await invoke(getUserReviews, {
        params: { userId: '7' }
    });
    assert.strictEqual(ownReviews.statusCode, 200);
    assert.strictEqual(ownReviews.body[0].product_id, ARCHIVED_PRODUCT.id);

    const adminToken = jwt.sign({ id: 1, role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '1h' });
    const adminQuestions = await invoke(questionController.getAllQuestionsAdmin, {
        headers: { authorization: `Bearer ${adminToken}` }
    });
    assert.strictEqual(adminQuestions.statusCode, 200);
    assert.strictEqual(adminQuestions.body[0].product_id, ARCHIVED_PRODUCT.id);
};

(async () => {
    await testPricingAndAtomicReservation();
    await testMerchantFeed();
    await testSearchAndSchemaFallback();
    await testFavorites();
    await testPublicQuestions();
    await testPublicReviewsAndArchiveRace();
    await testAuthenticatedHistoryRemainsAvailable();
    console.log('public catalog archive safety smoke passed');
})().catch((error) => {
    console.error(error);
    process.exit(1);
});
