const {
    listPublicCategories,
    getPublicCategoryBySlug
} = require('../services/categoryService');
const pool = require('../config/db');
const { getPublicCategoryFacets } = require('../services/productAttributeService');

const resolveFormat = (req) => {
    const format = String(req.query?.format || 'tree').trim().toLowerCase();
    return ['tree', 'flat'].includes(format) ? format : null;
};

const getPublicCategories = async (req, res) => {
    const format = resolveFormat(req);
    if (!format) {
        return res.status(400).json({ error: 'format yalnızca tree veya flat olabilir.' });
    }

    try {
        const categories = await listPublicCategories({ format });
        return res.status(200).json(categories);
    } catch (error) {
        if (!error.statusCode || error.statusCode >= 500) {
            console.error('Public kategori listeleme hatası:', error.message);
        }
        return res.status(error.statusCode || 500).json({
            error: error.statusCode ? error.message : 'Kategoriler yüklenemedi.',
            code: error.code || undefined
        });
    }
};

const getPublicCategory = async (req, res) => {
    try {
        const category = await getPublicCategoryBySlug(req.params.slug);
        if (category.redirect) {
            return res.redirect(
                category.redirect.status,
                `/api/public/categories/${encodeURIComponent(category.redirect.canonical_slug)}`
            );
        }
        return res.status(200).json(category);
    } catch (error) {
        if (!error.statusCode || error.statusCode >= 500) {
            console.error('Public kategori detay hatası:', error.message);
        }
        return res.status(error.statusCode || 500).json({
            error: error.statusCode ? error.message : 'Kategori yüklenemedi.',
            code: error.code || undefined
        });
    }
};

const getPublicCategoryFilters = async (req, res) => {
    try {
        let detail = await getPublicCategoryBySlug(req.params.slug);
        if (detail.redirect) {
            detail = await getPublicCategoryBySlug(detail.redirect.canonical_slug);
        }
        const filters = await getPublicCategoryFacets(pool, Number(detail.category.id));
        return res.status(200).json({
            category: {
                id: Number(detail.category.id),
                slug: detail.category.slug,
                name: detail.category.name
            },
            filters
        });
    } catch (error) {
        if (!error.statusCode || error.statusCode >= 500) {
            console.error('Public kategori filtre hatası:', error.message);
        }
        return res.status(error.statusCode || 500).json({
            error: error.statusCode ? error.message : 'Kategori filtreleri yüklenemedi.',
            code: error.code
        });
    }
};

module.exports = {
    getPublicCategories,
    getPublicCategory,
    getPublicCategoryFilters
};
