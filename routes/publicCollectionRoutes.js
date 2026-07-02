const express = require('express');
const {
    getCollections,
    getCollection
} = require('../controllers/publicCollectionController');

const router = express.Router();
router.get('/', getCollections);
router.get('/:slug', getCollection);

module.exports = router;
