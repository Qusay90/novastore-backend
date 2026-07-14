const express = require('express');
const { authenticate, requireAdmin } = require('../middlewares/authMiddleware');
const { requireCurrentAdmin } = require('../middlewares/currentAdmin');
const {
    getMenus,
    postMenu,
    patchMenu,
    getMenuItems,
    postMenuItem,
    patchMenuItem,
    patchMenuItemArchive,
    patchMenuItemReorder
} = require('../controllers/adminMenuController');

const router = express.Router();
router.use(authenticate, requireAdmin, requireCurrentAdmin);
router.get('/menus', getMenus);
router.post('/menus', postMenu);
router.patch('/menus/:id', patchMenu);
router.get('/menu-items', getMenuItems);
router.post('/menu-items', postMenuItem);
router.patch('/menu-items/reorder', patchMenuItemReorder);
router.patch('/menu-items/:id', patchMenuItem);
router.patch('/menu-items/:id/archive', patchMenuItemArchive);

module.exports = router;
