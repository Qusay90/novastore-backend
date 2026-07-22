const express = require('express');
const { authenticate, requireAdmin } = require('../middlewares/authMiddleware');
const { requireCurrentAdmin } = require('../middlewares/currentAdmin');
const { requireAdminCommerceCapabilityInStaging } = require('../middlewares/adminCommerceCapability');
const controller = require('../controllers/adminAttributeController');

const router = express.Router();
const requireStagingCatalogStructureWrite = requireAdminCommerceCapabilityInStaging('catalogStructureWrite');

router.use(authenticate, requireAdmin, requireCurrentAdmin);

router.get('/attributes', controller.getAttributes);
router.post('/attributes', requireStagingCatalogStructureWrite, controller.postAttribute);
router.patch('/attributes/:id', requireStagingCatalogStructureWrite, controller.patchAttribute);
router.patch('/attributes/:id/archive', requireStagingCatalogStructureWrite, controller.patchAttributeArchive);

router.post('/attribute-options', requireStagingCatalogStructureWrite, controller.postOption);
router.patch('/attribute-options/:id', requireStagingCatalogStructureWrite, controller.patchOption);
router.patch('/attribute-options/:id/archive', requireStagingCatalogStructureWrite, controller.patchOptionArchive);

router.get('/attribute-templates/resolve', controller.getResolvedTemplate);
router.get('/attribute-templates', controller.getTemplates);
router.post('/attribute-templates', requireStagingCatalogStructureWrite, controller.postTemplate);
router.patch('/attribute-templates/:id', requireStagingCatalogStructureWrite, controller.patchTemplate);
router.post('/attribute-templates/:id/attributes', requireStagingCatalogStructureWrite, controller.postTemplateAttribute);
router.delete('/attribute-templates/:id/attributes/:attributeId', requireStagingCatalogStructureWrite, controller.deleteTemplateAttribute);

module.exports = router;
