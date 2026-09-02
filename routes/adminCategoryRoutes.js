const express = require('express');
const { authenticate, requireAdmin } = require('../middlewares/authMiddleware');
const { requireCurrentAdmin } = require('../middlewares/currentAdmin');
const { requireAdminCommerceCapability } = require('../middlewares/adminCommerceCapability');
const {
    getAdminCategories,
    createAdminCategory,
    updateAdminCategory,
    moveAdminCategory,
    archiveAdminCategory
} = require('../controllers/adminCategoryController');

const router = express.Router();
const requireCatalogStructureWrite = requireAdminCommerceCapability('catalogStructureWrite');

router.get('/', authenticate, requireAdmin, requireCurrentAdmin, getAdminCategories);
router.post('/', authenticate, requireAdmin, requireCurrentAdmin, requireCatalogStructureWrite, createAdminCategory);
router.patch('/:id', authenticate, requireAdmin, requireCurrentAdmin, requireCatalogStructureWrite, updateAdminCategory);
router.patch('/:id/move', authenticate, requireAdmin, requireCurrentAdmin, requireCatalogStructureWrite, moveAdminCategory);
router.patch('/:id/archive', authenticate, requireAdmin, requireCurrentAdmin, requireCatalogStructureWrite, archiveAdminCategory);

module.exports = router;
