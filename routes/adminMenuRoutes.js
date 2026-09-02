const express = require('express');
const { authenticate, requireAdmin } = require('../middlewares/authMiddleware');
const { requireCurrentAdmin } = require('../middlewares/currentAdmin');
const { requireAdminCommerceCapability } = require('../middlewares/adminCommerceCapability');
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
const requireCatalogStructureWrite = requireAdminCommerceCapability('catalogStructureWrite');

router.use(authenticate, requireAdmin, requireCurrentAdmin);
router.get('/menus', getMenus);
router.post('/menus', requireCatalogStructureWrite, postMenu);
router.patch('/menus/:id', requireCatalogStructureWrite, patchMenu);
router.get('/menu-items', getMenuItems);
router.post('/menu-items', requireCatalogStructureWrite, postMenuItem);
router.patch('/menu-items/reorder', requireCatalogStructureWrite, patchMenuItemReorder);
router.patch('/menu-items/:id', requireCatalogStructureWrite, patchMenuItem);
router.patch('/menu-items/:id/archive', requireCatalogStructureWrite, patchMenuItemArchive);

module.exports = router;
