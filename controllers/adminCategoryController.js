const { listAdminCategories } = require('../services/categoryService');

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

module.exports = {
    getAdminCategories
};
