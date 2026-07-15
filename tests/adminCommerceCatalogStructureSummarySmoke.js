const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const jwt = require('jsonwebtoken');
const { authenticate, requireAdmin } = require('../middlewares/authMiddleware');
const { privateNoStore } = require('../middlewares/privateNoStore');
const { createRequireCurrentAdmin } = require('../services/currentAdminGuard');
const { createGetAdminCatalogStructureSummary } = require('../services/adminCommerceReadService');

process.env.JWT_SECRET = 'commerce-pro-catalog-structure-smoke-secret';

const tokenFor = (payload) => jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });

const createResponse = () => ({
    statusCode: 200,
    payload: null,
    headers: {},
    status(code) {
        this.statusCode = code;
        return this;
    },
    json(value) {
        this.payload = value;
        return this;
    },
    setHeader(name, value) {
        this.headers[String(name).toLowerCase()] = String(value);
    }
});

const runChain = async (handlers, req) => {
    const res = createResponse();
    const dispatch = async (index) => {
        if (index >= handlers.length) return;
        let nextPromise = null;
        const next = () => {
            nextPromise = dispatch(index + 1);
            return nextPromise;
        };
        await handlers[index](req, res, next);
        if (nextPromise) await nextPromise;
    };
    await dispatch(0);
    return res;
};

const rowsFor = (sql, count = 101) => {
    if (/FROM categories category/i.test(sql)) {
        return Array.from({ length: count }, (_, index) => ({
            id: index + 1,
            name: `Kategori ${index + 1}`,
            slug: `kategori-${index + 1}`,
            path: `kategori-${index + 1}`,
            depth: 0,
            parent_id: null,
            sort_order: index,
            is_active: true,
            is_customer_visible: true,
            show_in_menu: true,
            show_on_home: false,
            hide_when_empty: true,
            deleted_at: null,
            revision: 1,
            child_count: 0,
            first_party_product_count: 2,
            attribute_template_count: 1
        }));
    }
    if (/FROM attribute_definitions definition/i.test(sql)) {
        return Array.from({ length: count }, (_, index) => ({
            id: index + 1,
            code: `ozellik_${index + 1}`,
            name: `Özellik ${index + 1}`,
            type: 'option',
            unit: null,
            is_filterable: true,
            is_required: false,
            is_variant_relevant: false,
            sort_order: index,
            is_active: true,
            revision: 1,
            option_count: 3,
            template_count: 2,
            first_party_value_count: 4
        }));
    }
    if (/FROM attribute_templates template/i.test(sql)) {
        return Array.from({ length: count }, (_, index) => ({
            id: index + 1,
            name: `Şablon ${index + 1}`,
            category_id: index + 1,
            category_name: `Kategori ${index + 1}`,
            category_path: `kategori-${index + 1}`,
            sort_order: index,
            is_active: true,
            revision: 1,
            attribute_count: 4,
            required_count: 2,
            filterable_count: 3
        }));
    }
    if (/FROM collections collection/i.test(sql)) {
        return Array.from({ length: count }, (_, index) => ({
            id: index + 1,
            name: `Koleksiyon ${index + 1}`,
            slug: `koleksiyon-${index + 1}`,
            collection_type: index % 2 === 0 ? 'manual' : 'dynamic',
            rule_code: index % 2 === 0 ? null : 'new_arrivals',
            sort_order: index,
            is_active: true,
            show_on_home: false,
            deleted_at: null,
            revision: 1,
            rule_count: index % 2,
            first_party_manual_product_count: index % 2 === 0 ? 5 : 0
        }));
    }
    if (/FROM menus menu/i.test(sql) && !/FROM menu_items menu_item/i.test(sql)) {
        return Array.from({ length: count }, (_, index) => ({
            id: index + 1,
            code: index % 2 === 0 ? 'main' : 'footer',
            name: `Menü ${index + 1}`,
            is_active: true,
            revision: 1,
            item_count: 6,
            active_item_count: 5,
            root_item_count: 2
        }));
    }
    if (/FROM menu_items menu_item/i.test(sql)) {
        return Array.from({ length: count }, (_, index) => ({
            id: index + 1,
            menu_id: 1,
            menu_code: 'main',
            parent_id: null,
            title: `Menü öğesi ${index + 1}`,
            target_type: 'category',
            category_id: index + 1,
            collection_id: null,
            has_internal_url: false,
            sort_order: index,
            is_active: true,
            revision: 1
        }));
    }
    throw new Error(`Beklenmeyen yapı sorgusu: ${sql}`);
};

const expectedKeys = Object.freeze({
    categories: [
        'attribute_template_count', 'child_count', 'deleted_at', 'depth', 'first_party_product_count',
        'hide_when_empty', 'id', 'is_active', 'is_customer_visible', 'name', 'parent_id', 'path',
        'revision', 'show_in_menu', 'show_on_home', 'slug', 'sort_order'
    ],
    attributeDefinitions: [
        'code', 'first_party_value_count', 'id', 'is_active', 'is_filterable', 'is_required',
        'is_variant_relevant', 'name', 'option_count', 'revision', 'sort_order', 'template_count', 'type', 'unit'
    ],
    attributeTemplates: [
        'attribute_count', 'category_id', 'category_name', 'category_path', 'filterable_count', 'id',
        'is_active', 'name', 'required_count', 'revision', 'sort_order'
    ],
    collections: [
        'collection_type', 'deleted_at', 'first_party_manual_product_count', 'id', 'is_active', 'name',
        'revision', 'rule_code', 'rule_count', 'show_on_home', 'slug', 'sort_order'
    ],
    menus: ['active_item_count', 'code', 'id', 'is_active', 'item_count', 'name', 'revision', 'root_item_count'],
    menuItems: [
        'category_id', 'collection_id', 'has_internal_url', 'id', 'is_active', 'menu_code', 'menu_id',
        'parent_id', 'revision', 'sort_order', 'target_type', 'title'
    ]
});

(async () => {
    const queries = [];
    const handler = createGetAdminCatalogStructureSummary({
        async query(sql, params) {
            queries.push({ sql, params });
            return { rows: rowsFor(sql) };
        }
    });
    const response = createResponse();
    await handler({ query: { limit: '100' } }, response);

    assert.equal(response.statusCode, 200);
    assert.equal(response.payload.catalogMode, 'first_party');
    assert.equal(response.payload.structureScope, 'shared_catalog');
    assert.equal(queries.length, 6);
    for (const [key, keys] of Object.entries(expectedKeys)) {
        assert.equal(response.payload[key].limit, 100);
        assert.equal(response.payload[key].items.length, 100);
        assert.equal(response.payload[key].hasMore, true);
        assert.deepEqual(Object.keys(response.payload[key].items[0]).sort(), [...keys].sort());
    }

    const categoryQuery = queries.find(({ sql }) => /FROM categories category/i.test(sql));
    const attributeQuery = queries.find(({ sql }) => /FROM attribute_definitions definition/i.test(sql));
    const templateQuery = queries.find(({ sql }) => /FROM attribute_templates template\s+JOIN categories category/i.test(sql));
    const collectionQuery = queries.find(({ sql }) => /FROM collections collection/i.test(sql));
    const menuQuery = queries.find(({ sql }) => /FROM menus menu/i.test(sql) && !/FROM menu_items menu_item/i.test(sql));
    const menuItemQuery = queries.find(({ sql }) => /FROM menu_items menu_item/i.test(sql));
    assert.deepEqual(categoryQuery.params, ['novastore-platform', 101]);
    assert.deepEqual(attributeQuery.params, ['novastore-platform', 101]);
    assert.deepEqual(collectionQuery.params, ['novastore-platform', 101]);
    assert.deepEqual(templateQuery.params, [101]);
    assert.deepEqual(menuQuery.params, [101]);
    assert.deepEqual(menuItemQuery.params, [101]);

    for (const { sql } of queries) {
        assert.doesNotMatch(sql, /\b(?:INSERT|UPDATE|DELETE|ALTER|DROP|CREATE|TRUNCATE)\b/i);
        const projection = sql.match(/SELECT([\s\S]*?)FROM\s+(?:categories|attribute_definitions|attribute_templates|collections|menus|menu_items)\b/i)?.[1] || '';
        assert.doesNotMatch(projection, /\bSELECT\s+\*|\b\w+\.\*/i, 'yapı özeti açık projection kullanmalı');
        assert.doesNotMatch(projection, /description|image_url|banner_url|seo_|validation_metadata/i);
    }
    for (const { sql } of [categoryQuery, attributeQuery, collectionQuery]) {
        assert.match(
            sql,
            /JOIN stores [\s\S]*LOWER\([^)]*\.slug\) = LOWER\(\$1\)[\s\S]*\.is_active = TRUE[\s\S]*\.deleted_at IS NULL/i,
            'ürün bağlantılı sayaçlar yalnız active/non-deleted platform store kapsamını kullanmalı'
        );
        assert.match(sql, /(?:linked_product|valued_product)\.deleted_at IS NULL/i, 'silinmiş ürünler yapı sayaçlarına girmemeli');
    }
    assert.match(menuItemQuery.sql, /\(menu_item\.internal_url IS NOT NULL\) AS has_internal_url/i);
    assert.doesNotMatch(menuItemQuery.sql, /menu_item\.internal_url\s*(?:,|AS\s+internal_url)/i);
    assert.match(templateQuery.sql, /COALESCE\(template_link\.is_required, definition\.is_required\)/i);
    assert.match(templateQuery.sql, /COALESCE\(template_link\.is_filterable, definition\.is_filterable\)/i);

    let structureQueryCount = 0;
    const guardedHandler = createGetAdminCatalogStructureSummary({
        async query(sql) {
            structureQueryCount += 1;
            return { rows: rowsFor(sql, 1) };
        }
    });
    const currentAdminGuard = createRequireCurrentAdmin({
        async query() {
            return { rows: [{ id: 17, role: 'admin' }] };
        }
    });
    const chain = [privateNoStore, authenticate, requireAdmin, currentAdminGuard, guardedHandler];

    const noToken = await runChain(chain, { headers: {}, query: { limit: '100' } });
    assert.equal(noToken.statusCode, 401);
    assert.equal(noToken.headers['cache-control'], 'private, no-store, max-age=0');
    assert.equal(structureQueryCount, 0);

    const customer = await runChain(chain, {
        headers: { authorization: `Bearer ${tokenFor({ id: 17, role: 'customer' })}` },
        query: { limit: '100' }
    });
    assert.equal(customer.statusCode, 403);
    assert.equal(structureQueryCount, 0);

    const validAdmin = await runChain(chain, {
        headers: { authorization: `Bearer ${tokenFor({ id: 17, role: 'admin' })}` },
        query: { limit: '100' }
    });
    assert.equal(validAdmin.statusCode, 200);
    assert.equal(validAdmin.headers['cache-control'], 'private, no-store, max-age=0');
    assert.equal(structureQueryCount, 6);

    const originalConsoleError = console.error;
    console.error = () => {};
    try {
        const failure = createGetAdminCatalogStructureSummary({
            async query() {
                throw new Error('structure unavailable');
            }
        });
        const failureResponse = createResponse();
        await failure({ query: { limit: '25' } }, failureResponse);
        assert.equal(failureResponse.statusCode, 500);
        assert.deepEqual(failureResponse.payload, { error: 'Katalog yapı özeti getirilemedi.' });
    } finally {
        console.error = originalConsoleError;
    }

    const routeSource = fs.readFileSync(path.join(__dirname, '..', 'routes', 'adminRoutes.js'), 'utf8');
    assert.match(routeSource, /integratedAdminRead = \[privateNoStore, authenticate, requireAdmin, requireCurrentAdmin\]/);
    assert.match(
        routeSource,
        /router\.get\('\/catalog\/structure\/summary', \.\.\.integratedAdminRead, getAdminCatalogStructureSummary\)/
    );

    console.log('admin Commerce Pro catalog structure summary smoke passed');
})().catch((error) => {
    console.error(error);
    process.exit(1);
});
