const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');
require('dotenv').config();

// Cloudinary'ye kimliğimizi doğruluyoruz
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// Resimlerin ve videoların nereye ve nasıl kaydedileceğini belirliyoruz
const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'novastore_products', // Bulutta bu isimde bir klasör açıp resimleri oraya atacak
        resource_type: 'auto', // Hem image (resim/gif) hem de video yüklenmesine izin verir
        allowed_formats: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'mp4'] // İzin verilen dosya uzantıları
    }
});

const upload = multer({ storage: storage });

module.exports = { upload };