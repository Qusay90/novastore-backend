const express = require('express');
const router = express.Router();
const { getCategories, createCategory, deleteCategory } = require('../controllers/categoryController');
const { authenticate, requireAdmin } = require('../middlewares/authMiddleware');
const { requireCurrentAdmin } = require('../middlewares/currentAdmin');
const { requireAdminCommerceCapability } = require('../middlewares/adminCommerceCapability');

const requireCatalogStructureWrite = requireAdminCommerceCapability('catalogStructureWrite');

// /api/categories
router.get('/', getCategories);
router.post('/', authenticate, requireAdmin, requireCurrentAdmin, requireCatalogStructureWrite, createCategory);
router.delete('/:id', authenticate, requireAdmin, requireCurrentAdmin, requireCatalogStructureWrite, deleteCategory);

module.exports = router;
