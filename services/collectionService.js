const pool = require('../config/db');
const { slugifyCategoryName } = require('./categoryV2BackfillService');
const { ORDER_STATUS, PAYMENT_STATUS } = require('../constants/orderStatus');

const COLLECTION_TYPES = new Set(['manual', 'dynamic']);
const RULE_ALIASES = new Map([
    ['new_arrivals', 'new_arrivals'],
    ['yeni_gelenler', 'new_arrivals'],
    ['discount', 'discount'],
    ['indirim', 'discount'],
    ['best_sellers', 'best_sellers'],
    ['cok_satanlar', 'best_sellers'],
    ['çok_satanlar', 'best_sellers']
]);

class CollectionDomainError extends Error {
    constructor(message, { code = 'COLLECTION_DOMAIN_ERROR', statusCode = 400 } = {}) {
        super(message);
        this.name = 'CollectionDomainError';
        this.code = code;
        this.statusCode = statusCode;
    }
}

const asInteger = (value, field, { nullable = false, min = 0 } = {}) => {
    if (nullable && (value === null || value === undefined || value === '')) return null;
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < min) {
        throw new CollectionDomainError(`${field} geçerli bir tamsayı olmalıdır.`);
    }
    return parsed;
};

const cleanText = (value, maxLength, { nullable = true } = {}) => {
    if (value === null || value === undefined) return nullable ? null : '';
    const normalized = String(value).trim();
    if (!normalized) return nullable ? null : '';
    return normalized.slice(0, maxLength);
};

const normalizeRuleCode = (value) => {
    if (value === null || value === undefined || value === '') return null;
    const normalized = String(value).trim().toLocaleLowerCase('tr-TR');
    const rule = RULE_ALIASES.get(normalized);
    if (!rule) {
        throw new CollectionDomainError('Desteklenmeyen dinamik koleksiyon kuralı.', {
            code: 'COLLECTION_RULE_INVALID'
        });
    }
    return rule;
};

const normalizeCollectionInput = (body = {}, existing = null) => {
    const name = cleanText(body.name ?? existing?.name, 160, { nullable: false });
    if (!name) throw new CollectionDomainError('Koleksiyon adı zorunludur.');

    const collectionType = String(
        body.collection_type ?? body.collectionType ?? existing?.collection_type ?? 'manual'
    ).trim().toLowerCase();
    if (!COLLECTION_TYPES.has(collectionType)) {
        throw new CollectionDomainError('collection_type manual veya dynamic olmalıdır.');
    }

    const slug = slugifyCategoryName(body.slug ?? existing?.slug ?? name);
    if (!slug) throw new CollectionDomainError('Geçerli bir koleksiyon slug değeri üretilemedi.');

    const requestedRule = body.rule_code ?? body.ruleCode ?? existing?.rule_code;
    const ruleCode = collectionType === 'dynamic' ? normalizeRuleCode(requestedRule) : null;
    if (collectionType === 'dynamic' && !ruleCode) {
        throw new CollectionDomainError('Dinamik koleksiyon için rule_code zorunludur.');
    }

    return {
        name,
        slug,
        collection_type: collectionType,
        rule_code: ruleCode,
        description: cleanText(body.description ?? existing?.description, 5000),
        image_url: cleanText(body.image_url ?? body.imageUrl ?? existing?.image_url, 2000),
        banner_url: cleanText(body.banner_url ?? body.bannerUrl ?? existing?.banner_url, 2000),
        accent_color: cleanText(body.accent_color ?? body.accentColor ?? existing?.accent_color, 20),
        seo_title: cleanText(body.seo_title ?? body.seoTitle ?? existing?.seo_title, 180),
        seo_description: cleanText(body.seo_description ?? body.seoDescription ?? existing?.seo_description, 5000),
        sort_order: asInteger(body.sort_order ?? body.sortOrder ?? existing?.sort_order ?? 0, 'sort_order'),
        is_active: body.is_active ?? body.isActive ?? existing?.is_active ?? true
    };
};

const normalizeCollection = (row) => ({
    ...row,
    id: Number(row.id),
    sort_order: Number(row.sort_order || 0),
    visible_product_count: row.visible_product_count === undefined
        ? undefined
        : Number(row.visible_product_count || 0)
});

const listAdminCollections = async ({ queryable = pool } = {}) => {
    const result = await queryable.query(`
        SELECT
            collection.*,
            COUNT(collection_product.product_id)::INTEGER AS manual_product_count
        FROM collections collection
        LEFT JOIN collection_products collection_product
            ON collection_product.collection_id = collection.id
        GROUP BY collection.id
        ORDER BY collection.sort_order ASC, collection.name ASC, collection.id ASC
    `);
    return result.rows.map((row) => ({
        ...normalizeCollection(row),
        manual_product_count: Number(row.manual_product_count || 0)
    }));
};

const getAdminCollection = async (id, queryable = pool) => {
    const parsedId = asInteger(id, 'collection id', { min: 1 });
    const result = await queryable.query(
        'SELECT * FROM collections WHERE id = $1',
        [parsedId]
    );
    if (result.rows.length === 0) {
        throw new CollectionDomainError('Koleksiyon bulunamadı.', {
            code: 'COLLECTION_NOT_FOUND',
            statusCode: 404
        });
    }
    return normalizeCollection(result.rows[0]);
};

const createCollection = async (body, { queryable = pool } = {}) => {
    const input = normalizeCollectionInput(body);
    const client = typeof queryable.connect === 'function' ? await queryable.connect() : queryable;
    const shouldRelease = client !== queryable;
    try {
        await client.query('BEGIN');
        const result = await client.query(`
            INSERT INTO collections (
                name, slug, collection_type, rule_code, description,
                image_url, banner_url, accent_color, seo_title, seo_description,
                sort_order, is_active
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            RETURNING *
        `, [
            input.name,
            input.slug,
            input.collection_type,
            input.rule_code,
            input.description,
            input.image_url,
            input.banner_url,
            input.accent_color,
            input.seo_title,
            input.seo_description,
            input.sort_order,
            Boolean(input.is_active)
        ]);
        const collection = normalizeCollection(result.rows[0]);
        if (collection.rule_code) {
            await client.query(`
                INSERT INTO collection_rules (collection_id, rule_type, config)
                VALUES ($1, $2, $3::jsonb)
                ON CONFLICT (collection_id, rule_type) DO UPDATE
                SET config = EXCLUDED.config, updated_at = CURRENT_TIMESTAMP
            `, [collection.id, collection.rule_code, JSON.stringify(body.rule_config || body.ruleConfig || {})]);
        }
        await client.query('COMMIT');
        return collection;
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        if (error.code === '23505') {
            throw new CollectionDomainError('Koleksiyon slug değeri zaten kullanılıyor.', {
                code: 'COLLECTION_SLUG_CONFLICT',
                statusCode: 409
            });
        }
        throw error;
    } finally {
        if (shouldRelease) client.release();
    }
};

const updateCollection = async (id, body, { queryable = pool } = {}) => {
    const existing = await getAdminCollection(id, queryable);
    const input = normalizeCollectionInput(body, existing);
    const client = typeof queryable.connect === 'function' ? await queryable.connect() : queryable;
    const shouldRelease = client !== queryable;
    try {
        await client.query('BEGIN');
        const result = await client.query(`
            UPDATE collections
            SET name = $1,
                slug = $2,
                collection_type = $3,
                rule_code = $4,
                description = $5,
                image_url = $6,
                banner_url = $7,
                accent_color = $8,
                seo_title = $9,
                seo_description = $10,
                sort_order = $11,
                is_active = $12,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $13
            RETURNING *
        `, [
            input.name,
            input.slug,
            input.collection_type,
            input.rule_code,
            input.description,
            input.image_url,
            input.banner_url,
            input.accent_color,
            input.seo_title,
            input.seo_description,
            input.sort_order,
            Boolean(input.is_active),
            existing.id
        ]);
        await client.query('DELETE FROM collection_rules WHERE collection_id = $1', [existing.id]);
        if (input.rule_code) {
            await client.query(`
                INSERT INTO collection_rules (collection_id, rule_type, config)
                VALUES ($1, $2, $3::jsonb)
            `, [existing.id, input.rule_code, JSON.stringify(body.rule_config || body.ruleConfig || {})]);
        }
        await client.query('COMMIT');
        return normalizeCollection(result.rows[0]);
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        if (error.code === '23505') {
            throw new CollectionDomainError('Koleksiyon slug değeri zaten kullanılıyor.', {
                code: 'COLLECTION_SLUG_CONFLICT',
                statusCode: 409
            });
        }
        throw error;
    } finally {
        if (shouldRelease) client.release();
    }
};

const archiveCollection = async (id, archived = true, { queryable = pool } = {}) => {
    const existing = await getAdminCollection(id, queryable);
    const result = await queryable.query(`
        UPDATE collections
        SET is_active = $1,
            deleted_at = $2,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $3
        RETURNING *
    `, [!archived, archived ? new Date() : null, existing.id]);
    return normalizeCollection(result.rows[0]);
};

const assertManualCollection = async (collectionId, queryable) => {
    const collection = await getAdminCollection(collectionId, queryable);
    if (collection.collection_type !== 'manual') {
        throw new CollectionDomainError('Ürünler yalnızca manual koleksiyonlarda yönetilebilir.', {
            code: 'COLLECTION_NOT_MANUAL',
            statusCode: 409
        });
    }
    return collection;
};

const addManualCollectionProduct = async (
    collectionId,
    productId,
    sortOrder = 0,
    { queryable = pool } = {}
) => {
    const collection = await assertManualCollection(collectionId, queryable);
    const parsedProductId = asInteger(productId, 'product_id', { min: 1 });
    const parsedSortOrder = asInteger(sortOrder, 'sort_order');
    const result = await queryable.query(`
        INSERT INTO collection_products (collection_id, product_id, sort_order)
        SELECT $1, product.id, $3
        FROM products product
        WHERE product.id = $2
        ON CONFLICT (collection_id, product_id) DO UPDATE
        SET sort_order = EXCLUDED.sort_order
        RETURNING collection_id, product_id, sort_order
    `, [collection.id, parsedProductId, parsedSortOrder]);
    if (result.rows.length === 0) {
        throw new CollectionDomainError('Ürün bulunamadı.', {
            code: 'PRODUCT_NOT_FOUND',
            statusCode: 404
        });
    }
    return {
        collection_id: Number(result.rows[0].collection_id),
        product_id: Number(result.rows[0].product_id),
        sort_order: Number(result.rows[0].sort_order)
    };
};

const removeManualCollectionProduct = async (
    collectionId,
    productId,
    { queryable = pool } = {}
) => {
    const collection = await assertManualCollection(collectionId, queryable);
    const parsedProductId = asInteger(productId, 'product_id', { min: 1 });
    const result = await queryable.query(
        `DELETE FROM collection_products
         WHERE collection_id = $1 AND product_id = $2
         RETURNING product_id`,
        [collection.id, parsedProductId]
    );
    if (result.rows.length === 0) {
        throw new CollectionDomainError('Koleksiyon ürünü bulunamadı.', {
            code: 'COLLECTION_PRODUCT_NOT_FOUND',
            statusCode: 404
        });
    }
    return { removed: true, product_id: parsedProductId };
};

const getPublicCollectionRow = async (slug, queryable = pool) => {
    const normalizedSlug = slugifyCategoryName(slug);
    const result = await queryable.query(`
        SELECT *
        FROM collections
        WHERE slug = $1
          AND is_active = TRUE
          AND deleted_at IS NULL
        LIMIT 1
    `, [normalizedSlug]);
    if (result.rows.length === 0) {
        throw new CollectionDomainError('Koleksiyon bulunamadı veya yayında değil.', {
            code: 'COLLECTION_NOT_PUBLIC',
            statusCode: 404
        });
    }
    return normalizeCollection(result.rows[0]);
};

const getCollectionProductSource = (collection) => {
    if (collection.collection_type === 'manual') {
        return {
            joins: 'JOIN collection_products cp ON cp.product_id = p.id AND cp.collection_id = $1',
            where: '',
            ranking: 'cp.sort_order ASC, p.created_at DESC, p.id DESC',
            extraSelect: 'cp.sort_order AS collection_sort_order, 0::BIGINT AS sold_quantity'
        };
    }
    if (collection.rule_code === 'new_arrivals') {
        return {
            joins: '',
            where: `AND p.created_at >= CURRENT_TIMESTAMP - INTERVAL '30 days'`,
            ranking: 'p.created_at DESC, p.id DESC',
            extraSelect: '0 AS collection_sort_order, 0::BIGINT AS sold_quantity'
        };
    }
    if (collection.rule_code === 'discount') {
        return {
            joins: '',
            where: 'AND p.old_price IS NOT NULL AND p.old_price > p.price',
            ranking: '(p.old_price - p.price) DESC, p.created_at DESC, p.id DESC',
            extraSelect: '0 AS collection_sort_order, 0::BIGINT AS sold_quantity'
        };
    }
    if (collection.rule_code === 'best_sellers') {
        return {
            joins: `JOIN (
                SELECT order_item.product_id, SUM(order_item.quantity)::BIGINT AS sold_quantity
                FROM order_items order_item
                JOIN orders customer_order ON customer_order.id = order_item.order_id
                WHERE customer_order.status = $4
                  AND customer_order.payment_status = $5
                  AND customer_order.created_at >= CURRENT_TIMESTAMP - INTERVAL '30 days'
                  AND order_item.product_id IS NOT NULL
                GROUP BY order_item.product_id
            ) sales ON sales.product_id = p.id`,
            where: '',
            ranking: 'sales.sold_quantity DESC, p.id DESC',
            extraSelect: '0 AS collection_sort_order, sales.sold_quantity'
        };
    }
    throw new CollectionDomainError('Koleksiyon kuralı desteklenmiyor.', {
        code: 'COLLECTION_RULE_INVALID',
        statusCode: 409
    });
};

const queryPublicCollectionProducts = async (
    collection,
    { page = 1, limit = 24, queryable = pool } = {}
) => {
    const parsedPage = asInteger(page, 'page', { min: 1 });
    const parsedLimit = Math.min(asInteger(limit, 'limit', { min: 1 }), 100);
    const offset = (parsedPage - 1) * parsedLimit;
    const source = getCollectionProductSource(collection);
    const params = [
        collection.id,
        parsedLimit,
        offset,
        ORDER_STATUS.TESLIM_EDILDI,
        PAYMENT_STATUS.PAID
    ];
    const commonWhere = `
        p.publication_status = 'active'
        AND p.is_customer_visible = TRUE
        AND p.deleted_at IS NULL
    `;
    const countResult = await queryable.query(`
        SELECT COUNT(DISTINCT p.id)::INTEGER AS total
        FROM products p
        CROSS JOIN (
            SELECT
                $1::BIGINT AS collection_id,
                $2::INTEGER AS page_limit,
                $3::INTEGER AS page_offset,
                $4::TEXT AS completed_status,
                $5::TEXT AS paid_status
        ) query_input
        ${source.joins}
        WHERE ${commonWhere}
        ${source.where}
    `, params);
    const total = Number(countResult.rows[0]?.total || 0);
    const productsResult = await queryable.query(`
        SELECT
            p.id,
            p.name,
            p.description,
            p.price,
            p.old_price,
            p.stock,
            p.image_url,
            p.created_at,
            ${source.extraSelect}
        FROM products p
        CROSS JOIN (
            SELECT
                $1::BIGINT AS collection_id,
                $2::INTEGER AS page_limit,
                $3::INTEGER AS page_offset,
                $4::TEXT AS completed_status,
                $5::TEXT AS paid_status
        ) query_input
        ${source.joins}
        WHERE ${commonWhere}
        ${source.where}
        ORDER BY (p.stock > 0) DESC, ${source.ranking}
        LIMIT $2 OFFSET $3
    `, params);
    return {
        products: productsResult.rows.map((row) => ({
            id: Number(row.id),
            name: row.name,
            description: row.description,
            price: Number(row.price),
            old_price: row.old_price === null ? null : Number(row.old_price),
            stock: Number(row.stock || 0),
            image_url: row.image_url,
            created_at: row.created_at,
            sold_quantity: Number(row.sold_quantity || 0),
            is_purchasable: Number(row.stock || 0) > 0
        })),
        pagination: {
            page: parsedPage,
            limit: parsedLimit,
            total,
            total_pages: Math.ceil(total / parsedLimit)
        }
    };
};

const toPublicCollection = (collection, visibleProductCount) => ({
    id: collection.id,
    name: collection.name,
    slug: collection.slug,
    collection_type: collection.collection_type,
    description: collection.description,
    image_url: collection.image_url,
    banner_url: collection.banner_url,
    accent_color: collection.accent_color,
    seo_title: collection.seo_title,
    seo_description: collection.seo_description,
    sort_order: collection.sort_order,
    visible_product_count: Number(visibleProductCount || 0)
});

const listPublicCollections = async ({ queryable = pool } = {}) => {
    const result = await queryable.query(`
        SELECT
            collection.*,
            CASE
                WHEN collection.collection_type = 'manual' THEN (
                    SELECT COUNT(*)::INTEGER
                    FROM collection_products collection_product
                    JOIN products product ON product.id = collection_product.product_id
                    WHERE collection_product.collection_id = collection.id
                      AND product.publication_status = 'active'
                      AND product.is_customer_visible = TRUE
                      AND product.deleted_at IS NULL
                )
                WHEN collection.rule_code = 'new_arrivals' THEN (
                    SELECT COUNT(*)::INTEGER
                    FROM products product
                    WHERE product.publication_status = 'active'
                      AND product.is_customer_visible = TRUE
                      AND product.deleted_at IS NULL
                      AND product.created_at >= CURRENT_TIMESTAMP - INTERVAL '30 days'
                )
                WHEN collection.rule_code = 'discount' THEN (
                    SELECT COUNT(*)::INTEGER
                    FROM products product
                    WHERE product.publication_status = 'active'
                      AND product.is_customer_visible = TRUE
                      AND product.deleted_at IS NULL
                      AND product.old_price IS NOT NULL
                      AND product.old_price > product.price
                )
                WHEN collection.rule_code = 'best_sellers' THEN (
                    SELECT COUNT(DISTINCT product.id)::INTEGER
                    FROM products product
                    JOIN order_items order_item ON order_item.product_id = product.id
                    JOIN orders customer_order ON customer_order.id = order_item.order_id
                    WHERE product.publication_status = 'active'
                      AND product.is_customer_visible = TRUE
                      AND product.deleted_at IS NULL
                      AND customer_order.status = $1
                      AND customer_order.payment_status = $2
                      AND customer_order.created_at >= CURRENT_TIMESTAMP - INTERVAL '30 days'
                )
                ELSE 0
            END AS visible_product_count
        FROM collections collection
        WHERE collection.is_active = TRUE
          AND collection.deleted_at IS NULL
        ORDER BY collection.sort_order ASC, collection.name ASC, collection.id ASC
    `, [ORDER_STATUS.TESLIM_EDILDI, PAYMENT_STATUS.PAID]);
    return result.rows
        .map(normalizeCollection)
        .filter((collection) => collection.visible_product_count > 0)
        .map((collection) => toPublicCollection(collection, collection.visible_product_count));
};

const getPublicCollection = async (
    slug,
    { page = 1, limit = 24, queryable = pool } = {}
) => {
    const collection = await getPublicCollectionRow(slug, queryable);
    const productResult = await queryPublicCollectionProducts(collection, {
        page,
        limit,
        queryable
    });
    if (productResult.pagination.total === 0) {
        throw new CollectionDomainError('Koleksiyon boş veya yayında değil.', {
            code: 'COLLECTION_EMPTY',
            statusCode: 404
        });
    }
    return {
        collection: toPublicCollection(collection, productResult.pagination.total),
        ...productResult
    };
};

module.exports = {
    CollectionDomainError,
    normalizeRuleCode,
    listAdminCollections,
    getAdminCollection,
    createCollection,
    updateCollection,
    archiveCollection,
    addManualCollectionProduct,
    removeManualCollectionProduct,
    listPublicCollections,
    getPublicCollection,
    queryPublicCollectionProducts
};
