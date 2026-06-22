const express = require('express');
const { authenticate } = require('../middlewares/authMiddleware');
const {
    getSharedState,
    putSharedState,
    deleteSharedState
} = require('../controllers/sharedStateController');

const router = express.Router();

router.use(authenticate);

router.get('/:key', getSharedState);
router.put('/:key', putSharedState);
router.delete('/:key', deleteSharedState);

module.exports = router;
