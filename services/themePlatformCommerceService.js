'use strict';

// Presentation binds to canonical commerce. This module owns no price, stock,
// customer session, shared cart or order mutation authority.
const { buildPublicProductSqlPredicate } = require('../constants/productVisibility');
const { publicStoreSourceSql } = require('./publicCommerceEligibilityService');
const { ORDER_STATUS, PAYMENT_STATUS } = require('../constants/orderStatus');
const { maskFullName } = require('./privacyService');
const { loadPresentation } = require('./themePlatformPresentationService');
const fail = (code = 'RESOURCE_NOT_FOUND', statusCode = 404) => { throw Object.assign(new Error(code), { code, statusCode }); };
const id = (value) => {
    if (!['string', 'number'].includes(typeof value) || !/^[1-9]\d{0,9}$/u.test(String(value)) || Number(value) > 2147483647) fail('INVALID_REFERENCE', 400);
    return Number(value);
};
const uuid = (value) => {
    if (typeof value !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu.test(value)) fail('INVALID_REFERENCE', 400);
    return value;
};
const keys = (value, allowed) => {
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some((key) => !allowed.includes(key))) fail('INVALID_REQUEST', 400);
};
const projection = () => require('./publicStoreProjectionService');
const text = (value, max = 2000) => projection().customerText(value, max);
const mediaUrl = (value) => projection().customerMediaUrl(value);

function safeHost(input) {
    let value = input;
    if (input && typeof input === 'object') {
        const raw = input.rawHeaders;
        if (Array.isArray(raw) && raw.filter((entry, index) => index % 2 === 0 && String(entry).toLowerCase() === 'host').length !== 1) fail('INVALID_HOST', 400);
        value = input.headers?.host;
    }
    // Never derive tenant identity from forwarded headers, URL parameters or a
    // permissive URL parser (which may silently normalize hostile input).
    if (typeof value !== 'string' || value.length > 260 || value !== value.trim() || /[^a-zA-Z0-9.:[\]-]/u.test(value)) fail('INVALID_HOST', 400);
    const matched = /^(\[[0-9a-f:]+\]|[a-z0-9.-]+)(?::([0-9]{1,5}))?$/iu.exec(value);
    if (!matched || (matched[2] && (Number(matched[2]) < 1 || Number(matched[2]) > 65535))) fail('INVALID_HOST', 400);
    const host = matched[1].toLowerCase();
    if (host === '[::1]') return host;
    if (host.length > 253 || host.endsWith('.') || host.split('.').some((part) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u.test(part))) fail('INVALID_HOST', 400);
    return host;
}

const scopeSql = () => `SELECT s.id AS service_id,s.organization_id,s.store_id,
    ss.legacy_store_id,a.id AS assignment_id,a.channel,a.commerce_mode,a.status AS assignment_status,
    a.theme_version_id,v.document,v.digest,canonical.slug,canonical.display_name,
    canonical.description,canonical.shipping_policy,canonical.return_policy
    FROM seller_theme_services s
    JOIN seller_stores ss ON ss.id=s.store_id AND ss.organization_id=s.organization_id
    JOIN seller_organizations org ON org.id=s.organization_id
    JOIN theme_assignments a ON a.service_id=s.id AND a.organization_id=s.organization_id AND a.store_id=s.store_id
    JOIN theme_versions v ON v.id=a.theme_version_id
    JOIN themes t ON t.id=v.theme_id
    JOIN (${publicStoreSourceSql()}) canonical ON canonical.platform_store_id=ss.legacy_store_id`;
const activeScope = `s.status='ACTIVE' AND s.starts_at<=CURRENT_TIMESTAMP AND (s.expires_at IS NULL OR s.expires_at>CURRENT_TIMESTAMP)
    AND ss.status='active' AND ss.closed_at IS NULL AND org.status='active' AND org.closed_at IS NULL
    AND a.status<>'WITHDRAWN' AND v.status='PUBLISHED' AND t.status='ACTIVE'`;

async function resolveInternal(client, { service, assignment }) {
    const serviceId = uuid(service?.id || service?.service_id);
    const assignmentId = uuid(assignment?.id || assignment?.assignment_id);
    const rows = (await client.query(`${scopeSql()} WHERE s.id=$1 AND a.id=$2 AND ${activeScope}`, [serviceId, assignmentId])).rows;
    if (rows.length !== 1) fail();
    const scope = rows[0];
    for (const input of [service, assignment]) {
        if (input.organization_id !== undefined && String(input.organization_id) !== String(scope.organization_id)) fail();
        if (input.store_id !== undefined && String(input.store_id) !== String(scope.store_id)) fail();
        if (input.service_id !== undefined && input.service_id !== scope.service_id) fail();
    }
    if (assignment.channel !== undefined && assignment.channel !== scope.channel) fail();
    return scope;
}

async function resolvePublic(client, requestOrHost) {
    const host = safeHost(requestOrHost);
    const rows = (await client.query(`${scopeSql()}
        JOIN theme_domain_bindings binding ON binding.service_id=s.id AND binding.organization_id=s.organization_id
            AND binding.store_id=s.store_id AND binding.assignment_id=a.id
        WHERE binding.hostname=$1 AND binding.status='VERIFIED' AND binding.verified_at IS NOT NULL
            AND NULLIF(BTRIM(binding.verification_reference),'') IS NOT NULL
            AND binding.commerce_mode=a.commerce_mode AND a.commerce_mode='SINGLE_STORE'
            AND a.channel='web' AND a.status='ACCEPTED' AND ${activeScope}`, [host])).rows;
    if (rows.length !== 1) fail();
    return rows[0];
}

async function productRows(client, scope, productIds) {
    const selected = [...new Set(productIds.map(id))];
    if (!selected.length) return [];
    const rows = (await client.query(`SELECT p.id,p.name,p.description,p.price,p.old_price,p.stock,p.image_url,
        p.variant_selection_required,p.created_at,
        (SELECT AVG(r.rating) FROM reviews r WHERE r.product_id=p.id AND r.status='PUBLISHED') AS average_rating,
        (SELECT COUNT(*)::int FROM reviews r WHERE r.product_id=p.id AND r.status='PUBLISHED') AS review_count
        FROM products p WHERE p.store_id=$1 AND p.id=ANY($2::int[]) AND ${buildPublicProductSqlPredicate('p')}`,
    [scope.legacy_store_id, selected])).rows;
    if (rows.length !== selected.length) fail();
    return rows;
}

async function productsDto(client, rows) {
    if (!rows.length) return [];
    const media = (await client.query(`SELECT m.* FROM UNNEST($1::int[]) selected(id)
        CROSS JOIN LATERAL (SELECT * FROM product_media WHERE product_id=selected.id ORDER BY is_main DESC,sort_order,id LIMIT 20) m`,
    [rows.map((row) => row.id)])).rows;
    // Only the already-authorized product IDs participate. Respect the same
    // visible ancestor chain used by the scoped taxonomy endpoint.
    const links = (await client.query(`WITH RECURSIVE visible AS (
        SELECT id FROM categories WHERE parent_id IS NULL AND is_active AND is_customer_visible AND deleted_at IS NULL
        UNION SELECT c.id FROM categories c JOIN visible parent ON c.parent_id=parent.id
        WHERE c.is_active AND c.is_customer_visible AND c.deleted_at IS NULL
    ) SELECT pc.product_id,pc.category_id FROM product_categories pc JOIN visible ON visible.id=pc.category_id
        WHERE pc.product_id=ANY($1::int[]) ORDER BY pc.product_id,pc.category_id`, [rows.map((row) => row.id)])).rows;
    return rows.map((row) => ({ ...projection().toPublicProduct(row, media.filter((item) => String(item.product_id) === String(row.id))),
        category_ids: links.filter((item) => String(item.product_id) === String(row.id)).map((item) => Number(item.category_id)) }));
}

async function categories(client, scope) {
    // Recompute counts in the canonical store scope. Global category statistics
    // must never determine which taxonomy or counts a single-store tenant sees.
    const rows = (await client.query(`WITH RECURSIVE visible AS (
        SELECT c.id,c.parent_id,ARRAY[c.id] AS path_ids FROM categories c
        WHERE c.parent_id IS NULL AND c.is_active AND c.is_customer_visible AND c.deleted_at IS NULL
        UNION ALL SELECT c.id,c.parent_id,parent.path_ids||c.id FROM categories c JOIN visible parent ON c.parent_id=parent.id
        WHERE c.is_active AND c.is_customer_visible AND c.deleted_at IS NULL AND NOT c.id=ANY(parent.path_ids)
    ), counts AS (
        SELECT ancestor.id,COUNT(DISTINCT p.id)::int AS product_count
        FROM visible leaf CROSS JOIN LATERAL UNNEST(leaf.path_ids) ancestor(id)
        JOIN product_categories pc ON pc.category_id=leaf.id
        JOIN products p ON p.id=pc.product_id AND p.store_id=$1 AND ${buildPublicProductSqlPredicate('p')}
        GROUP BY ancestor.id
    ) SELECT c.id,c.name,c.slug,c.parent_id,c.image_url,c.icon,c.description,c.sort_order,counts.product_count
        FROM categories c JOIN counts ON counts.id=c.id ORDER BY c.sort_order,c.name,c.id`, [scope.legacy_store_id])).rows;
    return rows.map((row) => ({ id: Number(row.id), name: text(row.name, 240), slug: text(row.slug, 160), parent_id: row.parent_id === null ? null : Number(row.parent_id),
        image_url: mediaUrl(row.image_url), description: text(row.description), product_count: row.product_count }));
}

function collectionClause(collection, params) {
    if (collection.collection_type === 'manual') return `EXISTS(SELECT 1 FROM collection_products cp WHERE cp.product_id=p.id AND cp.collection_id=$${params.push(collection.id)})`;
    if (collection.collection_type !== 'dynamic') fail();
    if (collection.rule_code === 'new_arrivals') return "p.created_at>=CURRENT_TIMESTAMP-INTERVAL '30 days'";
    if (collection.rule_code === 'discount') return 'p.old_price IS NOT NULL AND p.old_price>p.price';
    if (collection.rule_code === 'best_sellers') return `EXISTS(SELECT 1 FROM order_items oi JOIN orders o ON o.id=oi.order_id
        WHERE oi.product_id=p.id AND o.status=$${params.push(ORDER_STATUS.TESLIM_EDILDI)} AND o.payment_status=$${params.push(PAYMENT_STATUS.PAID)}
        AND o.created_at>=CURRENT_TIMESTAMP-INTERVAL '30 days')`;
    fail();
}

async function collectionRow(client, scope, collectionId) {
    const row = (await client.query('SELECT id,name,slug,description,image_url,collection_type,rule_code FROM collections WHERE id=$1 AND is_active AND deleted_at IS NULL', [id(collectionId)])).rows[0];
    if (!row) fail();
    const params = [scope.legacy_store_id];
    const clause = collectionClause(row, params);
    if (!(await client.query(`SELECT p.id FROM products p WHERE p.store_id=$1 AND ${buildPublicProductSqlPredicate('p')} AND ${clause} LIMIT 1`, params)).rows.length) fail();
    return row;
}
const collectionDto = (row) => ({ id: Number(row.id), name: text(row.name, 240), slug: text(row.slug, 160), description: text(row.description), image_url: mediaUrl(row.image_url) });

async function collections(client, scope) {
    const rows = (await client.query('SELECT id,name,slug,description,image_url,collection_type,rule_code FROM collections WHERE is_active AND deleted_at IS NULL ORDER BY sort_order,id LIMIT 200')).rows;
    const result = [];
    for (const row of rows) {
        const params = [scope.legacy_store_id];
        let clause;
        try { clause = collectionClause(row, params); } catch (_) { continue; }
        if ((await client.query(`SELECT p.id FROM products p WHERE p.store_id=$1 AND ${buildPublicProductSqlPredicate('p')} AND ${clause} LIMIT 1`, params)).rows.length) result.push(collectionDto(row));
    }
    return result;
}

async function listProducts(client, scope, query = {}) {
    keys(query, ['q', 'categoryId', 'collectionId', 'sort', 'limit', 'offset']);
    const limit = query.limit === undefined ? 24 : id(query.limit), offset = query.offset === undefined ? 0 : Number(query.offset);
    if (limit > 100 || !Number.isSafeInteger(offset) || offset < 0 || offset > 10000) fail('INVALID_REQUEST', 400);
    const q = query.q ?? '';
    if (typeof q !== 'string' || q.length > 120 || /[\u0000-\u001f]/u.test(q)) fail('INVALID_REQUEST', 400);
    const orders = { newest: 'p.created_at DESC,p.id DESC', price_asc: 'p.price ASC,p.id', price_desc: 'p.price DESC,p.id', name: 'p.name,p.id' };
    const sort = query.sort ?? 'newest';
    if (!Object.hasOwn(orders, sort)) fail('INVALID_REQUEST', 400);
    const params = [scope.legacy_store_id], clauses = [];
    if (q.trim()) clauses.push(`p.name ILIKE $${params.push(`%${q.trim().replace(/[!%_]/gu, '!$&')}%`)} ESCAPE '!'`);
    if (query.categoryId !== undefined) {
        const categoryId = id(query.categoryId), visible = await categories(client, scope);
        if (!visible.some((item) => item.id === categoryId)) fail();
        const descendants = new Set([categoryId]);
        for (let i = 0; i < visible.length; i += 1) for (const row of visible) if (descendants.has(row.parent_id)) descendants.add(row.id);
        clauses.push(`EXISTS(SELECT 1 FROM product_categories pc WHERE pc.product_id=p.id AND pc.category_id=ANY($${params.push([...descendants])}::int[]))`);
    }
    if (query.collectionId !== undefined) clauses.push(collectionClause(await collectionRow(client, scope, query.collectionId), params));
    const predicate = `p.store_id=$1 AND ${buildPublicProductSqlPredicate('p')}${clauses.length ? ` AND ${clauses.join(' AND ')}` : ''}`;
    const total = (await client.query(`SELECT COUNT(*)::int AS n FROM products p WHERE ${predicate}`, params)).rows[0].n;
    const rows = (await client.query(`SELECT p.id FROM products p WHERE ${predicate} ORDER BY ${orders[sort]} LIMIT $${params.push(limit)} OFFSET $${params.push(offset)}`, params)).rows;
    const fetched = await productRows(client, scope, rows.map((row) => row.id));
    const byId = new Map(fetched.map((row) => [Number(row.id), row]));
    return { products: await productsDto(client, rows.map((row) => byId.get(Number(row.id)))), pagination: { limit, offset, total } };
}

async function validateNavigation(client, scope, navigation, document) {
    let visibleCategories, visibleCollections;
    for (const item of navigation) {
        let target = typeof item === 'string' ? item : item?.target;
        if (typeof target !== 'string' || target.length > 200) fail('INVALID_NAVIGATION', 400);
        if (document?.schemaVersion === 2) {
            if (['', 'home', 'categories', 'search', 'cart', 'account', 'support', 'favorites'].includes(target)) continue;
            const page = /^page:([a-z0-9_-]+)$/u.exec(target);
            if (page) {
                if (!document.studio?.pages?.some((row) => row.id === page[1] && row.enabled !== false)) fail();
                continue;
            }
            const native = /^(product|category|collection|android-product|android-category):([1-9]\d{0,9})$/u.exec(target);
            if (native) target = `/${native[1].replace('android-', '')}/${native[2]}`;
        }
        if (/^\/(?:home|shop|account|cart|help)$/u.test(target)) continue;
        const matched = /^\/(product|category|collection)\/([a-z0-9-]+)$/u.exec(target);
        if (!matched) fail('INVALID_NAVIGATION', 400);
        if (matched[1] === 'product') await productRows(client, scope, [id(matched[2])]);
        if (matched[1] === 'category') {
            visibleCategories ||= await categories(client, scope);
            if (!visibleCategories.some((row) => row.slug === matched[2] || String(row.id) === matched[2])) fail();
        }
        if (matched[1] === 'collection') {
            visibleCollections ||= await collections(client, scope);
            if (!visibleCollections.some((row) => row.slug === matched[2] || String(row.id) === matched[2])) fail();
        }
    }
}

function documentReferences(document, referenceAdapter) {
    let references;
    if (document?.schemaVersion === 1 && Array.isArray(document.components)) {
        references = { productIds: [], categoryIds: [], collectionIds: [], variants: [], navigation: [], assetIds: [...(document.assetIds || [])] };
        for (const component of document.components) {
            const props = component.props || {};
            for (const key of ['productIds', 'categoryIds', 'collectionIds']) if (props[key] !== undefined) {
                if (!Array.isArray(props[key])) fail('INVALID_REFERENCE', 400);
                references[key].push(...props[key]);
            }
            if (props.target) references.navigation.push({ target: props.target });
            if (props.imageAssetId) references.assetIds.push(props.imageAssetId);
            if (props.variants !== undefined) {
                if (!Array.isArray(props.variants)) fail('INVALID_REFERENCE', 400);
                references.variants.push(...props.variants);
            }
        }
    } else {
        if (typeof referenceAdapter !== 'function') fail('THEME_REFERENCE_ADAPTER_REQUIRED', 409);
        references = referenceAdapter(document);
    }
    keys(references, ['productIds', 'categoryIds', 'collectionIds', 'variants', 'navigation', 'assetIds']);
    for (const key of ['productIds', 'categoryIds', 'collectionIds', 'variants', 'navigation', 'assetIds']) {
        if (references[key] === undefined) references[key] = [];
        if (!Array.isArray(references[key]) || references[key].length > 500) fail('INVALID_REFERENCE', 400);
    }
    return references;
}

async function validateDocumentReferences(client, { service, assignment, document, referenceAdapter }) {
    const scope = await resolveInternal(client, { service, assignment });
    return validateScopedReferences(client, scope, document, referenceAdapter);
}

// Only the authenticated offer composer may call this before an assignment
// exists. All scope is re-derived from the locked service and published version;
// no browser-created assignment identifier is invented or accepted here.
async function validateCandidateDocumentReferences(client, { service, candidate, assignment, document, referenceAdapter }) {
    const scope = await resolveCandidate(client, { service, candidate: candidate || assignment });
    return validateScopedReferences(client, scope, document, referenceAdapter);
}

async function resolveCandidate(client, { service, candidate: input }) {
    keys(input, ['theme_version_id', 'channel', 'commerce_mode']);
    if (!['web', 'app'].includes(input.channel) || !['MARKETPLACE', 'SINGLE_STORE'].includes(input.commerce_mode)) fail('INVALID_REFERENCE', 400);
    const rows = (await client.query(`SELECT s.id AS service_id,s.organization_id,s.store_id,ss.legacy_store_id,$3::text AS channel,$4::text AS commerce_mode,
        v.id AS theme_version_id,canonical.slug,canonical.display_name,canonical.description,canonical.shipping_policy,canonical.return_policy
        FROM seller_theme_services s JOIN seller_stores ss ON ss.id=s.store_id AND ss.organization_id=s.organization_id
        JOIN seller_organizations org ON org.id=s.organization_id
        JOIN theme_versions v ON v.id=$2 JOIN themes t ON t.id=v.theme_id
        JOIN (${publicStoreSourceSql()}) canonical ON canonical.platform_store_id=ss.legacy_store_id
        WHERE s.id=$1 AND s.status='ACTIVE' AND s.starts_at<=CURRENT_TIMESTAMP AND (s.expires_at IS NULL OR s.expires_at>CURRENT_TIMESTAMP)
        AND ss.status='active' AND ss.closed_at IS NULL AND org.status='active' AND org.closed_at IS NULL AND v.status='PUBLISHED' AND t.status='ACTIVE'`,
    [uuid(service?.id || service?.service_id), uuid(input.theme_version_id), input.channel, input.commerce_mode])).rows;
    if (rows.length !== 1) fail();
    const scope = rows[0];
    if (service.organization_id !== undefined && String(service.organization_id) !== String(scope.organization_id)) fail();
    if (service.store_id !== undefined && String(service.store_id) !== String(scope.store_id)) fail();
    return scope;
}

async function validateScopedReferences(client, scope, document, referenceAdapter) {
    const references = documentReferences(document, referenceAdapter);
    await productRows(client, scope, references.productIds);
    const visibleCategories = references.categoryIds.length ? await categories(client, scope) : [];
    for (const categoryId of references.categoryIds) if (!visibleCategories.some((row) => row.id === id(categoryId))) fail();
    for (const collectionId of references.collectionIds) await collectionRow(client, scope, collectionId);
    for (const variant of references.variants) {
        keys(variant, ['productId', 'variantId']);
        await productRows(client, scope, [variant.productId]);
        try { await require('./purchasableVariantService').resolve(client, id(variant.productId), id(variant.variantId)); } catch (_) { fail(); }
    }
    await validateNavigation(client, scope, references.navigation, document);
    const assets = [...new Set(references.assetIds.map(uuid))];
    if (assets.length) {
        const rows = (await client.query(`SELECT id FROM theme_assets WHERE id=ANY($1::uuid[]) AND service_id=$2
            AND organization_id=$3 AND store_id=$4 AND status='READY'`, [assets, scope.service_id, scope.organization_id, scope.store_id])).rows;
        if (rows.length !== assets.length) fail();
    }
    return { validated: true, commerceMode: scope.commerce_mode, productCount: references.productIds.length,
        categoryCount: references.categoryIds.length, collectionCount: references.collectionIds.length, variantCount: references.variants.length, assetCount: assets.length };
}

async function preview(client, { service, assignment, query = {} }) {
    const scope = await resolveInternal(client, { service, assignment });
    return snapshot(client, scope, query);
}

async function previewCandidate(client, { service, candidate, query = {} }) {
    const scope = await resolveCandidate(client, { service, candidate });
    return snapshot(client, scope, query);
}

async function authenticatedPreviewScope(client, { service, assignment, candidate }) {
    // Authentication is the caller's responsibility; ambiguity cannot fall back
    // from an invalid assignment to a candidate with wider scope.
    if (Boolean(assignment) === Boolean(candidate)) fail('INVALID_REFERENCE', 400);
    return assignment ? resolveInternal(client, { service, assignment }) : resolveCandidate(client, { service, candidate });
}

async function authenticatedProductPreview(client, { service, assignment, candidate, productId }) {
    const scope = await authenticatedPreviewScope(client, { service, assignment, candidate });
    const product = await productDetail(client, scope, productId);
    const reviews = (await reputation(client, scope, productId, 'reviews')).reviews;
    const questions = (await reputation(client, scope, productId, 'questions')).questions;
    const related = await listProducts(client, scope, { limit: 13 });
    return { product, reviews, questions, recommendations: related.products.filter((row) => row.id !== id(productId)).slice(0, 12) };
}

async function authenticatedQuotePreview(client, { service, assignment, candidate, body }) {
    const scope = await authenticatedPreviewScope(client, { service, assignment, candidate });
    return quote(client, scope, body);
}

async function snapshot(client, scope, query) {
    const catalog = await listProducts(client, scope, query);
    const categoryRows = await categories(client, scope), collectionRows = await collections(client, scope);
    return { source: 'CANONICAL_PREVIEW', live: false, context: { commerceMode: scope.commerce_mode, presentation: await loadPresentation(client, scope.theme_version_id, scope.channel), store: await identity(client, scope),
        assignment: scope.assignment_id ? { id: scope.assignment_id, channel: scope.channel } : null,
        ...(scope.assignment_id ? {} : { candidate: { themeVersionId: scope.theme_version_id, channel: scope.channel } }),
        checkout: { enabled: false, reason: 'AUTHENTICATED_THEME_PREVIEW_READ_ONLY' } },
    ...catalog, categories: categoryRows, collections: collectionRows,
    navigation: categoryRows.map((row) => ({ label: row.name, target: `/category/${row.slug}` })) };
}

async function identity(client, scope) {
    const rows = (await client.query("SELECT * FROM seller_public_legal_identities WHERE organization_id=$1 AND status='approved'", [scope.organization_id])).rows;
    const legal = rows.length === 1 ? require('./sellerPublicLegalIdentityService').normalizeApprovedSellerPublicLegalIdentity(rows[0]) : null;
    const content=await require('./themePlatformStoreContentService').readPublicStoreContent(client,scope);
    const profile=content.storeIdentity;
    const contact=profile.revision?Object.fromEntries(['legalBusinessName','email','phone','address','city','region','country','supportEmail','supportPhone'].map(key=>[key,profile[key]])):null;
    return { slug: scope.slug, name: text(profile.displayName||scope.display_name, 160), description: text(scope.description),
        logo_url: profile.logoAssetId?`/api/theme-storefront/assets/${profile.logoAssetId}`:null, contact, social: profile.socialLinks,
        shipping_summary: text(profile.shippingSummary||scope.shipping_policy), return_summary: text(profile.returnSummary||scope.return_policy),
        legal_refs: legal ? [{ type: 'seller_public_legal_identity', locale: 'tr-TR', version: legal.version, content_sha256: legal.contentSha256,
            public_legal_name: legal.publicLegalName, public_trade_name: legal.publicTradeName, disclosure: legal.publicDisclosureText }] : [],
        legal_documents: content.legalReferences,
        legal_cms_status: content.missingLegalTypes.length?'STORE_LEGAL_CMS_REQUIRED':'APPROVED',
        legal_missing_types: content.missingLegalTypes };
}

async function productDetail(client, scope, productId) {
    const row = (await productRows(client, scope, [productId]))[0];
    const product = { ...(await productsDto(client, [row]))[0], description: text(row.description, 12000) };
    product.variants = row.variant_selection_required ? await require('./purchasableVariantService').publicVariants(client, row.id) : [];
    if (row.variant_selection_required) product.is_purchasable = product.variants.some((variant) => variant.purchasable);
    const links = (await client.query('SELECT category_id FROM product_categories WHERE product_id=$1', [row.id])).rows;
    product.categories = (await categories(client, scope)).filter((category) => links.some((link) => Number(link.category_id) === category.id));
    product.links = { reviews: `/api/theme-storefront/products/${row.id}/reviews`, questions: `/api/theme-storefront/products/${row.id}/questions`, recommendations: `/api/theme-storefront/products/${row.id}/recommendations` };
    return product;
}

async function reputation(client, scope, productId, type) {
    await productRows(client, scope, [productId]);
    if (type === 'reviews') {
        const rows = (await client.query(`SELECT r.id,r.rating,r.comment,r.created_at,COALESCE(u.full_name,u.name) AS public_name FROM reviews r
            LEFT JOIN users u ON u.id=r.user_id WHERE r.product_id=$1 AND r.status='PUBLISHED' ORDER BY r.created_at DESC,r.id DESC LIMIT 50`, [id(productId)])).rows;
        return { reviews: rows.map((row) => ({ id: Number(row.id), rating: Number(row.rating), comment: text(row.comment, 4000), created_at: row.created_at, full_name: maskFullName(row.public_name) })) };
    }
    const rows = (await client.query(`SELECT q.id,q.question,q.answer,q.created_at,q.answered_at,COALESCE(u.full_name,u.name) AS public_name FROM product_questions q
        LEFT JOIN users u ON u.id=q.user_id WHERE q.product_id=$1 AND NULLIF(BTRIM(q.answer),'') IS NOT NULL ORDER BY q.answered_at DESC NULLS LAST,q.id DESC LIMIT 50`, [id(productId)])).rows;
    return { questions: rows.map((row) => ({ id: Number(row.id), question: text(row.question, 4000), answer: text(row.answer, 4000), created_at: row.created_at, answered_at: row.answered_at, user_name: maskFullName(row.public_name) })) };
}

async function quote(client, scope, body) {
    keys(body, ['items', 'couponCode']);
    if (!Array.isArray(body.items) || !body.items.length || body.items.length > 50) fail('INVALID_CART', 400);
    if (body.couponCode !== undefined && body.couponCode !== null && (typeof body.couponCode !== 'string' || body.couponCode.length > 80)) fail('INVALID_CART', 400);
    const items = body.items.map((item) => {
        keys(item, ['productId', 'variantId', 'quantity']);
        if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 20) fail('INVALID_CART', 400);
        return { id: id(item.productId), quantity: item.quantity, ...(item.variantId === undefined ? {} : { variant_id: id(item.variantId) }) };
    });
    await productRows(client, scope, items.map((item) => item.id));
    // Variant identifiers must belong to the scoped product, including requests
    // which also carry a valid product from this store.
    for (const item of items) if (item.variant_id) {
        try { await require('./purchasableVariantService').resolve(client, item.id, item.variant_id); } catch (_) { fail(); }
    }
    let priced;
    try { priced = await require('./pricingService').calculatePricing({ cartItems: items, couponCode: body.couponCode, client, lockCoupon: false }); }
    catch (error) { fail(['VARIANT_REQUIRED', 'VARIANT_NOT_ALLOWED', 'VARIANT_STOCK_UNAVAILABLE'].includes(error.code) ? error.code : 'CART_NOT_PURCHASABLE', error.statusCode || 409); }
    return { items: priced.items.map((item) => ({ productId: item.id, variantId: item.variant_id ?? null, quantity: item.quantity, name: text(item.name, 240),
        price: item.price, old_price: item.old_price, line_total: item.line_total, image_url: mediaUrl(item.image), variant_selections: item.variant_selections ?? [] })),
        totals: priced.totals, coupon: { applied: priced.coupon.applied, code: priced.coupon.code, discountAmount: priced.coupon.discountAmount, reason: priced.coupon.reason },
        campaigns: priced.campaigns, checkout: { enabled: false, reason: 'CANONICAL_QUOTE_ONLY' }, inventoryReserved: false };
}

function createThemePlatformCommerceService({ database, referenceAdapter, customerRuntimeAuthority } = {}) {
    if (!database?.connect) throw new Error('Explicit database required');
    const read = async (requestOrHost, action) => {
        const client = await database.connect();
        try {
            await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
            const scope = await resolvePublic(client, requestOrHost);
            const result = await action(client, scope);
            await client.query('COMMIT');
            return result;
        } catch (error) { await client.query('ROLLBACK'); throw error; }
        finally { client.release(); }
    };
    return { read, resolveInternal, validateDocumentReferences: (client, args) => validateDocumentReferences(client, { ...args, referenceAdapter: args.referenceAdapter || referenceAdapter }),
        context: (req) => read(req, async (client, scope) => {
            const runtime=typeof customerRuntimeAuthority==='function'?await customerRuntimeAuthority(client,scope):{enabled:false,contractVersion:2,reason:'THEME_CUSTOMER_RUNTIME_DISABLED'};
            if(runtime.enabled&&(runtime.contractVersion!==2||Number(runtime.storeId)!==Number(scope.legacy_store_id)))fail('THEME_RUNTIME_SCOPE_INVALID',503);
            return {commerceMode:scope.commerce_mode,live:runtime.enabled===true,runtimeStatus:runtime.enabled?'LOCAL_PUBLISHED_CUSTOMER_RUNTIME':'VERIFIED_BINDING_PREVIEW_ONLY',
                presentation:await loadPresentation(client,scope.theme_version_id,scope.channel),store:await identity(client,scope),
                assignment:{id:scope.assignment_id,channel:scope.channel},customerRuntime:runtime,
                ...(runtime.enabled?{document:runtime.document}:{}),checkout:{enabled:false,reason:runtime.enabled?'THEME_PAYMENT_ACTIVATION_REQUIRED':'THEME_CUSTOMER_RUNTIME_DISABLED'}};
        }),
        products: (req, query) => read(req, (client, scope) => listProducts(client, scope, query)),
        product: (req, productId) => read(req, (client, scope) => productDetail(client, scope, productId)),
        categories: (req) => read(req, (client, scope) => categories(client, scope)),
        collections: (req) => read(req, (client, scope) => collections(client, scope)),
        collection: (req, collectionId, query) => read(req, async (client, scope) => ({ collection: collectionDto(await collectionRow(client, scope, collectionId)), ...await listProducts(client, scope, { ...query, collectionId }) })),
        navigation: (req) => read(req, async (client, scope) => ({ links: [{ label: 'Ana sayfa', target: '/home' }, { label: 'Ürünler', target: '/shop' },
            ...(await categories(client, scope)).map((row) => ({ label: row.name, target: `/category/${row.slug}` })), { label: 'Yardım', target: '/help' }] })),
        recommendations: (req, productId) => read(req, async (client, scope) => { await productRows(client, scope, [productId]); const result = await listProducts(client, scope, { limit: 13 }); return { products: result.products.filter((row) => row.id !== id(productId)).slice(0, 12) }; }),
        reputation: (req, productId, type) => read(req, (client, scope) => reputation(client, scope, productId, type)),
        quote: (req, body) => read(req, (client, scope) => quote(client, scope, body)),
        legal: (req, type) => read(req, async (client, scope) => {
            const content=await require('./themePlatformStoreContentService').readPublicStoreContent(client,scope);
            if(!type)return {documents:content.legalReferences};
            const document=content.documents.find(row=>row.type===type);
            if(!document)fail();
            return document;
        }),
        asset: (req, assetId, assetReader) => read(req, async (client, scope) => {
            const asset = (await client.query(`SELECT id FROM theme_assets WHERE id=$1 AND service_id=$2 AND organization_id=$3 AND store_id=$4 AND status='READY'`,
                [uuid(assetId), scope.service_id, scope.organization_id, scope.store_id])).rows[0];
            if (!asset) fail();
            return assetReader(client, scope, asset.id);
        }) };
}

function createThemeStorefrontHostGuard({ database, enabled = false, trustedPlatformHosts = [], storefrontPrefix = '/api/theme-storefront',servePublished } = {}) {
    const trusted = new Set(trustedPlatformHosts.map(safeHost));
    if (!/^\/api\/[a-z0-9/-]+$/u.test(storefrontPrefix)) throw new Error('Invalid storefront prefix');
    return async (req, res, next) => {
        if (!enabled) return next();
        try {
            const hostname = safeHost(req);
            if (trusted.has(hostname)) return next();
            const rows = (await database.query('SELECT commerce_mode FROM theme_domain_bindings WHERE hostname=$1', [hostname])).rows;
            if (rows.length !== 1) return res.status(421).json({ code: 'HOST_NOT_CONFIGURED' });
            // Express routes are case-insensitive by default. Apply the same
            // comparison here so /API/Products cannot bypass the tenant guard.
            const requestPath = String(req.path || String(req.url || '').split('?')[0]).toLowerCase();
            if (rows[0].commerce_mode !== 'SINGLE_STORE') return res.status(421).json({ code: 'HOST_NOT_CONFIGURED' });
            if (requestPath === storefrontPrefix || requestPath.startsWith(`${storefrontPrefix}/`)) return next();
            // No generic commerce/auth API escape hatch on a custom tenant host.
            // Authentication/checkout adapters require their own explicit gate.
            if (requestPath === '/api' || requestPath.startsWith('/api/')) return res.status(404).json({ code: 'RESOURCE_NOT_FOUND' });
            if(typeof servePublished==='function'&&['GET','HEAD'].includes(req.method))return servePublished(req,res);
            // A binding is not a published renderer. Never fall through to the
            // marketplace HTML or another store's legacy document routes.
            return res.status(503).json({ code: 'STOREFRONT_NOT_PUBLISHED' });
        } catch (error) { return res.status(error.statusCode || 503).json({ code: error.statusCode ? error.code : 'STOREFRONT_UNAVAILABLE' }); }
    };
}

module.exports = { createThemePlatformCommerceService, createThemeStorefrontHostGuard, validateDocumentReferences, validateCandidateDocumentReferences, documentReferences,
    safeHost, resolveInternal, resolvePublic, preview, previewCandidate, authenticatedProductPreview, authenticatedQuotePreview };
