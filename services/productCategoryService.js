const { normalizeLegacyCategoryName } = require('./categoryV2BackfillService');

class ProductCategoryValidationError extends Error {
    constructor(message, details = []) {
        super(message);
        this.statusCode = 400;
        this.code = 'PRODUCT_CATEGORY_INVALID';
        this.details = details;
    }
}

const parseIdList = (value) => {
    if (value === undefined || value === null || value === '') return [];
    let values = value;
    if (typeof value === 'string') {
        try {
            values = JSON.parse(value);
        } catch (_) {
            values = value.split(',');
        }
    }
    if (!Array.isArray(values)) values = [values];
    return [...new Set(values.map(Number).filter(Number.isInteger))];
};

const loadCategories = async (queryable) => {
    const result = await queryable.query(`
        SELECT category.id, category.name, category.deleted_at,
               EXISTS (
                   SELECT 1 FROM categories child
                   WHERE child.parent_id = category.id AND child.deleted_at IS NULL
               ) AS has_children
        FROM categories category
        ORDER BY category.id
    `);
    return result.rows.map((row) => ({ ...row, id: Number(row.id) }));
};

const resolveProductCategoryAssignment = async (
    queryable,
    body,
    legacyCategories,
    { isUpdate = false } = {}
) => {
    const hasExplicit =
        Object.prototype.hasOwnProperty.call(body, 'categoryIds') ||
        Object.prototype.hasOwnProperty.call(body, 'primaryCategoryId');
    const hasLegacy =
        Object.prototype.hasOwnProperty.call(body, 'category') ||
        Object.prototype.hasOwnProperty.call(body, 'categories');
    if (isUpdate && !hasExplicit && !hasLegacy) {
        return { replace: false, assignments: [], categoryNames: legacyCategories, warnings: [] };
    }

    const categories = await loadCategories(queryable);
    const byId = new Map(categories.map((category) => [category.id, category]));

    if (hasExplicit) {
        const categoryIds = parseIdList(body.categoryIds);
        const primaryCategoryId = Number(body.primaryCategoryId);
        if (categoryIds.length === 0 || !Number.isInteger(primaryCategoryId)) {
            throw new ProductCategoryValidationError('categoryIds ve primaryCategoryId zorunludur.');
        }
        if (!categoryIds.includes(primaryCategoryId)) {
            throw new ProductCategoryValidationError('primaryCategoryId, categoryIds içinde olmalıdır.');
        }
        const invalid = categoryIds.filter((id) => {
            const category = byId.get(id);
            return !category || category.deleted_at || category.has_children;
        });
        if (invalid.length > 0) {
            throw new ProductCategoryValidationError(
                'Ürünler yalnızca mevcut leaf kategorilere atanabilir.',
                invalid
            );
        }
        const ordered = [primaryCategoryId, ...categoryIds.filter((id) => id !== primaryCategoryId)];
        return {
            replace: true,
            assignments: ordered.map((categoryId) => ({
                categoryId,
                isPrimary: categoryId === primaryCategoryId
            })),
            categoryNames: ordered.map((id) => byId.get(id).name),
            warnings: []
        };
    }

    const groups = new Map();
    categories.filter((category) => !category.deleted_at).forEach((category) => {
        const key = normalizeLegacyCategoryName(category.name);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(category);
    });
    const assignments = [];
    const issues = [];
    legacyCategories.forEach((name) => {
        const candidates = groups.get(normalizeLegacyCategoryName(name)) || [];
        if (candidates.length !== 1) {
            issues.push(`${name}: ${candidates.length ? 'belirsiz eşleşme' : 'eşleşme yok'}`);
        } else if (candidates[0].has_children) {
            issues.push(`${name}: parent kategori`);
        } else if (!assignments.some((item) => item.categoryId === candidates[0].id)) {
            assignments.push({ categoryId: candidates[0].id, isPrimary: assignments.length === 0 });
        }
    });
    return {
        replace: issues.length === 0 && assignments.length > 0,
        assignments,
        categoryNames: legacyCategories,
        warnings: issues.length ? [`Kategori v2 eşleştirmesi tamamlanamadı: ${issues.join(', ')}`] : []
    };
};

const getProductCategoryLinks = async (queryable, productId) => {
    const result = await queryable.query(
        `SELECT category_id, is_primary FROM product_categories
         WHERE product_id = $1 ORDER BY is_primary DESC, category_id`,
        [productId]
    );
    return result.rows.map((row) => ({
        categoryId: Number(row.category_id),
        isPrimary: row.is_primary === true
    }));
};

const syncProductCategoryAssignments = async (queryable, productId, resolution) => {
    const previous = await getProductCategoryLinks(queryable, productId);
    if (!resolution.replace) return { previous, current: previous };
    await queryable.query('DELETE FROM product_categories WHERE product_id = $1', [productId]);
    for (const assignment of resolution.assignments) {
        await queryable.query(
            `INSERT INTO product_categories (product_id, category_id, is_primary)
             VALUES ($1, $2, $3)`,
            [productId, assignment.categoryId, assignment.isPrimary]
        );
    }
    return { previous, current: resolution.assignments };
};

const assertProductCategoryPublicationReady = (publicationStatus, assignments = []) => {
    if (String(publicationStatus || '').toLowerCase() !== 'active') return true;
    const hasPrimaryLeaf = assignments.length > 0 && assignments.some((item) => item.isPrimary === true);
    if (!hasPrimaryLeaf) {
        throw new ProductCategoryValidationError(
            'Aktif ürün için en az bir leaf categoryIds ve seçili primaryCategoryId zorunludur.'
        );
    }
    return true;
};

module.exports = {
    ProductCategoryValidationError,
    parseIdList,
    resolveProductCategoryAssignment,
    getProductCategoryLinks,
    syncProductCategoryAssignments,
    assertProductCategoryPublicationReady
};
