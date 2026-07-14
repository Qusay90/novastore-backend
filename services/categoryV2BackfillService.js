const PLATFORM_STORE = Object.freeze({
    name: 'NovaStore',
    slug: 'novastore-platform'
});

const normalizeLegacyCategoryName = (value) =>
    String(value || '')
        .normalize('NFKC')
        .trim()
        .replace(/\s+/g, ' ')
        .toLocaleLowerCase('tr-TR');

const slugifyCategoryName = (value) => {
    const normalized = String(value || '')
        .normalize('NFKD')
        .toLocaleLowerCase('tr-TR')
        .replace(/ı/g, 'i')
        .replace(/ş/g, 's')
        .replace(/ğ/g, 'g')
        .replace(/ü/g, 'u')
        .replace(/ö/g, 'o')
        .replace(/ç/g, 'c')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/&/g, '-ve-')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

    return normalized || 'kategori';
};

const uniqueBy = (values, keySelector) => {
    const seen = new Set();
    return values.filter((value) => {
        const key = keySelector(value);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
};

const buildCategoryPlan = (categories, aliases) => {
    const categoryById = new Map(categories.map((category) => [Number(category.id), category]));
    const childrenByParentId = new Map();
    const normalizedGroups = new Map();
    const existingAliasByNormalized = new Map();
    const usedSlugs = new Set();
    const structuralIssues = [];
    const structuralIssueKeys = new Set();

    categories.forEach((category) => {
        const categoryId = Number(category.id);
        if (category.parent_id !== null) {
            const parentId = Number(category.parent_id);
            if (!childrenByParentId.has(parentId)) childrenByParentId.set(parentId, []);
            childrenByParentId.get(parentId).push(categoryId);
        }

        if (!category.deleted_at) {
            const normalizedName = normalizeLegacyCategoryName(category.name);
            if (normalizedName) {
                if (!normalizedGroups.has(normalizedName)) normalizedGroups.set(normalizedName, []);
                normalizedGroups.get(normalizedName).push(category);
            }
        }

        if (category.slug) usedSlugs.add(String(category.slug).toLocaleLowerCase('tr-TR'));
    });

    aliases.forEach((alias) => {
        existingAliasByNormalized.set(
            normalizeLegacyCategoryName(alias.normalized_alias),
            Number(alias.category_id)
        );
    });

    const nextSlugById = new Map();
    [...categories]
        .sort((left, right) => Number(left.id) - Number(right.id))
        .forEach((category) => {
            const categoryId = Number(category.id);
            if (category.slug) {
                nextSlugById.set(categoryId, String(category.slug));
                return;
            }

            const baseSlug = slugifyCategoryName(category.name);
            let candidate = baseSlug;
            let suffix = 1;
            while (usedSlugs.has(candidate.toLocaleLowerCase('tr-TR'))) {
                candidate = suffix === 1
                    ? `${baseSlug}-${categoryId}`
                    : `${baseSlug}-${categoryId}-${suffix}`;
                suffix += 1;
            }
            usedSlugs.add(candidate.toLocaleLowerCase('tr-TR'));
            nextSlugById.set(categoryId, candidate);
        });

    const resolvedTreeById = new Map();
    const visiting = new Set();

    const addStructuralIssue = (issue) => {
        const key = `${issue.type}:${issue.categoryId}:${issue.parentId || ''}`;
        if (structuralIssueKeys.has(key)) return;
        structuralIssueKeys.add(key);
        structuralIssues.push(issue);
    };

    const resolveTree = (categoryId) => {
        if (resolvedTreeById.has(categoryId)) return resolvedTreeById.get(categoryId);
        const category = categoryById.get(categoryId);
        if (!category) return null;

        if (visiting.has(categoryId)) {
            addStructuralIssue({ type: 'cycle', categoryId });
            resolvedTreeById.set(categoryId, null);
            return null;
        }

        visiting.add(categoryId);
        let depth = 0;
        let parentPath = '';

        if (category.parent_id !== null) {
            const parentId = Number(category.parent_id);
            if (!categoryById.has(parentId)) {
                addStructuralIssue({ type: 'missing_parent', categoryId, parentId });
                visiting.delete(categoryId);
                resolvedTreeById.set(categoryId, null);
                return null;
            }

            const parentTree = resolveTree(parentId);
            if (!parentTree) {
                addStructuralIssue({ type: 'invalid_parent_tree', categoryId, parentId });
                visiting.delete(categoryId);
                resolvedTreeById.set(categoryId, null);
                return null;
            }
            depth = parentTree.depth + 1;
            parentPath = parentTree.path;
        }

        const slug = nextSlugById.get(categoryId);
        const path = category.path || (parentPath ? `${parentPath}/${slug}` : slug);
        const tree = { depth, path, slug };
        visiting.delete(categoryId);
        resolvedTreeById.set(categoryId, tree);
        return tree;
    };

    const categoryUpdates = [];
    categories.forEach((category) => {
        const categoryId = Number(category.id);
        const tree = resolveTree(categoryId);
        if (!tree) return;
        if (!category.slug || !category.path || category.depth === null || category.depth === undefined) {
            categoryUpdates.push({
                id: categoryId,
                slug: tree.slug,
                path: tree.path,
                depth: tree.depth
            });
        }
    });

    const aliasesToCreate = [];
    const ambiguousCategoryNames = [];
    const aliasConflicts = [];

    normalizedGroups.forEach((group, normalizedName) => {
        if (group.length > 1) {
            ambiguousCategoryNames.push({
                normalizedName,
                categoryIds: group.map((category) => Number(category.id))
            });
            return;
        }

        const category = group[0];
        const existingCategoryId = existingAliasByNormalized.get(normalizedName);
        if (existingCategoryId && existingCategoryId !== Number(category.id)) {
            aliasConflicts.push({
                normalizedName,
                existingCategoryId,
                requestedCategoryId: Number(category.id)
            });
            return;
        }
        if (!existingCategoryId) {
            aliasesToCreate.push({
                categoryId: Number(category.id),
                alias: category.name,
                normalizedAlias: normalizedName
            });
        }
    });

    return {
        categoryById,
        childrenByParentId,
        normalizedGroups,
        categoryUpdates,
        aliasesToCreate,
        ambiguousCategoryNames,
        aliasConflicts,
        structuralIssues,
        statsCategoryIds: categories.map((category) => Number(category.id))
    };
};

const buildProductPlan = (products, existingLinks, categoryPlan) => {
    const existingLinksByProductId = new Map();
    existingLinks.forEach((link) => {
        const productId = Number(link.product_id);
        if (!existingLinksByProductId.has(productId)) existingLinksByProductId.set(productId, []);
        existingLinksByProductId.get(productId).push(link);
    });

    const relationships = [];
    const alreadyMappedProducts = [];
    const unmatchedProducts = [];
    const ambiguousProducts = [];
    const parentCategoryProducts = [];
    const needsReviewProducts = [];

    const resolveLegacyName = (rawName) => {
        const normalizedName = normalizeLegacyCategoryName(rawName);
        if (!normalizedName) return { type: 'empty', rawName };

        const candidates = categoryPlan.normalizedGroups.get(normalizedName) || [];
        if (candidates.length === 0) return { type: 'unmatched', rawName, normalizedName };
        if (candidates.length > 1) {
            return {
                type: 'ambiguous',
                rawName,
                normalizedName,
                categoryIds: candidates.map((category) => Number(category.id))
            };
        }

        const category = candidates[0];
        const categoryId = Number(category.id);
        if (category.deleted_at) return { type: 'unmatched', rawName, normalizedName };
        if ((categoryPlan.childrenByParentId.get(categoryId) || []).length > 0) {
            return { type: 'parent', rawName, normalizedName, categoryId };
        }
        return { type: 'matched', rawName, normalizedName, categoryId };
    };

    products.forEach((product) => {
        const productId = Number(product.id);
        const existing = existingLinksByProductId.get(productId) || [];
        if (existing.length > 0) {
            alreadyMappedProducts.push({
                productId,
                categoryIds: existing.map((link) => Number(link.category_id))
            });
            return;
        }

        const legacyArray = Array.isArray(product.categories) ? product.categories : [];
        const candidates = uniqueBy(
            [
                { source: 'category', value: product.category },
                ...legacyArray.map((value, index) => ({ source: 'categories', index, value }))
            ].filter((candidate) => normalizeLegacyCategoryName(candidate.value)),
            (candidate) => normalizeLegacyCategoryName(candidate.value)
        );

        const resolved = candidates.map((candidate) => ({
            ...candidate,
            resolution: resolveLegacyName(candidate.value)
        }));

        const unmatched = resolved.filter((item) => item.resolution.type === 'unmatched');
        const ambiguous = resolved.filter((item) => item.resolution.type === 'ambiguous');
        const parents = resolved.filter((item) => item.resolution.type === 'parent');
        const matched = uniqueBy(
            resolved.filter((item) => item.resolution.type === 'matched'),
            (item) => item.resolution.categoryId
        );

        if (unmatched.length > 0) {
            unmatchedProducts.push({
                productId,
                names: unmatched.map((item) => item.value)
            });
        }
        if (ambiguous.length > 0) {
            ambiguousProducts.push({
                productId,
                names: ambiguous.map((item) => ({
                    value: item.value,
                    categoryIds: item.resolution.categoryIds
                }))
            });
        }
        if (parents.length > 0) {
            parentCategoryProducts.push({
                productId,
                names: parents.map((item) => ({
                    value: item.value,
                    categoryId: item.resolution.categoryId
                }))
            });
        }

        const primaryMatch = matched.find((item) => item.source === 'category') || matched[0] || null;
        matched.forEach((item) => {
            relationships.push({
                productId,
                categoryId: item.resolution.categoryId,
                isPrimary: Boolean(primaryMatch && primaryMatch.resolution.categoryId === item.resolution.categoryId)
            });
        });

        if (matched.length === 0 || unmatched.length > 0 || ambiguous.length > 0 || parents.length > 0) {
            needsReviewProducts.push({
                productId,
                hasMapping: matched.length > 0,
                reason: matched.length === 0 ? 'no_safe_leaf_match' : 'partial_match'
            });
        }
    });

    return {
        relationships,
        alreadyMappedProducts,
        unmatchedProducts,
        ambiguousProducts,
        parentCategoryProducts,
        needsReviewProducts
    };
};

const loadBackfillSnapshot = async (queryable) => {
    const categoriesResult = await queryable.query(`
        SELECT id, name, parent_id, slug, path, depth, deleted_at
        FROM categories
        ORDER BY id
    `);
    const aliasesResult = await queryable.query(`
        SELECT category_id, normalized_alias
        FROM category_aliases
        ORDER BY id
    `);
    const productsResult = await queryable.query(`
        SELECT id, category, categories, store_id
        FROM products
        ORDER BY id
    `);
    const linksResult = await queryable.query(`
        SELECT product_id, category_id, is_primary
        FROM product_categories
        ORDER BY product_id, category_id
    `);
    const storeResult = await queryable.query(`
        SELECT id
        FROM stores
        WHERE LOWER(slug) = LOWER($1)
          AND deleted_at IS NULL
        ORDER BY id
        LIMIT 1
    `, [PLATFORM_STORE.slug]);

    return {
        categories: categoriesResult.rows,
        aliases: aliasesResult.rows,
        products: productsResult.rows,
        existingLinks: linksResult.rows,
        platformStoreId: storeResult.rows[0]?.id || null
    };
};

const buildBackfillPlan = async (queryable) => {
    const snapshot = await loadBackfillSnapshot(queryable);
    const categoryPlan = buildCategoryPlan(snapshot.categories, snapshot.aliases);
    const productPlan = buildProductPlan(snapshot.products, snapshot.existingLinks, categoryPlan);

    return {
        summary: {
            categories: snapshot.categories.length,
            categoryUpdates: categoryPlan.categoryUpdates.length,
            aliasesToCreate: categoryPlan.aliasesToCreate.length,
            statsRowsToEnsure: categoryPlan.statsCategoryIds.length,
            products: snapshot.products.length,
            productsWithoutStore: snapshot.products.filter((product) => !product.store_id).length,
            relationshipsToCreate: productPlan.relationships.length,
            alreadyMappedProducts: productPlan.alreadyMappedProducts.length,
            unmatchedProducts: productPlan.unmatchedProducts.length,
            ambiguousProducts: productPlan.ambiguousProducts.length,
            parentCategoryProducts: productPlan.parentCategoryProducts.length,
            needsReviewProducts: productPlan.needsReviewProducts.length,
            platformStoreExists: Boolean(snapshot.platformStoreId)
        },
        categoryUpdates: categoryPlan.categoryUpdates,
        aliasesToCreate: categoryPlan.aliasesToCreate,
        ambiguousCategoryNames: categoryPlan.ambiguousCategoryNames,
        aliasConflicts: categoryPlan.aliasConflicts,
        structuralIssues: categoryPlan.structuralIssues,
        statsCategoryIds: categoryPlan.statsCategoryIds,
        relationships: productPlan.relationships,
        alreadyMappedProducts: productPlan.alreadyMappedProducts,
        unmatchedProducts: productPlan.unmatchedProducts,
        ambiguousProducts: productPlan.ambiguousProducts,
        parentCategoryProducts: productPlan.parentCategoryProducts,
        needsReviewProducts: productPlan.needsReviewProducts
    };
};

const recalculateCategoryStats = async (queryable) => {
    await queryable.query(`
        WITH RECURSIVE category_tree AS (
            SELECT id AS ancestor_id, id AS descendant_id, 0 AS relation_depth
            FROM categories

            UNION ALL

            SELECT tree.ancestor_id, child.id, tree.relation_depth + 1
            FROM category_tree tree
            JOIN categories child ON child.parent_id = tree.descendant_id
        ),
        aggregate_counts AS (
            SELECT
                tree.ancestor_id AS category_id,
                COUNT(DISTINCT p.id) FILTER (
                    WHERE tree.relation_depth = 0
                      AND p.deleted_at IS NULL
                ) AS direct_product_count,
                COUNT(DISTINCT p.id) FILTER (
                    WHERE tree.relation_depth = 0
                      AND p.publication_status = 'active'
                      AND p.is_customer_visible = TRUE
                      AND p.deleted_at IS NULL
                ) AS visible_product_count,
                COUNT(DISTINCT p.id) FILTER (
                    WHERE tree.relation_depth = 0
                      AND p.publication_status = 'active'
                      AND p.is_customer_visible = TRUE
                      AND p.deleted_at IS NULL
                      AND p.stock > 0
                ) AS sellable_product_count,
                COUNT(DISTINCT p.id) FILTER (
                    WHERE tree.relation_depth > 0
                      AND p.publication_status = 'active'
                      AND p.is_customer_visible = TRUE
                      AND p.deleted_at IS NULL
                ) AS descendant_visible_product_count,
                COUNT(DISTINCT p.id) FILTER (
                    WHERE tree.relation_depth > 0
                      AND p.publication_status = 'active'
                      AND p.is_customer_visible = TRUE
                      AND p.deleted_at IS NULL
                      AND p.stock > 0
                ) AS descendant_sellable_product_count,
                COUNT(DISTINCT p.id) FILTER (
                    WHERE p.publication_status = 'active'
                      AND p.is_customer_visible = TRUE
                      AND p.deleted_at IS NULL
                ) AS subtree_visible_product_count,
                COUNT(DISTINCT p.id) FILTER (
                    WHERE p.publication_status = 'active'
                      AND p.is_customer_visible = TRUE
                      AND p.deleted_at IS NULL
                      AND p.stock > 0
                ) AS subtree_sellable_product_count
            FROM category_tree tree
            LEFT JOIN product_categories product_category
                ON product_category.category_id = tree.descendant_id
            LEFT JOIN products p
                ON p.id = product_category.product_id
            GROUP BY tree.ancestor_id
        )
        INSERT INTO category_stats (
            category_id,
            direct_product_count,
            visible_product_count,
            sellable_product_count,
            descendant_visible_product_count,
            descendant_sellable_product_count,
            subtree_visible_product_count,
            subtree_sellable_product_count,
            updated_at
        )
        SELECT
            category_id,
            direct_product_count,
            visible_product_count,
            sellable_product_count,
            descendant_visible_product_count,
            descendant_sellable_product_count,
            subtree_visible_product_count,
            subtree_sellable_product_count,
            CURRENT_TIMESTAMP
        FROM aggregate_counts
        ON CONFLICT (category_id) DO UPDATE
        SET direct_product_count = EXCLUDED.direct_product_count,
            visible_product_count = EXCLUDED.visible_product_count,
            sellable_product_count = EXCLUDED.sellable_product_count,
            descendant_visible_product_count = EXCLUDED.descendant_visible_product_count,
            descendant_sellable_product_count = EXCLUDED.descendant_sellable_product_count,
            subtree_visible_product_count = EXCLUDED.subtree_visible_product_count,
            subtree_sellable_product_count = EXCLUDED.subtree_sellable_product_count,
            updated_at = CURRENT_TIMESTAMP
    `);
};

const applyBackfillPlan = async (queryable, plan) => {
    if (plan.structuralIssues.length > 0) {
        const error = new Error('Category tree has structural issues; apply was refused.');
        error.code = 'CATEGORY_TREE_INVALID';
        error.issues = plan.structuralIssues;
        throw error;
    }
    if (plan.aliasConflicts.length > 0) {
        const error = new Error('Category aliases conflict with existing targets; apply was refused.');
        error.code = 'CATEGORY_ALIAS_CONFLICT';
        error.issues = plan.aliasConflicts;
        throw error;
    }

    const applied = {
        categoryUpdates: 0,
        aliasesCreated: 0,
        statsRowsEnsured: 0,
        storeAssignments: 0,
        relationshipsCreated: 0,
        platformStoreId: null
    };

    for (const category of plan.categoryUpdates) {
        const result = await queryable.query(
            `UPDATE categories
             SET slug = COALESCE(slug, $2),
                 path = COALESCE(path, $3),
                 depth = COALESCE(depth, $4),
                 revision = revision + 1,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $1`,
            [category.id, category.slug, category.path, category.depth]
        );
        applied.categoryUpdates += result.rowCount;
    }

    for (const alias of plan.aliasesToCreate) {
        const result = await queryable.query(
            `INSERT INTO category_aliases (
                category_id,
                alias,
                normalized_alias,
                alias_type,
                redirect_status
             )
             VALUES ($1, $2, $3, 'legacy_name', 301)
             ON CONFLICT DO NOTHING`,
            [alias.categoryId, alias.alias, alias.normalizedAlias]
        );
        applied.aliasesCreated += result.rowCount;
    }

    for (const categoryId of plan.statsCategoryIds) {
        const result = await queryable.query(
            `INSERT INTO category_stats (category_id)
             VALUES ($1)
             ON CONFLICT (category_id) DO NOTHING`,
            [categoryId]
        );
        applied.statsRowsEnsured += result.rowCount;
    }

    const existingStore = await queryable.query(
        `SELECT id
         FROM stores
         WHERE LOWER(slug) = LOWER($1)
           AND deleted_at IS NULL
         ORDER BY id
         LIMIT 1`,
        [PLATFORM_STORE.slug]
    );

    let platformStoreId = existingStore.rows[0]?.id || null;
    if (!platformStoreId) {
        const storeResult = await queryable.query(
            `INSERT INTO stores (name, slug, is_active)
             VALUES ($1, $2, TRUE)
             RETURNING id`,
            [PLATFORM_STORE.name, PLATFORM_STORE.slug]
        );
        platformStoreId = storeResult.rows[0].id;
    }
    applied.platformStoreId = Number(platformStoreId);

    const storeUpdate = await queryable.query(
        `UPDATE products
         SET store_id = $1,
             revision = revision + 1,
             updated_at = CURRENT_TIMESTAMP
         WHERE store_id IS NULL`,
        [platformStoreId]
    );
    applied.storeAssignments = storeUpdate.rowCount;

    for (const relationship of plan.relationships) {
        const result = await queryable.query(
            `INSERT INTO product_categories (product_id, category_id, is_primary)
             VALUES ($1, $2, $3)
             ON CONFLICT (product_id, category_id) DO NOTHING`,
            [relationship.productId, relationship.categoryId, relationship.isPrimary]
        );
        applied.relationshipsCreated += result.rowCount;
    }

    await recalculateCategoryStats(queryable);
    return applied;
};

const runCategoryV2Backfill = async (pool, { apply = false } = {}) => {
    if (!pool || typeof pool.connect !== 'function') {
        throw new TypeError('Category v2 backfill requires a PostgreSQL pool.');
    }

    if (!apply) {
        const plan = await buildBackfillPlan(pool);
        return { mode: 'dry-run', ...plan };
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query(`SELECT pg_advisory_xact_lock(hashtext('novastore-category-v2-backfill'))`);
        await client.query('LOCK TABLE categories, products, product_categories IN SHARE ROW EXCLUSIVE MODE');
        const plan = await buildBackfillPlan(client);
        const applied = await applyBackfillPlan(client, plan);
        await client.query('COMMIT');
        return { mode: 'apply', ...plan, applied };
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
};

module.exports = {
    PLATFORM_STORE,
    normalizeLegacyCategoryName,
    slugifyCategoryName,
    buildBackfillPlan,
    recalculateCategoryStats,
    runCategoryV2Backfill
};
