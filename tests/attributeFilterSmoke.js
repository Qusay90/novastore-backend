const assert = require('assert');
const path = require('path');
const { spawn } = require('child_process');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const createCoreSchema = require('../models/createCoreDb');
const { applyAttributeSchema } = require('../models/attributeSchema');
const { resolveStartupSafety } = require('../config/startupSafety');

const root = path.join(__dirname, '..');
const port = 5203;
const jwtSecret = 'attribute-filter-smoke-only';
let child;

const waitForServer = () => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Attribute server startup timed out')), 30000);
    const onData = (chunk) => {
        if (chunk.toString().includes('NovaStore sunucusu')) {
            clearTimeout(timer);
            resolve();
        }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.once('exit', (code) => {
        clearTimeout(timer);
        reject(new Error(`Server exited before attribute smoke: ${code}`));
    });
});

const request = async (pathname, { method = 'GET', token = null, body } = {}) => {
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const response = await fetch(`http://127.0.0.1:${port}${pathname}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body)
    });
    const payload = await response.json();
    return { response, payload };
};

(async () => {
    const safety = resolveStartupSafety(process.env);
    assert.strictEqual(safety.safeLocalDatabase, true);
    assert.strictEqual(safety.target.database, 'novastore_category_v2_test');

    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await createCoreSchema();
    const legacyProduct = await pool.query(`
        INSERT INTO products (name,price,stock,category,categories,publication_status,is_customer_visible)
        VALUES ('Korunan Legacy',10,1,'Kategorisiz',ARRAY['Kategorisiz']::TEXT[],'draft',TRUE)
        RETURNING id
    `);
    await applyAttributeSchema(pool);
    await applyAttributeSchema(pool);
    const preserved = await pool.query('SELECT name FROM products WHERE id=$1', [legacyProduct.rows[0].id]);
    assert.strictEqual(preserved.rows[0].name, 'Korunan Legacy');

    const categoryResult = await pool.query(`
        INSERT INTO categories (
            name,slug,path,depth,sort_order,is_active,is_customer_visible,hide_when_empty
        ) VALUES
          ('Telefonlar','telefonlar','telefonlar',0,0,TRUE,TRUE,FALSE),
          ('Akıllı Telefon','akilli-telefon','telefonlar/akilli-telefon',1,0,TRUE,TRUE,FALSE),
          ('İş Telefonu','is-telefonu','telefonlar/is-telefonu',1,1,TRUE,TRUE,FALSE)
        RETURNING id,slug
    `);
    const categoryBySlug = new Map(categoryResult.rows.map((row) => [row.slug, Number(row.id)]));
    await pool.query('UPDATE categories SET parent_id=$1 WHERE slug IN ($2,$3)', [
        categoryBySlug.get('telefonlar'), 'akilli-telefon', 'is-telefonu'
    ]);

    child = spawn(process.execPath, ['server.js'], {
        cwd: root,
        env: {
            ...process.env,
            PORT: String(port),
            NODE_ENV: 'test',
            JWT_SECRET: jwtSecret,
            NOVASTORE_SAFE_LOCAL_BACKEND: 'true',
            SKIP_SCHEMA_INIT: 'true',
            NOVASTORE_ALLOW_SCHEMA_INIT: 'false',
            DB_SSL: 'false'
        },
        stdio: ['ignore', 'pipe', 'pipe']
    });
    await waitForServer();

    const adminToken = jwt.sign({ id: 1, role: 'admin' }, jwtSecret);
    const customerToken = jwt.sign({ id: 2, role: 'customer' }, jwtSecret);
    assert.strictEqual((await request('/api/admin/attributes')).response.status, 401);
    assert.strictEqual((await request('/api/admin/attributes', { token: customerToken })).response.status, 403);

    const createAttribute = async (body) => {
        const result = await request('/api/admin/attributes', {
            method: 'POST', token: adminToken, body
        });
        assert.strictEqual(result.response.status, 201, JSON.stringify(result.payload));
        return result.payload.attribute;
    };
    const brand = await createAttribute({
        code: 'brand', name: 'Marka', type: 'option',
        is_filterable: true, is_required: true
    });
    const ram = await createAttribute({
        code: 'ram_gb', name: 'RAM', type: 'number', unit: 'GB',
        is_filterable: true, is_required: true,
        validation_metadata: { min: 1, max: 64 }
    });
    const waterproof = await createAttribute({
        code: 'waterproof', name: 'Suya Dayanıklı', type: 'boolean', is_filterable: true
    });
    const colors = await createAttribute({
        code: 'colors', name: 'Renkler', type: 'multi_option', is_filterable: true
    });
    const warranty = await createAttribute({
        code: 'warranty_years', name: 'Garanti Aralığı', type: 'range', unit: 'yıl',
        is_filterable: true, validation_metadata: { min: 0, max: 10 }
    });
    const note = await createAttribute({
        code: 'private_note', name: 'Teknik Not', type: 'text', is_filterable: false
    });
    const noteUpdate = await request(`/api/admin/attributes/${note.id}`, {
        method: 'PATCH', token: adminToken, body: { name: 'Güvenli Teknik Not' }
    });
    assert.strictEqual(noteUpdate.response.status, 200);
    assert.strictEqual(noteUpdate.payload.attribute.name, 'Güvenli Teknik Not');
    const noteArchive = await request(`/api/admin/attributes/${note.id}/archive`, {
        method: 'PATCH', token: adminToken, body: { archived: true }
    });
    assert.strictEqual(noteArchive.payload.attribute.is_active, false);
    await request(`/api/admin/attributes/${note.id}/archive`, {
        method: 'PATCH', token: adminToken, body: { archived: false }
    });
    const conflict = await request('/api/admin/attributes', {
        method: 'POST', token: adminToken,
        body: { code: 'brand', name: 'Çakışan Marka', type: 'number' }
    });
    assert.strictEqual(conflict.response.status, 400);
    assert.strictEqual(conflict.payload.code, 'ATTRIBUTE_CODE_TYPE_CONFLICT');

    const createOption = async (attributeId, value, label) => {
        const result = await request('/api/admin/attribute-options', {
            method: 'POST', token: adminToken,
            body: { attribute_id: attributeId, value, label }
        });
        assert.strictEqual(result.response.status, 201, JSON.stringify(result.payload));
        return result.payload.option;
    };
    const apple = await createOption(brand.id, 'apple', 'Apple');
    const samsung = await createOption(brand.id, 'samsung', 'Samsung');
    const unused = await createOption(brand.id, 'unused', 'Sonuçsuz Marka');
    const unusedArchive = await request(`/api/admin/attribute-options/${unused.id}/archive`, {
        method: 'PATCH', token: adminToken, body: { archived: true }
    });
    assert.strictEqual(unusedArchive.payload.option.is_active, false);
    await request(`/api/admin/attribute-options/${unused.id}/archive`, {
        method: 'PATCH', token: adminToken, body: { archived: false }
    });
    const black = await createOption(colors.id, 'black', 'Siyah');
    const blue = await createOption(colors.id, 'blue', 'Mavi');

    const createTemplate = async (name, categoryId) => {
        const result = await request('/api/admin/attribute-templates', {
            method: 'POST', token: adminToken,
            body: { name, category_id: categoryId }
        });
        assert.strictEqual(result.response.status, 201, JSON.stringify(result.payload));
        return result.payload.template;
    };
    const smartTemplate = await createTemplate('Akıllı Telefon Özellikleri', categoryBySlug.get('akilli-telefon'));
    const workTemplate = await createTemplate('İş Telefonu Özellikleri', categoryBySlug.get('is-telefonu'));
    const link = async (templateId, attribute, overrides = {}) => {
        const result = await request(`/api/admin/attribute-templates/${templateId}/attributes`, {
            method: 'POST', token: adminToken,
            body: { attribute_id: attribute.id, ...overrides }
        });
        assert.strictEqual(result.response.status, 200, JSON.stringify(result.payload));
    };
    for (const attribute of [brand, ram, waterproof, colors, warranty, note]) {
        await link(smartTemplate.id, attribute, {
            is_required: ['brand', 'ram_gb'].includes(attribute.code),
            is_filterable: attribute.code !== 'private_note'
        });
    }
    await link(workTemplate.id, brand, { is_required: true, is_filterable: true });
    await link(workTemplate.id, ram, { is_required: true, is_filterable: true });
    const unlinkNote = await request(
        `/api/admin/attribute-templates/${smartTemplate.id}/attributes/${note.id}`,
        { method: 'DELETE', token: adminToken }
    );
    assert.strictEqual(unlinkNote.response.status, 200);
    await link(smartTemplate.id, note, { is_required: false, is_filterable: false });
    const templateUpdate = await request(`/api/admin/attribute-templates/${workTemplate.id}`, {
        method: 'PATCH', token: adminToken,
        body: { name: 'İş Telefonu Güncel Özellikleri', category_id: categoryBySlug.get('is-telefonu') }
    });
    assert.strictEqual(templateUpdate.response.status, 200);

    const resolved = await request(
        `/api/admin/attribute-templates/resolve?categoryIds=${encodeURIComponent(JSON.stringify([
            categoryBySlug.get('akilli-telefon'), categoryBySlug.get('is-telefonu')
        ]))}`,
        { token: adminToken }
    );
    assert.strictEqual(resolved.response.status, 200);
    assert.strictEqual(resolved.payload.attributes.filter((item) => item.code === 'brand').length, 1);
    assert.strictEqual(resolved.payload.attributes.find((item) => item.code === 'brand').template_ids.length, 2);

    const baseProduct = {
        price: 1000,
        stock: 0,
        description: 'Telefon',
        publicationStatus: 'active',
        isCustomerVisible: true,
        categoryIds: [categoryBySlug.get('akilli-telefon')],
        primaryCategoryId: categoryBySlug.get('akilli-telefon')
    };
    const missingRequired = await request('/api/products', {
        method: 'POST', token: adminToken,
        body: { ...baseProduct, name: 'Eksik Telefon', attributes: { waterproof: true } }
    });
    assert.strictEqual(missingRequired.response.status, 400);
    assert.strictEqual(missingRequired.payload.code, 'REQUIRED_ATTRIBUTE_MISSING');

    const draft = await request('/api/products', {
        method: 'POST', token: adminToken,
        body: {
            ...baseProduct, name: 'Taslak Telefon', publicationStatus: 'draft', attributes: {}
        }
    });
    assert.strictEqual(draft.response.status, 201, JSON.stringify(draft.payload));

    const invalidOption = await request('/api/products', {
        method: 'POST', token: adminToken,
        body: {
            ...baseProduct, name: 'Geçersiz Option',
            attributes: { brand: 999999, ram_gb: 8 }
        }
    });
    assert.strictEqual(invalidOption.response.status, 400);
    assert.strictEqual(invalidOption.payload.code, 'ATTRIBUTE_OPTION_INVALID');
    const invalidRange = await request('/api/products', {
        method: 'POST', token: adminToken,
        body: {
            ...baseProduct, name: 'Geçersiz Aralık',
            attributes: { brand: apple.id, ram_gb: 8, warranty_years: { min: 4, max: 1 } }
        }
    });
    assert.strictEqual(invalidRange.response.status, 400);

    const createProduct = async (body) => {
        const result = await request('/api/products', {
            method: 'POST', token: adminToken, body
        });
        assert.strictEqual(result.response.status, 201, JSON.stringify(result.payload));
        return result.payload.product;
    };
    const applePhone = await createProduct({
        ...baseProduct,
        name: 'Apple Test Telefon',
        attributes: {
            brand: apple.id, ram_gb: 8, waterproof: true,
            colors: [black.id, blue.id], warranty_years: { min: 1, max: 2 },
            private_note: '<img src=x onerror=alert(1)>'
        }
    });
    const samsungPhone = await createProduct({
        ...baseProduct,
        name: 'Samsung Test Telefon',
        stock: 4,
        categoryIds: [categoryBySlug.get('akilli-telefon'), categoryBySlug.get('is-telefonu')],
        primaryCategoryId: categoryBySlug.get('akilli-telefon'),
        attributes: {
            brand: samsung.id, ram_gb: 12, waterproof: false,
            colors: [blue.id], warranty_years: { min: 2, max: 3 }
        }
    });

    const publicDetail = await request(`/api/products/${applePhone.id}`);
    assert.strictEqual(publicDetail.response.status, 200);
    assert(publicDetail.payload.attributes.some((item) => item.code === 'private_note'));
    assert(!JSON.stringify(publicDetail.payload.attributes).includes('validation_metadata'));
    assert.strictEqual(publicDetail.payload.is_purchasable, false);

    const facets = await request('/api/public/categories/telefonlar/filters');
    assert.strictEqual(facets.response.status, 200, JSON.stringify(facets.payload));
    const brandFacet = facets.payload.filters.find((item) => item.code === 'brand');
    assert.deepStrictEqual(brandFacet.options.map((item) => item.value).sort(), ['apple', 'samsung']);
    assert(!brandFacet.options.some((item) => item.value === 'unused'));
    assert(!facets.payload.filters.some((item) => item.code === 'private_note'));
    const ramFacet = facets.payload.filters.find((item) => item.code === 'ram_gb');
    assert.strictEqual(ramFacet.min, 8);
    assert.strictEqual(ramFacet.max, 12);

    const filter = async (attributes) => request(
        `/api/products?categorySlug=telefonlar&attributes=${encodeURIComponent(JSON.stringify(attributes))}`
    );
    const appleFiltered = await filter({ brand: ['apple'] });
    assert.deepStrictEqual(appleFiltered.payload.map((item) => item.name), ['Apple Test Telefon']);
    const ramFiltered = await filter({ ram_gb: { min: 10 } });
    assert.deepStrictEqual(ramFiltered.payload.map((item) => item.name), ['Samsung Test Telefon']);
    const booleanFiltered = await filter({ waterproof: false });
    assert.deepStrictEqual(booleanFiltered.payload.map((item) => item.name), ['Samsung Test Telefon']);
    const multiFiltered = await filter({ colors: ['black'] });
    assert.deepStrictEqual(multiFiltered.payload.map((item) => item.name), ['Apple Test Telefon']);
    const rangeFiltered = await filter({ warranty_years: { min: 2.5 } });
    assert.deepStrictEqual(rangeFiltered.payload.map((item) => item.name), ['Samsung Test Telefon']);

    const updateWithoutAttributes = await request(`/api/products/${samsungPhone.id}`, {
        method: 'PUT', token: adminToken, body: {
            name: 'Samsung Güncel Telefon',
            price: 1000,
            stock: 4,
            description: 'Güncel telefon'
        }
    });
    assert.strictEqual(updateWithoutAttributes.response.status, 200, JSON.stringify(updateWithoutAttributes.payload));
    assert(updateWithoutAttributes.payload.product.attributes.some((item) => item.code === 'brand'));

    const tables = await pool.query(`
        SELECT to_regclass('public.attribute_definitions') AS definitions,
               to_regclass('public.attribute_options') AS options,
               to_regclass('public.attribute_templates') AS templates,
               to_regclass('public.template_attributes') AS template_attributes,
               to_regclass('public.product_attribute_values') AS values,
               to_regclass('public.idx_product_attribute_values_option_ids_gin') AS option_ids_gin,
               to_regclass('public.idx_product_attribute_values_range') AS range_index
    `);
    Object.values(tables.rows[0]).forEach((value) => assert(value));
    const legacyColumns = await pool.query(`
        SELECT COUNT(*)::INTEGER AS count
        FROM information_schema.columns
        WHERE table_schema='public' AND table_name='products'
          AND column_name IN ('category','categories')
    `);
    assert.strictEqual(legacyColumns.rows[0].count, 2);
    const constraints = await pool.query(`
        SELECT COUNT(*)::INTEGER AS count
        FROM pg_constraint
        WHERE conrelid IN (
            'attribute_definitions'::regclass,
            'product_attribute_values'::regclass
        )
    `);
    assert(constraints.rows[0].count >= 5);
    console.log('attribute/filter smoke passed');
})().catch((error) => {
    console.error(error);
    process.exitCode = 1;
}).finally(async () => {
    if (child && !child.killed) child.kill();
    await pool.end();
});
