const {
    ADMIN_COMMERCE_CAPABILITY_DEFAULTS,
    getAdminCommerceCapabilities
} = require('./adminCommerceCapabilityService');
const { PLATFORM_STORE } = require('./categoryV2BackfillService');
const { getPaymentProviderCapability } = require('../config/paymentProviderConfig');

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

const SELLER_ENTITY_STATUSES = new Set(['active', 'suspended', 'closed']);

const positiveSafeIntegerOrNull = (value) => {
    if (value === null || value === undefined || value === '') return null;
    const normalized = Number(value);
    return Number.isSafeInteger(normalized) && normalized > 0 ? normalized : null;
};

const verifiedSellerBinding = (row) => {
    const bindingCount = Number(row.current_binding_count || 0);
    const sellerStoreId = positiveSafeIntegerOrNull(row.seller_store_id);
    const sellerOrganizationId = positiveSafeIntegerOrNull(row.seller_organization_id);
    const sellerStoreStatus = String(row.seller_store_status || '');
    const sellerOrganizationStatus = String(row.seller_organization_status || '');
    const sellerOrganizationName = String(row.seller_organization_name || '').trim();
    return bindingCount === 1
        && sellerStoreId !== null
        && sellerOrganizationId !== null
        && sellerOrganizationName.length > 0
        && SELLER_ENTITY_STATUSES.has(sellerStoreStatus)
        && SELLER_ENTITY_STATUSES.has(sellerOrganizationStatus);
};

const toAdminStoreSummary = (row) => {
    const ownershipVerified = verifiedSellerBinding(row);
    const operational = row.is_active === true
        && ownershipVerified
        && row.seller_store_status === 'active'
        && row.seller_store_closed_at === null
        && row.seller_organization_status === 'active'
        && row.seller_organization_closed_at === null;
    return Object.freeze({
        id: Number(row.id),
        storeName: String(row.store_name || ''),
        operationalStatus: operational ? 'active' : 'inactive',
        sellerStoreId: ownershipVerified ? Number(row.seller_store_id) : null,
        sellerStoreStatus: ownershipVerified ? String(row.seller_store_status) : null,
        sellerOrganizationId: ownershipVerified ? Number(row.seller_organization_id) : null,
        sellerOrganizationName: ownershipVerified ? String(row.seller_organization_name) : null,
        sellerOrganizationStatus: ownershipVerified ? String(row.seller_organization_status) : null,
        ownershipVerified,
        productCount: Number(row.product_count || 0),
        customerVisibleProductCount: Number(row.customer_visible_product_count || 0),
        createdAt: row.created_at || null,
        updatedAt: row.updated_at || null
    });
};

const toAdminStoreDetail = (row, categoryRows) => Object.freeze({
    ...toAdminStoreSummary(row),
    ownerName: row.owner_name ? String(row.owner_name) : null,
    catalogCategories: Object.freeze(categoryRows.map((category) => Object.freeze({
        id: Number(category.id),
        name: String(category.name || '')
    })))
});

const getAdminSession = (req, res) => {
    if (!req.currentAdmin) {
        return res.status(401).json({ error: 'Güncel yönetici oturumu gerekli.' });
    }
    return res.status(200).json({
        user: { ...req.currentAdmin },
        commerceMode: 'marketplace',
        paymentProvider: getPaymentProviderCapability(),
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
                    o.tracking_no,
                    o.estimated_delivery_date,
                    o.updated_at,
                    COALESCE(item_projection.item_count, 0)::INT AS item_count,
                    COALESCE(item_projection.items, '[]'::JSONB) AS items,
                    COALESCE(seller_projection.seller_allocations, '[]'::JSONB) AS seller_allocations,
                    latest_payment.provider AS payment_provider,
                    latest_payment.payment_ref,
                    latest_payment.external_ref AS payment_external_ref,
                    CASE
                        WHEN latest_payment.status = 'FAILED' THEN 'PAYMENT_FAILED'
                        ELSE NULL
                    END AS payment_failure_reason,
                    latest_payment.updated_at AS payment_updated_at
                FROM orders o
                LEFT JOIN LATERAL (
                    SELECT
                        COUNT(*)::INT AS item_count,
                        JSONB_AGG(
                            JSONB_BUILD_OBJECT(
                                'product_id', item.product_id,
                                'name', item.product_name,
                                'quantity', item.quantity,
                                'unit_price', item.unit_price,
                                'line_total', item.total_price,
                                'store_id', product.store_id
                            )
                            ORDER BY item.source_item_index ASC NULLS LAST, item.id ASC
                        ) AS items
                    FROM order_items item
                    LEFT JOIN products product ON product.id = item.product_id
                    WHERE item.order_id = o.id
                ) item_projection ON TRUE
                LEFT JOIN LATERAL (
                    SELECT JSONB_AGG(
                        JSONB_BUILD_OBJECT(
                            'seller_order_id', seller_order.id,
                            'organization_id', seller_order.organization_id,
                            'organization_name', seller_organization.display_name,
                            'store_id', seller_order.store_id,
                            'store_name', seller_store.display_name,
                            'status', seller_order.status,
                            'currency', seller_order.currency,
                            'gross_amount', seller_order.gross_minor::NUMERIC / 100
                        )
                        ORDER BY seller_order.id ASC
                    ) AS seller_allocations
                    FROM seller_orders seller_order
                    JOIN seller_stores seller_store
                      ON seller_store.organization_id = seller_order.organization_id
                     AND seller_store.id = seller_order.store_id
                    JOIN seller_organizations seller_organization
                      ON seller_organization.id = seller_order.organization_id
                    WHERE seller_order.canonical_order_id = o.id
                ) seller_projection ON TRUE
                LEFT JOIN LATERAL (
                    SELECT
                        payment.provider,
                        payment.payment_ref,
                        payment.external_ref,
                        payment.status,
                        payment.updated_at
                    FROM payments payment
                    WHERE payment.order_id = o.id
                    ORDER BY payment.created_at DESC NULLS LAST, payment.id DESC
                    LIMIT 1
                ) latest_payment ON TRUE
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
                    p.sku,
                    p.brand,
                    p.product_type,
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
                    legacy_store.id AS store_id,
                    legacy_store.name AS store_name,
                    legacy_store.slug AS store_slug,
                    CASE
                        WHEN legacy_store.is_active IS NOT TRUE
                          OR legacy_store.deleted_at IS NOT NULL
                        THEN 'inactive'
                        WHEN LOWER(legacy_store.slug) = LOWER($1)
                          AND COALESCE(seller_binding.current_binding_count, 0) = 0
                        THEN 'active'
                        WHEN COALESCE(seller_binding.current_binding_count, 0) = 1
                          AND seller_binding.seller_store_status = 'active'
                          AND seller_binding.seller_store_closed_at IS NULL
                          AND seller_binding.seller_organization_status = 'active'
                          AND seller_binding.seller_organization_closed_at IS NULL
                        THEN 'active'
                        ELSE 'inactive'
                    END AS store_operational_status,
                    CASE
                        WHEN COALESCE(seller_binding.current_binding_count, 0) = 1
                        THEN seller_binding.seller_organization_id
                        ELSE NULL
                    END AS seller_organization_id,
                    CASE
                        WHEN COALESCE(seller_binding.current_binding_count, 0) = 1
                        THEN seller_binding.seller_organization_name
                        ELSE NULL
                    END AS seller_organization_name,
                    CASE
                        WHEN COALESCE(seller_binding.current_binding_count, 0) = 1
                        THEN seller_binding.seller_organization_status
                        ELSE NULL
                    END AS seller_organization_status,
                    COALESCE((
                        LOWER(legacy_store.slug) = LOWER($1)
                        AND COALESCE(seller_binding.current_binding_count, 0) = 0
                    ), FALSE) AS admin_editable,
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
                LEFT JOIN stores legacy_store ON legacy_store.id = p.store_id
                LEFT JOIN LATERAL (
                    SELECT
                        COUNT(*)::INT AS current_binding_count,
                        MIN(seller_store.organization_id) AS seller_organization_id,
                        MIN(seller_store.status) AS seller_store_status,
                        MIN(seller_store.closed_at) AS seller_store_closed_at,
                        MIN(seller_organization.display_name) AS seller_organization_name,
                        MIN(seller_organization.status) AS seller_organization_status,
                        MIN(seller_organization.closed_at) AS seller_organization_closed_at
                    FROM seller_stores seller_store
                    JOIN seller_organizations seller_organization
                      ON seller_organization.id = seller_store.organization_id
                    WHERE seller_store.legacy_store_id = p.store_id
                      AND seller_store.closed_at IS NULL
                ) seller_binding ON TRUE
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
            catalogMode: 'marketplace',
            mutationScope: 'first_party',
            ...toSummaryPage(result.rows, limit)
        });
    } catch (error) {
        console.error('Admin ürün özetleri hatası:', error.message);
        return res.status(500).json({ error: 'Ürün özetleri getirilemedi.' });
    }
};

const createGetAdminStoreSummaries = (database) => async (req, res) => {
    const limit = parseOrderSummaryLimit(req.query?.limit);

    try {
        const result = await database.query(
            `
                SELECT
                    store.id,
                    store.name AS store_name,
                    store.is_active,
                    store.created_at,
                    store.updated_at,
                    seller_binding.current_binding_count,
                    seller_binding.seller_store_id,
                    seller_binding.seller_store_status,
                    seller_binding.seller_store_closed_at,
                    seller_binding.seller_organization_id,
                    seller_binding.seller_organization_name,
                    seller_binding.seller_organization_status,
                    seller_binding.seller_organization_closed_at,
                    COUNT(product.id) FILTER (WHERE product.deleted_at IS NULL)::INT AS product_count,
                    COUNT(product.id) FILTER (
                        WHERE product.deleted_at IS NULL
                          AND product.publication_status = 'active'
                          AND product.is_customer_visible = TRUE
                    )::INT AS customer_visible_product_count
                FROM stores store
                LEFT JOIN LATERAL (
                    SELECT
                        COUNT(*)::INT AS current_binding_count,
                        MIN(seller_store.id) AS seller_store_id,
                        MIN(seller_store.status) AS seller_store_status,
                        MIN(seller_store.closed_at) AS seller_store_closed_at,
                        MIN(seller_organization.id) AS seller_organization_id,
                        MIN(seller_organization.display_name) AS seller_organization_name,
                        MIN(seller_organization.status) AS seller_organization_status,
                        MIN(seller_organization.closed_at) AS seller_organization_closed_at
                    FROM seller_stores seller_store
                    JOIN seller_organizations seller_organization
                      ON seller_organization.id = seller_store.organization_id
                    WHERE seller_store.legacy_store_id = store.id
                      AND seller_store.closed_at IS NULL
                ) seller_binding ON TRUE
                LEFT JOIN products product ON product.store_id = store.id
                WHERE store.deleted_at IS NULL
                  AND LOWER(store.slug) <> LOWER($1)
                GROUP BY
                    store.id,
                    seller_binding.current_binding_count,
                    seller_binding.seller_store_id,
                    seller_binding.seller_store_status,
                    seller_binding.seller_store_closed_at,
                    seller_binding.seller_organization_id,
                    seller_binding.seller_organization_name,
                    seller_binding.seller_organization_status,
                    seller_binding.seller_organization_closed_at
                ORDER BY store.created_at DESC NULLS LAST, store.id DESC
                LIMIT $2
            `,
            [PLATFORM_STORE.slug, limit + 1]
        );
        const summaries = result.rows.map(toAdminStoreSummary);
        return res.status(200).json(toSummaryPage(summaries, limit));
    } catch (_error) {
        console.error('Admin mağaza özetleri getirilemedi.');
        return res.status(500).json({ error: 'Mağaza özetleri getirilemedi.' });
    }
};

const parseAdminStoreId = (rawValue) => {
    const normalized = String(rawValue ?? '').trim();
    if (!/^[1-9]\d*$/.test(normalized)) return null;
    const id = Number(normalized);
    return Number.isSafeInteger(id) ? id : null;
};

const createGetAdminStoreDetail = (database) => async (req, res) => {
    const storeId = parseAdminStoreId(req.params?.id);
    if (!storeId) return res.status(400).json({ error: 'Geçerli bir mağaza kimliği gerekli.' });

    try {
        const storeResult = await database.query(
            `
                SELECT
                    store.id,
                    store.name AS store_name,
                    store.is_active,
                    store.created_at,
                    store.updated_at,
                    COALESCE(owner.full_name, owner.name) AS owner_name,
                    seller_binding.current_binding_count,
                    seller_binding.seller_store_id,
                    seller_binding.seller_store_status,
                    seller_binding.seller_store_closed_at,
                    seller_binding.seller_organization_id,
                    seller_binding.seller_organization_name,
                    seller_binding.seller_organization_status,
                    seller_binding.seller_organization_closed_at,
                    COUNT(product.id) FILTER (WHERE product.deleted_at IS NULL)::INT AS product_count,
                    COUNT(product.id) FILTER (
                        WHERE product.deleted_at IS NULL
                          AND product.publication_status = 'active'
                          AND product.is_customer_visible = TRUE
                    )::INT AS customer_visible_product_count
                FROM stores store
                LEFT JOIN users owner ON owner.id = store.owner_user_id
                LEFT JOIN LATERAL (
                    SELECT
                        COUNT(*)::INT AS current_binding_count,
                        MIN(seller_store.id) AS seller_store_id,
                        MIN(seller_store.status) AS seller_store_status,
                        MIN(seller_store.closed_at) AS seller_store_closed_at,
                        MIN(seller_organization.id) AS seller_organization_id,
                        MIN(seller_organization.display_name) AS seller_organization_name,
                        MIN(seller_organization.status) AS seller_organization_status,
                        MIN(seller_organization.closed_at) AS seller_organization_closed_at
                    FROM seller_stores seller_store
                    JOIN seller_organizations seller_organization
                      ON seller_organization.id = seller_store.organization_id
                    WHERE seller_store.legacy_store_id = store.id
                      AND seller_store.closed_at IS NULL
                ) seller_binding ON TRUE
                LEFT JOIN products product ON product.store_id = store.id
                WHERE store.id = $1
                  AND store.deleted_at IS NULL
                  AND LOWER(store.slug) <> LOWER($2)
                GROUP BY
                    store.id,
                    owner.full_name,
                    owner.name,
                    seller_binding.current_binding_count,
                    seller_binding.seller_store_id,
                    seller_binding.seller_store_status,
                    seller_binding.seller_store_closed_at,
                    seller_binding.seller_organization_id,
                    seller_binding.seller_organization_name,
                    seller_binding.seller_organization_status,
                    seller_binding.seller_organization_closed_at
            `,
            [storeId, PLATFORM_STORE.slug]
        );
        const store = storeResult.rows[0];
        if (!store) return res.status(404).json({ error: 'Mağaza kaydı bulunamadı.' });

        const categoriesResult = await database.query(
            `
                SELECT DISTINCT category.id, category.name
                FROM products product
                JOIN product_categories category_link ON category_link.product_id = product.id
                JOIN categories category ON category.id = category_link.category_id
                WHERE product.store_id = $1
                  AND product.deleted_at IS NULL
                  AND category.deleted_at IS NULL
                ORDER BY category.name ASC, category.id ASC
            `,
            [storeId]
        );
        return res.status(200).json(toAdminStoreDetail(store, categoriesResult.rows));
    } catch (_error) {
        console.error('Admin mağaza detayı getirilemedi.');
        return res.status(500).json({ error: 'Mağaza detayı getirilemedi.' });
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
                    r.revision,
                    r.decision_note,
                    r.decided_at,
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
                SELECT id, type, message, COALESCE(is_read, FALSE) AS is_read,
                       entity_type, entity_id, created_at
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
    createGetAdminStoreDetail,
    createGetAdminStoreSummaries,
    getAdminCommerceCapabilities,
    getAdminSession,
    parseOrderSummaryLimit,
    parseAdminStoreId,
    toAdminStoreDetail,
    toAdminStoreSummary,
    toSummaryPage
};
