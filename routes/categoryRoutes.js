const express = require('express');
const router = express.Router();
const { getCategories, createCategory, deleteCategory } = require('../controllers/categoryController');
const { authenticate, requireAdmin } = require('../middlewares/authMiddleware');

// /api/categories
router.get('/', getCategories);
router.post('/', authenticate, requireAdmin, createCategory);
router.delete('/:id', authenticate, requireAdmin, deleteCategory);

module.exports = router;
