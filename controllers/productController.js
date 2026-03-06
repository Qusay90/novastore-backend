const pool = require('../config/db');

// 1. Tüm Ürünleri Listeleme (GET)
const getAllProducts = async (req, res) => {
    try {
        // Ürünleri ve yorum ortalamalarını/sayılarını getir
        const result = await pool.query(`
            SELECT p.*, 
                   ROUND(COALESCE(AVG(r.rating), 0), 1) as average_rating, 
                   CAST(COUNT(r.id) AS INTEGER) as review_count
            FROM products p
            LEFT JOIN reviews r ON p.id = r.product_id
            GROUP BY p.id
            ORDER BY p.created_at DESC
        `);
        res.status(200).json(result.rows);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: "Ürünler getirilirken sunucu hatası oluştu." });
    }
};

// 2. Yeni Ürün Ekleme (POST) - DOSYA YÜKLEMELİ
const createProduct = async (req, res) => {
    try {
        const { name, price, oldPrice, stock, description, category } = req.body;
        const finalOldPrice = oldPrice ? oldPrice : null;

        const files = req.files || [];
        const mainImageUrl = files.length > 0 ? files[0].path : null;

        const newProduct = await pool.query(
            'INSERT INTO products (name, price, old_price, stock, description, image_url, category) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
            [name, price, finalOldPrice, stock, description, mainImageUrl, category || 'Kategorisiz']
        );

        const productId = newProduct.rows[0].id;

        for (let i = 0; i < files.length; i++) {
            await pool.query(
                'INSERT INTO product_media (product_id, media_url, is_main) VALUES ($1, $2, $3)',
                [productId, files[i].path, i === 0]
            );
        }

        res.status(201).json({ mesaj: "Ürün başarıyla vitrine eklendi!", product: newProduct.rows[0] });
    } catch (err) {
        console.error("Ürün ekleme hatası:", err.message);
        res.status(500).json({ error: "Ürün eklenirken bir hata meydana geldi." });
    }
};
// YENİ: Tek bir ürünün detaylarını getirme (Detay Sayfası İçin)
const getProductById = async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query('SELECT * FROM products WHERE id = $1', [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Ürün bulunamadı." });
        }

        const mediaResult = await pool.query('SELECT * FROM product_media WHERE product_id = $1 ORDER BY id ASC', [id]);
        const product = result.rows[0];
        product.media = mediaResult.rows;

        res.status(200).json(product);
    } catch (err) {
        console.error("Ürün detay hatası:", err.message);
        res.status(500).json({ error: "Ürün detayları getirilemedi." });
    }
};

// Ürün Silme
const deleteProduct = async (req, res) => {
    try {
        const { id } = req.params;
        await pool.query('DELETE FROM products WHERE id = $1', [id]);
        res.status(200).json({ mesaj: "Ürün başarıyla silindi." });
    } catch (err) {
        res.status(500).json({ error: "Ürün silinirken hata oluştu." });
    }
};

// Ürün Güncelleme (Fiyat, Stok, Kategori vs.)
const updateProduct = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, price, oldPrice, stock, description, category } = req.body;
        const finalOldPrice = oldPrice ? oldPrice : null;

        await pool.query(
            'UPDATE products SET name = $1, price = $2, old_price = $3, stock = $4, description = $5, category = $6 WHERE id = $7',
            [name, price, finalOldPrice, stock, description, category || 'Kategorisiz', id]
        );

        const files = req.files || [];
        for (let i = 0; i < files.length; i++) {
            await pool.query(
                'INSERT INTO product_media (product_id, media_url, is_main) VALUES ($1, $2, false)',
                [id, files[i].path]
            );
        }

        res.status(200).json({ mesaj: "Ürün bilgileri güncellendi!" });
    } catch (err) {
        res.status(500).json({ error: "Ürün güncellenemedi." });
    }
};

const deleteProductMedia = async (req, res) => {
    try {
        const { mediaId } = req.params;
        await pool.query('DELETE FROM product_media WHERE id = $1', [mediaId]);
        res.status(200).json({ mesaj: "Medya başarıyla silindi." });
    } catch (err) {
        res.status(500).json({ error: "Medya silinemedi." });
    }
};

module.exports = {
    getAllProducts,
    createProduct,
    getProductById,
    deleteProduct,
    updateProduct,
    deleteProductMedia
};