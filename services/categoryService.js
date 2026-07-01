const pool = require('../config/db');

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
    getPublicCategoryBySlug
};
