const {
    ADMIN_COMMERCE_CAPABILITY_DEFAULTS,
    getAdminCommerceCapabilities
} = require('./adminCommerceCapabilityService');
const { PLATFORM_STORE } = require('./categoryV2BackfillService');

const ADMIN_COMMERCE_CAPABILITIES = ADMIN_COMMERCE_CAPABILITY_DEFAULTS;

const parseOrderSummaryLimit = (rawValue) => {
    if (rawValue === undefined || rawValue === null || String(rawValue).trim() === '') return 50;
    const normalized = String(rawValue).trim();
    if (!/^-?\d+$/.test(normalized)) return 50;
    const parsed = Number(normalized);
    if (!Number.isSafeInteger(parsed)) return 50;
    return Math.min(Math.max(parsed, 1), 100);
};

const toSummaryPage = (rows, limit) => ({
    items: rows.slice(0, limit),
    limit,
    hasMore: rows.length > limit
});

const getAdminSession = (req, res) => {
    if (!req.currentAdmin) {
        return res.status(401).json({ error: 'Güncel yönetici oturumu gerekli.' });
    }
    return res.status(200).json({
        user: { ...req.currentAdmin },
        commerceMode: 'single_vendor',
        apiVersion: '2026-07-14',
        capabilities: getAdminCommerceCapabilities()
    });
};

const createGetAdminOrderSummaries = (database) => async (req, res) => {
    const limit = parseOrderSummaryLimit(req.query?.limit);

    try {
        const result = await database.query(
            `
                SELECT
                    o.id,
                    o.total_amount,
                    o.currency,
                    o.status,
                    o.customer_name,
                    o.email,
                    o.created_at,
                    o.payment_status,
                    o.refund_status,
                    o.shipment_status,
                    o.shipment_provider,
                    o.estimated_delivery_date,
                    CASE
                        WHEN jsonb_typeof(o.items) = 'array' THEN jsonb_array_length(o.items)
                        ELSE 0
                    END::INT AS item_count
                FROM orders o
                ORDER BY o.created_at DESC NULLS LAST, o.id DESC
                LIMIT $1
            `,
            [limit + 1]
        );
        return res.status(200).json(toSummaryPage(result.rows, limit));
    } catch (error) {
        console.error('Admin sipariş özetleri hatası:', error.message);
        return res.status(500).json({ error: 'Sipariş özetleri getirilemedi.' });
    }
};

const createGetAdminProductSummaries = (database) => async (req, res) => {
    const limit = parseOrderSummaryLimit(req.query?.limit);

    try {
        const result = await database.query(
            `
                SELECT
                    p.id,
                    p.name,
                    p.price,
                    p.old_price,
                    'TRY'::TEXT AS currency,
                    COALESCE(p.stock, 0)::INT AS stock,
                    p.publication_status,
                    p.is_customer_visible,
                    p.deleted_at,
                    p.created_at,
                    p.updated_at,
                    p.revision,
                    primary_category.id AS primary_category_id,
                    primary_category.name AS primary_category_name,
                    primary_category.path AS primary_category_path,
                    (
                        SELECT COUNT(*)::INT
                        FROM product_categories category_link
                        WHERE category_link.product_id = p.id
                    ) AS category_count,
                    EXISTS (
                        SELECT 1
                        FROM product_media media
                        WHERE media.product_id = p.id
                    ) AS has_media
                FROM products p
                INNER JOIN stores first_party_store
                    ON first_party_store.id = p.store_id
                   AND LOWER(first_party_store.slug) = LOWER($1)
                   AND first_party_store.is_active = TRUE
                   AND first_party_store.deleted_at IS NULL
                LEFT JOIN LATERAL (
                    SELECT category.id, category.name, category.path
                    FROM product_categories primary_link
                    JOIN categories category ON category.id = primary_link.category_id
                    WHERE primary_link.product_id = p.id
                      AND primary_link.is_primary = TRUE
                    ORDER BY category.id ASC
                    LIMIT 1
                ) primary_category ON TRUE
                ORDER BY p.id DESC
                LIMIT $2
            `,
            [PLATFORM_STORE.slug, limit + 1]
        );
        return res.status(200).json({
            catalogMode: 'first_party',
            ...toSummaryPage(result.rows, limit)
        });
    } catch (error) {
        console.error('Admin ürün özetleri hatası:', error.message);
        return res.status(500).json({ error: 'Ürün özetleri getirilemedi.' });
    }
};

const createGetAdminCatalogStructureSummary = (database) => async (req, res) => {
    const limit = parseOrderSummaryLimit(req.query?.limit);
    const storeSlug = PLATFORM_STORE.slug;

    try {
        const [
            categoriesResult,
            attributesResult,
            templatesResult,
            collectionsResult,
            menusResult,
            menuItemsResult
        ] = await Promise.all([
            database.query(
                `
                    SELECT
                        category.id,
                        category.name,
                        category.slug,
                        category.path,
                        category.depth,
                        category.parent_id,
                        category.sort_order,
                        category.is_active,
                        category.is_customer_visible,
                        category.show_in_menu,
                        category.show_on_home,
                        category.hide_when_empty,
                        category.deleted_at,
                        category.revision,
                        (
                            SELECT COUNT(*)::INT
                            FROM categories child
                            WHERE child.parent_id = category.id
                              AND child.deleted_at IS NULL
                        ) AS child_count,
                        (
                            SELECT COUNT(DISTINCT product_link.product_id)::INT
                            FROM product_categories product_link
                            JOIN products linked_product ON linked_product.id = product_link.product_id
                            JOIN stores product_store
                              ON product_store.id = linked_product.store_id
                             AND LOWER(product_store.slug) = LOWER($1)
                             AND product_store.is_active = TRUE
                             AND product_store.deleted_at IS NULL
                            WHERE product_link.category_id = category.id
                              AND linked_product.deleted_at IS NULL
                        ) AS first_party_product_count,
                        (
                            SELECT COUNT(*)::INT
                            FROM attribute_templates template
                            WHERE template.category_id = category.id
                        ) AS attribute_template_count
                    FROM categories category
                    ORDER BY category.deleted_at ASC NULLS FIRST,
                             category.path ASC NULLS LAST,
                             category.id ASC
                    LIMIT $2
                `,
                [storeSlug, limit + 1]
            ),
            database.query(
                `
                    SELECT
                        definition.id,
                        definition.code,
                        definition.name,
                        definition.type,
                        definition.unit,
                        definition.is_filterable,
                        definition.is_required,
                        definition.is_variant_relevant,
                        definition.sort_order,
                        definition.is_active,
                        definition.revision,
                        (
                            SELECT COUNT(*)::INT
                            FROM attribute_options option_item
                            WHERE option_item.attribute_id = definition.id
                        ) AS option_count,
                        (
                            SELECT COUNT(*)::INT
                            FROM template_attributes template_link
                            WHERE template_link.attribute_id = definition.id
                        ) AS template_count,
                        (
                            SELECT COUNT(DISTINCT value_item.product_id)::INT
                            FROM product_attribute_values value_item
                            JOIN products valued_product ON valued_product.id = value_item.product_id
                            JOIN stores value_store
                              ON value_store.id = valued_product.store_id
                             AND LOWER(value_store.slug) = LOWER($1)
                             AND value_store.is_active = TRUE
                             AND value_store.deleted_at IS NULL
                            WHERE value_item.attribute_id = definition.id
                              AND valued_product.deleted_at IS NULL
                        ) AS first_party_value_count
                    FROM attribute_definitions definition
                    ORDER BY definition.sort_order ASC, definition.id ASC
                    LIMIT $2
                `,
                [storeSlug, limit + 1]
            ),
            database.query(
                `
                    SELECT
                        template.id,
                        template.name,
                        template.category_id,
                        category.name AS category_name,
                        category.path AS category_path,
                        template.sort_order,
                        template.is_active,
                        template.revision,
                        COUNT(template_link.attribute_id)::INT AS attribute_count,
                        COUNT(template_link.attribute_id) FILTER (
                            WHERE COALESCE(template_link.is_required, definition.is_required) = TRUE
                        )::INT AS required_count,
                        COUNT(template_link.attribute_id) FILTER (
                            WHERE COALESCE(template_link.is_filterable, definition.is_filterable) = TRUE
                        )::INT AS filterable_count
                    FROM attribute_templates template
                    JOIN categories category ON category.id = template.category_id
                    LEFT JOIN template_attributes template_link ON template_link.template_id = template.id
                    LEFT JOIN attribute_definitions definition ON definition.id = template_link.attribute_id
                    GROUP BY template.id, category.name, category.path
                    ORDER BY template.sort_order ASC, template.id ASC
                    LIMIT $1
                `,
                [limit + 1]
            ),
            database.query(
                `
                    SELECT
                        collection.id,
                        collection.name,
                        collection.slug,
                        collection.collection_type,
                        collection.rule_code,
                        collection.sort_order,
                        collection.is_active,
                        collection.show_on_home,
                        collection.deleted_at,
                        collection.revision,
                        (
                            SELECT COUNT(*)::INT
                            FROM collection_rules collection_rule
                            WHERE collection_rule.collection_id = collection.id
                        ) AS rule_count,
                        (
                            SELECT COUNT(*)::INT
                            FROM collection_products collection_product
                            JOIN products linked_product ON linked_product.id = collection_product.product_id
                            JOIN stores product_store
                              ON product_store.id = linked_product.store_id
                             AND LOWER(product_store.slug) = LOWER($1)
                             AND product_store.is_active = TRUE
                             AND product_store.deleted_at IS NULL
                            WHERE collection_product.collection_id = collection.id
                              AND linked_product.deleted_at IS NULL
                        ) AS first_party_manual_product_count
                    FROM collections collection
                    ORDER BY collection.deleted_at ASC NULLS FIRST,
                             collection.sort_order ASC,
                             collection.id ASC
                    LIMIT $2
                `,
                [storeSlug, limit + 1]
            ),
            database.query(
                `
                    SELECT
                        menu.id,
                        menu.code,
                        menu.name,
                        menu.is_active,
                        menu.revision,
                        COUNT(menu_item.id)::INT AS item_count,
                        COUNT(menu_item.id) FILTER (WHERE menu_item.is_active = TRUE)::INT AS active_item_count,
                        COUNT(menu_item.id) FILTER (WHERE menu_item.parent_id IS NULL)::INT AS root_item_count
                    FROM menus menu
                    LEFT JOIN menu_items menu_item ON menu_item.menu_id = menu.id
                    GROUP BY menu.id
                    ORDER BY menu.code ASC, menu.id ASC
                    LIMIT $1
                `,
                [limit + 1]
            ),
            database.query(
                `
                    SELECT
                        menu_item.id,
                        menu_item.menu_id,
                        menu.code AS menu_code,
                        menu_item.parent_id,
                        menu_item.title,
                        menu_item.target_type,
                        menu_item.category_id,
                        menu_item.collection_id,
                        (menu_item.internal_url IS NOT NULL) AS has_internal_url,
                        menu_item.sort_order,
                        menu_item.is_active,
                        menu_item.revision
                    FROM menu_items menu_item
                    JOIN menus menu ON menu.id = menu_item.menu_id
                    ORDER BY menu.code ASC,
                             menu_item.parent_id ASC NULLS FIRST,
                             menu_item.sort_order ASC,
                             menu_item.id ASC
                    LIMIT $1
                `,
                [limit + 1]
            )
        ]);

        return res.status(200).json({
            catalogMode: 'first_party',
            structureScope: 'shared_catalog',
            categories: toSummaryPage(categoriesResult.rows, limit),
            attributeDefinitions: toSummaryPage(attributesResult.rows, limit),
            attributeTemplates: toSummaryPage(templatesResult.rows, limit),
            collections: toSummaryPage(collectionsResult.rows, limit),
            menus: toSummaryPage(menusResult.rows, limit),
            menuItems: toSummaryPage(menuItemsResult.rows, limit)
        });
    } catch (error) {
        console.error('Admin katalog yapı özeti hatası:', error.message);
        return res.status(500).json({ error: 'Katalog yapı özeti getirilemedi.' });
    }
};

const createGetAdminReturnSummaries = (database) => async (req, res) => {
    const limit = parseOrderSummaryLimit(req.query?.limit);

    try {
        const result = await database.query(
            `
                SELECT
                    r.id,
                    r.order_id,
                    r.reason_code,
                    r.status,
                    r.refund_amount,
                    r.created_at,
                    r.updated_at,
                    o.status AS order_status,
                    o.refund_status,
                    o.payment_status,
                    o.currency,
                    COALESCE(u.full_name, u.name, o.customer_name, 'Bilinmiyor') AS customer_name
                FROM returns r
                JOIN orders o ON o.id = r.order_id
                LEFT JOIN users u ON u.id = r.user_id
                ORDER BY
                    CASE r.status
                        WHEN 'REQUESTED' THEN 0
                        WHEN 'IN_REVIEW' THEN 1
                        WHEN 'APPROVED' THEN 2
                        WHEN 'COMPLETED' THEN 3
                        ELSE 4
                    END,
                    r.created_at DESC NULLS LAST,
                    r.id DESC
                LIMIT $1
            `,
            [limit + 1]
        );
        return res.status(200).json(toSummaryPage(result.rows, limit));
    } catch (error) {
        console.error('Admin iade özetleri hatası:', error.message);
        return res.status(500).json({ error: 'İade özetleri getirilemedi.' });
    }
};

const createGetAdminNotificationSummaries = (database) => async (req, res) => {
    const limit = parseOrderSummaryLimit(req.query?.limit);

    try {
        const result = await database.query(
            `
                SELECT id, type, message, COALESCE(is_read, FALSE) AS is_read, created_at
                FROM notifications
                WHERE user_id IS NULL
                ORDER BY created_at DESC NULLS LAST, id DESC
                LIMIT $1
            `,
            [limit + 1]
        );
        return res.status(200).json(toSummaryPage(result.rows, limit));
    } catch (error) {
        console.error('Admin bildirim özetleri hatası:', error.message);
        return res.status(500).json({ error: 'Bildirim özetleri getirilemedi.' });
    }
};

module.exports = {
    ADMIN_COMMERCE_CAPABILITIES,
    createGetAdminCatalogStructureSummary,
    createGetAdminNotificationSummaries,
    createGetAdminOrderSummaries,
    createGetAdminProductSummaries,
    createGetAdminReturnSummaries,
    getAdminCommerceCapabilities,
    getAdminSession,
    parseOrderSummaryLimit,
    toSummaryPage
};
