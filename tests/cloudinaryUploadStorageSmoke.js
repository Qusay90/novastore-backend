const assert = require('node:assert/strict');
const express = require('express');
const http = require('node:http');
const { Writable } = require('node:stream');
const { cloudinary, createUpload } = require('../config/cloudinary');

const originalUploadStream = cloudinary.uploader.upload_stream;
const originalDestroy = cloudinary.uploader.destroy;

let uploadCalls = 0;
let uploadedBody = Buffer.alloc(0);

const restoreState = () => {
    cloudinary.uploader.upload_stream = originalUploadStream;
    cloudinary.uploader.destroy = originalDestroy;
};

cloudinary.uploader.upload_stream = (options, callback) => {
    uploadCalls += 1;
    assert.equal(options.folder, 'novastore_products');
    assert.equal(options.resource_type, 'auto');
    assert.ok(options.allowed_formats.includes('jpg'));

    const chunks = [];
    return new Writable({
        write(chunk, _encoding, done) {
            chunks.push(Buffer.from(chunk));
            done();
        },
        final(done) {
            uploadedBody = Buffer.concat(chunks);
            process.nextTick(() => callback(null, {
                secure_url: 'https://res.cloudinary.com/demo/image/upload/v123/novastore_products/proof.jpg',
                url: 'http://res.cloudinary.com/demo/image/upload/v123/novastore_products/proof.jpg',
                public_id: 'novastore_products/proof',
                resource_type: 'image',
                bytes: uploadedBody.length,
                format: 'jpg'
            }));
            done();
        }
    });
};

cloudinary.uploader.destroy = async () => ({ result: 'ok' });

const buildMultipartBody = ({ fields, files }) => {
    const boundary = `----novastore-cloudinary-storage-smoke-${Date.now()}`;
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

const postMultipart = (server, path, { fields, files }) => new Promise((resolve, reject) => {
    const { boundary, body } = buildMultipartBody({ fields, files });
    const req = http.request({
        method: 'POST',
        host: '127.0.0.1',
        port: server.address().port,
        path,
        headers: {
            'Content-Type': `multipart/form-data; boundary=${boundary}`,
            'Content-Length': body.length
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
app.post('/upload', createUpload('novastore_products').single('media'), (req, res) => {
    res.status(200).json({
        path: req.file.path,
        secure_url: req.file.secure_url,
        url: req.file.url,
        public_id: req.file.public_id,
        filename: req.file.filename,
        resource_type: req.file.resource_type,
        size: req.file.size,
        originalname: req.file.originalname,
        mimetype: req.file.mimetype
    });
});

(async () => {
    const server = await new Promise((resolve) => {
        const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
    });

    try {
        const content = Buffer.from('fake jpeg bytes');
        const response = await postMultipart(server, '/upload', {
            fields: { name: 'Proof' },
            files: [{
                fieldName: 'media',
                filename: 'proof.jpg',
                contentType: 'image/jpeg',
                content
            }]
        });

        assert.equal(response.status, 200);
        assert.equal(uploadCalls, 1);
        assert.equal(uploadedBody.toString('utf8'), content.toString('utf8'));
        assert.equal(response.body.path, 'https://res.cloudinary.com/demo/image/upload/v123/novastore_products/proof.jpg');
        assert.equal(response.body.public_id, 'novastore_products/proof');
        assert.equal(response.body.filename, 'novastore_products/proof');
        assert.equal(response.body.resource_type, 'image');
        assert.equal(response.body.size, content.length);
        assert.equal(response.body.originalname, 'proof.jpg');
        assert.equal(response.body.mimetype, 'image/jpeg');

        console.log('cloudinaryUploadStorageSmoke: OK');
    } finally {
        await new Promise((resolve) => server.close(resolve));
        restoreState();
    }
})().catch((err) => {
    restoreState();
    console.error(err);
    process.exitCode = 1;
});
