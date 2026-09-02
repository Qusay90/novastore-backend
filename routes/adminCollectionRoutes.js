const express = require('express');
const { authenticate, requireAdmin } = require('../middlewares/authMiddleware');
const { requireCurrentAdmin } = require('../middlewares/currentAdmin');
const { requireAdminCommerceCapability } = require('../middlewares/adminCommerceCapability');
const {
    getCollections,
    postCollection,
    patchCollection,
    patchCollectionArchive,
    getCollectionProducts,
    postCollectionProduct,
    deleteCollectionProduct
} = require('../controllers/adminCollectionController');

const router = express.Router();
const requireCatalogStructureWrite = requireAdminCommerceCapability('catalogStructureWrite');

router.use(authenticate, requireAdmin, requireCurrentAdmin);
router.get('/collections', getCollections);
router.post('/collections', requireCatalogStructureWrite, postCollection);
router.patch('/collections/:id', requireCatalogStructureWrite, patchCollection);
router.patch('/collections/:id/archive', requireCatalogStructureWrite, patchCollectionArchive);
router.get('/collections/:id/products', getCollectionProducts);
router.post('/collections/:id/products', requireCatalogStructureWrite, postCollectionProduct);
router.delete('/collections/:id/products/:productId', requireCatalogStructureWrite, deleteCollectionProduct);

module.exports = router;
