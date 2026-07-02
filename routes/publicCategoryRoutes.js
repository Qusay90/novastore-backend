const express = require('express');
const {
    getPublicCategories,
    getPublicCategory,
    getPublicCategoryFilters
} = require('../controllers/publicCategoryController');

const router = express.Router();

router.get('/', getPublicCategories);
router.get('/:slug/filters', getPublicCategoryFilters);
router.get('/:slug', getPublicCategory);

module.exports = router;
