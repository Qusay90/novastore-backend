const express = require('express');
const router = express.Router();
const { getCategories, createCategory, deleteCategory } = require('../controllers/categoryController');
const { authenticate, requireAdmin } = require('../middlewares/authMiddleware');
const { requireCurrentAdmin } = require('../middlewares/currentAdmin');

// /api/categories
router.get('/', getCategories);
router.post('/', authenticate, requireAdmin, requireCurrentAdmin, createCategory);
router.delete('/:id', authenticate, requireAdmin, requireCurrentAdmin, deleteCategory);

module.exports = router;
