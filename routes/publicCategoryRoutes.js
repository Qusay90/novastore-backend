const express = require('express');
const {
    getPublicCategories,
    getPublicCategory
} = require('../controllers/publicCategoryController');

const router = express.Router();

router.get('/', getPublicCategories);
router.get('/:slug', getPublicCategory);

module.exports = router;
