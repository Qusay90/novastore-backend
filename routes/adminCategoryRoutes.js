const express = require('express');
const { authenticate, requireAdmin } = require('../middlewares/authMiddleware');
const { requireCurrentAdmin } = require('../middlewares/currentAdmin');
const {
    getAdminCategories,
    createAdminCategory,
    updateAdminCategory,
    moveAdminCategory,
    archiveAdminCategory
} = require('../controllers/adminCategoryController');

const router = express.Router();

router.get('/', authenticate, requireAdmin, requireCurrentAdmin, getAdminCategories);
router.post('/', authenticate, requireAdmin, requireCurrentAdmin, createAdminCategory);
router.patch('/:id', authenticate, requireAdmin, requireCurrentAdmin, updateAdminCategory);
router.patch('/:id/move', authenticate, requireAdmin, requireCurrentAdmin, moveAdminCategory);
router.patch('/:id/archive', authenticate, requireAdmin, requireCurrentAdmin, archiveAdminCategory);

module.exports = router;
