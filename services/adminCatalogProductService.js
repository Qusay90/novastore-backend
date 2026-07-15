const { PLATFORM_STORE } = require('./categoryV2BackfillService');
const {
    ProductCategoryValidationError,
    getProductCategoryLinks,
    syncProductCategoryAssignments,
    assertProductCategoryPublicationReady
} = require('./productCategoryService');
const {
    getProductAttributeValues,
    validateProductAttributes,
    syncProductAttributeValues
} = require('./productAttributeService');
const { syncCategoryStatsForProducts } = require('./categoryStatsService');
const { AdminCatalogMutationError } = require('./adminCatalogMutationPolicy');
const { executeAdminCatalogMutation } = require('./adminCatalogMutationService');
const {
    normalizeProductId,
    normalizeCreateProductPayload,
    normalizeUpdateProductPayload,
    normalizeArchiveProductPayload
} = require('./adminCatalogProductPolicy');

const CATALOG_MODE = 'first_party';
const CURRENCY = 'TRY';
const AUDIT_METADATA = Object.freeze({
    source: 'admin-commerce-pro',
    catalog_mode: CATALOG_MODE
});

const productNotFound = () => new AdminCatalogMutationError('Katalog kaydı bulunamadı.', {
    code: 'ADMIN_CATALOG_ENTITY_NOT_FOUND',
    statusCode: 404
});

const platformStoreUnavailable = () => new AdminCatalogMutationError(
    'Birinci taraf katalog mağazası kullanılamıyor.',
    {
        code: 'ADMIN_CATALOG_PLATFORM_STORE_UNAVAILABLE',
        statusCode: 503
    }
);

const alreadyArchived = () => new AdminCatalogMutationError('Ürün zaten arşivlenmiş.', {
    code: 'ADMIN_CATALOG_PRODUCT_ALREADY_ARCHIVED',
    statusCode: 409,
    details: Object.freeze({ refetchRequired: true })
});

const toNumberOrNull = (value) => value === null || value === undefined ? null : Number(value);

const toProductDetail = (row, categoryRows, attributes) => Object.freeze({
    id: Number(row.id),
    name: row.name,
    description: row.description ?? '',
    price: Number(row.price),
    old_price: toNumberOrNull(row.old_price),
    currency: CURRENCY,
    stock: Number(row.stock || 0),
    publication_status: row.publication_status,
    is_customer_visible: row.is_customer_visible === true,
    deleted_at: row.deleted_at ?? null,
    created_at: row.created_at ?? null,
    updated_at: row.updated_at ?? null,
    revision: Number(row.revision),
    has_media: row.has_media === true,
    category_ids: Object.freeze(categoryRows.map((category) => Number(category.id))),
    primary_category_id: (() => {
        const primary = categoryRows.find((category) => category.is_primary === true);
        return primary ? Number(primary.id) : null;
    })(),
    categories: Object.freeze(categoryRows.map((category) => Object.freeze({
        id: Number(category.id),
        name: category.name,
        path: category.path || category.name || '',
        is_primary: category.is_primary === true
    }))),
    attributes: Object.freeze(attributes.map((attribute) => Object.freeze({
        attribute_id: Number(attribute.attribute_id),
        code: attribute.code,
        name: attribute.name,
        type: attribute.type,
        unit: attribute.unit ?? null,
        is_required: attribute.is_required === true,
        is_filterable: attribute.is_filterable === true,
        is_variant_relevant: attribute.is_variant_relevant === true,
        value: attribute.value ?? null
    })))
});

const readAdminCatalogProductDetail = async (database, rawId) => {
    const id = normalizeProductId(rawId);
    const productResult = await database.query(
        `SELECT
             product.id,
             product.name,
             product.description,
             product.price,
             product.old_price,
             product.stock,
             product.publication_status,
             product.is_customer_visible,
             product.deleted_at,
             product.created_at,
             product.updated_at,
             product.revision,
             EXISTS (
                 SELECT 1
                 FROM product_media media
                 WHERE media.product_id = product.id
             ) AS has_media
         FROM products product
         JOIN stores first_party_store
           ON first_party_store.id = product.store_id
          AND LOWER(first_party_store.slug) = LOWER($1)
          AND first_party_store.is_active = TRUE
          AND first_party_store.deleted_at IS NULL
         WHERE product.id = $2`,
        [PLATFORM_STORE.slug, id]
    );
    if (!productResult.rows?.length) throw productNotFound();

    const categoriesResult = await database.query(
        `SELECT category.id, category.name, category.path, category_link.is_primary
         FROM product_categories category_link
         JOIN categories category ON category.id = category_link.category_id
         WHERE category_link.product_id = $1
         ORDER BY category_link.is_primary DESC, category.id ASC`,
        [id]
    );
    const attributes = await getProductAttributeValues(database, id);
    return Object.freeze({
        catalogMode: CATALOG_MODE,
        product: toProductDetail(productResult.rows[0], categoriesResult.rows || [], attributes)
    });
};

const toMutationEnvelope = (executed) => Object.freeze({
    catalogMode: CATALOG_MODE,
    product: Object.freeze({
        ...executed.result.product,
        revision: Number(executed.result.revision)
    })
});

const loadPlatformStore = async (client, { unavailableAsNotFound = false } = {}) => {
    const result = await client.query(
        `SELECT id
         FROM stores
         WHERE LOWER(slug) = LOWER($1)
           AND is_active = TRUE
           AND deleted_at IS NULL
         ORDER BY id ASC
         LIMIT 1
         FOR SHARE`,
        [PLATFORM_STORE.slug]
    );
    if (!result.rows?.length) {
        throw unavailableAsNotFound ? productNotFound() : platformStoreUnavailable();
    }
    return Object.freeze({ id: Number(result.rows[0].id) });
};

const loadFirstPartyProduct = async (client, id, storeId) => {
    const result = await client.query(
        `SELECT id, name, description, price, old_price, stock, category, categories,
                publication_status, is_customer_visible, deleted_at, revision
         FROM products
         WHERE id = $1 AND store_id = $2`,
        [id, storeId]
    );
    if (!result.rows?.length) throw productNotFound();
    return result.rows[0];
};

const authorizeFirstPartyProductTarget = async (client, current) => {
    const store = await loadPlatformStore(client, { unavailableAsNotFound: true });
    const product = await loadFirstPartyProduct(client, current.id, store.id);
    return Object.freeze({ store, product });
};

const loadValidLeafCategories = async (client, categoryIds, { requirePublishable = false } = {}) => {
    if (!categoryIds.length) return [];
    const result = await client.query(
        `SELECT category.id, category.name, category.path,
                category.is_active, category.is_customer_visible, category.deleted_at,
                EXISTS (
                    SELECT 1
                    FROM categories child
                    WHERE child.parent_id = category.id
                      AND child.deleted_at IS NULL
                ) AS has_children
         FROM categories category
         WHERE category.id = ANY($1::INTEGER[])
         ORDER BY category.id ASC`,
        [categoryIds]
    );
    const byId = new Map((result.rows || []).map((row) => [Number(row.id), row]));
    const invalidIds = categoryIds.filter((id) => {
        const category = byId.get(id);
        return !category
            || category.deleted_at
            || category.has_children === true
            || (requirePublishable && (
                category.is_active !== true || category.is_customer_visible !== true
            ));
    });
    if (invalidIds.length) {
        throw new ProductCategoryValidationError(
            requirePublishable
                ? 'Aktif ürün yalnızca aktif, görünür ve silinmemiş leaf kategorilere atanabilir.'
                : 'Ürün yalnızca silinmemiş leaf kategorilere atanabilir.',
            invalidIds
        );
    }
    return categoryIds.map((id) => byId.get(id));
};

const buildCategoryResolution = async (client, categoryIds, primaryCategoryId) => {
    const categories = await loadValidLeafCategories(client, categoryIds);
    const assignments = categoryIds.map((categoryId) => ({
        categoryId,
        isPrimary: categoryId === primaryCategoryId
    }));
    return Object.freeze({
        replace: true,
        assignments,
        categoryNames: categories.map((category) => category.name),
        warnings: Object.freeze([])
    });
};

const validateEffectiveCategories = async (client, publicationStatus, assignments) => {
    const ids = assignments.map((assignment) => assignment.categoryId);
    if (publicationStatus === 'active') {
        await loadValidLeafCategories(client, ids, { requirePublishable: true });
    }
    assertProductCategoryPublicationReady(publicationStatus, assignments);
};

const pruneProductAttributesOutsideTemplates = async (client, productId) => {
    await client.query(
        `DELETE FROM product_attribute_values value
         WHERE value.product_id = $1
           AND NOT EXISTS (
               SELECT 1
               FROM product_categories category_link
               JOIN attribute_templates template
                 ON template.category_id = category_link.category_id
                AND template.is_active = TRUE
               JOIN template_attributes template_link
                 ON template_link.template_id = template.id
                AND template_link.attribute_id = value.attribute_id
               JOIN attribute_definitions definition
                 ON definition.id = template_link.attribute_id
                AND definition.is_active = TRUE
               WHERE category_link.product_id = value.product_id
           )`,
        [productId]
    );
};

const validateAndSyncAttributes = async (
    client,
    { productId, categoryIds, attributes, publicationStatus }
) => {
    const existingValues = await getProductAttributeValues(client, productId);
    const validation = await validateProductAttributes(client, {
        categoryIds,
        body: attributes === undefined ? {} : { attributes },
        publicationStatus,
        existingValues
    });
    await syncProductAttributeValues(client, productId, validation);
};

const isArchivedProduct = (product) =>
    product.publication_status === 'archived' || product.deleted_at != null;

const hasMaterialProductChange = (current, changes) => {
    if (Object.prototype.hasOwnProperty.call(changes, 'category_ids')
        || Object.prototype.hasOwnProperty.call(changes, 'attributes')) return true;
    return Object.entries(changes).some(([field, value]) => {
        if (field === 'price' || field === 'old_price') {
            return toNumberOrNull(current[field]) !== toNumberOrNull(value);
        }
        if (field === 'stock') return Number(current.stock) !== value;
        if (field === 'description') return (current.description ?? null) !== value;
        return current[field] !== value;
    });
};

const createAdminCatalogProduct = async (database, { actor, body, requestId = null }) => {
    const payload = normalizeCreateProductPayload(body);
    const executed = await executeAdminCatalogMutation({
        database,
        actor,
        entityType: 'product',
        entityKey: null,
        action: 'create',
        changedFields: [
            'attributes', 'category_ids', 'description', 'is_customer_visible', 'name',
            'old_price', 'price', 'primary_category_id', 'publication_status', 'stock'
        ],
        requestId,
        metadata: AUDIT_METADATA,
        applyMutation: async (client) => {
            const store = await loadPlatformStore(client);
            const resolution = await buildCategoryResolution(
                client,
                payload.category_ids,
                payload.primary_category_id
            );
            await validateEffectiveCategories(client, payload.publication_status, resolution.assignments);
            const categoryNames = resolution.categoryNames;
            const insertResult = await client.query(
                `INSERT INTO products (
                     name, description, price, old_price, stock, category, categories,
                     publication_status, is_customer_visible, deleted_at, store_id
                 ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NULL,$10)
                 RETURNING id, revision`,
                [
                    payload.name,
                    payload.description,
                    payload.price,
                    payload.old_price,
                    payload.stock,
                    categoryNames[0] || 'Kategorisiz',
                    categoryNames.length ? categoryNames : ['Kategorisiz'],
                    payload.publication_status,
                    payload.is_customer_visible,
                    store.id
                ]
            );
            if (!insertResult.rows?.length
                || (insertResult.rowCount !== undefined && insertResult.rowCount !== 1)) {
                throw new AdminCatalogMutationError('Ürün oluşturulamadı.', {
                    code: 'ADMIN_CATALOG_PRODUCT_CREATE_FAILED',
                    statusCode: 500
                });
            }
            const product = insertResult.rows[0];
            const categorySync = await syncProductCategoryAssignments(
                client,
                Number(product.id),
                resolution
            );
            await validateAndSyncAttributes(client, {
                productId: Number(product.id),
                categoryIds: payload.category_ids,
                attributes: payload.attributes,
                publicationStatus: payload.publication_status
            });
            await syncCategoryStatsForProducts(
                client,
                [Number(product.id)],
                categorySync.previous.map((item) => item.categoryId)
            );
            const detail = await readAdminCatalogProductDetail(client, Number(product.id));
            return {
                id: Number(product.id),
                revision: Number(product.revision),
                product: detail.product
            };
        }
    });
    return toMutationEnvelope(executed);
};

const updateAdminCatalogProduct = async (database, rawId, { actor, body, requestId = null }) => {
    const id = normalizeProductId(rawId);
    const payload = normalizeUpdateProductPayload(body);
    const executed = await executeAdminCatalogMutation({
        database,
        actor,
        entityType: 'product',
        entityKey: String(id),
        action: 'update',
        expectedRevision: payload.expected_revision,
        changedFields: payload.changed_fields,
        requestId,
        metadata: AUDIT_METADATA,
        authorizeLockedTarget: authorizeFirstPartyProductTarget,
        applyMutation: async (client, { targetScope }) => {
            const { store, product: current } = targetScope;
            if (isArchivedProduct(current)) throw alreadyArchived();
            if (!hasMaterialProductChange(current, payload.changes)) {
                throw new AdminCatalogMutationError('Ürün güncellemesi gerçek bir değişiklik içermiyor.', {
                    code: 'ADMIN_CATALOG_PRODUCT_UPDATE_NOOP',
                    statusCode: 400
                });
            }

            const hasCategoryChange = Object.prototype.hasOwnProperty.call(payload.changes, 'category_ids');
            const currentAssignments = await getProductCategoryLinks(client, id);
            const resolution = hasCategoryChange
                ? await buildCategoryResolution(
                    client,
                    payload.changes.category_ids,
                    payload.changes.primary_category_id
                )
                : null;
            const effectiveAssignments = resolution?.assignments || currentAssignments;
            const effectiveStatus = payload.changes.publication_status ?? current.publication_status;
            await validateEffectiveCategories(client, effectiveStatus, effectiveAssignments);

            const categoryNames = resolution?.categoryNames || current.categories || [current.category || 'Kategorisiz'];
            const updateResult = await client.query(
                `UPDATE products
                 SET name = $1,
                     description = $2,
                     price = $3,
                     old_price = $4,
                     stock = $5,
                     category = $6,
                     categories = $7,
                     publication_status = $8,
                     is_customer_visible = $9,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE id = $10 AND store_id = $11
                 RETURNING id`,
                [
                    payload.changes.name ?? current.name,
                    Object.prototype.hasOwnProperty.call(payload.changes, 'description')
                        ? payload.changes.description
                        : current.description,
                    payload.changes.price ?? current.price,
                    Object.prototype.hasOwnProperty.call(payload.changes, 'old_price')
                        ? payload.changes.old_price
                        : current.old_price,
                    payload.changes.stock ?? current.stock,
                    categoryNames[0] || 'Kategorisiz',
                    categoryNames.length ? categoryNames : ['Kategorisiz'],
                    effectiveStatus,
                    payload.changes.is_customer_visible ?? current.is_customer_visible,
                    id,
                    store.id
                ]
            );
            if (!updateResult.rows?.length
                || Number(updateResult.rows[0].id) !== id
                || (updateResult.rowCount !== undefined && updateResult.rowCount !== 1)) {
                throw productNotFound();
            }

            const categorySync = resolution
                ? await syncProductCategoryAssignments(client, id, resolution)
                : { previous: currentAssignments, current: currentAssignments };
            if (resolution) await pruneProductAttributesOutsideTemplates(client, id);
            await validateAndSyncAttributes(client, {
                productId: id,
                categoryIds: effectiveAssignments.map((item) => item.categoryId),
                attributes: payload.changes.attributes,
                publicationStatus: effectiveStatus
            });
            await syncCategoryStatsForProducts(
                client,
                [id],
                categorySync.previous.map((item) => item.categoryId)
            );
            const detail = await readAdminCatalogProductDetail(client, id);
            return { id, product: detail.product };
        }
    });
    return toMutationEnvelope(executed);
};

const archiveAdminCatalogProduct = async (database, rawId, { actor, body, requestId = null }) => {
    const id = normalizeProductId(rawId);
    const payload = normalizeArchiveProductPayload(body);
    const executed = await executeAdminCatalogMutation({
        database,
        actor,
        entityType: 'product',
        entityKey: String(id),
        action: 'archive',
        expectedRevision: payload.expected_revision,
        changedFields: ['deleted_at', 'is_customer_visible', 'publication_status'],
        requestId,
        metadata: AUDIT_METADATA,
        authorizeLockedTarget: authorizeFirstPartyProductTarget,
        applyMutation: async (client, { targetScope }) => {
            const { store, product: current } = targetScope;
            if (isArchivedProduct(current)) throw alreadyArchived();
            const categoryLinks = await getProductCategoryLinks(client, id);
            const archiveResult = await client.query(
                `UPDATE products
                 SET publication_status = 'archived',
                     is_customer_visible = FALSE,
                     deleted_at = CURRENT_TIMESTAMP,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE id = $1 AND store_id = $2
                 RETURNING id`,
                [id, store.id]
            );
            if (!archiveResult.rows?.length
                || Number(archiveResult.rows[0].id) !== id
                || (archiveResult.rowCount !== undefined && archiveResult.rowCount !== 1)) {
                throw productNotFound();
            }
            await syncCategoryStatsForProducts(
                client,
                [id],
                categoryLinks.map((item) => item.categoryId)
            );
            const detail = await readAdminCatalogProductDetail(client, id);
            return { id, product: detail.product };
        }
    });
    return toMutationEnvelope(executed);
};

module.exports = {
    CATALOG_MODE,
    readAdminCatalogProductDetail,
    createAdminCatalogProduct,
    updateAdminCatalogProduct,
    archiveAdminCatalogProduct,
    pruneProductAttributesOutsideTemplates,
    toProductDetail
};
