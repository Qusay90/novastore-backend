const express = require('express');
const router = express.Router();
const {
    listAddresses,
    createAddress,
    updateAddress,
    deleteAddress,
    setDefaultAddress
} = require('../controllers/addressController');
const { authenticate } = require('../middlewares/authMiddleware');

router.use(authenticate);

router.get('/', listAddresses);
router.post('/', createAddress);
router.put('/:id', updateAddress);
router.delete('/:id', deleteAddress);
router.patch('/:id/default', setDefaultAddress);
router.post('/:id/default', setDefaultAddress);

module.exports = router;
