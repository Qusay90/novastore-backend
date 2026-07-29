const express = require('express');
const { authenticate, requireAdmin } = require('../middlewares/authMiddleware');
const { requireCurrentAdmin } = require('../middlewares/currentAdmin');
const { requireAdminCommerceCapabilityInStaging } = require('../middlewares/adminCommerceCapability');
const {
    getAdminCategories,
    createAdminCategory,
    updateAdminCategory,
    moveAdminCategory,
    archiveAdminCategory
} = require('../controllers/adminCategoryController');

const router = express.Router();
const requireStagingCatalogStructureWrite = requireAdminCommerceCapabilityInStaging('catalogStructureWrite');

router.get('/', authenticate, requireAdmin, requireCurrentAdmin, getAdminCategories);
router.post('/', authenticate, requireAdmin, requireStagingCatalogStructureWrite, requireCurrentAdmin, createAdminCategory);
router.patch('/:id', authenticate, requireAdmin, requireStagingCatalogStructureWrite, requireCurrentAdmin, updateAdminCategory);
router.patch('/:id/move', authenticate, requireAdmin, requireStagingCatalogStructureWrite, requireCurrentAdmin, moveAdminCategory);
router.patch('/:id/archive', authenticate, requireAdmin, requireStagingCatalogStructureWrite, requireCurrentAdmin, archiveAdminCategory);

module.exports = router;
