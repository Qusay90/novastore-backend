const express = require('express');
const { authenticate, requireAdmin } = require('../middlewares/authMiddleware');
const { requireCurrentAdmin } = require('../middlewares/currentAdmin');
const { requireAdminCommerceCapabilityInStaging } = require('../middlewares/adminCommerceCapability');
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
const requireStagingCatalogStructureWrite = requireAdminCommerceCapabilityInStaging('catalogStructureWrite');

router.use(authenticate, requireAdmin, requireCurrentAdmin);
router.get('/menus', getMenus);
router.post('/menus', requireStagingCatalogStructureWrite, postMenu);
router.patch('/menus/:id', requireStagingCatalogStructureWrite, patchMenu);
router.get('/menu-items', getMenuItems);
router.post('/menu-items', requireStagingCatalogStructureWrite, postMenuItem);
router.patch('/menu-items/reorder', requireStagingCatalogStructureWrite, patchMenuItemReorder);
router.patch('/menu-items/:id', requireStagingCatalogStructureWrite, patchMenuItem);
router.patch('/menu-items/:id/archive', requireStagingCatalogStructureWrite, patchMenuItemArchive);

module.exports = router;
