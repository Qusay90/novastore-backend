const pool = require('../config/db');

// Tüm Kategori ve Alt Kategorileri Getir (Hiyerarşik Değil, Düz Liste Olarak. Frontend yönetecek)
const getCategories = async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM categories ORDER BY parent_id NULLS FIRST, name ASC');
        res.status(200).json(result.rows);
    } catch (err) {
        console.error("Kategoriler getirilirken hata:", err);
        res.status(500).json({ error: "Kategoriler yüklenemedi." });
    }
};

// Yeni Kategori Ekle
const createCategory = async (req, res) => {
    try {
        const { name, parent_id } = req.body;

        // Eğer kategori adı zaten varsa kaydetmeye çalışınca hata verir (UNIQUE constraint var)
        const newCategory = await pool.query(
            'INSERT INTO categories (name, parent_id) VALUES ($1, $2) RETURNING *',
            [name, parent_id || null]
        );

        res.status(201).json({ mesaj: "Kategori başarıyla eklendi!", category: newCategory.rows[0] });
    } catch (err) {
        console.error("Kategori eklenirken hata:", err);
        res.status(500).json({ error: "Kategori eklenemedi." });
    }
};

// Kategori Sil
const deleteCategory = async (req, res) => {
    try {
        const { id } = req.params;

        // Tabloda ON DELETE CASCADE olduğu için, alt kategoriler de silinecektir.
        await pool.query('DELETE FROM categories WHERE id = $1', [id]);

        res.status(200).json({ mesaj: "Kategori başarıyla silindi." });
    } catch (err) {
        console.error("Kategori silinirken hata:", err);
        res.status(500).json({ error: "Kategori silinemedi." });
    }
};

module.exports = { getCategories, createCategory, deleteCategory };
