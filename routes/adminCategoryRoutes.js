const express = require('express');
const { authenticate, requireAdmin } = require('../middlewares/authMiddleware');
const {
    getAdminCategories,
    createAdminCategory,
    updateAdminCategory,
    moveAdminCategory,
    archiveAdminCategory
} = require('../controllers/adminCategoryController');

const router = express.Router();

router.get('/', authenticate, requireAdmin, getAdminCategories);
router.post('/', authenticate, requireAdmin, createAdminCategory);
router.patch('/:id', authenticate, requireAdmin, updateAdminCategory);
router.patch('/:id/move', authenticate, requireAdmin, moveAdminCategory);
router.patch('/:id/archive', authenticate, requireAdmin, archiveAdminCategory);

module.exports = router;
