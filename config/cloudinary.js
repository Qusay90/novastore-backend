const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');
require('dotenv').config({ quiet: true });

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

const allowedFormats = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'mp4', 'webm', 'ogg', 'mov'];

const createUpload = (folder) => {
    const storage = new CloudinaryStorage({
        cloudinary,
        params: {
            folder,
            resource_type: 'auto',
            allowed_formats: allowedFormats
        }
    });

    return multer({ storage });
};

const upload = createUpload('novastore_products');
const reviewUpload = createUpload('novastore_reviews');
const previewUpload = createUpload('novastore_product_previews');

module.exports = {
    cloudinary,
    upload,
    reviewUpload,
    previewUpload,
    createUpload
};
