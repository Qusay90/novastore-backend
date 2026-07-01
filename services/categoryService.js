const pool = require('../config/db');
const { slugifyCategoryName, normalizeLegacyCategoryName } = require('./categoryV2BackfillService');
const { recalculateAllCategoryStats } = require('./categoryStatsService');

const COUNT_FIELDS = Object.freeze([
    'direct_product_count',
    'visible_product_count',
    'sellable_product_count',
    'descendant_visible_product_count',
    'descendant_sellable_product_count',
    'subtree_visible_product_count',
    'subtree_sellable_product_count'
]);

const CATEGORY_SELECT = `
    SELECT
        category.id,
        category.name,
        category.parent_id,
        category.slug,
        category.path,
        category.depth,
        category.image_url,
        category.banner_url,
        category.icon,
        category.accent_color,
        category.description,
        category.seo_title,
        category.seo_description,
        category.sort_order,
        category.is_active,
        category.is_customer_visible,
        category.show_in_menu,
        category.show_on_home,
        category.hide_when_empty,
        category.google_taxonomy_id,
        category.created_at,
        category.updated_at,
        category.deleted_at,
        COALESCE(stats.direct_product_count, 0) AS direct_product_count,
        COALESCE(stats.visible_product_count, 0) AS visible_product_count,
        COALESCE(stats.sellable_product_count, 0) AS sellable_product_count,
        COALESCE(stats.descendant_visible_product_count, 0) AS descendant_visible_product_count,
        COALESCE(stats.descendant_sellable_product_count, 0) AS descendant_sellable_product_count,
        COALESCE(stats.subtree_visible_product_count, 0) AS subtree_visible_product_count,
        COALESCE(stats.subtree_sellable_product_count, 0) AS subtree_sellable_product_count
    FROM categories category
    LEFT JOIN category_stats stats ON stats.category_id = category.id
`;

class CategoryDomainError extends Error {
    constructor(message, { code = 'CATEGORY_DOMAIN_ERROR', statusCode = 400 } = {}) {
        super(message);
        this.name = 'CategoryDomainError';
        this.code = code;
        this.statusCode = statusCode;
    }
}

const normalizeCategoryRow = (row) => {
    const normalized = {
        ...row,
        id: Number(row.id),
        parent_id: row.parent_id === null ? null : Number(row.parent_id),
        depth: row.depth === null ? null : Number(row.depth),
        sort_order: Number(row.sort_order || 0)
    };

    COUNT_FIELDS.forEach((field) => {
        normalized[field] = Number(row[field] || 0);
    });

    return normalized;
};

const compareCategories = (left, right) => {
    const sortDifference = Number(left.sort_order || 0) - Number(right.sort_order || 0);
    if (sortDifference !== 0) return sortDifference;

    const nameDifference = String(left.name || '').localeCompare(String(right.name || ''), 'tr');
    if (nameDifference !== 0) return nameDifference;
    return Number(left.id) - Number(right.id);
};

const assertAcyclicCategoryTree = (categories) => {
    const categoryById = new Map(categories.map((category) => [Number(category.id), category]));
    const state = new Map();

    const visit = (categoryId) => {
        const currentState = state.get(categoryId);
        if (currentState === 'visited') return;
        if (currentState === 'visiting') {
            throw new CategoryDomainError('Kategori ağacında döngü tespit edildi.', {
                code: 'CATEGORY_CYCLE',
                statusCode: 409
            });
        }

        state.set(categoryId, 'visiting');
        const category = categoryById.get(categoryId);
        if (category && category.parent_id !== null && categoryById.has(Number(category.parent_id))) {
            visit(Number(category.parent_id));
        }
        state.set(categoryId, 'visited');
    };

    categories.forEach((category) => visit(Number(category.id)));
};

const assertCategoryMoveAllowed = (categories, categoryId, nextParentId) => {
    const parsedCategoryId = Number(categoryId);
    const parsedParentId = nextParentId === null || nextParentId === undefined
        ? null
        : Number(nextParentId);
    const categoryById = new Map(categories.map((category) => [Number(category.id), category]));

    if (!Number.isInteger(parsedCategoryId) || !categoryById.has(parsedCategoryId)) {
        throw new CategoryDomainError('Kategori bulunamadı.', {
            code: 'CATEGORY_NOT_FOUND',
            statusCode: 404
        });
    }
    if (parsedParentId !== null && (!Number.isInteger(parsedParentId) || !categoryById.has(parsedParentId))) {
        throw new CategoryDomainError('Parent kategori bulunamadı.', {
            code: 'CATEGORY_PARENT_NOT_FOUND',
            statusCode: 404
        });
    }
    if (parsedCategoryId === parsedParentId) {
        throw new CategoryDomainError('Kategori kendisinin parent kaydı olamaz.', {
            code: 'CATEGORY_CYCLE',
            statusCode: 409
        });
    }

    const visited = new Set();
    let cursorId = parsedParentId;
    while (cursorId !== null) {
        if (cursorId === parsedCategoryId || visited.has(cursorId)) {
            throw new CategoryDomainError('Kategori taşıma işlemi döngü oluşturur.', {
                code: 'CATEGORY_CYCLE',
                statusCode: 409
            });
        }
        visited.add(cursorId);
        const cursor = categoryById.get(cursorId);
        cursorId = cursor && cursor.parent_id !== null ? Number(cursor.parent_id) : null;
    }

    return true;
};

const buildCategoryTree = (categories) => {
    assertAcyclicCategoryTree(categories);
    const nodes = categories.map((category) => ({ ...category, children: [] }));
    const nodeById = new Map(nodes.map((node) => [Number(node.id), node]));
    const roots = [];

    nodes.forEach((node) => {
        const parent = node.parent_id === null ? null : nodeById.get(Number(node.parent_id));
        if (parent) parent.children.push(node);
        else roots.push(node);
    });

    const sortTree = (items) => {
        items.sort(compareCategories);
        items.forEach((item) => sortTree(item.children));
    };
    sortTree(roots);
    return roots;
};

const flattenCategoryTree = (tree) => {
    const flattened = [];
    const visit = (nodes) => {
        nodes.forEach((node) => {
            const { children, ...category } = node;
            flattened.push(category);
            visit(children);
        });
    };
    visit(tree);
    return flattened;
};

const listCategoryRows = async (queryable = pool) => {
    const result = await queryable.query(`
        ${CATEGORY_SELECT}
        ORDER BY
            category.depth ASC NULLS LAST,
            category.sort_order ASC,
            category.name ASC,
            category.id ASC
    `);
    return result.rows.map(normalizeCategoryRow);
};

const isCategoryIndividuallyPublic = (category) =>
    category.is_active === true &&
    category.is_customer_visible === true &&
    !category.deleted_at &&
    Number(category.subtree_visible_product_count) > 0;

const filterPublicCategories = (categories) => {
    const categoryById = new Map(categories.map((category) => [Number(category.id), category]));
    const visibilityMemo = new Map();
    const visiting = new Set();

    const isPublicWithAncestors = (categoryId) => {
        if (visibilityMemo.has(categoryId)) return visibilityMemo.get(categoryId);
        if (visiting.has(categoryId)) {
            visibilityMemo.set(categoryId, false);
            return false;
        }

        const category = categoryById.get(categoryId);
        if (!category || !isCategoryIndividuallyPublic(category)) {
            visibilityMemo.set(categoryId, false);
            return false;
        }

        visiting.add(categoryId);
        const parentVisible = category.parent_id === null
            ? true
            : isPublicWithAncestors(Number(category.parent_id));
        visiting.delete(categoryId);
        visibilityMemo.set(categoryId, parentVisible);
        return parentVisible;
    };

    return categories.filter((category) => isPublicWithAncestors(Number(category.id)));
};

const toPublicCategory = (category) => {
    const publicCategory = {
        id: category.id,
        name: category.name,
        parent_id: category.parent_id,
        slug: category.slug,
        path: category.path,
        depth: category.depth,
        image_url: category.image_url,
        banner_url: category.banner_url,
        icon: category.icon,
        accent_color: category.accent_color,
        description: category.description,
        seo_title: category.seo_title,
        seo_description: category.seo_description,
        sort_order: category.sort_order,
        visible_product_count: category.visible_product_count,
        sellable_product_count: category.sellable_product_count,
        descendant_visible_product_count: category.descendant_visible_product_count,
        descendant_sellable_product_count: category.descendant_sellable_product_count,
        subtree_visible_product_count: category.subtree_visible_product_count,
        subtree_sellable_product_count: category.subtree_sellable_product_count
    };

    if (Array.isArray(category.children)) {
        publicCategory.children = category.children.map(toPublicCategory);
    }
    return publicCategory;
};

const listAdminCategories = async ({ format = 'tree', queryable = pool } = {}) => {
    const categories = await listCategoryRows(queryable);
    if (format === 'flat') return categories;
    return buildCategoryTree(categories);
};

const listPublicCategories = async ({ format = 'tree', queryable = pool } = {}) => {
    const allCategories = await listCategoryRows(queryable);
    const publicCategories = filterPublicCategories(allCategories);
    if (format === 'flat') return publicCategories.map(toPublicCategory).sort(compareCategories);
    return buildCategoryTree(publicCategories).map(toPublicCategory);
};

const getPublicCategoryBySlug = async (slug, { queryable = pool } = {}) => {
    const normalizedSlug = String(slug || '').trim().toLocaleLowerCase('tr-TR');
    if (!normalizedSlug) {
        throw new CategoryDomainError('Kategori bulunamadı.', {
            code: 'CATEGORY_NOT_FOUND',
            statusCode: 404
        });
    }

    const allCategories = await listCategoryRows(queryable);
    const publicCategories = filterPublicCategories(allCategories);
    const publicById = new Map(publicCategories.map((category) => [Number(category.id), category]));
    const selected = publicCategories.find((category) =>
        String(category.slug || '').toLocaleLowerCase('tr-TR') === normalizedSlug
    );

    if (!selected) {
        const aliasResult = await queryable.query(
            `SELECT category_id, redirect_status
             FROM category_aliases
             WHERE LOWER(normalized_alias) = LOWER($1)
             ORDER BY id
             LIMIT 1`,
            [normalizedSlug]
        );
        const alias = aliasResult.rows[0];
        const aliasTarget = alias ? publicById.get(Number(alias.category_id)) : null;
        if (aliasTarget) {
            return {
                redirect: {
                    status: Number(alias.redirect_status || 301),
                    canonical_slug: aliasTarget.slug
                }
            };
        }
        throw new CategoryDomainError('Kategori bulunamadı veya yayında değil.', {
            code: 'CATEGORY_NOT_PUBLIC',
            statusCode: 404
        });
    }

    const breadcrumb = [];
    let cursor = selected;
    const visited = new Set();
    while (cursor) {
        if (visited.has(Number(cursor.id))) {
            throw new CategoryDomainError('Kategori ağacında döngü tespit edildi.', {
                code: 'CATEGORY_CYCLE',
                statusCode: 409
            });
        }
        visited.add(Number(cursor.id));
        breadcrumb.unshift(toPublicCategory(cursor));
        cursor = cursor.parent_id === null ? null : publicById.get(Number(cursor.parent_id));
    }

    const children = publicCategories
        .filter((category) => Number(category.parent_id) === Number(selected.id))
        .sort(compareCategories)
        .map(toPublicCategory);

    return {
        category: toPublicCategory(selected),
        breadcrumb,
        children
    };
};

const CATEGORY_MUTATION_FIELDS = Object.freeze([
    'image_url', 'banner_url', 'icon', 'accent_color', 'description',
    'seo_title', 'seo_description', 'sort_order', 'is_active',
    'is_customer_visible', 'show_in_menu', 'show_on_home',
    'hide_when_empty', 'google_taxonomy_id'
]);

const withCategoryTransaction = async (operation) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query(`SELECT pg_advisory_xact_lock(hashtext('novastore-category-mutation'))`);
        const result = await operation(client);
        await client.query('COMMIT');
        return result;
    } catch (error) {
        await client.query('ROLLBACK');
        if (error.code === '23505') {
            throw new CategoryDomainError('Aynı parent altında kategori adı veya slug zaten kullanılıyor.', {
                code: 'CATEGORY_CONFLICT',
                statusCode: 409
            });
        }
        throw error;
    } finally {
        client.release();
    }
};

const loadLockedCategories = async (client) => {
    const result = await client.query(`
        SELECT id, name, parent_id, slug, path, depth, sort_order, deleted_at
        FROM categories
        ORDER BY id
        FOR UPDATE
    `);
    return result.rows.map(normalizeCategoryRow);
};

const ensureUniqueSlug = async (client, requested, excludeId = null, automatic = false) => {
    const base = slugifyCategoryName(requested);
    let candidate = base;
    let suffix = 2;
    while (true) {
        const result = await client.query(
            `SELECT id FROM categories
             WHERE LOWER(slug) = LOWER($1)
               AND deleted_at IS NULL
               AND ($2::INTEGER IS NULL OR id <> $2)
             LIMIT 1`,
            [candidate, excludeId]
        );
        if (result.rowCount === 0) return candidate;
        if (!automatic) {
            throw new CategoryDomainError('Slug zaten kullanılıyor.', {
                code: 'CATEGORY_SLUG_CONFLICT',
                statusCode: 409
            });
        }
        candidate = `${base}-${suffix}`;
        suffix += 1;
    }
};

const updateSubtreeMetadata = async (client, rootId) => {
    const categories = await loadLockedCategories(client);
    const byId = new Map(categories.map((category) => [category.id, category]));
    const children = new Map();
    categories.forEach((category) => {
        if (category.parent_id === null) return;
        if (!children.has(category.parent_id)) children.set(category.parent_id, []);
        children.get(category.parent_id).push(category.id);
    });
    const root = byId.get(Number(rootId));
    if (!root) throw new CategoryDomainError('Kategori bulunamadı.', { code: 'CATEGORY_NOT_FOUND', statusCode: 404 });
    const parent = root.parent_id === null ? null : byId.get(root.parent_id);
    const queue = [{
        id: root.id,
        path: parent ? `${parent.path}/${root.slug}` : root.slug,
        depth: parent ? Number(parent.depth) + 1 : 0
    }];
    while (queue.length) {
        const current = queue.shift();
        await client.query(
            'UPDATE categories SET path = $2, depth = $3, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
            [current.id, current.path, current.depth]
        );
        for (const childId of children.get(current.id) || []) {
            const child = byId.get(childId);
            queue.push({
                id: child.id,
                path: `${current.path}/${child.slug}`,
                depth: current.depth + 1
            });
        }
    }
};

const createCategory = async (input = {}) => withCategoryTransaction(async (client) => {
    const name = String(input.name || '').trim();
    if (!name) throw new CategoryDomainError('Kategori adı zorunludur.');
    const parentId = input.parentId ?? input.parent_id ?? null;
    const categories = await loadLockedCategories(client);
    const parent = parentId === null ? null : categories.find((category) => category.id === Number(parentId));
    if (parentId !== null && (!parent || parent.deleted_at)) {
        throw new CategoryDomainError('Parent kategori bulunamadı.', { code: 'CATEGORY_PARENT_NOT_FOUND', statusCode: 404 });
    }
    if (parent) {
        const linked = await client.query(
            'SELECT 1 FROM product_categories WHERE category_id = $1 LIMIT 1',
            [parent.id]
        );
        if (linked.rowCount > 0) {
            throw new CategoryDomainError('Ürün bağlı leaf kategori altına child eklenemez; ürün migration gerekir.', {
                code: 'CATEGORY_PRODUCTS_REQUIRE_MIGRATION',
                statusCode: 409
            });
        }
    }
    const hasExplicitSlug = input.slug !== undefined && String(input.slug).trim();
    const slug = await ensureUniqueSlug(client, hasExplicitSlug ? input.slug : name, null, !hasExplicitSlug);
    const path = parent ? `${parent.path}/${slug}` : slug;
    const depth = parent ? Number(parent.depth) + 1 : 0;
    const values = CATEGORY_MUTATION_FIELDS.map((field) => input[field]);
    const result = await client.query(`
        INSERT INTO categories (
            name, parent_id, slug, path, depth,
            image_url, banner_url, icon, accent_color, description,
            seo_title, seo_description, sort_order, is_active,
            is_customer_visible, show_in_menu, show_on_home,
            hide_when_empty, google_taxonomy_id
        )
        VALUES (
            $1, $2, $3, $4, $5,
            $6, $7, $8, $9, $10,
            $11, $12, COALESCE($13, 0), COALESCE($14, TRUE),
            COALESCE($15, TRUE), COALESCE($16, TRUE), COALESCE($17, FALSE),
            COALESCE($18, TRUE), $19
        )
        RETURNING *
    `, [name, parent?.id || null, slug, path, depth, ...values]);
    await client.query(
        'INSERT INTO category_stats (category_id) VALUES ($1) ON CONFLICT DO NOTHING',
        [result.rows[0].id]
    );
    return normalizeCategoryRow(result.rows[0]);
});

const updateCategory = async (categoryId, input = {}) => withCategoryTransaction(async (client) => {
    const categories = await loadLockedCategories(client);
    const existing = categories.find((category) => category.id === Number(categoryId));
    if (!existing) throw new CategoryDomainError('Kategori bulunamadı.', { code: 'CATEGORY_NOT_FOUND', statusCode: 404 });
    const currentResult = await client.query('SELECT * FROM categories WHERE id = $1', [categoryId]);
    const current = currentResult.rows[0];
    const nextName = input.name === undefined ? current.name : String(input.name).trim();
    if (!nextName) throw new CategoryDomainError('Kategori adı zorunludur.');
    let nextSlug = current.slug;
    if (input.slug !== undefined && slugifyCategoryName(input.slug) !== current.slug) {
        nextSlug = await ensureUniqueSlug(client, input.slug, Number(categoryId), false);
        const normalizedOldSlug = normalizeLegacyCategoryName(current.slug);
        const conflict = await client.query(
            `SELECT category_id FROM category_aliases
             WHERE LOWER(normalized_alias) = LOWER($1) AND category_id <> $2 LIMIT 1`,
            [normalizedOldSlug, categoryId]
        );
        if (conflict.rowCount) throw new CategoryDomainError('Eski slug başka bir alias ile çakışıyor.', { statusCode: 409 });
        await client.query(
            `INSERT INTO category_aliases (category_id, alias, normalized_alias, alias_type, redirect_status)
             VALUES ($1, $2, $3, 'legacy_slug', 301) ON CONFLICT DO NOTHING`,
            [categoryId, current.slug, normalizedOldSlug]
        );
    }
    const merged = Object.fromEntries(CATEGORY_MUTATION_FIELDS.map((field) => [
        field,
        input[field] === undefined ? current[field] : input[field]
    ]));
    const result = await client.query(`
        UPDATE categories SET
            name=$2, slug=$3, image_url=$4, banner_url=$5, icon=$6,
            accent_color=$7, description=$8, seo_title=$9, seo_description=$10,
            sort_order=$11, is_active=$12, is_customer_visible=$13,
            show_in_menu=$14, show_on_home=$15, hide_when_empty=$16,
            google_taxonomy_id=$17, updated_at=CURRENT_TIMESTAMP
        WHERE id=$1 RETURNING *
    `, [categoryId, nextName, nextSlug, ...CATEGORY_MUTATION_FIELDS.map((field) => merged[field])]);
    if (nextSlug !== current.slug) await updateSubtreeMetadata(client, categoryId);
    return normalizeCategoryRow(result.rows[0]);
});

const moveCategory = async (categoryId, input = {}) => withCategoryTransaction(async (client) => {
    const categories = await loadLockedCategories(client);
    const parentId = input.parentId ?? input.parent_id ?? null;
    assertCategoryMoveAllowed(categories, Number(categoryId), parentId === null ? null : Number(parentId));
    const category = categories.find((item) => item.id === Number(categoryId));
    const parent = parentId === null ? null : categories.find((item) => item.id === Number(parentId));
    if (parent?.deleted_at) throw new CategoryDomainError('Silinmiş parent altına taşıma yapılamaz.', { statusCode: 409 });
    if (parent) {
        const linked = await client.query('SELECT 1 FROM product_categories WHERE category_id=$1 LIMIT 1', [parent.id]);
        if (linked.rowCount) throw new CategoryDomainError('Ürün bağlı leaf kategori parent yapılamaz.', {
            code: 'CATEGORY_PRODUCTS_REQUIRE_MIGRATION', statusCode: 409
        });
    }
    const duplicate = await client.query(
        `SELECT 1 FROM categories
         WHERE id <> $1 AND name = $2
           AND COALESCE(parent_id, 0) = COALESCE($3::INTEGER, 0)
           AND deleted_at IS NULL LIMIT 1`,
        [categoryId, category.name, parent?.id || null]
    );
    if (duplicate.rowCount) throw new CategoryDomainError('Aynı parent altında aynı kategori adı kullanılamaz.', {
        code: 'CATEGORY_CONFLICT', statusCode: 409
    });
    await client.query(
        `UPDATE categories SET parent_id=$2, sort_order=COALESCE($3, sort_order),
         updated_at=CURRENT_TIMESTAMP WHERE id=$1`,
        [categoryId, parent?.id || null, input.sortOrder ?? input.sort_order ?? null]
    );
    await updateSubtreeMetadata(client, categoryId);
    await recalculateAllCategoryStats(client);
    return (await client.query('SELECT * FROM categories WHERE id=$1', [categoryId])).rows[0];
});

const setCategoryArchived = async (categoryId, archived) => withCategoryTransaction(async (client) => {
    const result = await client.query(
        `UPDATE categories
         SET deleted_at = CASE WHEN $2 THEN COALESCE(deleted_at, CURRENT_TIMESTAMP) ELSE NULL END,
             is_active = CASE WHEN $2 THEN FALSE ELSE TRUE END,
             updated_at = CURRENT_TIMESTAMP
         WHERE id=$1 RETURNING *`,
        [categoryId, archived === true]
    );
    if (!result.rowCount) throw new CategoryDomainError('Kategori bulunamadı.', { code: 'CATEGORY_NOT_FOUND', statusCode: 404 });
    await recalculateAllCategoryStats(client);
    return normalizeCategoryRow(result.rows[0]);
});

module.exports = {
    COUNT_FIELDS,
    CategoryDomainError,
    normalizeCategoryRow,
    compareCategories,
    assertAcyclicCategoryTree,
    assertCategoryMoveAllowed,
    buildCategoryTree,
    flattenCategoryTree,
    listCategoryRows,
    filterPublicCategories,
    listAdminCategories,
    listPublicCategories,
    getPublicCategoryBySlug,
    createCategory,
    updateCategory,
    moveCategory,
    setCategoryArchived
};
