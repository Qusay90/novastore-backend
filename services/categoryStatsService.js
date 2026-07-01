const { recalculateCategoryStats } = require('./categoryV2BackfillService');

const normalizeIds = (values) => [...new Set(
    (Array.isArray(values) ? values : [values])
        .map(Number)
        .filter(Number.isInteger)
)];

const readCategoryStats = async (queryable) => {
    const result = await queryable.query(`
        SELECT category_id, direct_product_count, visible_product_count, sellable_product_count,
               descendant_visible_product_count, descendant_sellable_product_count,
               subtree_visible_product_count, subtree_sellable_product_count
        FROM category_stats
        ORDER BY category_id
    `);
    return result.rows.map((row) => Object.fromEntries(
        Object.entries(row).map(([key, value]) => [key, Number(value || 0)])
    ));
};

const recalculateAllCategoryStats = async (queryable) => {
    await recalculateCategoryStats(queryable);
    return readCategoryStats(queryable);
};

const syncCategoryStatsForProducts = async (queryable, productIds = [], previousCategoryIds = []) => {
    const ids = [...normalizeIds(productIds), ...normalizeIds(previousCategoryIds)];
    if (ids.length === 0) return [];
    // Correctness-first: distinct aggregation over the full tree prevents multi-leaf double counts.
    return recalculateAllCategoryStats(queryable);
};

const reconcileCategoryStats = async (queryable) => {
    const before = await readCategoryStats(queryable);
    const after = await recalculateAllCategoryStats(queryable);
    const beforeById = new Map(before.map((row) => [row.category_id, row]));
    const drift = after.filter((row) =>
        JSON.stringify(beforeById.get(row.category_id) || null) !== JSON.stringify(row)
    );
    return { drift, stats: after };
};

module.exports = {
    readCategoryStats,
    recalculateAllCategoryStats,
    syncCategoryStatsForProducts,
    reconcileCategoryStats
};
