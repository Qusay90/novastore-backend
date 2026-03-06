//Bu dosya, dışarıdan gelen /api/products isteklerini az önce yazdığımız controller'a yönlendirecek.

const express = require('express');
const router = express.Router();
const { getAllProducts, createProduct, getProductById, deleteProduct, updateProduct, deleteProductMedia } = require('../controllers/productController');
const { upload } = require('../config/cloudinary'); // Yükleyiciyi dahil ettik

router.get('/', getAllProducts);

// POST isteğine "upload.array('media', 10)" ara yazılımını ekledik.
// Bu, "media" adıyla gelen en fazla 10 dosyayı alıp Cloudinary'ye yükler.
router.post('/', upload.array('media', 10), createProduct);

router.get('/:id', getProductById);
router.delete('/:id', deleteProduct); // Ürünü silme yolu
router.put('/:id', upload.array('media', 10), updateProduct); // Ürünü güncelleme yolu
router.delete('/media/:mediaId', deleteProductMedia); // Spesifik bir ürün görselini silme yolu

module.exports = router;