const express = require('express');
const router = express.Router();
const {
    getAllProducts,
    createProduct,
    getProductById,
    deleteProduct,
    updateProduct,
    deleteProductMedia,
    previewProductMediaBackgroundRemoval,
    previewExistingProductMediaBackgroundRemoval,
    applyExistingProductMediaBackgroundRemoval,
    cleanupProductMediaPreview
} = require('../controllers/productController');
const { upload, previewUpload } = require('../config/cloudinary');
const { authenticate, requireAdmin } = require('../middlewares/authMiddleware');
const { requireCurrentAdmin } = require('../middlewares/currentAdmin');

router.get('/', getAllProducts);

// Medya yolu, '/:id' ile cakismamasi icin once tanimlanir
router.post('/media-preview/remove-background', authenticate, requireAdmin, requireCurrentAdmin, previewUpload.single('media'), previewProductMediaBackgroundRemoval);
router.post('/media-preview/cleanup', authenticate, requireAdmin, requireCurrentAdmin, cleanupProductMediaPreview);
router.post('/media/:mediaId/remove-background-preview', authenticate, requireAdmin, requireCurrentAdmin, previewExistingProductMediaBackgroundRemoval);
router.post('/media/:mediaId/remove-background-apply', authenticate, requireAdmin, requireCurrentAdmin, applyExistingProductMediaBackgroundRemoval);
router.delete('/media/:mediaId', authenticate, requireAdmin, requireCurrentAdmin, deleteProductMedia);

router.get('/:id', getProductById);
router.post('/', authenticate, requireAdmin, requireCurrentAdmin, upload.array('media', 10), createProduct);
router.put('/:id', authenticate, requireAdmin, requireCurrentAdmin, upload.array('media', 10), updateProduct);
router.delete('/:id', authenticate, requireAdmin, requireCurrentAdmin, deleteProduct);

module.exports = router;
