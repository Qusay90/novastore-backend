const express = require('express');
const { authenticate, requireAdmin } = require('../middlewares/authMiddleware');
const { requireCurrentAdmin } = require('../middlewares/currentAdmin');
const { requireAdminCommerceCapability } = require('../middlewares/adminCommerceCapability');
const controller = require('../controllers/adminAttributeController');

const router = express.Router();
const requireCatalogStructureWrite = requireAdminCommerceCapability('catalogStructureWrite');

router.use(authenticate, requireAdmin, requireCurrentAdmin);

router.get('/attributes', controller.getAttributes);
router.post('/attributes', requireCatalogStructureWrite, controller.postAttribute);
router.patch('/attributes/:id', requireCatalogStructureWrite, controller.patchAttribute);
router.patch('/attributes/:id/archive', requireCatalogStructureWrite, controller.patchAttributeArchive);

router.post('/attribute-options', requireCatalogStructureWrite, controller.postOption);
router.patch('/attribute-options/:id', requireCatalogStructureWrite, controller.patchOption);
router.patch('/attribute-options/:id/archive', requireCatalogStructureWrite, controller.patchOptionArchive);

router.get('/attribute-templates/resolve', controller.getResolvedTemplate);
router.get('/attribute-templates', controller.getTemplates);
router.post('/attribute-templates', requireCatalogStructureWrite, controller.postTemplate);
router.patch('/attribute-templates/:id', requireCatalogStructureWrite, controller.patchTemplate);
router.post('/attribute-templates/:id/attributes', requireCatalogStructureWrite, controller.postTemplateAttribute);
router.delete('/attribute-templates/:id/attributes/:attributeId', requireCatalogStructureWrite, controller.deleteTemplateAttribute);

module.exports = router;
