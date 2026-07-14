const assert = require('node:assert/strict');
const express = require('express');
const http = require('node:http');
const Module = require('node:module');
const jwt = require('jsonwebtoken');

process.env.NODE_ENV = 'test';
process.env.NOVASTORE_SAFE_LOCAL_BACKEND = 'true';
process.env.NOVASTORE_ALLOW_REMOTE_DB = 'false';
process.env.SKIP_SCHEMA_INIT = 'true';
process.env.NOVASTORE_ALLOW_SCHEMA_INIT = 'false';
process.env.DATABASE_URL = 'postgresql://novastore_test:novastore_test_only@127.0.0.1:55432/novastore_category_v2_test';
process.env.DB_HOST = '127.0.0.1';
process.env.DB_PORT = '55432';
process.env.DB_NAME = 'novastore_category_v2_test';
process.env.DB_USER = 'novastore_test';
process.env.DB_PASSWORD = 'novastore_test_only';
process.env.DB_SSL = 'false';
process.env.SUPABASE_USE_POOLER = 'false';
process.env.JWT_SECRET = 'review-upload-authorization-smoke-secret';

const originalLoad = Module._load;
Module._load = function load(request, parent, isMain) {
    if (request === '../server' || request.endsWith('/server')) {
        return {
            io: {
                to: () => ({
                    emit: () => {}
                })
            }
        };
    }
    return originalLoad.call(this, request, parent, isMain);
};

const pool = require('../config/db');
const { cloudinary, reviewUpload } = require('../config/cloudinary');
const reviewRoutes = require('../routes/reviewRoutes');

const originalPoolQuery = pool.query;
const originalPoolConnect = pool.connect;
const originalReviewUploadArray = reviewUpload.array;
const originalUploadStream = cloudinary.uploader.upload_stream;
const originalDestroy = cloudinary.uploader.destroy;

let deliveredRows = [];
let malformedEligibilityResult = false;
let reviewUploadParserCalls = 0;
let cloudinaryUploadCalls = 0;
let destroyCalls = 0;
let connectCalls = 0;
let reviewInserts = 0;
let mediaInserts = 0;
let notificationInserts = 0;
let auditInserts = 0;

const restoreState = () => {
    pool.query = originalPoolQuery;
    pool.connect = originalPoolConnect;
    reviewUpload.array = originalReviewUploadArray;
    cloudinary.uploader.upload_stream = originalUploadStream;
    cloudinary.uploader.destroy = originalDestroy;
    Module._load = originalLoad;
};

const buildMultipartBody = ({ fields, files }) => {
    const boundary = `----novastore-review-smoke-${Date.now()}`;
    const chunks = [];
    const push = (value) => chunks.push(Buffer.isBuffer(value) ? value : Buffer.from(value));

    for (const [name, value] of Object.entries(fields)) {
        push(`--${boundary}\r\n`);
        push(`Content-Disposition: form-data; name="${name}"\r\n\r\n`);
        push(`${value}\r\n`);
    }

    for (const file of files) {
        push(`--${boundary}\r\n`);
        push(`Content-Disposition: form-data; name="${file.fieldName}"; filename="${file.filename}"\r\n`);
        push(`Content-Type: ${file.contentType}\r\n\r\n`);
        push(file.content);
        push('\r\n');
    }

    push(`--${boundary}--\r\n`);

    return {
        boundary,
        body: Buffer.concat(chunks)
    };
};

const postMultipart = (server, path, { fields, files, headers = {} }) => new Promise((resolve, reject) => {
    const { boundary, body } = buildMultipartBody({ fields, files });
    const req = http.request({
        method: 'POST',
        host: '127.0.0.1',
        port: server.address().port,
        path,
        headers: {
            'Content-Type': `multipart/form-data; boundary=${boundary}`,
            'Content-Length': body.length,
            ...headers
        }
    }, (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
            const text = Buffer.concat(chunks).toString('utf8');
            resolve({
                status: res.statusCode,
                body: text ? JSON.parse(text) : null
            });
        });
    });

    req.on('error', reject);
    req.end(body);
});

const app = express();
app.use('/api/reviews', reviewRoutes);

const createServer = () => new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => resolve(server));
});

const token = jwt.sign(
    { id: 42, role: 'customer' },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
);

const reviewRequest = {
    fields: {
        productId: '101',
        rating: '5',
        comment: 'Review media authorization smoke'
    },
    files: [{
        fieldName: 'media',
        filename: 'proof.png',
        contentType: 'image/png',
        content: Buffer.from('fake image bytes')
    }],
    headers: {
        Authorization: `Bearer ${token}`
    }
};

reviewUpload.array = function patchedReviewUploadArray(...args) {
    reviewUploadParserCalls += 1;
    return originalReviewUploadArray.apply(this, args);
};

cloudinary.uploader.upload_stream = (options, callback) => {
    cloudinaryUploadCalls += 1;
    return {
        end(buffer) {
            assert.ok(Buffer.isBuffer(buffer), 'review media should be uploaded from multer memory storage');
            process.nextTick(() => callback(null, {
                secure_url: `https://cdn.example.test/review-${cloudinaryUploadCalls}.png`,
                url: `http://cdn.example.test/review-${cloudinaryUploadCalls}.png`,
                public_id: `review-${cloudinaryUploadCalls}`,
                resource_type: options.resource_type
            }));
        }
    };
};

cloudinary.uploader.destroy = async () => {
    destroyCalls += 1;
    return { result: 'ok' };
};

pool.query = async (sql, params = []) => {
    const text = String(sql);

    if (/SELECT id FROM reviews WHERE product_id = \$1 AND user_id = \$2/i.test(text)) {
        assert.deepEqual(params, [101, 42]);
        return { rows: [] };
    }

    if (/AS public_product_exists/i.test(text)) {
        assert.deepEqual([params[0], params[2]], [42, 101]);
        if (malformedEligibilityResult) return { rows: [] };
        return {
            rows: [{
                public_product_exists: true,
                has_delivered_order: deliveredRows.length > 0
            }]
        };
    }

    if (/INSERT INTO notifications/i.test(text)) {
        notificationInserts += 1;
        return { rows: [{ id: notificationInserts, user_id: null, type: params[1], message: params[2] }] };
    }

    if (/INSERT INTO notification_audit_logs/i.test(text)) {
        auditInserts += 1;
        return { rows: [] };
    }

    throw new Error(`Unexpected pool query in review upload smoke: ${text}`);
};

pool.connect = async () => {
    connectCalls += 1;
    return {
        async query(sql, params = []) {
            const text = String(sql);

            if (text === 'BEGIN' || text === 'COMMIT' || text === 'ROLLBACK') {
                return { rows: [] };
            }

            if (/INSERT INTO reviews/i.test(text)) {
                reviewInserts += 1;
                assert.deepEqual(params, [101, 42, 5, 'Review media authorization smoke']);
                return { rows: [{ id: 9001 }] };
            }

            if (/INSERT INTO review_media/i.test(text)) {
                mediaInserts += 1;
                assert.equal(params[0], 9001);
                assert.equal(params[1], 'https://cdn.example.test/review-1.png');
                assert.equal(params[2], 'image');
                assert.equal(params[3], 0);
                return { rows: [] };
            }

            throw new Error(`Unexpected client query in review upload smoke: ${text}`);
        },
        release() {}
    };
};

(async () => {
    const server = await createServer();

    try {
        const missingPreflight = await postMultipart(server, '/api/reviews', reviewRequest);
        assert.equal(missingPreflight.status, 400);
        assert.equal(reviewUploadParserCalls, 0, 'multipart review without preflight product id must not invoke multer');
        assert.equal(cloudinaryUploadCalls, 0);

        malformedEligibilityResult = true;
        const malformedEligibility = await postMultipart(server, '/api/reviews?productId=101', reviewRequest);
        assert.equal(malformedEligibility.status, 500);
        assert.equal(reviewUploadParserCalls, 0, 'malformed eligibility result must fail closed before multer');
        assert.equal(cloudinaryUploadCalls, 0, 'malformed eligibility result must fail closed before Cloudinary');
        malformedEligibilityResult = false;

        deliveredRows = [];
        const unauthorized = await postMultipart(server, '/api/reviews?productId=101', reviewRequest);
        assert.equal(unauthorized.status, 403);
        assert.equal(unauthorized.body.code, 'DELIVERY_REQUIRED');
        assert.equal(reviewUploadParserCalls, 0, 'unauthorized review media must not invoke multer');
        assert.equal(cloudinaryUploadCalls, 0, 'unauthorized review media must not reach Cloudinary');
        assert.equal(connectCalls, 0, 'unauthorized review media must not start a review transaction');
        assert.equal(reviewInserts, 0);
        assert.equal(mediaInserts, 0);

        deliveredRows = [{ id: 7001 }];
        const authorized = await postMultipart(server, '/api/reviews?productId=101', reviewRequest);
        assert.equal(authorized.status, 201);
        assert.equal(authorized.body.reviewId, 9001);
        assert.equal(reviewUploadParserCalls, 1, 'authorized review media should invoke multer after permission passes');
        assert.equal(cloudinaryUploadCalls, 1, 'authorized review media should upload after permission passes');
        assert.equal(connectCalls, 1);
        assert.equal(reviewInserts, 1);
        assert.equal(mediaInserts, 1);
        assert.equal(destroyCalls, 0);

        console.log('reviewUploadAuthorizationSmoke: OK');
    } finally {
        await new Promise((resolve) => server.close(resolve));
        restoreState();
    }
})().catch((err) => {
    restoreState();
    console.error(err);
    process.exitCode = 1;
});
