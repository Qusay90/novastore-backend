const express = require('express');
const { authenticate, requireAdmin } = require('../middlewares/authMiddleware');
const {
    getCollections,
    postCollection,
    patchCollection,
    patchCollectionArchive,
    postCollectionProduct,
    deleteCollectionProduct
} = require('../controllers/adminCollectionController');

const router = express.Router();
router.use(authenticate, requireAdmin);
router.get('/collections', getCollections);
router.post('/collections', postCollection);
router.patch('/collections/:id', patchCollection);
router.patch('/collections/:id/archive', patchCollectionArchive);
router.post('/collections/:id/products', postCollectionProduct);
router.delete('/collections/:id/products/:productId', deleteCollectionProduct);

module.exports = router;
