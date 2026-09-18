'use strict';

const { buildPublicProductSqlPredicate } = require('../constants/productVisibility');
const { publicStoreSourceSql } = require('./publicCommerceEligibilityService');
const { buildPublicAttributeFilterSql, parsePublicAttributeFilters } = require('./productAttributeService');
const { customerMediaUrl, toPublicMedia } = require('./publicStoreProjectionService');
const {
    PublicReadError, scalar, parsePage, decodeCursor, cursorColumns, afterCursorSql, pageRows
} = require('./publicReadPaginationService');

const STOCK_RANK = '(CASE WHEN p.stock > 0 THEN 0 ELSE 1 END)';
const FILTER_KEYS = ['q', 'category', 'categoryId', 'category_id', 'categorySlug', 'category_slug',
    'includeDescendants', 'include_descendants', 'attributes', 'attributeFilters', 'attribute_filters'];
const validateMarketplaceQuery = (query = {}) => {
    for (const key of Object.keys(query)) {
        if (![...FILTER_KEYS, 'limit', 'cursor', 'pagination'].includes(key)) throw new PublicReadError('PUBLIC_QUERY_INVALID');
        scalar(query, key, key === 'cursor' ? 1024 : key.startsWith('attribute') ? 4096 : key === 'q' ? 120 : 255);
    }
    for (const keys of [['categoryId', 'category_id'], ['categorySlug', 'category_slug'],
        ['includeDescendants', 'include_descendants'], ['attributes', 'attributeFilters', 'attribute_filters']]) {
        if (keys.filter((key) => query[key] !== undefined).length > 1) throw new PublicReadError('PUBLIC_QUERY_INVALID');
    }
    const id = query.categoryId ?? query.category_id;
    if (id !== undefined && (!/^[1-9]\d{0,9}$/u.test(id) || Number(id) > 2147483647)) throw new PublicReadError('PUBLIC_QUERY_INVALID');
    const filters = parsePublicAttributeFilters(query);
    if (Object.keys(filters).length > 20) throw new PublicReadError('PUBLIC_QUERY_INVALID');
    for (const [key, value] of Object.entries(filters)) {
        if (key.length > 80 || (Array.isArray(value) && value.length > 50)) throw new PublicReadError('PUBLIC_QUERY_INVALID');
        if (value && typeof value === 'object' && !Array.isArray(value)
            && Object.keys(value).some((part) => !['min', 'max'].includes(part))) throw new PublicReadError('PUBLIC_QUERY_INVALID');
    }
    return parsePage(query);
};

const categoryPredicate = (selected, params) => {
    if (!selected) return '';
    const id = `$${params.push(selected.categoryId)}`;
    const descendants = `$${params.push(selected.includeDescendants)}::BOOLEAN`;
    return ` AND EXISTS (
        WITH RECURSIVE selected_categories AS (
            SELECT id FROM categories WHERE id = ${id} AND is_active = TRUE
                AND is_customer_visible = TRUE AND deleted_at IS NULL
            UNION ALL
            SELECT child.id FROM categories child JOIN selected_categories parent ON child.parent_id = parent.id
            WHERE ${descendants} = TRUE AND child.is_active = TRUE
                AND child.is_customer_visible = TRUE AND child.deleted_at IS NULL
        )
        SELECT 1 FROM product_categories link JOIN selected_categories selected ON selected.id = link.category_id
        WHERE link.product_id = p.id
    )`;
};

const readPublicProductPage = async (queryable, query = {}, selectedCategory = null) => {
    const options = validateMarketplaceQuery(query);
    const q = (query.q || '').trim();
    if (/\u0000/u.test(q)) throw new PublicReadError('PUBLIC_QUERY_INVALID');
    const params = [];
    let where = categoryPredicate(selectedCategory, params);
    where += buildPublicAttributeFilterSql(query, params).sql;
    if (q) {
        // The ! escape makes %, _ and ! literal search characters, never client wildcards.
        const search = `$${params.push(`%${q.replace(/[!%_]/gu, '!$&')}%`)}`;
        where += ` AND (p.name ILIKE ${search} ESCAPE '!' OR p.description ILIKE ${search} ESCAPE '!')`;
    }
    const scope = ['products', selectedCategory, q, params];
    // Copy parameters: scope must remain unchanged when cursor and LIMIT parameters are appended.
    scope[3] = [...params];
    const cursor = decodeCursor(options.cursor, scope);
    where += afterCursorSql(cursor, params, { id: 'p.id', time: 'p.created_at', rank: STOCK_RANK });
    const limit = `$${params.push(options.limit + 1)}`;
    const result = await queryable.query(`
        SELECT p.id, p.name, p.description, p.brand, p.product_type, p.price, p.old_price, p.stock, p.image_url,
            p.category, p.categories, p.variant_selection_required,
            public_store.slug AS public_store_slug, public_store.display_name AS public_store_name,
            ${cursorColumns('p.created_at', STOCK_RANK)},
            (SELECT ROUND(COALESCE(AVG(review.rating), 0), 1) FROM reviews review
                WHERE review.product_id = p.id AND review.status = 'PUBLISHED') AS average_rating,
            (SELECT COUNT(*)::INTEGER FROM reviews review
                WHERE review.product_id = p.id AND review.status = 'PUBLISHED') AS review_count
        FROM products p
        JOIN (${publicStoreSourceSql()}) public_store ON public_store.platform_store_id = p.store_id
        WHERE ${buildPublicProductSqlPredicate('p')} ${where}
        ORDER BY ${STOCK_RANK}, p.created_at DESC NULLS LAST, p.id DESC
        LIMIT ${limit}`, params);
    const page = pageRows(result.rows, options.limit, scope);
    const ids = page.items.map((row) => Number(row.id));
    const mediaById = new Map();
    const categoriesById = new Map();
    if (ids.length) {
        const [media, links] = await Promise.all([
            queryable.query(`SELECT media.* FROM UNNEST($1::INTEGER[]) selected(id)
                CROSS JOIN LATERAL (
                    SELECT id, product_id, media_url, media_type, is_main, sort_order,
                        card_focal_x, card_focal_y, card_zoom
                    FROM product_media WHERE product_id = selected.id AND COALESCE(media_type, 'image') = 'image'
                    ORDER BY is_main DESC, sort_order ASC, id ASC LIMIT 20
                ) media`, [ids]),
            queryable.query(`SELECT link.* FROM UNNEST($1::INTEGER[]) selected(id)
                CROSS JOIN LATERAL (
                    SELECT product_id, category_id, is_primary FROM product_categories
                    WHERE product_id = selected.id ORDER BY is_primary DESC, category_id LIMIT 100
                ) link`, [ids])
        ]);
        for (const row of media.rows) {
            const safe = toPublicMedia(row);
            if (!safe) continue;
            const id = Number(row.product_id);
            if (!mediaById.has(id)) mediaById.set(id, []);
            mediaById.get(id).push(safe);
        }
        for (const row of links.rows) {
            const id = Number(row.product_id);
            if (!categoriesById.has(id)) categoriesById.set(id, []);
            categoriesById.get(id).push(row);
        }
    }
    page.items = page.items.map((row) => {
        const id = Number(row.id);
        const links = categoriesById.get(id) || [];
        const categories = Array.isArray(row.categories) && row.categories.length
            ? row.categories : [row.category || 'Kategorisiz'];
        const media = mediaById.get(id) || [];
        return {
            id, name: row.name, description: row.description, brand: row.brand ?? null,
            product_type: row.product_type ?? null, price: Number(row.price),
            old_price: row.old_price == null ? null : Number(row.old_price),
            stock: Number(row.stock), is_purchasable: Number(row.stock) > 0,
            variant_selection_required: row.variant_selection_required === true,
            image_url: customerMediaUrl(row.image_url) || media[0]?.media_url || null, media,
            category: categories[0], categories,
            categoryIds: links.map((link) => Number(link.category_id)),
            primaryCategoryId: Number(links.find((link) => link.is_primary)?.category_id) || null,
            average_rating: Number(row.average_rating || 0).toFixed(1), review_count: Number(row.review_count || 0),
            store: { slug: row.public_store_slug, name: row.public_store_name }
        };
    });
    return page;
};

const listPublicProducts = async (database, query = {}, selectedCategory = null) => {
    const client = await database.connect();
    try {
        await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
        await client.query("SET LOCAL statement_timeout = '3s'");
        const page = await readPublicProductPage(client, query, selectedCategory);
        await client.query('COMMIT');
        return page;
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
    } finally { client.release(); }
};

module.exports = { listPublicProducts, validateMarketplaceQuery };
