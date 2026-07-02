const {
    listAttributes,
    createAttribute,
    updateAttribute,
    setAttributeArchived,
    createAttributeOption,
    updateAttributeOption,
    listTemplates,
    createTemplate,
    updateTemplate,
    addTemplateAttribute,
    removeTemplateAttribute,
    resolveTemplateAttributes
} = require('../services/attributeService');
const { parseIdList } = require('../services/productCategoryService');

const sendError = (res, error, fallback) => {
    if (!error.statusCode || error.statusCode >= 500) {
        console.error('Admin attribute API hatası:', error.message);
    }
    return res.status(error.statusCode || 500).json({
        error: error.statusCode ? error.message : fallback,
        code: error.code,
        details: error.details
    });
};

const getAttributes = async (_req, res) => {
    try {
        return res.status(200).json(await listAttributes());
    } catch (error) {
        return sendError(res, error, 'Attribute listesi yüklenemedi.');
    }
};

const postAttribute = async (req, res) => {
    try {
        return res.status(201).json({ attribute: await createAttribute(req.body) });
    } catch (error) {
        return sendError(res, error, 'Attribute oluşturulamadı.');
    }
};

const patchAttribute = async (req, res) => {
    try {
        return res.status(200).json({ attribute: await updateAttribute(req.params.id, req.body) });
    } catch (error) {
        return sendError(res, error, 'Attribute güncellenemedi.');
    }
};

const patchAttributeArchive = async (req, res) => {
    try {
        return res.status(200).json({
            attribute: await setAttributeArchived(req.params.id, req.body.archived !== false)
        });
    } catch (error) {
        return sendError(res, error, 'Attribute durumu güncellenemedi.');
    }
};

const postOption = async (req, res) => {
    try {
        return res.status(201).json({ option: await createAttributeOption(req.body) });
    } catch (error) {
        return sendError(res, error, 'Attribute option oluşturulamadı.');
    }
};

const patchOption = async (req, res) => {
    try {
        return res.status(200).json({ option: await updateAttributeOption(req.params.id, req.body) });
    } catch (error) {
        return sendError(res, error, 'Attribute option güncellenemedi.');
    }
};

const patchOptionArchive = async (req, res) => {
    try {
        return res.status(200).json({
            option: await updateAttributeOption(req.params.id, {
                is_active: req.body.archived === false
            })
        });
    } catch (error) {
        return sendError(res, error, 'Attribute option durumu güncellenemedi.');
    }
};

const getTemplates = async (_req, res) => {
    try {
        return res.status(200).json(await listTemplates());
    } catch (error) {
        return sendError(res, error, 'Template listesi yüklenemedi.');
    }
};

const postTemplate = async (req, res) => {
    try {
        return res.status(201).json({ template: await createTemplate(req.body) });
    } catch (error) {
        return sendError(res, error, 'Template oluşturulamadı.');
    }
};

const patchTemplate = async (req, res) => {
    try {
        return res.status(200).json({ template: await updateTemplate(req.params.id, req.body) });
    } catch (error) {
        return sendError(res, error, 'Template güncellenemedi.');
    }
};

const postTemplateAttribute = async (req, res) => {
    try {
        return res.status(200).json({
            templateAttribute: await addTemplateAttribute(req.params.id, req.body)
        });
    } catch (error) {
        return sendError(res, error, 'Template attribute bağlantısı kurulamadı.');
    }
};

const deleteTemplateAttribute = async (req, res) => {
    try {
        await removeTemplateAttribute(req.params.id, req.params.attributeId);
        return res.status(200).json({ message: 'Template attribute bağlantısı kaldırıldı.' });
    } catch (error) {
        return sendError(res, error, 'Template attribute bağlantısı kaldırılamadı.');
    }
};

const getResolvedTemplate = async (req, res) => {
    try {
        const categoryIds = parseIdList(req.query.categoryIds ?? req.query.category_ids);
        return res.status(200).json({
            categoryIds,
            attributes: await resolveTemplateAttributes(require('../config/db'), categoryIds)
        });
    } catch (error) {
        return sendError(res, error, 'Kategori attribute template’i çözümlenemedi.');
    }
};

module.exports = {
    getAttributes,
    postAttribute,
    patchAttribute,
    patchAttributeArchive,
    postOption,
    patchOption,
    patchOptionArchive,
    getTemplates,
    postTemplate,
    patchTemplate,
    postTemplateAttribute,
    deleteTemplateAttribute,
    getResolvedTemplate
};
