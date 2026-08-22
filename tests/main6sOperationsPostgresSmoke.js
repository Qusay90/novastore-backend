const assert = require('node:assert/strict');
const Module = require('node:module');
const { LOCAL_TEST_CAPABILITY } = require('../scripts/staging-migrations/guard');
const { loadRegistry } = require('../scripts/staging-migrations/registry');
const { runApply } = require('../scripts/staging-migrations/runner');

const OPERATIONS_DATABASE_URL =
    'postgresql://novastore_test:novastore_test_only@127.0.0.1:55433/novastore_main6s_operations_test';

const assertDisposableDatabaseUrl = (rawUrl) => {
    const url = new URL(String(rawUrl || '').trim());
    const databaseName = url.pathname.replace(/^\/+/, '');
    assert.equal(url.protocol, 'postgresql:', 'Main 6S operations smoke requires PostgreSQL.');
    assert.equal(url.hostname, '127.0.0.1', 'Main 6S operations smoke requires loopback PostgreSQL.');
    assert.equal(url.port, '55433', 'Main 6S operations smoke requires the disposable PG16 port.');
    assert.equal(
        databaseName,
        'novastore_main6s_operations_test',
        'Main 6S operations smoke requires its dedicated disposable database.'
    );
    assert.match(databaseName, /_test$/, 'Main 6S operations database name must end with _test.');
    assert.equal(url.search, '', 'Main 6S operations smoke rejects connection-string query overrides.');
    assert.equal(url.hash, '', 'Main 6S operations smoke rejects connection-string fragments.');
    return { url, databaseName };
};

const requestedDatabaseUrl = process.env.MAIN6S_OPERATIONS_DATABASE_URL || OPERATIONS_DATABASE_URL;
assert.equal(
    requestedDatabaseUrl,
    OPERATIONS_DATABASE_URL,
    'Main 6S operations smoke only accepts the attested disposable database URL.'
);
const { url: databaseUrl, databaseName } = assertDisposableDatabaseUrl(requestedDatabaseUrl);

Object.assign(process.env, {
    NODE_ENV: 'test',
    NOVASTORE_SAFE_LOCAL_BACKEND: 'true',
    NOVASTORE_ALLOW_REMOTE_DB: 'false',
    NOVASTORE_ALLOW_SCHEMA_INIT: 'false',
    SKIP_SCHEMA_INIT: 'true',
    DATABASE_URL: requestedDatabaseUrl,
    DB_HOST: databaseUrl.hostname,
    DB_PORT: databaseUrl.port,
    DB_NAME: databaseName,
    DB_USER: decodeURIComponent(databaseUrl.username),
    DB_PASSWORD: decodeURIComponent(databaseUrl.password),
    DB_SSL: 'false',
    SUPABASE_USE_POOLER: 'false',
    SUPABASE_POOLER_HOST: '',
    SUPABASE_REGION: '',
    SUPABASE_PROJECT_REF: '',
    JWT_SECRET: 'main6s-operations-postgres-smoke-only',
    CLOUDINARY_CLOUD_NAME: 'novastore-main6s-test',
    FREE_SHIPPING_THRESHOLD: '1500',
    DEFAULT_SHIPPING_FEE: '49.90'
});

const migrationRegistry = loadRegistry();
const migrationEnvironment = Object.freeze({
    NODE_ENV: 'test',
    NOVASTORE_DEPLOY_ENV: 'staging',
    NOVASTORE_STAGING_MIGRATIONS_ENABLED: 'true',
    NOVASTORE_ALLOW_REMOTE_DB: 'true',
    NOVASTORE_EXPECTED_DATABASE_HOST: databaseUrl.hostname,
    NOVASTORE_EXPECTED_DATABASE_NAME: databaseName,
    [LOCAL_TEST_CAPABILITY]: 'true',
    DATABASE_URL: requestedDatabaseUrl
});

const originalModuleLoad = Module._load;
Module._load = function patchedModuleLoad(request, parent, isMain) {
    if (request === '../server' || request === './server') return { io: null };
    return originalModuleLoad.call(this, request, parent, isMain);
};

const pool = require('../config/db');
const reviewController = require('../controllers/reviewController');
const questionController = require('../controllers/questionController');
const messageController = require('../controllers/messageController');
const { createNotification } = require('../controllers/notificationController');
const {
    deleteProductMediaRecord,
    registerProductMedia,
    reorderProductMedia
} = require('../services/adminCatalogMediaService');
const {
    createCouponAdmin,
    setCouponAdminStatus
} = require('../services/couponAdminService');
const { calculatePricing } = require('../services/pricingService');

const response = () => ({
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

const invoke = async (handler, request) => {
    const res = response();
    await handler({ headers: {}, query: {}, params: {}, body: {}, ...request }, res);
    return res;
};

const requireSuccess = (result, expectedStatus, operation) => {
    assert.equal(
        result.statusCode,
        expectedStatus,
        `${operation} failed: ${JSON.stringify(result.body)}`
    );
    return result.body;
};

const runMarker = `${Date.now().toString(36)}-${process.pid.toString(36)}`.toLowerCase();
const adminActor = (id) => ({ id: Number(id), role: 'admin', principal: 'admin' });
const customerActor = (id) => ({ id: Number(id), role: 'customer', principal: 'customer' });

(async () => {
    try {
        const databasePreflight = await pool.query(
            `SELECT
                current_database() AS database_name,
                (
                    SELECT COUNT(*)::INTEGER
                    FROM pg_class object
                    JOIN pg_namespace namespace ON namespace.oid = object.relnamespace
                    WHERE namespace.nspname = 'public'
                      AND object.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')
                ) AS public_object_count`
        );
        assert.deepEqual(
            {
                databaseName: databasePreflight.rows[0].database_name,
                publicObjectCount: Number(databasePreflight.rows[0].public_object_count)
            },
            {
                databaseName,
                publicObjectCount: 0
            },
            'Main 6S operations smoke requires an exact, empty disposable database before migration.'
        );

        const firstApply = await runApply({
            env: migrationEnvironment,
            registry: migrationRegistry,
            output: () => {}
        });
        assert.deepEqual(firstApply.applied, migrationRegistry.map((entry) => entry.id));
        const secondApply = await runApply({
            env: migrationEnvironment,
            registry: migrationRegistry,
            output: () => {}
        });
        assert.deepEqual(secondApply.applied, []);

        const migrationCount = await pool.query(
            'SELECT COUNT(*)::INTEGER AS count FROM novastore_schema_migrations'
        );
        assert.equal(migrationCount.rows[0].count, 29, 'Combined DB must have exactly 29 migrations.');

        const storeResult = await pool.query(
            `SELECT id, slug
             FROM stores
             WHERE LOWER(slug) = LOWER($1)
               AND is_active = TRUE
               AND deleted_at IS NULL`,
            ['novastore-platform']
        );
        assert.equal(storeResult.rows.length, 1, 'The active first-party NovaStore must exist.');
        const storeId = Number(storeResult.rows[0].id);

        const seededAdmin = await pool.query(
            `INSERT INTO users (full_name, email, password, role, auth_enabled)
             VALUES ($1, $2, 'not-used', 'admin', TRUE)
             RETURNING id`,
            [`Main 6S Admin ${runMarker}`, `main6s-admin-${runMarker}@example.test`]
        );
        const adminId = Number(seededAdmin.rows[0].id);

        const seededCustomer = await pool.query(
            `INSERT INTO users (full_name, email, password, role, auth_enabled)
             VALUES ($1, $2, 'not-used', 'customer', TRUE)
             RETURNING id`,
            [`Main 6S Customer ${runMarker}`, `main6s-customer-${runMarker}@example.test`]
        );
        const customerId = Number(seededCustomer.rows[0].id);

        const seededProduct = await pool.query(
            `INSERT INTO products (
                name, description, price, old_price, stock, category, categories,
                publication_status, is_customer_visible, store_id
             ) VALUES ($1, $2, 123.45, 149.90, 20, 'Main 6S Test', ARRAY['Main 6S Test'], 'active', TRUE, $3)
             RETURNING id, revision`,
            [`Main 6S Product ${runMarker}`, 'Disposable PostgreSQL operations smoke product.', storeId]
        );
        const productId = Number(seededProduct.rows[0].id);
        assert.equal(Number(seededProduct.rows[0].revision), 1);

        const seededOrder = await pool.query(
            `INSERT INTO orders (
                user_id, total_amount, status, customer_name, email, items,
                payment_status, shipment_status, currency
             ) VALUES ($1, 246.90, 'Teslim Edildi', $2, $3, $4::jsonb, 'PAID', 'DELIVERED', 'TRY')
             RETURNING id`,
            [
                customerId,
                `Main 6S Customer ${runMarker}`,
                `main6s-customer-${runMarker}@example.test`,
                JSON.stringify([{ id: productId, product_id: productId, quantity: 2 }])
            ]
        );
        const orderId = Number(seededOrder.rows[0].id);
        assert(Number.isSafeInteger(orderId) && orderId > 0);

        const customer = customerActor(customerId);
        const admin = adminActor(adminId);

        const asked = requireSuccess(await invoke(questionController.askQuestion, {
            user: customer,
            body: {
                product_id: productId,
                question: 'Bu ürünün garanti süresi ne kadardır?'
            }
        }), 201, 'customer question');
        const questionId = Number(asked.question.id);
        assert.equal(asked.question.revision, '1');
        assert.equal(asked.question.status, 'pending');

        const answered = requireSuccess(await invoke(questionController.answerQuestion, {
            currentAdmin: admin,
            headers: { 'x-request-id': `main6s-question-${runMarker}` },
            params: { id: String(questionId) },
            body: {
                answer: 'Bu ürün iki yıl garanti kapsamındadır.',
                expected_revision: 1
            }
        }), 200, 'admin question answer');
        assert.equal(Number(answered.question.revision), 2);

        const publicQuestions = requireSuccess(await invoke(questionController.getProductQuestions, {
            params: { productId: String(productId) }
        }), 200, 'public answered questions');
        assert.equal(publicQuestions.length, 1);
        assert.equal(publicQuestions[0].id, questionId);
        assert.equal(publicQuestions[0].is_answered, true);
        assert.equal(publicQuestions[0].answer, 'Bu ürün iki yıl garanti kapsamındadır.');
        assert.equal(Object.hasOwn(publicQuestions[0], 'user_id'), false);
        assert.equal(Object.hasOwn(publicQuestions[0], 'product_id'), false);

        const addedReview = requireSuccess(await invoke(reviewController.addReview, {
            user: customer,
            headers: { 'content-type': 'application/json' },
            body: {
                productId,
                rating: 5,
                comment: 'Teslimattan sonra gerçek veritabanında doğrulanan değerlendirme.'
            },
            files: []
        }), 201, 'delivered customer review');
        const reviewId = Number(addedReview.reviewId);
        assert.equal(addedReview.status, 'PENDING');

        const pendingReview = await pool.query(
            'SELECT status, revision FROM reviews WHERE id = $1 AND user_id = $2',
            [reviewId, customerId]
        );
        assert.deepEqual(
            { status: pendingReview.rows[0].status, revision: Number(pendingReview.rows[0].revision) },
            { status: 'PENDING', revision: 1 }
        );

        const moderatedReview = requireSuccess(await invoke(reviewController.moderateReview, {
            currentAdmin: admin,
            headers: { 'x-request-id': `main6s-review-${runMarker}` },
            params: { reviewId: String(reviewId) },
            body: {
                status: 'PUBLISHED',
                expected_revision: 1,
                moderation_note: 'İçerik yayın için uygundur.'
            }
        }), 200, 'admin review publication');
        assert.equal(moderatedReview.review.status, 'PUBLISHED');
        assert.equal(Number(moderatedReview.review.revision), 2);

        const publicReviews = requireSuccess(await invoke(reviewController.getProductReviews, {
            headers: {},
            params: { productId: String(productId) }
        }), 200, 'public published reviews');
        assert.equal(publicReviews.reviews.length, 1);
        assert.equal(Number(publicReviews.reviews[0].id), reviewId);
        assert.equal(publicReviews.totalReviews, 1);
        assert.equal(publicReviews.average, '5.0');
        assert.equal(Object.hasOwn(publicReviews.reviews[0], 'status'), false);

        const imageUrl = `https://res.cloudinary.com/novastore-main6s-test/image/upload/v1/${runMarker}-cover.jpg`;
        const detailImageUrl = `https://res.cloudinary.com/novastore-main6s-test/image/upload/v1/${runMarker}-detail.jpg`;
        const videoUrl = `https://res.cloudinary.com/novastore-main6s-test/video/upload/v1/${runMarker}-demo.mp4`;
        const firstMedia = await registerProductMedia(pool, productId, {
            actor: admin,
            requestId: `main6s-media-1-${runMarker}`,
            body: { expected_revision: 1, media_url: imageUrl, media_type: 'image' }
        });
        assert.equal(firstMedia.revision, 2);
        assert.equal(firstMedia.storageMutation, false);
        assert.equal(firstMedia.media.length, 1);
        assert.equal(firstMedia.media[0].isCover, true);

        await assert.rejects(
            registerProductMedia(pool, productId, {
                actor: admin,
                requestId: `main6s-media-video-reject-${runMarker}`,
                body: { expected_revision: 2, media_url: videoUrl, media_type: 'video' }
            }),
            (error) => error.code === 'ADMIN_CATALOG_MEDIA_VIDEO_RENDERER_HANDOFF_REQUIRED'
        );
        const secondMedia = await registerProductMedia(pool, productId, {
            actor: admin,
            requestId: `main6s-media-2-${runMarker}`,
            body: { expected_revision: 2, media_url: detailImageUrl, media_type: 'image' }
        });
        assert.equal(secondMedia.revision, 3);
        assert.equal(secondMedia.media.length, 2);
        const imageMediaId = Number(secondMedia.media.find((item) => item.mediaUrl === imageUrl).id);
        const detailImageMediaId = Number(secondMedia.media.find((item) => item.mediaUrl === detailImageUrl).id);
        assert.equal(secondMedia.media.find((item) => item.id === detailImageMediaId).isCover, false);

        const reorderedMedia = await reorderProductMedia(pool, productId, {
            actor: admin,
            requestId: `main6s-media-order-${runMarker}`,
            body: {
                expected_revision: 3,
                media_ids: [detailImageMediaId, imageMediaId],
                cover_media_id: detailImageMediaId
            }
        });
        assert.equal(reorderedMedia.revision, 4);
        assert.equal(reorderedMedia.media[0].id, detailImageMediaId);
        assert.equal(reorderedMedia.media[0].isCover, true);

        const deletedMedia = await deleteProductMediaRecord(pool, productId, detailImageMediaId, {
            actor: admin,
            requestId: `main6s-media-delete-${runMarker}`,
            body: { expected_revision: 4 }
        });
        assert.equal(deletedMedia.revision, 5);
        assert.equal(deletedMedia.storageMutation, false);
        assert.equal(deletedMedia.providerAssetDeletionRequired, true);
        assert.deepEqual(deletedMedia.media.map((item) => item.id), [imageMediaId]);
        assert.equal(deletedMedia.media[0].isCover, true);
        const productAfterMedia = await pool.query(
            'SELECT revision, image_url FROM products WHERE id = $1',
            [productId]
        );
        assert.equal(Number(productAfterMedia.rows[0].revision), 5);
        assert.equal(productAfterMedia.rows[0].image_url, imageUrl);
        await assert.rejects(
            pool.query(
                `INSERT INTO product_media (product_id, media_url, media_type, is_main, sort_order)
                 VALUES ($1, $2, 'video', FALSE, 99)`,
                [productId, videoUrl]
            ),
            (error) => error.code === '23514'
        );
        await assert.rejects(
            pool.query(
                `INSERT INTO product_media (product_id, media_url, media_type, is_main, sort_order)
                 VALUES ($1, $2, 'image', FALSE, 100)`,
                [productId, videoUrl]
            ),
            (error) => error.code === '23514'
        );
        await assert.rejects(
            pool.query('UPDATE products SET image_url = $2 WHERE id = $1', [productId, videoUrl]),
            (error) => error.code === '23514'
        );

        const couponCode = `M6S${runMarker.replace(/-/g, '').toUpperCase()}`;
        const createdCoupon = await createCouponAdmin(pool, {
            actor: admin,
            requestId: `main6s-coupon-create-${runMarker}`,
            body: {
                code: couponCode,
                discount_type: 'PERCENT',
                discount_value: 10,
                min_order_amount: 0,
                is_active: false
            }
        });
        assert.equal(createdCoupon.coupon.is_active, false);
        assert.equal(createdCoupon.coupon.operational_status, 'disabled');
        assert.equal(createdCoupon.coupon.revision, 1);

        const activatedCoupon = await setCouponAdminStatus(pool, createdCoupon.coupon.id, {
            actor: admin,
            requestId: `main6s-coupon-activate-${runMarker}`,
            body: { expected_revision: 1, is_active: true }
        });
        assert.equal(activatedCoupon.coupon.is_active, true);
        assert.equal(activatedCoupon.coupon.operational_status, 'active');
        assert.equal(activatedCoupon.coupon.revision, 2);

        const pricing = await calculatePricing({
            cartItems: [{ productId, quantity: 2, price: 0.01, name: 'Browser fiyatı güvenilmez' }],
            couponCode: couponCode.toLowerCase(),
            client: pool
        });
        assert.equal(pricing.items[0].price, 123.45);
        assert.equal(pricing.totals.subtotal, 246.90);
        assert.equal(pricing.totals.couponDiscount, 24.69);
        assert.equal(pricing.coupon.applied, true);
        assert.equal(Number(pricing.coupon.couponId), createdCoupon.coupon.id);

        const customerMessage = requireSuccess(await invoke(messageController.sendMessage, {
            user: customer,
            body: { message: 'Siparişim hakkında destek almak istiyorum.' }
        }), 201, 'customer support message');
        const supportThreadId = Number(customerMessage.support_thread_id);
        assert(Number.isSafeInteger(supportThreadId) && supportThreadId > 0);
        assert.equal(Number(customerMessage.sender_id), customerId);

        const takeover = requireSuccess(await invoke(messageController.takeOverSupportThread, {
            user: admin,
            currentAdmin: admin,
            params: { threadId: String(supportThreadId) }
        }), 200, 'admin support takeover');
        assert.equal(takeover.thread.status, 'TAKEN_OVER');
        assert.equal(takeover.thread.assignedAdminId, adminId);

        const adminMessage = requireSuccess(await invoke(messageController.sendMessage, {
            user: admin,
            body: {
                receiver_id: customerId,
                message: 'Talebinizi devraldım; siparişinizi kontrol ediyorum.'
            }
        }), 201, 'admin support reply');
        assert.equal(Number(adminMessage.support_thread_id), supportThreadId);
        assert.equal(Number(adminMessage.sender_id), adminId);
        assert.equal(Number(adminMessage.receiver_id), customerId);

        const customerHistory = requireSuccess(await invoke(messageController.getChatHistory, {
            user: customer,
            params: { userId: String(customerId) }
        }), 200, 'customer support history');
        assert.equal(customerHistory.length, 2);
        assert.deepEqual(
            customerHistory.map((message) => Number(message.support_thread_id)),
            [supportThreadId, supportThreadId]
        );
        assert.deepEqual(
            customerHistory.map((message) => Number(message.sender_id)),
            [customerId, adminId]
        );

        const handoffMessage = await pool.query(
            `INSERT INTO messages (support_thread_id, sender_id, receiver_id, message)
             VALUES ($1, $2, $3, $4)
             RETURNING id`,
            [supportThreadId, customerId, adminId, `[AI DESTEK DEVRI] ${runMarker}`]
        );
        const handoffMessageId = Number(handoffMessage.rows[0].id);
        const dismissalNotificationRows = await pool.query(
            `INSERT INTO notifications (user_id, type, message, is_read, entity_type, entity_id)
             VALUES
                (NULL, 'ai_handoff', $1, FALSE, 'support_thread', $2),
                (NULL, 'ai_handoff', $1, FALSE, 'support_thread', $3),
                (NULL, 'ai_handoff', $4, FALSE, NULL, NULL),
                (NULL, 'ai_handoff', $5, FALSE, NULL, NULL)
             RETURNING id`,
            [
                `Müşteri #${customerId} destek devri`,
                supportThreadId,
                supportThreadId + 999,
                `Eski bildirim: Müşteri #${customerId} destek devri`,
                `Eski bildirim: Müşteri #${customerId}0 destek devri`
            ]
        );
        const dismissalNotificationIds = dismissalNotificationRows.rows.map((row) => Number(row.id));
        const dismissedHandoff = requireSuccess(await invoke(messageController.deleteAiHandoffThread, {
            user: admin,
            currentAdmin: admin,
            params: { userId: String(customerId) }
        }), 200, 'admin support handoff dismissal');
        assert.equal(dismissedHandoff.dismissedCount, 1);
        assert.equal(dismissedHandoff.deletedCount, 0);
        const preservedHandoff = await pool.query(
            `SELECT message, handoff_dismissed_at, handoff_dismissed_by
             FROM messages
             WHERE id = $1`,
            [handoffMessageId]
        );
        assert.equal(preservedHandoff.rows.length, 1);
        assert(preservedHandoff.rows[0].handoff_dismissed_at);
        assert.equal(Number(preservedHandoff.rows[0].handoff_dismissed_by), adminId);
        const notificationDismissalState = await pool.query(
            `SELECT id, is_read
             FROM notifications
             WHERE id = ANY($1::INTEGER[])
             ORDER BY id`,
            [dismissalNotificationIds]
        );
        assert.deepEqual(
            notificationDismissalState.rows.map((row) => Boolean(row.is_read)),
            [true, false, true, false]
        );
        const dismissalEventsBeforeNoop = Number((await pool.query(
            `SELECT COUNT(*)::INTEGER AS count
             FROM support_thread_events
             WHERE support_thread_id = $1 AND event_type = 'HANDOFF_DISMISSED'`,
            [supportThreadId]
        )).rows[0].count);
        assert.equal(dismissalEventsBeforeNoop, 1);
        const repeatedDismissal = requireSuccess(await invoke(messageController.deleteAiHandoffThread, {
            user: admin,
            currentAdmin: admin,
            params: { userId: String(customerId) }
        }), 200, 'idempotent admin support handoff dismissal');
        assert.equal(repeatedDismissal.dismissedCount, 0);
        const dismissalEventsAfterNoop = Number((await pool.query(
            `SELECT COUNT(*)::INTEGER AS count
             FROM support_thread_events
             WHERE support_thread_id = $1 AND event_type = 'HANDOFF_DISMISSED'`,
            [supportThreadId]
        )).rows[0].count);
        assert.equal(dismissalEventsAfterNoop, dismissalEventsBeforeNoop);
        await assert.rejects(
            pool.query(
                `INSERT INTO messages (support_thread_id, sender_id, receiver_id, message)
                 VALUES ($1, $2, $3, $4)`,
                [supportThreadId, customerId, adminId, `geçersiz\u0007mesaj`]
            ),
            (error) => error.code === '23514'
        );

        const typedNotification = await createNotification(
            customerId,
            'main6s_product_update',
            'Main 6S ürün bildirimi.',
            null,
            { entityType: 'product', entityId: productId }
        );
        assert(typedNotification, 'Typed notification must be persisted.');
        const persistedTypedNotification = await pool.query(
            `SELECT user_id, type, entity_type, entity_id
             FROM notifications
             WHERE id = $1`,
            [typedNotification.id]
        );
        assert.deepEqual(
            {
                userId: Number(persistedTypedNotification.rows[0].user_id),
                type: persistedTypedNotification.rows[0].type,
                entityType: persistedTypedNotification.rows[0].entity_type,
                entityId: Number(persistedTypedNotification.rows[0].entity_id)
            },
            {
                userId: customerId,
                type: 'main6s_product_update',
                entityType: 'product',
                entityId: productId
            }
        );

        const generatedTargets = await pool.query(
            `SELECT type, user_id, entity_type, entity_id
             FROM notifications
             WHERE (entity_type = 'product_question' AND entity_id = $1)
                OR (entity_type = 'review' AND entity_id = $2)
                OR (entity_type = 'support_thread' AND entity_id = $3)`,
            [questionId, reviewId, supportThreadId]
        );
        assert(generatedTargets.rows.some((row) => (
            row.type === 'question_answered'
            && Number(row.user_id) === customerId
            && row.entity_type === 'product_question'
            && Number(row.entity_id) === questionId
        )));
        assert(generatedTargets.rows.some((row) => (
            row.type === 'new_review'
            && row.user_id === null
            && row.entity_type === 'review'
            && Number(row.entity_id) === reviewId
        )));
        assert(generatedTargets.rows.some((row) => (
            row.type === 'support_message'
            && row.user_id === null
            && row.entity_type === 'support_thread'
            && Number(row.entity_id) === supportThreadId
        )));

        const auditCounts = await pool.query(
            `SELECT
                (SELECT COUNT(*)::INTEGER FROM customer_operation_audit_events
                 WHERE actor_user_id = $1 AND entity_id IN ($2, $3)) AS customer_operation_count,
                (SELECT COUNT(*)::INTEGER FROM admin_catalog_audit_events
                 WHERE actor_user_id = $1 AND entity_type = 'product' AND entity_key = $4) AS media_count,
                (SELECT COUNT(*)::INTEGER FROM admin_coupon_audit_events
                 WHERE actor_user_id = $1 AND coupon_id = $5) AS coupon_count,
                (SELECT COUNT(*)::INTEGER FROM support_thread_events
                 WHERE support_thread_id = $6) AS support_event_count`,
            [adminId, questionId, reviewId, String(productId), createdCoupon.coupon.id, supportThreadId]
        );
        assert.equal(auditCounts.rows[0].customer_operation_count, 2);
        assert.equal(auditCounts.rows[0].media_count, 4);
        assert.equal(auditCounts.rows[0].coupon_count, 2);
        assert(auditCounts.rows[0].support_event_count >= 4);

        const operationAuditId = await pool.query(
            'SELECT id FROM customer_operation_audit_events WHERE actor_user_id = $1 ORDER BY id LIMIT 1',
            [adminId]
        );
        const catalogAuditId = await pool.query(
            'SELECT id FROM admin_catalog_audit_events WHERE actor_user_id = $1 ORDER BY id LIMIT 1',
            [adminId]
        );
        const couponAuditId = await pool.query(
            'SELECT id FROM admin_coupon_audit_events WHERE actor_user_id = $1 ORDER BY id LIMIT 1',
            [adminId]
        );
        const supportAuditId = await pool.query(
            'SELECT id FROM support_thread_events WHERE support_thread_id = $1 ORDER BY id LIMIT 1',
            [supportThreadId]
        );
        for (const [table, id] of [
            ['customer_operation_audit_events', operationAuditId.rows[0].id],
            ['admin_catalog_audit_events', catalogAuditId.rows[0].id],
            ['admin_coupon_audit_events', couponAuditId.rows[0].id],
            ['support_thread_events', supportAuditId.rows[0].id]
        ]) {
            await assert.rejects(
                pool.query(`UPDATE ${table} SET created_at = created_at WHERE id = $1`, [id]),
                (error) => error.code === '55000'
            );
            await assert.rejects(
                pool.query(`DELETE FROM ${table} WHERE id = $1`, [id]),
                (error) => error.code === '55000'
            );
        }
        await assert.rejects(
            pool.query('DELETE FROM coupons WHERE id = $1', [createdCoupon.coupon.id]),
            (error) => error.code === '55000'
        );

        console.log(
            'main6s PostgreSQL operations smoke passed: ' +
            'question=PASS review=PASS media=PASS coupon-pricing=PASS support=PASS notification=PASS audit=PASS'
        );
    } finally {
        Module._load = originalModuleLoad;
        await pool.end();
    }
})().catch((error) => {
    Module._load = originalModuleLoad;
    console.error(error);
    process.exitCode = 1;
});
