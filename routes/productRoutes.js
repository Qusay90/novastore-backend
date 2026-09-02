const express = require('express');
const router = express.Router();
const {
    getAllProducts,
    getProductById
} = require('../controllers/productController');
const { authenticate, requireAdmin } = require('../middlewares/authMiddleware');
const { requireCurrentAdmin } = require('../middlewares/currentAdmin');

const retireLegacyAdminProductWrite = (_req, res) => res.status(410).json({
    code: 'LEGACY_ADMIN_PRODUCT_WRITE_RETIRED',
    error: 'Eski ürün yazma yolu kapatıldı. Canonical Admin katalog işlemini kullanın.'
});

router.get('/', getAllProducts);

// Medya yolu, '/:id' ile cakismamasi icin once tanimlanir
router.post('/media-preview/remove-background', authenticate, requireAdmin, requireCurrentAdmin, retireLegacyAdminProductWrite);
router.post('/media-preview/cleanup', authenticate, requireAdmin, requireCurrentAdmin, retireLegacyAdminProductWrite);
router.post('/media/:mediaId/remove-background-preview', authenticate, requireAdmin, requireCurrentAdmin, retireLegacyAdminProductWrite);
router.post('/media/:mediaId/remove-background-apply', authenticate, requireAdmin, requireCurrentAdmin, retireLegacyAdminProductWrite);
router.delete('/media/:mediaId', authenticate, requireAdmin, requireCurrentAdmin, retireLegacyAdminProductWrite);

router.get('/:id', getProductById);
router.post('/', authenticate, requireAdmin, requireCurrentAdmin, retireLegacyAdminProductWrite);
router.put('/:id', authenticate, requireAdmin, requireCurrentAdmin, retireLegacyAdminProductWrite);
router.delete('/:id', authenticate, requireAdmin, requireCurrentAdmin, retireLegacyAdminProductWrite);

module.exports = router;
