const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

const notificationCalls = [];

process.env.NODE_ENV = 'test';
process.env.NOVASTORE_SAFE_LOCAL_BACKEND = 'true';
process.env.NOVASTORE_ALLOW_REMOTE_DB = 'false';
process.env.SKIP_SCHEMA_INIT = 'true';
process.env.NOVASTORE_ALLOW_SCHEMA_INIT = 'false';
process.env.DATABASE_URL = 'postgresql://novastore_test:novastore_test_only@127.0.0.1:55432/novastore_review_question_operations_test';
process.env.DB_HOST = '127.0.0.1';
process.env.DB_PORT = '55432';
process.env.DB_NAME = 'novastore_review_question_operations_test';
process.env.DB_USER = 'novastore_test';
process.env.DB_PASSWORD = 'novastore_test_only';
process.env.DB_SSL = 'false';
process.env.JWT_SECRET = 'review-question-operations-smoke-secret';

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
    if (request === '../server' || request.endsWith('/server')) return { io: null };
    if (request === './notificationController') {
        return {
            createNotification: async (...args) => {
                notificationCalls.push(args);
                return { id: 1 };
            }
        };
    }
    return originalLoad.call(this, request, parent, isMain);
};

const root = path.join(__dirname, '..');
const pool = require('../config/db');
const reviewController = require('../controllers/reviewController');
const questionController = require('../controllers/questionController');
const originalQuery = pool.query;
const originalConnect = pool.connect;

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

const invoke = async (handler, req) => {
    const res = response();
    await handler({ headers: {}, query: {}, params: {}, body: {}, ...req }, res);
    return res;
};

const transactionClient = (handler) => ({
    query: handler,
    release() {}
});

const assertMigrationContract = () => {
    const migration = fs.readFileSync(
        path.join(root, 'migrations', '20260813_01_review_question_operations.sql'),
        'utf8'
    );
    assert.match(migration, /UPDATE reviews[\s\S]*SET status = 'PUBLISHED'[\s\S]*WHERE status IS NULL/i);
    assert.match(migration, /ALTER COLUMN status SET DEFAULT 'PENDING'/i);
    assert.match(migration, /CHECK \(status IN \('PENDING', 'PUBLISHED', 'HIDDEN'\)\)/i);
    assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS idx_reviews_product_user_unique/i);
    assert.match(migration, /ADD COLUMN IF NOT EXISTS answered_by INTEGER REFERENCES users\(id\)/i);
    assert.match(migration, /CREATE TABLE IF NOT EXISTS customer_operation_audit_events/i);
    assert.match(migration, /BEFORE UPDATE OR DELETE ON customer_operation_audit_events/i);
};

const assertRouteContract = () => {
    const reviewRoutes = fs.readFileSync(path.join(root, 'routes', 'reviewRoutes.js'), 'utf8');
    const questionRoutes = fs.readFileSync(path.join(root, 'routes', 'questionRoutes.js'), 'utf8');
    assert.match(reviewRoutes, /'\/admin\/all'[\s\S]*authenticateAdmin[\s\S]*requireAdminCommerceCapability\('reviewsRead'\)[\s\S]*requireCurrentAdmin[\s\S]*getAdminReviews/);
    assert.match(reviewRoutes, /'\/admin\/all',\s*privateNoStore/);
    assert.match(reviewRoutes, /'\/admin\/:reviewId\/moderation'[\s\S]*requireAdminCommerceCapability\('reviewModerationWrite'\)[\s\S]*moderateReview/);
    assert.match(questionRoutes, /'\/admin\/all'[\s\S]*requireAdminCommerceCapability\('questionsRead'\)[\s\S]*getAllQuestionsAdmin/);
    assert.match(questionRoutes, /'\/admin\/all',\s*privateNoStore/);
    assert.match(questionRoutes, /'\/admin\/answer\/:id'[\s\S]*requireAdminCommerceCapability\('questionAnswerWrite'\)[\s\S]*answerQuestion/);
};

const assertNotificationTargetContract = () => {
    const reviewControllerSource = fs.readFileSync(path.join(root, 'controllers', 'reviewController.js'), 'utf8');
    const questionControllerSource = fs.readFileSync(path.join(root, 'controllers', 'questionController.js'), 'utf8');
    assert.match(reviewControllerSource, /eventType:\s*EVENT\.REVIEW_CREATED[\s\S]*aggregateType:\s*'review'[\s\S]*aggregateId:\s*reviewId/);
    assert.match(reviewControllerSource, /eventType:\s*EVENT\.REVIEW_MODERATION_RESULT[\s\S]*aggregateType:\s*'review'[\s\S]*aggregateId:\s*reviewId/);
    assert.match(questionControllerSource, /eventType:\s*EVENT\.QUESTION_CREATED[\s\S]*aggregateType:\s*'product_question'[\s\S]*aggregateId:\s*newQuestion\.rows\[0\]\.id/);
    assert.match(questionControllerSource, /eventType:\s*EVENT\.QUESTION_ANSWERED[\s\S]*aggregateType:\s*'product_question'[\s\S]*aggregateId:\s*answeredQuestion\.id/);
};

const testPublicProjection = async () => {
    pool.query = async (sql) => {
        const text = String(sql);
        if (/WITH public_product AS/i.test(text)) {
            assert.match(text, /NULLIF\(BTRIM\(pq\.answer\), ''\) IS NOT NULL/i);
            assert.doesNotMatch(text, /SELECT[\s\S]*pq\.user_id[\s\S]*FROM public_product/i);
            return {
                rows: [{
                    public_product_id: 101,
                    id: 501,
                    product_id: 101,
                    user_id: 41,
                    question: 'Yanıtlanmış soru',
                    answer: 'Güvenli yanıt',
                    user_name: 'Test Customer',
                    created_at: new Date('2026-08-13T08:00:00.000Z'),
                    answered_at: new Date('2026-08-13T09:00:00.000Z')
                }]
            };
        }
        if (/SELECT products\.id AS public_product_id/i.test(text)) {
            assert.match(text, /r\.status = 'PUBLISHED'/i);
            return {
                rows: [{
                    public_product_id: 101,
                    id: 601,
                    rating: 5,
                    comment: 'Yayınlanmış değerlendirme',
                    created_at: new Date('2026-08-13T08:00:00.000Z'),
                    full_name: 'Test Customer',
                    average: '5',
                    total: '1'
                }]
            };
        }
        if (/FROM review_media/i.test(text)) return { rows: [] };
        throw new Error(`Unexpected public projection query: ${text}`);
    };

    const questions = await invoke(questionController.getProductQuestions, { params: { productId: '101' } });
    assert.equal(questions.statusCode, 200);
    assert.deepEqual(Object.keys(questions.body[0]).sort(), [
        'answer', 'answered_at', 'created_at', 'id', 'is_answered', 'question', 'status', 'user_name'
    ]);
    assert.equal(questions.body[0].user_name, 'TE*** CU***');
    assert.equal(JSON.stringify(questions.body).includes('user_id'), false);
    assert.equal(JSON.stringify(questions.body).includes('product_id'), false);

    const reviews = await invoke(reviewController.getProductReviews, {
        params: { productId: '101' },
        headers: {}
    });
    assert.equal(reviews.statusCode, 200);
    assert.equal(reviews.body.reviews.length, 1);
    assert.equal(reviews.body.reviews[0].full_name, 'TE*** CU***');
};

const testDuplicateReviewRejection = async () => {
    pool.query = async (sql) => {
        const text = String(sql);
        if (/AS public_product_exists/i.test(text)) {
            return { rows: [{ public_product_exists: true, first_party_write_eligible: true, has_delivered_order: true }] };
        }
        if (/SELECT id FROM reviews WHERE product_id/i.test(text)) return { rows: [] };
        throw new Error(`Unexpected duplicate preflight query: ${text}`);
    };
    let rolledBack = 0;
    pool.connect = async () => transactionClient(async (sql) => {
        const text = String(sql).trim();
        if (text === 'BEGIN') return { rows: [] };
        if (text === 'ROLLBACK') {
            rolledBack += 1;
            return { rows: [] };
        }
        if (/INSERT INTO reviews/i.test(text)) {
            assert.match(text, /'PENDING'/i);
            const error = new Error('duplicate');
            error.code = '23505';
            throw error;
        }
        throw new Error(`Unexpected duplicate transaction query: ${text}`);
    });

    const result = await invoke(reviewController.addReview, {
        user: { id: 41, role: 'customer', principal: 'customer' },
        headers: { 'content-type': 'application/json' },
        body: { productId: 101, rating: 5, comment: 'Tekil değerlendirme' },
        files: []
    });
    assert.equal(result.statusCode, 409);
    assert.equal(result.body.code, 'ALREADY_REVIEWED');
    assert.equal(rolledBack, 1);
};

const testControlCharacterRejection = async () => {
    pool.query = async () => {
        throw new Error('invalid text must not query the database');
    };
    pool.connect = async () => {
        throw new Error('invalid text must not open a transaction');
    };
    const review = await invoke(reviewController.addReview, {
        user: { id: 41, role: 'customer', principal: 'customer' },
        headers: { 'content-type': 'application/json' },
        body: { productId: 101, rating: 5, comment: 'geçersiz\u0007yorum' },
        files: []
    });
    assert.equal(review.statusCode, 400);
    assert.equal(review.body.code, 'REVIEW_COMMENT_INVALID');

    const question = await invoke(questionController.askQuestion, {
        user: { id: 41, role: 'customer', principal: 'customer' },
        body: { product_id: 101, question: 'geçersiz\u0007soru' }
    });
    assert.equal(question.statusCode, 400);
    assert.equal(question.body.code, 'QUESTION_TEXT_INVALID');
};

const testSellerWritesFailClosed = async () => {
    let queryCount = 0;
    pool.query = async (sql) => {
        const text = String(sql);
        queryCount += 1;
        if (/AS public_product_exists/i.test(text)) {
            assert.match(text, /AS first_party_write_eligible/i);
            return {
                rows: [{
                    public_product_exists: true,
                    first_party_write_eligible: false,
                    has_delivered_order: true
                }]
            };
        }
        if (/INSERT INTO product_questions/i.test(text)) {
            assert.match(text, /first_party_store\.slug/i);
            return { rows: [] };
        }
        throw new Error(`Unexpected seller write query: ${text}`);
    };
    pool.connect = async () => {
        throw new Error('seller review must fail before opening a transaction');
    };

    const review = await invoke(reviewController.addReview, {
        user: { id: 41, role: 'customer', principal: 'customer' },
        headers: { 'content-type': 'application/json' },
        body: { productId: 999, rating: 5, comment: 'Satıcı ürünü değerlendirmesi' },
        files: []
    });
    assert.equal(review.statusCode, 403);
    assert.equal(review.body.code, 'SELLER_REVIEW_HANDOFF_REQUIRED');

    const questionTransaction = [];
    pool.connect = async () => transactionClient(async (sql) => {
        const text = String(sql).trim();
        questionTransaction.push(text);
        if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(text)) return { rows: [] };
        if (/INSERT INTO product_questions/i.test(text)) {
            queryCount += 1;
            assert.match(text, /first_party_store\.slug/i);
            return { rows: [] };
        }
        throw new Error(`Unexpected seller question transaction query: ${text}`);
    });

    const question = await invoke(questionController.askQuestion, {
        user: { id: 41, role: 'customer', principal: 'customer' },
        body: { product_id: 999, question: 'Satıcı ürünü hakkında soru?' }
    });
    assert.equal(question.statusCode, 404);
    assert.equal(question.body.code, 'PRODUCT_NOT_FOUND');
    assert.equal(queryCount, 2);
    assert.deepEqual(questionTransaction, ['BEGIN', questionTransaction[1], 'ROLLBACK']);
    assert.match(questionTransaction[1], /INSERT INTO product_questions/i);
};

const testReviewModerationAudit = async () => {
    const calls = [];
    pool.connect = async () => transactionClient(async (sql, params = []) => {
        const text = String(sql).trim();
        calls.push({ text, params });
        if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(text)) return { rows: [] };
        if (/FROM reviews r[\s\S]*FOR UPDATE OF r/i.test(text)) {
            assert.match(text, /first_party_store\.slug/i);
            return { rows: [{ id: 601, product_id: 101, status: 'PENDING', revision: 1, moderation_note: null }] };
        }
        if (/UPDATE reviews/i.test(text)) {
            return {
                rows: [{
                    id: 601,
                    product_id: 101,
                    status: 'PUBLISHED',
                    revision: 2,
                    moderated_by: 9,
                    moderated_at: new Date('2026-08-13T10:00:00.000Z'),
                    moderation_note: 'İçerik uygun'
                }]
            };
        }
        if (/INSERT INTO customer_operation_audit_events/i.test(text)) {
            assert.deepEqual(params.slice(0, 3), [9, 601, 'publish']);
            assert.equal(JSON.parse(params[4]).revision, 2);
            assert.equal(JSON.parse(params[5]).product_id, 101);
            return { rows: [] };
        }
        if (/INSERT INTO notification_outbox_events/i.test(text)) {
            assert.equal(params[2], 'REVIEW_MODERATION_RESULT');
            assert.equal(params[3], 'review');
            assert.equal(Number(params[4]), 601);
            assert.equal(Number(params[5]), 2);
            return { rows: [{ id: params[0], inserted: true, status: 'PENDING' }] };
        }
        throw new Error(`Unexpected review moderation query: ${text}`);
    });

    const result = await invoke(reviewController.moderateReview, {
        currentAdmin: { id: 9, role: 'admin' },
        params: { reviewId: '601' },
        body: { status: 'PUBLISHED', expected_revision: 1, moderation_note: 'İçerik uygun' },
        headers: { 'x-request-id': 'review-moderation-1' }
    });
    assert.equal(result.statusCode, 200);
    assert.equal(result.body.review.status, 'PUBLISHED');
    assert.equal(calls.filter((call) => call.text === 'COMMIT').length, 1);
};

const testReviewTenantDenied = async () => {
    let mutations = 0;
    pool.connect = async () => transactionClient(async (sql) => {
        const text = String(sql).trim();
        if (['BEGIN', 'ROLLBACK'].includes(text)) return { rows: [] };
        if (/FROM reviews r[\s\S]*FOR UPDATE OF r/i.test(text)) return { rows: [] };
        if (/^(?:UPDATE|INSERT|DELETE)\b/i.test(text)) mutations += 1;
        throw new Error(`Unexpected tenant-denied review query: ${text}`);
    });

    const result = await invoke(reviewController.moderateReview, {
        currentAdmin: { id: 9, role: 'admin' },
        params: { reviewId: '999' },
        body: { status: 'HIDDEN', expected_revision: 1 },
        headers: {}
    });
    assert.equal(result.statusCode, 404);
    assert.equal(result.body.code, 'REVIEW_NOT_FOUND');
    assert.equal(mutations, 0);
};

const testQuestionAnswerAudit = async () => {
    const calls = [];
    pool.connect = async () => transactionClient(async (sql, params = []) => {
        const text = String(sql).trim();
        calls.push({ text, params });
        if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(text)) return { rows: [] };
        if (/FROM product_questions pq[\s\S]*FOR UPDATE OF pq/i.test(text)) {
            assert.match(text, /first_party_store\.slug/i);
            return {
                rows: [{
                    id: 501,
                    product_id: 101,
                    user_id: 41,
                    question: 'Stok var mı?',
                    answer: null,
                    revision: 1,
                    created_at: new Date('2026-08-13T08:00:00.000Z'),
                    answered_at: null
                }]
            };
        }
        if (/UPDATE product_questions/i.test(text)) {
            return {
                rows: [{
                    id: 501,
                    product_id: 101,
                    user_id: 41,
                    question: 'Stok var mı?',
                    answer: 'Evet, stokta.',
                    revision: 2,
                    answered_by: 9,
                    answered_at: new Date('2026-08-13T10:00:00.000Z'),
                    created_at: new Date('2026-08-13T08:00:00.000Z'),
                    updated_at: new Date('2026-08-13T10:00:00.000Z')
                }]
            };
        }
        if (/INSERT INTO customer_operation_audit_events/i.test(text)) {
            assert.deepEqual(params.slice(0, 3), [9, 501, 'answer']);
            assert.equal(JSON.parse(params[4]).revision, 2);
            return { rows: [] };
        }
        if (/INSERT INTO notification_outbox_events/i.test(text)) {
            assert.equal(params[2], 'QUESTION_ANSWERED');
            assert.equal(params[3], 'product_question');
            assert.equal(Number(params[4]), 501);
            assert.equal(Number(params[5]), 2);
            return { rows: [{ id: params[0], inserted: true, status: 'PENDING' }] };
        }
        throw new Error(`Unexpected question answer query: ${text}`);
    });

    const result = await invoke(questionController.answerQuestion, {
        currentAdmin: { id: 9, role: 'admin' },
        params: { id: '501' },
        body: { answer: 'Evet, stokta.', expected_revision: 1 },
        headers: { 'x-request-id': 'question-answer-1' }
    });
    assert.equal(result.statusCode, 200);
    assert.equal(result.body.question.answer, 'Evet, stokta.');
    assert.equal(result.body.question.answered_by, 9);
    assert.equal(calls.filter((call) => call.text === 'COMMIT').length, 1);
    assert.equal(calls.some((call) => /INSERT INTO notification_outbox_events/i.test(call.text)), true);
};

const testQuestionValidationAndConflict = async () => {
    pool.connect = async () => {
        throw new Error('invalid input must not open a transaction');
    };
    const malformed = await invoke(questionController.answerQuestion, {
        currentAdmin: { id: 9, role: 'admin' },
        params: { id: '501' },
        body: { answer: 'x'.repeat(2001) },
        headers: {}
    });
    assert.equal(malformed.statusCode, 400);
    assert.equal(malformed.body.code, 'QUESTION_ANSWER_INVALID');

    const missingRevision = await invoke(questionController.answerQuestion, {
        currentAdmin: { id: 9, role: 'admin' },
        params: { id: '501' },
        body: { answer: 'Geçerli ama revision önkoşulu eksik.' },
        headers: {}
    });
    assert.equal(missingRevision.statusCode, 428);
    assert.equal(missingRevision.body.code, 'QUESTION_PRECONDITION_REQUIRED');

    let mutations = 0;
    pool.connect = async () => transactionClient(async (sql) => {
        const text = String(sql).trim();
        if (['BEGIN', 'ROLLBACK'].includes(text)) return { rows: [] };
        if (/FROM product_questions pq[\s\S]*FOR UPDATE OF pq/i.test(text)) {
            return {
                rows: [{
                    id: 501,
                    product_id: 101,
                    user_id: 41,
                    question: 'Stok var mı?',
                    answer: null,
                    revision: 2
                }]
            };
        }
        if (/^(?:UPDATE|INSERT|DELETE)\b/i.test(text)) mutations += 1;
        throw new Error(`Unexpected stale question query: ${text}`);
    });
    const stale = await invoke(questionController.answerQuestion, {
        currentAdmin: { id: 9, role: 'admin' },
        params: { id: '501' },
        body: { answer: 'Evet, stokta.', expected_revision: 1 },
        headers: {}
    });
    assert.equal(stale.statusCode, 409);
    assert.equal(stale.body.code, 'QUESTION_REVISION_CONFLICT');
    assert.equal(mutations, 0);
};

(async () => {
    assertMigrationContract();
    assertRouteContract();
    assertNotificationTargetContract();
    await testPublicProjection();
    await testDuplicateReviewRejection();
    await testControlCharacterRejection();
    await testSellerWritesFailClosed();
    await testReviewModerationAudit();
    await testReviewTenantDenied();
    await testQuestionAnswerAudit();
    await testQuestionValidationAndConflict();
    console.log('reviewQuestionOperationsSmoke: OK');
})().catch((error) => {
    console.error(error);
    process.exitCode = 1;
}).finally(() => {
    pool.query = originalQuery;
    pool.connect = originalConnect;
    Module._load = originalLoad;
});
