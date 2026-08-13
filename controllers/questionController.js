const pool = require('../config/db');
const { maskFullName } = require('../services/privacyService');
const { buildPublicProductSqlPredicate } = require('../constants/productVisibility');
const { PLATFORM_STORE } = require('../services/categoryV2BackfillService');

const MIN_QUESTION_LENGTH = 5;
const MAX_QUESTION_LENGTH = 1000;
const MAX_ANSWER_LENGTH = 2000;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

class QuestionOperationError extends Error {
    constructor(message, code, statusCode = 400) {
        super(message);
        this.name = 'QuestionOperationError';
        this.code = code;
        this.statusCode = statusCode;
    }
}

const positiveInteger = (value, message, code) => {
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < 1) {
        throw new QuestionOperationError(message, code);
    }
    return parsed;
};

const boundedText = (value, { min, max, message, code }) => {
    if (typeof value !== 'string') throw new QuestionOperationError(message, code);
    const text = value.trim();
    if (text.length < min || text.length > max || CONTROL_CHARACTER_PATTERN.test(text)) {
        throw new QuestionOperationError(message, code);
    }
    return text;
};

const parseExpectedRevision = (body = {}) => {
    const value = body.expected_revision ?? body.expectedRevision;
    if (value === undefined || value === null || value === '') {
        throw new QuestionOperationError(
            'expected_revision önkoşulu zorunludur.',
            'QUESTION_PRECONDITION_REQUIRED',
            428
        );
    }
    return positiveInteger(value, 'expected_revision pozitif güvenli tam sayı olmalıdır.', 'QUESTION_REVISION_INVALID');
};

const requestAuditMetadata = (req, values = {}) => {
    const requestId = String(req.headers?.['x-request-id'] || '').trim();
    return {
        ...values,
        request_id: requestId && requestId.length <= 120 && /^[A-Za-z0-9._:-]+$/.test(requestId)
            ? requestId
            : null
    };
};

// --- Musteri Islemleri ---

// Yeni Soru Sor
exports.askQuestion = async (req, res) => {
    try {
        const productId = positiveInteger(
            req.body?.product_id,
            'Geçerli bir ürün kimliği zorunludur.',
            'QUESTION_PRODUCT_ID_INVALID'
        );
        const question = boundedText(req.body?.question, {
            min: MIN_QUESTION_LENGTH,
            max: MAX_QUESTION_LENGTH,
            message: `Soru ${MIN_QUESTION_LENGTH} ile ${MAX_QUESTION_LENGTH} karakter arasında olmalıdır.`,
            code: 'QUESTION_TEXT_INVALID'
        });
        const user_id = req.user.id;

        const newQuestion = await pool.query(
            `INSERT INTO product_questions (product_id, user_id, question)
             SELECT products.id, $2, $3
             FROM products
             JOIN stores first_party_store
               ON first_party_store.id = products.store_id
              AND LOWER(first_party_store.slug) = LOWER($4)
              AND first_party_store.is_active = TRUE
              AND first_party_store.deleted_at IS NULL
             WHERE products.id = $1
               AND ${buildPublicProductSqlPredicate('products')}
             RETURNING id, product_id, question, answer, revision, created_at, answered_at`,
            [productId, user_id, question, PLATFORM_STORE.slug]
        );

        if (newQuestion.rows.length === 0) {
            return res.status(404).json({ error: 'Ürün bulunamadı.', code: 'PRODUCT_NOT_FOUND' });
        }

        // Bildirim gonder (Admine)
        try {
            const { io } = require('../server');
            const { createNotification } = require('./notificationController');
            await createNotification(
                null,
                'new_question',
                'Yeni bir ürün sorusu geldi!',
                io,
                { entityType: 'product_question', entityId: Number(newQuestion.rows[0].id) }
            );
        } catch (notifErr) {
            console.error('Bildirim gonderilirken hata:', notifErr);
        }

        res.status(201).json({
            mesaj: 'Sorunuz başarıyla iletildi. Mağaza yanıtladığında burada görünecektir.',
            question: {
                ...newQuestion.rows[0],
                status: 'pending',
                is_answered: false
            }
        });
    } catch (error) {
        if (error instanceof QuestionOperationError) {
            return res.status(error.statusCode).json({ error: error.message, code: error.code });
        }
        console.error('Soru sorma hatası:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
};

// Ürüne Ait Soruları Getir
exports.getProductQuestions = async (req, res) => {
    try {
        const productId = positiveInteger(
            req.params.productId,
            'Geçersiz ürün kimliği.',
            'QUESTION_PRODUCT_ID_INVALID'
        );

        const questions = await pool.query(
            `WITH public_product AS (
                SELECT products.id
                FROM products
                WHERE products.id = $1
                  AND ${buildPublicProductSqlPredicate('products')}
             )
             SELECT public_product.id AS public_product_id,
                    pq.id, pq.question, pq.answer, pq.created_at, pq.answered_at,
                    COALESCE(u.full_name, u.name) as user_name
             FROM public_product
             LEFT JOIN product_questions pq
               ON pq.product_id = public_product.id
              AND NULLIF(BTRIM(pq.answer), '') IS NOT NULL
             LEFT JOIN users u ON pq.user_id = u.id
             ORDER BY pq.answered_at DESC, pq.id DESC`,
            [productId]
        );

        if (questions.rows.length === 0) {
            return res.status(404).json({ error: 'Ürün bulunamadı.', code: 'PRODUCT_NOT_FOUND' });
        }

        res.status(200).json(
            questions.rows
                .filter((questionRow) => questionRow.id !== null)
                .map((questionRow) => ({
                    id: Number(questionRow.id),
                    question: questionRow.question,
                    answer: questionRow.answer,
                    user_name: maskFullName(questionRow.user_name),
                    created_at: questionRow.created_at,
                    answered_at: questionRow.answered_at,
                    status: 'answered',
                    is_answered: true
                }))
        );
    } catch (error) {
        if (error instanceof QuestionOperationError) {
            return res.status(error.statusCode).json({ error: error.message, code: error.code });
        }
        console.error('Soruları getirme hatası:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
};

// 3. Kullanıcının Kendi Sorduğu Soruları Getir
exports.getUserQuestions = async (req, res) => {
    try {
        const user_id = req.user.id;

        const questions = await pool.query(
            `SELECT pq.id, pq.question, pq.answer, pq.revision,
                    pq.created_at, pq.answered_at,
                    pq.product_id, p.name as product_name, p.image_url as product_image
             FROM product_questions pq
             JOIN products p ON pq.product_id = p.id
             WHERE pq.user_id = $1
             ORDER BY pq.created_at DESC`,
            [user_id]
        );

        res.status(200).json(questions.rows.map((questionRow) => ({
            ...questionRow,
            status: questionRow.answer ? 'answered' : 'pending',
            is_answered: Boolean(questionRow.answer)
        })));
    } catch (error) {
        console.error('Kullanıcı soruları getirme hatası:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
};

// --- Admin Islemleri ---

// Admin: Tüm Soruları Getir (Cevaplanmamışlar üstte olsun)
exports.getAllQuestionsAdmin = async (req, res) => {
    try {
        const questions = await pool.query(
            `SELECT pq.id, pq.product_id, pq.user_id, pq.question, pq.answer,
                    pq.revision, pq.answered_by, pq.created_at, pq.answered_at, pq.updated_at,
                     p.name as product_name, p.image_url as product_image,
                     COALESCE(u.full_name, u.name) as user_name
             FROM product_questions pq
             JOIN products p ON pq.product_id = p.id
             JOIN stores first_party_store
              ON first_party_store.id = p.store_id
              AND LOWER(first_party_store.slug) = LOWER($1)
              AND first_party_store.is_active = TRUE
              AND first_party_store.deleted_at IS NULL
             JOIN users u ON pq.user_id = u.id
             ORDER BY
                CASE WHEN NULLIF(BTRIM(pq.answer), '') IS NULL THEN 0 ELSE 1 END ASC,
                pq.created_at DESC`,
            [PLATFORM_STORE.slug]
        );

        res.status(200).json(questions.rows);
    } catch (error) {
        console.error('Tüm soruları getirme hatası:', error);
        res.status(500).json({ error: 'Sunucu hatası: ' + error.message });
    }
};

// Admin: Ürün bazlı soru özetleri
exports.getProductQuestionSummaryAdmin = async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT
                p.id AS product_id,
                p.name AS product_name,
                p.image_url AS product_image,
                COUNT(pq.id)::INT AS question_count,
                COUNT(pq.id) FILTER (WHERE NULLIF(BTRIM(pq.answer), '') IS NULL)::INT AS pending_count,
                COUNT(pq.id) FILTER (WHERE NULLIF(BTRIM(pq.answer), '') IS NOT NULL)::INT AS answered_count,
                MAX(pq.created_at) AS latest_question_at
             FROM product_questions pq
             JOIN products p ON pq.product_id = p.id
             JOIN stores first_party_store
              ON first_party_store.id = p.store_id
              AND LOWER(first_party_store.slug) = LOWER($1)
              AND first_party_store.is_active = TRUE
              AND first_party_store.deleted_at IS NULL
             GROUP BY p.id, p.name, p.image_url
             ORDER BY
                COUNT(pq.id) FILTER (WHERE NULLIF(BTRIM(pq.answer), '') IS NULL) DESC,
                MAX(pq.created_at) DESC`,
            [PLATFORM_STORE.slug]
        );

        res.status(200).json(result.rows);
    } catch (error) {
        console.error('Ürün soru özetleri getirme hatası:', error);
        res.status(500).json({ error: 'Sunucu hatası: ' + error.message });
    }
};

// Admin: Soruya Cevap Ver
exports.answerQuestion = async (req, res) => {
    let client;
    try {
        const questionId = positiveInteger(
            req.params.id,
            'Geçersiz soru kimliği.',
            'QUESTION_ID_INVALID'
        );
        const answer = boundedText(req.body?.answer, {
            min: 1,
            max: MAX_ANSWER_LENGTH,
            message: `Cevap 1 ile ${MAX_ANSWER_LENGTH} karakter arasında olmalıdır.`,
            code: 'QUESTION_ANSWER_INVALID'
        });
        const expectedRevision = parseExpectedRevision(req.body);
        const actorId = Number(req.currentAdmin?.id);
        if (!Number.isSafeInteger(actorId) || actorId < 1) {
            throw new QuestionOperationError(
                'Güncel yönetici kimliği zorunludur.',
                'QUESTION_ADMIN_ACTOR_INVALID',
                403
            );
        }

        client = await pool.connect();
        await client.query('BEGIN');
        const currentResult = await client.query(
            `SELECT pq.id, pq.product_id, pq.user_id, pq.question, pq.answer, pq.revision,
                    pq.created_at, pq.answered_at
             FROM product_questions pq
             JOIN products product ON product.id = pq.product_id
             JOIN stores first_party_store
              ON first_party_store.id = product.store_id
              AND LOWER(first_party_store.slug) = LOWER($2)
              AND first_party_store.is_active = TRUE
              AND first_party_store.deleted_at IS NULL
             WHERE pq.id = $1
             FOR UPDATE OF pq`,
            [questionId, PLATFORM_STORE.slug]
        );
        if (currentResult.rows.length === 0) {
            throw new QuestionOperationError('Soru bulunamadı.', 'QUESTION_NOT_FOUND', 404);
        }

        const current = currentResult.rows[0];
        const currentRevision = Number(current.revision);
        if (currentRevision !== expectedRevision) {
            throw new QuestionOperationError(
                'Soru başka bir işlem tarafından güncellendi; kuyruğu yenileyin.',
                'QUESTION_REVISION_CONFLICT',
                409
            );
        }
        if (current.answer === answer) {
            throw new QuestionOperationError('Cevap mevcut yanıtla aynı.', 'QUESTION_ANSWER_NOOP', 409);
        }

        const updatedQuery = await client.query(
            `UPDATE product_questions
             SET answer = $1,
                 answered_at = CURRENT_TIMESTAMP,
                 answered_by = $2,
                 updated_at = CURRENT_TIMESTAMP,
                 revision = revision + 1
             WHERE id = $3 AND revision = $4
             RETURNING id, product_id, user_id, question, answer, revision,
                       answered_by, answered_at, created_at, updated_at`,
            [answer, actorId, questionId, currentRevision]
        );
        if (updatedQuery.rows.length !== 1) {
            throw new QuestionOperationError(
                'Soru revision güncellemesi çakıştı.',
                'QUESTION_REVISION_CONFLICT',
                409
            );
        }

        const answeredQuestion = updatedQuery.rows[0];
        await client.query(
            `INSERT INTO customer_operation_audit_events (
                actor_user_id, actor_role, entity_type, entity_id, action,
                before_state, after_state, metadata
             ) VALUES ($1, 'admin', 'question', $2, $3, $4::JSONB, $5::JSONB, $6::JSONB)`,
            [
                actorId,
                questionId,
                current.answer ? 'revise_answer' : 'answer',
                JSON.stringify({ answer: current.answer || null, revision: currentRevision }),
                JSON.stringify({ answer: answeredQuestion.answer, revision: Number(answeredQuestion.revision) }),
                JSON.stringify(requestAuditMetadata(req, { product_id: Number(current.product_id) }))
            ]
        );
        await client.query('COMMIT');

        // Bildirim gonder (Kullaniciya)
        try {
            const { io } = require('../server');
            const { createNotification } = require('./notificationController');
            await createNotification(
                answeredQuestion.user_id,
                'question_answered',
                'Sorduğunuz soru mağaza tarafından yanıtlandı!',
                io,
                { entityType: 'product_question', entityId: Number(answeredQuestion.id) }
            );
        } catch (notifErr) {
            console.error('Bildirim gonderilirken hata:', notifErr);
        }

        res.status(200).json({ mesaj: 'Soru cevaplandı ve yayınlandı.', question: answeredQuestion });
    } catch (error) {
        if (client) await client.query('ROLLBACK').catch(() => {});
        if (error instanceof QuestionOperationError) {
            return res.status(error.statusCode).json({ error: error.message, code: error.code });
        }
        console.error('Cevaplama hatası:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    } finally {
        if (client) client.release();
    }
};
