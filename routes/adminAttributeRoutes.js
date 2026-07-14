const express = require('express');
const { authenticate, requireAdmin } = require('../middlewares/authMiddleware');
const { requireCurrentAdmin } = require('../middlewares/currentAdmin');
const controller = require('../controllers/adminAttributeController');

const router = express.Router();
router.use(authenticate, requireAdmin, requireCurrentAdmin);

router.get('/attributes', controller.getAttributes);
router.post('/attributes', controller.postAttribute);
router.patch('/attributes/:id', controller.patchAttribute);
router.patch('/attributes/:id/archive', controller.patchAttributeArchive);

router.post('/attribute-options', controller.postOption);
router.patch('/attribute-options/:id', controller.patchOption);
router.patch('/attribute-options/:id/archive', controller.patchOptionArchive);

router.get('/attribute-templates/resolve', controller.getResolvedTemplate);
router.get('/attribute-templates', controller.getTemplates);
router.post('/attribute-templates', controller.postTemplate);
router.patch('/attribute-templates/:id', controller.patchTemplate);
router.post('/attribute-templates/:id/attributes', controller.postTemplateAttribute);
router.delete('/attribute-templates/:id/attributes/:attributeId', controller.deleteTemplateAttribute);

module.exports = router;
