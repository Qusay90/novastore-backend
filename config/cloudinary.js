const multer = require('multer');
const { assertExternalSideEffectAllowed } = require('./stagingRuntimePolicy');

const MAX_REVIEW_MEDIA_COUNT = 4;
const MAX_REVIEW_MEDIA_BYTES = 8 * 1024 * 1024;
const REVIEW_MEDIA_FOLDER = 'novastore_reviews';

let cloudinaryClient = null;

const getCloudinaryClient = (effect) => {
    assertExternalSideEffectAllowed(effect);
    if (!cloudinaryClient) {
        cloudinaryClient = require('cloudinary').v2;
        cloudinaryClient.config({
            cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
            api_key: process.env.CLOUDINARY_API_KEY,
            api_secret: process.env.CLOUDINARY_API_SECRET
        });
    }
    return cloudinaryClient;
};

const cloudinary = {
    url(...args) {
        return getCloudinaryClient('cloudinary_write').url(...args);
    },
    uploader: {
        upload_stream(...args) {
            return getCloudinaryClient('cloudinary_write').uploader.upload_stream(...args);
        },
        explicit(...args) {
            return getCloudinaryClient('cloudinary_write').uploader.explicit(...args);
        },
        destroy(...args) {
            return getCloudinaryClient('cloudinary_delete').uploader.destroy(...args);
        }
    }
};

const allowedFormats = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'mp4', 'webm', 'ogg', 'mov'];
const allowedReviewMimeTypes = new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'video/mp4',
    'video/webm',
    'video/ogg',
    'video/quicktime'
]);

const createUploadOptions = (folder, resourceType = 'auto') => ({
    folder,
    resource_type: resourceType,
    allowed_formats: allowedFormats
});

const buildUploadedFileInfo = (file, result, fallbackResourceType) => {
    const mediaUrl = result.secure_url || result.url;
    if (!mediaUrl) {
        throw new Error('Cloudinary upload did not return a media URL.');
    }

    return {
        path: mediaUrl,
        secure_url: result.secure_url,
        url: result.url,
        public_id: result.public_id,
        filename: result.public_id,
        resource_type: result.resource_type || fallbackResourceType,
        bytes: result.bytes,
        size: result.bytes || file.size,
        format: result.format,
        originalname: file.originalname,
        mimetype: file.mimetype
    };
};

const createCloudinaryStorage = (folder) => ({
    _handleFile(_req, file, cb) {
        let settled = false;
        const done = (error, info) => {
            if (settled) return;
            settled = true;
            cb(error, info);
        };

        const uploadStream = cloudinary.uploader.upload_stream(
            createUploadOptions(folder, 'auto'),
            (error, result) => {
                if (error) return done(error);

                try {
                    return done(null, buildUploadedFileInfo(file, result || {}, 'auto'));
                } catch (err) {
                    return done(err);
                }
            }
        );

        file.stream.on('error', (error) => done(error));
        file.stream.pipe(uploadStream);
    },

    _removeFile(_req, file, cb) {
        const publicId = file.public_id || file.filename;
        if (!publicId) return cb(null);

        cloudinary.uploader.destroy(publicId, {
            resource_type: file.resource_type || 'image'
        }).then(() => cb(null)).catch(cb);
    }
});

const createUpload = (folder) => {
    return multer({ storage: createCloudinaryStorage(folder) });
};

const reviewFileFilter = (_req, file, cb) => {
    const mimeType = String(file && file.mimetype || '').toLowerCase();
    if (allowedReviewMimeTypes.has(mimeType)) {
        return cb(null, true);
    }

    const err = new Error('Ge\u00e7ersiz dosya t\u00fcr\u00fc. Yaln\u0131zca g\u00f6rsel veya desteklenen video dosyalar\u0131 ekleyebilirsiniz.');
    err.statusCode = 400;
    return cb(err);
};

const uploadBufferToCloudinary = (file, folder = REVIEW_MEDIA_FOLDER) => new Promise((resolve, reject) => {
    const resourceType = String(file && file.mimetype || '').toLowerCase().startsWith('video/')
        ? 'video'
        : 'image';

    const stream = cloudinary.uploader.upload_stream(
        createUploadOptions(folder, resourceType),
        (error, result) => {
            if (error) return reject(error);

            try {
                return resolve({
                    ...file,
                    ...buildUploadedFileInfo(file, result || {}, resourceType)
                });
            } catch (err) {
                return reject(err);
            }
        }
    );

    stream.end(file.buffer);
});

const cleanupCloudinaryAssets = async (files = []) => {
    const assets = Array.isArray(files) ? files : [];
    await Promise.allSettled(
        assets
            .filter((file) => file && file.public_id)
            .map((file) => cloudinary.uploader.destroy(file.public_id, {
                resource_type: file.resource_type || 'image'
            }))
    );
};

const uploadReviewMediaFiles = async (files = []) => {
    const uploaded = [];
    try {
        for (const file of Array.isArray(files) ? files : []) {
            uploaded.push(await uploadBufferToCloudinary(file));
        }
        return uploaded;
    } catch (error) {
        await cleanupCloudinaryAssets(uploaded);
        throw error;
    }
};

const upload = createUpload('novastore_products');
const reviewUpload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: MAX_REVIEW_MEDIA_BYTES,
        files: MAX_REVIEW_MEDIA_COUNT
    },
    fileFilter: reviewFileFilter
});
const previewUpload = createUpload('novastore_product_previews');

module.exports = {
    cloudinary,
    upload,
    reviewUpload,
    previewUpload,
    createUpload,
    uploadReviewMediaFiles,
    cleanupCloudinaryAssets
};
