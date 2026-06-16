const express = require('express');
const router = express.Router();
const {
    listFavorites,
    addFavorite,
    removeFavorite,
    syncFavorites
} = require('../controllers/favoriteController');
const { authenticate } = require('../middlewares/authMiddleware');

router.use(authenticate);

router.get('/', listFavorites);
router.post('/sync', syncFavorites);
router.post('/:productId', addFavorite);
router.delete('/:productId', removeFavorite);

module.exports = router;
