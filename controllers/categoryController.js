const pool = require('../config/db');
const {
    createCategory: createCategoryV2,
    setCategoryArchived
} = require('../services/categoryService');

// Legacy flat response contract; existing clients build the tree themselves.
const getCategories = async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM categories ORDER BY parent_id NULLS FIRST, name ASC'
        );
        return res.status(200).json(result.rows);
    } catch (error) {
        console.error('Kategoriler getirilirken hata:', error);
        return res.status(500).json({ error: 'Kategoriler yüklenemedi.' });
    }
};

const createCategory = async (req, res) => {
    try {
        const category = await createCategoryV2({
            ...req.body,
            parentId: req.body.parent_id || null
        });
        return res.status(201).json({
            mesaj: 'Kategori başarıyla eklendi!',
            category
        });
    } catch (error) {
        if (!error.statusCode || error.statusCode >= 500) {
            console.error('Kategori eklenirken hata:', error);
        }
        return res.status(error.statusCode || 500).json({
            error: error.statusCode ? error.message : 'Kategori eklenemedi.',
            code: error.code
        });
    }
};

// Legacy DELETE is retained as a route contract but now archives instead of hard-deleting.
const deleteCategory = async (req, res) => {
    try {
        await setCategoryArchived(req.params.id, true);
        return res.status(200).json({ mesaj: 'Kategori başarıyla silindi.' });
    } catch (error) {
        if (!error.statusCode || error.statusCode >= 500) {
            console.error('Kategori silinirken hata:', error);
        }
        return res.status(error.statusCode || 500).json({
            error: error.statusCode ? error.message : 'Kategori silinemedi.',
            code: error.code
        });
    }
};

module.exports = { getCategories, createCategory, deleteCategory };
