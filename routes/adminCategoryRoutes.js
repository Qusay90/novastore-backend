const express = require('express');
const { authenticate, requireAdmin } = require('../middlewares/authMiddleware');
const { getAdminCategories } = require('../controllers/adminCategoryController');

const router = express.Router();

router.get('/', authenticate, requireAdmin, getAdminCategories);

module.exports = router;
