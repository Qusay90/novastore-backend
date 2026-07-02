const {
    MARKETPLACE_COLLECTIONS,
    MAIN_MENU_ITEMS
} = require('../data/marketplaceNavigationSeed');

class MarketplaceNavigationSeedConflictError extends Error {
    constructor(report) {
        super(`Marketplace navigation seed has ${report.conflicts.length} conflict(s).`);
        this.code = 'MARKETPLACE_NAVIGATION_SEED_CONFLICT';
        this.report = report;
    }
}

const normalize = (value) => String(value || '').trim().toLocaleLowerCase('tr-TR');

const makeReport = (apply) => ({
    mode: apply ? 'apply' : 'dry-run',
    total_collections: MARKETPLACE_COLLECTIONS.length,
    total_menus: 1,
    total_menu_items: MAIN_MENU_ITEMS.length,
    collections: { added: [], existing: [] },
    menus: { added: [], existing: [] },
    menu_items: { added: [], existing: [] },
    conflicts: []
});

const planOrApplyNavigationSeed = async (
    queryable,
    {
        apply = false,
        collections = MARKETPLACE_COLLECTIONS,
        menuItems = MAIN_MENU_ITEMS
    } = {}
) => {
    const report = makeReport(apply);
    report.total_collections = collections.length;
    report.total_menu_items = menuItems.length;
    const existingCollections = await queryable.query('SELECT * FROM collections ORDER BY id');
    const collectionBySlug = new Map(existingCollections.rows.map((row) => [normalize(row.slug), row]));
    const resolvedCollections = new Map();
    let virtualCollectionId = -1;

    for (const collection of collections) {
        const existing = collectionBySlug.get(normalize(collection.slug));
        if (existing && (
            existing.deleted_at ||
            existing.collection_type !== collection.collection_type ||
            (existing.rule_code || null) !== (collection.rule_code || null)
        )) {
            report.conflicts.push({
                entity: 'collection',
                slug: collection.slug,
                reason: existing.deleted_at ? 'archived_slug_conflict' : 'collection_identity_conflict'
            });
            continue;
        }
        let id = existing ? Number(existing.id) : virtualCollectionId--;
        if (!existing && apply) {
            const inserted = await queryable.query(`
                INSERT INTO collections (
                    name, slug, collection_type, rule_code, description,
                    sort_order, show_on_home, is_active
                )
                VALUES ($1,$2,$3,$4,$5,$6,$7,TRUE)
                RETURNING id
            `, [
                collection.name,
                collection.slug,
                collection.collection_type,
                collection.rule_code,
                `${collection.name} ürünlerini keşfedin.`,
                collection.sort_order,
                collection.show_on_home === true
            ]);
            id = Number(inserted.rows[0].id);
            if (collection.rule_code) {
                await queryable.query(`
                    INSERT INTO collection_rules (collection_id, rule_type, config)
                    VALUES ($1,$2,'{}'::JSONB)
                `, [id, collection.rule_code]);
            }
        } else if (existing && apply && collection.rule_code) {
            await queryable.query(`
                INSERT INTO collection_rules (collection_id, rule_type, config)
                VALUES ($1,$2,'{}'::JSONB)
                ON CONFLICT (collection_id, rule_type) DO NOTHING
            `, [id, collection.rule_code]);
        }
        report.collections[existing ? 'existing' : 'added'].push({
            slug: collection.slug,
            id: existing || apply ? id : null
        });
        resolvedCollections.set(collection.slug, id);
    }

    const categoryResult = await queryable.query(
        'SELECT id, slug FROM categories WHERE deleted_at IS NULL'
    );
    const categoryBySlug = new Map(categoryResult.rows.map((row) => [normalize(row.slug), Number(row.id)]));
    const menuResult = await queryable.query(`SELECT * FROM menus WHERE code='main' LIMIT 1`);
    const existingMenu = menuResult.rows[0] || null;
    let menuId = existingMenu ? Number(existingMenu.id) : -1;
    if (!existingMenu && apply) {
        const inserted = await queryable.query(`
            INSERT INTO menus (code, name, is_active)
            VALUES ('main', 'Ana Menü', TRUE)
            RETURNING id
        `);
        menuId = Number(inserted.rows[0].id);
    }
    report.menus[existingMenu ? 'existing' : 'added'].push({
        code: 'main',
        id: existingMenu || apply ? menuId : null
    });

    const existingItemsResult = existingMenu
        ? await queryable.query(
            'SELECT * FROM menu_items WHERE menu_id=$1 AND parent_id IS NULL',
            [menuId]
        )
        : { rows: [] };
    const itemByTitle = new Map(existingItemsResult.rows.map((row) => [normalize(row.title), row]));

    for (const item of menuItems) {
        const targetId = item.target_type === 'category'
            ? categoryBySlug.get(normalize(item.target_slug))
            : resolvedCollections.get(item.target_slug);
        if (!targetId) {
            report.conflicts.push({
                entity: 'menu_item',
                title: item.title,
                target_slug: item.target_slug,
                reason: 'target_not_found'
            });
            continue;
        }
        const existing = itemByTitle.get(normalize(item.title));
        const expectedCategoryId = item.target_type === 'category' ? targetId : null;
        const expectedCollectionId = item.target_type === 'collection' ? targetId : null;
        if (existing && (
            existing.target_type !== item.target_type ||
            (existing.category_id === null ? null : Number(existing.category_id)) !== expectedCategoryId ||
            (existing.collection_id === null ? null : Number(existing.collection_id)) !== expectedCollectionId
        )) {
            report.conflicts.push({
                entity: 'menu_item',
                title: item.title,
                reason: 'menu_item_identity_conflict'
            });
            continue;
        }
        if (!existing && apply) {
            await queryable.query(`
                INSERT INTO menu_items (
                    menu_id, parent_id, title, target_type,
                    category_id, collection_id, sort_order, is_active
                )
                VALUES ($1,NULL,$2,$3,$4,$5,$6,TRUE)
            `, [
                menuId,
                item.title,
                item.target_type,
                expectedCategoryId,
                expectedCollectionId,
                item.sort_order
            ]);
        }
        report.menu_items[existing ? 'existing' : 'added'].push({
            title: item.title,
            target_type: item.target_type,
            target_slug: item.target_slug
        });
    }

    return report;
};

const runMarketplaceNavigationSeed = async (pool, options = {}) => {
    const apply = options.apply === true;
    const client = await pool.connect();
    try {
        await client.query(apply
            ? 'BEGIN ISOLATION LEVEL SERIALIZABLE'
            : 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'
        );
        if (apply) {
            await client.query(
                `SELECT pg_advisory_xact_lock(hashtext('novastore-marketplace-navigation-seed-v1'))`
            );
        }
        const report = await planOrApplyNavigationSeed(client, { ...options, apply });
        if (apply && report.conflicts.length) {
            throw new MarketplaceNavigationSeedConflictError(report);
        }
        await client.query(apply ? 'COMMIT' : 'ROLLBACK');
        return report;
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
    } finally {
        client.release();
    }
};

module.exports = {
    MarketplaceNavigationSeedConflictError,
    planOrApplyNavigationSeed,
    runMarketplaceNavigationSeed
};
