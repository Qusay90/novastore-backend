const { MARKETPLACE_CATEGORY_TREE } = require('../data/marketplaceCategorySeed');
const {
    normalizeLegacyCategoryName,
    slugifyCategoryName
} = require('./categoryV2BackfillService');

const SEED_LOCK_KEY = 'novastore-marketplace-category-seed-v1';

const normalizeSeedSiblingName = (value) =>
    normalizeLegacyCategoryName(value)
        .replace(/\s*\.+$/g, '')
        .replace(/\s+/g, ' ')
        .trim();

class MarketplaceCategorySeedConflictError extends Error {
    constructor(report) {
        super(`Marketplace category seed has ${report.conflicts.length} conflict(s).`);
        this.name = 'MarketplaceCategorySeedConflictError';
        this.code = 'MARKETPLACE_CATEGORY_SEED_CONFLICT';
        this.report = report;
    }
}

const flattenTree = (tree = MARKETPLACE_CATEGORY_TREE) => {
    const flattened = [];

    const visit = (nodes, ancestors = [], parentKey = null) => {
        nodes.forEach((item, sortOrder) => {
            const key = [...ancestors.map((ancestor) => ancestor.name), item.name].join(' > ');
            const record = {
                key,
                parentKey,
                name: item.name,
                ancestors,
                sort_order: sortOrder,
                icon: item.icon || null,
                accent_color: item.accentColor || null
            };
            flattened.push(record);
            visit(item.children || [], [...ancestors, record], key);
        });
    };

    visit(tree);

    const recordsByBaseSlug = new Map();
    flattened.forEach((record) => {
        record.baseSlug = slugifyCategoryName(record.name);
        if (!recordsByBaseSlug.has(record.baseSlug)) recordsByBaseSlug.set(record.baseSlug, []);
        recordsByBaseSlug.get(record.baseSlug).push(record);
    });

    flattened.forEach((record) => {
        const group = recordsByBaseSlug.get(record.baseSlug);
        if (group.length === 1) {
            record.slug = record.baseSlug;
            return;
        }

        for (let ancestorCount = 1; ancestorCount <= record.ancestors.length; ancestorCount += 1) {
            const names = record.ancestors
                .slice(-ancestorCount)
                .map((ancestor) => ancestor.name)
                .concat(record.name);
            const candidate = slugifyCategoryName(names.join(' '));
            const collision = group.some((other) => {
                if (other === record || other.ancestors.length < ancestorCount) return false;
                const otherNames = other.ancestors
                    .slice(-ancestorCount)
                    .map((ancestor) => ancestor.name)
                    .concat(other.name);
                return slugifyCategoryName(otherNames.join(' ')) === candidate;
            });
            if (!collision) {
                record.slug = candidate;
                return;
            }
        }

        record.slug = slugifyCategoryName(
            record.ancestors.map((ancestor) => ancestor.name).concat(record.name).join(' ')
        );
    });

    const slugOwners = new Map();
    flattened.forEach((record) => {
        const owner = slugOwners.get(record.slug);
        if (owner) {
            throw new Error(`Seed data slug collision: ${owner.key} / ${record.key} -> ${record.slug}`);
        }
        slugOwners.set(record.slug, record);
        delete record.baseSlug;
    });

    const byKey = new Map();
    flattened.forEach((record) => {
        const parent = record.parentKey ? byKey.get(record.parentKey) : null;
        record.path = parent ? `${parent.path}/${record.slug}` : record.slug;
        record.depth = parent ? parent.depth + 1 : 0;
        record.description = `${record.name} kategorisindeki ürünleri NovaStore'da keşfedin.`;
        record.seo_title = `${record.name} | NovaStore`;
        record.seo_description =
            `${record.name} ürünlerini, seçeneklerini ve güncel marketplace fırsatlarını inceleyin.`;
        record.is_active = true;
        record.is_customer_visible = true;
        record.show_in_menu = true;
        record.show_on_home = record.depth === 0;
        record.hide_when_empty = true;
        byKey.set(record.key, record);
        delete record.ancestors;
    });

    return flattened;
};

const normalizeComparable = (value) => {
    if (value === undefined || value === null) return null;
    return value;
};

const mutableFields = Object.freeze([
    'name',
    'slug',
    'path',
    'depth',
    'sort_order',
    'is_active',
    'is_customer_visible',
    'show_in_menu',
    'show_on_home',
    'hide_when_empty',
    'description',
    'seo_title',
    'seo_description',
    'icon',
    'accent_color'
]);

const getChangedFields = (existing, record) => mutableFields.filter((field) =>
    normalizeComparable(existing[field]) !== normalizeComparable(record[field])
);

const createReport = (records, apply) => ({
    mode: apply ? 'apply' : 'dry-run',
    seed_version: 1,
    total_seed_categories: records.length,
    added: [],
    existing: [],
    updated: [],
    conflicts: [],
    skipped: [],
    aliases_created: 0,
    stats_created: 0
});

const loadCurrentState = async (queryable) => {
    const categoriesResult = await queryable.query(`
        SELECT
            id, name, parent_id, slug, path, depth, sort_order,
            is_active, is_customer_visible, show_in_menu, show_on_home,
            hide_when_empty, description, seo_title, seo_description,
            icon, accent_color, deleted_at
        FROM categories
        ORDER BY id
    `);
    const aliasesResult = await queryable.query(`
        SELECT category_id, normalized_alias
        FROM category_aliases
    `);
    const linkedParentsResult = await queryable.query(`
        SELECT DISTINCT category_id
        FROM product_categories
    `);

    return {
        categories: categoriesResult.rows,
        aliases: aliasesResult.rows,
        linkedParentIds: new Set(linkedParentsResult.rows.map((row) => Number(row.category_id)))
    };
};

const planOrApplySeed = async (queryable, { apply = false, tree = MARKETPLACE_CATEGORY_TREE } = {}) => {
    const records = flattenTree(tree);
    const report = createReport(records, apply);
    const current = await loadCurrentState(queryable);
    const categoryBySlug = new Map();
    const categoryBySiblingName = new Map();
    const aliasByNormalized = new Map();
    const resolvedByKey = new Map();
    let virtualId = -1;

    current.categories.forEach((category) => {
        if (category.slug) {
            categoryBySlug.set(String(category.slug).toLocaleLowerCase('tr-TR'), category);
        }
        const siblingKey = `${category.parent_id === null ? 'root' : Number(category.parent_id)}::` +
            normalizeSeedSiblingName(category.name);
        if (!categoryBySiblingName.has(siblingKey)) {
            categoryBySiblingName.set(siblingKey, category);
        }
    });
    current.aliases.forEach((alias) => {
        aliasByNormalized.set(
            normalizeLegacyCategoryName(alias.normalized_alias),
            Number(alias.category_id)
        );
    });

    for (const record of records) {
        const parent = record.parentKey ? resolvedByKey.get(record.parentKey) : null;
        if (record.parentKey && (!parent || parent.unavailable)) {
            report.skipped.push({
                key: record.key,
                slug: record.slug,
                reason: 'parent_unavailable'
            });
            resolvedByKey.set(record.key, { unavailable: true });
            continue;
        }

        const expectedParentId = parent ? Number(parent.id) : null;
        const existing = categoryBySlug.get(record.slug.toLocaleLowerCase('tr-TR'));
        const aliasOwnerId = aliasByNormalized.get(normalizeLegacyCategoryName(record.slug));
        const siblingKey = `${expectedParentId === null ? 'root' : expectedParentId}::` +
            normalizeSeedSiblingName(record.name);
        const sibling = categoryBySiblingName.get(siblingKey);

        const matched = existing || sibling || null;
        if (matched) {
            const matchedBySlug = Boolean(existing);
            const identityMatches =
                !matched.deleted_at &&
                normalizeSeedSiblingName(matched.name) === normalizeSeedSiblingName(record.name) &&
                (matched.parent_id === null ? null : Number(matched.parent_id)) === expectedParentId;

            if (!identityMatches || (aliasOwnerId && aliasOwnerId !== Number(matched.id))) {
                report.conflicts.push({
                    key: record.key,
                    slug: record.slug,
                    existing_category_id: Number(matched.id),
                    reason: matched.deleted_at
                        ? (matchedBySlug ? 'archived_slug_conflict' : 'archived_sibling_name_conflict')
                        : (matchedBySlug ? 'slug_identity_conflict' : 'sibling_slug_alias_conflict')
                });
                resolvedByKey.set(record.key, { unavailable: true });
                continue;
            }

            const changedFields = getChangedFields(matched, record);
            if (changedFields.length > 0) {
                if (apply) {
                    if (
                        matched.slug &&
                        String(matched.slug).toLocaleLowerCase('tr-TR') !== record.slug.toLocaleLowerCase('tr-TR')
                    ) {
                        const aliasResult = await queryable.query(
                            `INSERT INTO category_aliases (
                                category_id, alias, normalized_alias, alias_type, redirect_status
                             )
                             VALUES ($1, $2, $3, 'legacy_slug', 301)
                             ON CONFLICT DO NOTHING`,
                            [matched.id, matched.slug, normalizeLegacyCategoryName(matched.slug)]
                        );
                        report.aliases_created += aliasResult.rowCount;
                    }
                    await queryable.query(`
                        UPDATE categories SET
                            name=$2, slug=$3, path=$4, depth=$5, sort_order=$6,
                            is_active=$7, is_customer_visible=$8,
                            show_in_menu=$9, show_on_home=$10, hide_when_empty=$11,
                            description=$12, seo_title=$13, seo_description=$14,
                            icon=$15, accent_color=$16, updated_at=CURRENT_TIMESTAMP
                        WHERE id=$1
                    `, [
                        matched.id,
                        record.name,
                        record.slug,
                        record.path,
                        record.depth,
                        record.sort_order,
                        record.is_active,
                        record.is_customer_visible,
                        record.show_in_menu,
                        record.show_on_home,
                        record.hide_when_empty,
                        record.description,
                        record.seo_title,
                        record.seo_description,
                        record.icon,
                        record.accent_color
                    ]);
                }
                report.updated.push({
                    key: record.key,
                    id: Number(matched.id),
                    slug: record.slug,
                    fields: changedFields
                });
            } else {
                report.existing.push({
                    key: record.key,
                    id: Number(matched.id),
                    slug: record.slug
                });
            }

            if (apply) {
                const statsResult = await queryable.query(
                    `INSERT INTO category_stats (category_id)
                     VALUES ($1)
                     ON CONFLICT DO NOTHING
                     RETURNING category_id`,
                    [matched.id]
                );
                report.stats_created += statsResult.rowCount;
            }
            resolvedByKey.set(record.key, {
                id: Number(matched.id),
                path: record.path,
                depth: record.depth,
                existing: true
            });
            categoryBySlug.delete(String(matched.slug || '').toLocaleLowerCase('tr-TR'));
            categoryBySlug.set(record.slug.toLocaleLowerCase('tr-TR'), {
                ...matched,
                name: record.name,
                slug: record.slug,
                path: record.path,
                depth: record.depth
            });
            categoryBySiblingName.set(siblingKey, {
                ...matched,
                name: record.name,
                slug: record.slug,
                path: record.path,
                depth: record.depth
            });
            continue;
        }

        if (aliasOwnerId) {
            report.conflicts.push({
                key: record.key,
                slug: record.slug,
                existing_category_id: aliasOwnerId,
                reason: 'alias_slug_conflict'
            });
            resolvedByKey.set(record.key, { unavailable: true });
            continue;
        }

        if (parent?.existing && current.linkedParentIds.has(expectedParentId)) {
            report.conflicts.push({
                key: record.key,
                slug: record.slug,
                existing_category_id: expectedParentId,
                reason: 'parent_has_products'
            });
            resolvedByKey.set(record.key, { unavailable: true });
            continue;
        }

        let id = virtualId;
        if (apply) {
            const inserted = await queryable.query(`
                INSERT INTO categories (
                    name, parent_id, slug, path, depth, sort_order,
                    is_active, is_customer_visible, show_in_menu, show_on_home,
                    hide_when_empty, description, seo_title, seo_description,
                    icon, accent_color
                )
                VALUES (
                    $1,$2,$3,$4,$5,$6,
                    $7,$8,$9,$10,
                    $11,$12,$13,$14,
                    $15,$16
                )
                RETURNING id
            `, [
                record.name,
                expectedParentId,
                record.slug,
                record.path,
                record.depth,
                record.sort_order,
                record.is_active,
                record.is_customer_visible,
                record.show_in_menu,
                record.show_on_home,
                record.hide_when_empty,
                record.description,
                record.seo_title,
                record.seo_description,
                record.icon,
                record.accent_color
            ]);
            id = Number(inserted.rows[0].id);
            const statsResult = await queryable.query(
                'INSERT INTO category_stats (category_id) VALUES ($1) RETURNING category_id',
                [id]
            );
            report.stats_created += statsResult.rowCount;
        } else {
            virtualId -= 1;
        }

        report.added.push({
            key: record.key,
            id: apply ? id : null,
            slug: record.slug,
            path: record.path
        });
        resolvedByKey.set(record.key, {
            id,
            path: record.path,
            depth: record.depth,
            existing: false
        });
        categoryBySlug.set(record.slug.toLocaleLowerCase('tr-TR'), {
            id,
            name: record.name,
            parent_id: expectedParentId,
            slug: record.slug
        });
        categoryBySiblingName.set(siblingKey, {
            id,
            name: record.name,
            parent_id: expectedParentId,
            slug: record.slug
        });
    }

    return report;
};

const runMarketplaceCategorySeed = async (pool, { apply = false, tree } = {}) => {
    if (!pool || typeof pool.connect !== 'function') {
        throw new TypeError('Marketplace category seed requires a PostgreSQL pool.');
    }

    const client = await pool.connect();
    try {
        await client.query(apply
            ? 'BEGIN ISOLATION LEVEL SERIALIZABLE'
            : 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'
        );
        if (apply) {
            await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [SEED_LOCK_KEY]);
        }
        const report = await planOrApplySeed(client, { apply, tree });
        if (apply && report.conflicts.length > 0) {
            throw new MarketplaceCategorySeedConflictError(report);
        }
        await client.query(apply ? 'COMMIT' : 'ROLLBACK');
        return report;
    } catch (error) {
        try {
            await client.query('ROLLBACK');
        } catch (_) {
            // Preserve the original seed error.
        }
        throw error;
    } finally {
        client.release();
    }
};

module.exports = {
    SEED_LOCK_KEY,
    MarketplaceCategorySeedConflictError,
    normalizeSeedSiblingName,
    flattenTree,
    planOrApplySeed,
    runMarketplaceCategorySeed
};
