const express = require('express');
const router = express.Router();
const { getAllProducts, createProduct, getProductById, deleteProduct, updateProduct, deleteProductMedia } = require('../controllers/productController');
const { upload } = require('../config/cloudinary');
const { authenticate, requireAdmin } = require('../middlewares/authMiddleware');

router.get('/', getAllProducts);
router.get('/:id', getProductById);

// Medya yolu, '/:id' ile cakismamasi icin once tanimlanir
router.delete('/media/:mediaId', authenticate, requireAdmin, deleteProductMedia);

router.post('/', authenticate, requireAdmin, upload.array('media', 10), createProduct);
router.put('/:id', authenticate, requireAdmin, upload.array('media', 10), updateProduct);
router.delete('/:id', authenticate, requireAdmin, deleteProduct);

module.exports = router;
