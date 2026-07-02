const express = require('express');
const { getNavigation } = require('../controllers/publicNavigationController');

const router = express.Router();
router.get('/:code', getNavigation);

module.exports = router;
