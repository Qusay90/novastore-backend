const express = require('express');
const { authenticate, requireAdmin } = require('../middlewares/authMiddleware');
const { requireCurrentAdmin } = require('../middlewares/currentAdmin');
const { requireAdminCommerceCapabilityInStaging } = require('../middlewares/adminCommerceCapability');
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
const requireStagingCatalogStructureWrite = requireAdminCommerceCapabilityInStaging('catalogStructureWrite');

router.use(authenticate, requireAdmin, requireCurrentAdmin);
router.get('/collections', getCollections);
router.post('/collections', requireStagingCatalogStructureWrite, postCollection);
router.patch('/collections/:id', requireStagingCatalogStructureWrite, patchCollection);
router.patch('/collections/:id/archive', requireStagingCatalogStructureWrite, patchCollectionArchive);
router.get('/collections/:id/products', getCollectionProducts);
router.post('/collections/:id/products', requireStagingCatalogStructureWrite, postCollectionProduct);
router.delete('/collections/:id/products/:productId', requireStagingCatalogStructureWrite, deleteCollectionProduct);

module.exports = router;
