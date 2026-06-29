const pool = require('../config/db');
const FAVORITES_SCHEMA_ERROR = '42P01';

const sendFavoritesError = (res, error, fallbackMessage) => {
    if (error?.code === FAVORITES_SCHEMA_ERROR) {
        return res.status(503).json({
            error: 'Favoriler geçici olarak kullanılamıyor.',
            code: 'FAVORITES_SCHEMA_MISSING'
        });
    }
    return res.status(500).json({ error: fallbackMessage });
};

const normalizeProductId = (value) => {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const mapFavoriteRow = (row) => {
    const favorite = {
        productId: row.product_id,
        createdAt: row.created_at
    };

    if (row.id !== undefined) {
        favorite.product = {
            id: row.id,
            name: row.name,
            price: row.price,
            oldPrice: row.old_price,
            imageUrl: row.image_url,
            stock: row.stock,
            category: row.category
        };
    }

    return favorite;
};

const FAVORITE_SELECT = `
    SELECT
        f.product_id,
        f.created_at,
        p.id,
        p.name,
        p.price,
        p.old_price,
        p.image_url,
        p.stock,
        p.category
    FROM favorites f
    INNER JOIN products p ON p.id = f.product_id
`;

const buildFavoritesResponse = (rows) => ({
    productIds: rows.map((row) => row.product_id),
    favorites: rows.map(mapFavoriteRow)
});

const fetchFavoriteRows = async (userId, queryable = pool) => {
    const result = await queryable.query(
        `${FAVORITE_SELECT}
         WHERE f.user_id = $1
         ORDER BY f.created_at DESC, f.product_id DESC`,
        [userId]
    );
    return result.rows;
};

const productExists = async (productId, queryable = pool) => {
    const result = await queryable.query('SELECT id FROM products WHERE id = $1', [productId]);
    return result.rowCount > 0;
};

const listFavorites = async (req, res) => {
    try {
        const rows = await fetchFavoriteRows(req.user.id);
        res.json(buildFavoritesResponse(rows));
    } catch (error) {
        console.error('Favoriler alinamadi:', error);
        sendFavoritesError(res, error, 'Favoriler alinamadi.');
    }
};

const addFavorite = async (req, res) => {
    const productId = normalizeProductId(req.params.productId);
    if (!productId) return res.status(400).json({ error: 'Gecersiz urun id.' });

    try {
        if (!(await productExists(productId))) {
            return res.status(404).json({ error: 'Urun bulunamadi.' });
        }

        const result = await pool.query(
            `INSERT INTO favorites (user_id, product_id)
             VALUES ($1, $2)
             ON CONFLICT (user_id, product_id) DO NOTHING
             RETURNING product_id, created_at`,
            [req.user.id, productId]
        );

        res.status(result.rowCount > 0 ? 201 : 200).json({
            productId,
            favorited: true,
            created: result.rowCount > 0
        });
    } catch (error) {
        console.error('Favori eklenemedi:', error);
        sendFavoritesError(res, error, 'Favori eklenemedi.');
    }
};

const removeFavorite = async (req, res) => {
    const productId = normalizeProductId(req.params.productId);
    if (!productId) return res.status(400).json({ error: 'Gecersiz urun id.' });

    try {
        const result = await pool.query(
            'DELETE FROM favorites WHERE user_id = $1 AND product_id = $2',
            [req.user.id, productId]
        );

        res.json({
            productId,
            favorited: false,
            removed: result.rowCount > 0
        });
    } catch (error) {
        console.error('Favori kaldirilamadi:', error);
        sendFavoritesError(res, error, 'Favori kaldirilamadi.');
    }
};

const syncFavorites = async (req, res) => {
    const rawProductIds = Array.isArray(req.body?.productIds) ? req.body.productIds : null;
    if (!rawProductIds) return res.status(400).json({ error: 'productIds listesi gerekli.' });
    if (rawProductIds.length > 200) return res.status(400).json({ error: 'Tek seferde en fazla 200 favori senkronlanabilir.' });

    const productIds = [];
    for (const rawId of rawProductIds) {
        const productId = normalizeProductId(rawId);
        if (!productId) return res.status(400).json({ error: 'Gecersiz urun id.', value: rawId });
        if (!productIds.includes(productId)) productIds.push(productId);
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        if (productIds.length > 0) {
            const existingResult = await client.query(
                'SELECT id FROM products WHERE id = ANY($1::int[])',
                [productIds]
            );
            const existingIds = new Set(existingResult.rows.map((row) => Number(row.id)));
            const validProductIds = productIds.filter((productId) => existingIds.has(productId));
            for (const productId of validProductIds) {
                await client.query(
                    `INSERT INTO favorites (user_id, product_id)
                     VALUES ($1, $2)
                     ON CONFLICT (user_id, product_id) DO NOTHING`,
                    [req.user.id, productId]
                );
            }
        }

        const rows = await fetchFavoriteRows(req.user.id, client);
        await client.query('COMMIT');
        const response = buildFavoritesResponse(rows);
        response.ignoredProductIds = productIds.filter(
            (productId) => !rows.some((row) => Number(row.product_id) === productId)
        );
        res.json(response);
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Favoriler senkronlanamadi:', error);
        sendFavoritesError(res, error, 'Favoriler senkronlanamadi.');
    } finally {
        client.release();
    }
};

module.exports = {
    listFavorites,
    addFavorite,
    removeFavorite,
    syncFavorites,
    __test: {
        normalizeProductId,
        mapFavoriteRow,
        buildFavoritesResponse,
        sendFavoritesError
    }
};
