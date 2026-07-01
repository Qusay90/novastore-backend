const {
    listAdminCategories,
    createCategory,
    updateCategory,
    moveCategory,
    setCategoryArchived
} = require('../services/categoryService');

const resolveFormat = (req) => {
    const format = String(req.query?.format || 'tree').trim().toLowerCase();
    return ['tree', 'flat'].includes(format) ? format : null;
};

const getAdminCategories = async (req, res) => {
    const format = resolveFormat(req);
    if (!format) {
        return res.status(400).json({ error: 'format yalnızca tree veya flat olabilir.' });
    }

    try {
        const categories = await listAdminCategories({ format });
        return res.status(200).json(categories);
    } catch (error) {
        if (!error.statusCode || error.statusCode >= 500) {
            console.error('Admin kategori listeleme hatası:', error.message);
        }
        return res.status(error.statusCode || 500).json({
            error: error.statusCode ? error.message : 'Kategoriler yüklenemedi.',
            code: error.code || undefined
        });
    }
};

const mutationHandler = (operation, successStatus = 200) => async (req, res) => {
    try {
        const category = await operation(req);
        return res.status(successStatus).json({ category });
    } catch (error) {
        if (!error.statusCode || error.statusCode >= 500) {
            console.error('Admin kategori mutation hatası:', error.message);
        }
        return res.status(error.statusCode || 500).json({
            error: error.statusCode ? error.message : 'Kategori işlemi tamamlanamadı.',
            code: error.code,
            details: error.details
        });
    }
};

const createAdminCategory = mutationHandler((req) => createCategory(req.body), 201);
const updateAdminCategory = mutationHandler((req) => updateCategory(req.params.id, req.body));
const moveAdminCategory = mutationHandler((req) => moveCategory(req.params.id, req.body));
const archiveAdminCategory = mutationHandler((req) =>
    setCategoryArchived(req.params.id, req.body.archived !== false)
);

module.exports = {
    getAdminCategories,
    createAdminCategory,
    updateAdminCategory,
    moveAdminCategory,
    archiveAdminCategory
};
