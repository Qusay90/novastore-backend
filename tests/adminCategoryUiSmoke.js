const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const adminHtml = fs.readFileSync(path.join(root, 'frontend', 'admin.html'), 'utf8');
const moduleSource = fs.readFileSync(path.join(root, 'frontend', 'admin-categories.js'), 'utf8');
let submitHandler = null;
const fakeElements = {
    'categories-table-body': { innerHTML: '' },
    'add-category-form': {
        addEventListener: (eventName, handler) => {
            if (eventName === 'submit') submitHandler = handler;
        }
    },
    'category-form-error': { textContent: '', hidden: true },
    'category-modal-title': { textContent: '' },
    'category-modal': { style: {} },
    'category-save-button': { disabled: false }
};
const checkboxIds = new Set([
    'cat-is-active',
    'cat-is-customer-visible',
    'cat-show-in-menu',
    'cat-show-on-home',
    'cat-hide-when-empty'
]);
[
    'cat-name',
    'cat-parent',
    'cat-slug',
    'cat-image-url',
    'cat-banner-url',
    'cat-icon',
    'cat-accent-color',
    'cat-description',
    'cat-seo-title',
    'cat-seo-description',
    'cat-sort-order',
    'cat-is-active',
    'cat-is-customer-visible',
    'cat-show-in-menu',
    'cat-show-on-home',
    'cat-hide-when-empty',
    'cat-google-taxonomy-id'
].forEach((id) => {
    fakeElements[id] = checkboxIds.has(id)
        ? { type: 'checkbox', checked: false }
        : { type: id === 'cat-parent' ? 'select-one' : 'text', value: '', innerHTML: '' };
});

const sandbox = {
    window: {
        confirm: () => true,
        alert: () => {},
        closeCategoryModal: () => {},
        showNotification: () => {}
    },
    document: {
        getElementById: (id) => fakeElements[id] || null
    },
    console
};

vm.runInNewContext(moduleSource, sandbox, { filename: 'admin-categories.js' });
const categoryAdmin = sandbox.window.NovaStoreAdminCategories;
assert(categoryAdmin, 'Admin category module should be exposed');

const fourLevelTree = [{
    id: 1,
    name: 'Elektronik',
    children: [{
        id: 2,
        parent_id: 1,
        name: 'Bilgisayar',
        is_active: false,
        children: [{
            id: 3,
            parent_id: 2,
            name: 'Dizüstü',
            children: [{
                id: 4,
                parent_id: 3,
                name: '<img src=x onerror=alert(1)>',
                deleted_at: '2026-07-02T00:00:00.000Z',
                visible_product_count: 0,
                children: []
            }]
        }]
    }]
}];

const flat = categoryAdmin._test.flattenTree(fourLevelTree);
assert.deepStrictEqual(Array.from(flat, (category) => category.depth), [0, 1, 2, 3]);
assert.strictEqual(flat.length, 4, 'Archived and empty categories must remain in the admin tree');
assert.strictEqual(flat[3].deleted_at, '2026-07-02T00:00:00.000Z');

const escaped = categoryAdmin._test.escapeHtml('<img src=x onerror="alert(1)">');
assert(!escaped.includes('<img'));
assert(escaped.includes('&lt;img'));
assert(escaped.includes('&quot;'));

const payload = categoryAdmin._test.buildCategoryPayload({
    name: 'Dizüstü Bilgisayar',
    parentId: '2',
    slug: 'dizustu-bilgisayar',
    imageUrl: 'https://cdn.test/category.jpg',
    bannerUrl: 'https://cdn.test/banner.jpg',
    icon: 'laptop',
    accentColor: '#F7941D',
    description: 'Kategori açıklaması',
    seoTitle: 'SEO başlığı',
    seoDescription: 'SEO açıklaması',
    sortOrder: '7',
    isActive: true,
    isCustomerVisible: true,
    showInMenu: true,
    showOnHome: false,
    hideWhenEmpty: true,
    googleTaxonomyId: '328'
});

assert.deepStrictEqual(JSON.parse(JSON.stringify(payload)), {
    name: 'Dizüstü Bilgisayar',
    parent_id: 2,
    slug: 'dizustu-bilgisayar',
    image_url: 'https://cdn.test/category.jpg',
    banner_url: 'https://cdn.test/banner.jpg',
    icon: 'laptop',
    accent_color: '#F7941D',
    description: 'Kategori açıklaması',
    seo_title: 'SEO başlığı',
    seo_description: 'SEO açıklaması',
    sort_order: 7,
    is_active: true,
    is_customer_visible: true,
    show_in_menu: true,
    show_on_home: false,
    hide_when_empty: true,
    google_taxonomy_id: '328'
});
assert.deepStrictEqual(
    JSON.parse(JSON.stringify(categoryAdmin._test.buildMovePayload({ ...payload, parentId: '', sortOrder: '3' }))),
    { parent_id: null, sort_order: 3 }
);

[
    'cat-name',
    'cat-parent',
    'cat-slug',
    'cat-image-url',
    'cat-banner-url',
    'cat-icon',
    'cat-accent-color',
    'cat-description',
    'cat-seo-title',
    'cat-seo-description',
    'cat-sort-order',
    'cat-is-active',
    'cat-is-customer-visible',
    'cat-show-in-menu',
    'cat-show-on-home',
    'cat-hide-when-empty',
    'cat-google-taxonomy-id'
].forEach((id) => assert(adminHtml.includes(`id="${id}"`), `Missing admin category field: ${id}`));

assert(adminHtml.includes('<script src="admin-categories.js"></script>'));
assert(adminHtml.includes('apiFetch: adminApiFetch'), 'Category UI must reuse hardened admin auth fetch');
assert(moduleSource.includes("request('/api/admin/categories?format=tree')"));
assert(moduleSource.includes("request('/api/admin/categories',"));
assert(moduleSource.includes('`/api/admin/categories/${state.editingId}`'));
assert(moduleSource.includes('`/api/admin/categories/${state.editingId}/move`'));
assert(moduleSource.includes('`/api/admin/categories/${Number(categoryId)}/archive`'));
assert(!moduleSource.includes("method: 'DELETE'"), 'Admin category UI must archive instead of deleting');
assert(moduleSource.includes('error.textContent = message'), 'Backend errors must be rendered as text');
assert(adminHtml.includes('<th>Kayıt No.</th>'));
assert(moduleSource.includes('Site İçi Yol: /'));

(async () => {
    const calls = [];
    let callbackCategories = [];
    categoryAdmin.configure({
        apiFetch: async (url, options) => {
            calls.push({ url, options });
            return {
                ok: true,
                status: 200,
                json: async () => options ? { category: {} } : fourLevelTree
            };
        },
        onCategoriesChanged: (categories) => {
            callbackCategories = categories;
        }
    });
    await categoryAdmin.load();

    assert.strictEqual(calls[0].url, '/api/admin/categories?format=tree');
    assert.strictEqual(callbackCategories.length, 4);
    assert(fakeElements['categories-table-body'].innerHTML.includes('Arşiv'));
    assert(fakeElements['categories-table-body'].innerHTML.includes('Pasif'));
    assert(fakeElements['categories-table-body'].innerHTML.includes('Müşteriye gösterilecek ürün yok'));
    assert(!fakeElements['categories-table-body'].innerHTML.includes('<img src=x'));
    assert(fakeElements['categories-table-body'].innerHTML.includes('&lt;img src=x'));
    assert.strictEqual(typeof submitHandler, 'function');

    categoryAdmin.openCreate();
    fakeElements['cat-name'].value = 'Yeni Kategori';
    fakeElements['cat-parent'].value = '2';
    fakeElements['cat-sort-order'].value = '9';
    fakeElements['cat-is-active'].checked = true;
    fakeElements['cat-is-customer-visible'].checked = true;
    await submitHandler({ preventDefault: () => {} });

    const createCall = calls.find((call) => call.url === '/api/admin/categories' && call.options?.method === 'POST');
    assert(createCall, 'Create must call the admin category endpoint');
    const createBody = JSON.parse(createCall.options.body);
    assert.strictEqual(createBody.name, 'Yeni Kategori');
    assert.strictEqual(createBody.parent_id, 2);
    assert.strictEqual(createBody.sort_order, 9);

    categoryAdmin.openEdit(3);
    fakeElements['cat-name'].value = 'Dizüstü Güncel';
    fakeElements['cat-parent'].value = '1';
    fakeElements['cat-sort-order'].value = '4';
    await submitHandler({ preventDefault: () => {} });

    const updateCall = calls.find((call) => call.url === '/api/admin/categories/3' && call.options?.method === 'PATCH');
    assert(updateCall, 'Update must call the category metadata endpoint');
    const updateBody = JSON.parse(updateCall.options.body);
    assert.strictEqual(updateBody.name, 'Dizüstü Güncel');
    assert(!Object.hasOwn(updateBody, 'slug'), 'Unchanged slug must not be resent');
    assert(!Object.hasOwn(updateBody, 'parent_id'), 'Parent changes belong to the move endpoint');
    assert(!Object.hasOwn(updateBody, 'sort_order'), 'Ordering changes belong to the move endpoint');

    const moveCall = calls.find((call) => call.url === '/api/admin/categories/3/move' && call.options?.method === 'PATCH');
    assert(moveCall, 'Move/reorder must call the move endpoint');
    assert.deepStrictEqual(JSON.parse(moveCall.options.body), { parent_id: 1, sort_order: 4 });

    await categoryAdmin.toggleArchive(3, 'archive');
    await categoryAdmin.toggleArchive(3, 'restore');
    const archiveBodies = calls
        .filter((call) => call.url === '/api/admin/categories/3/archive')
        .map((call) => JSON.parse(call.options.body));
    assert.deepStrictEqual(archiveBodies, [{ archived: true }, { archived: false }]);

    categoryAdmin.configure({
        apiFetch: async () => ({
            ok: false,
            status: 409,
            json: async () => ({ message: 'Kategori döngü oluşturamaz.' })
        })
    });
    categoryAdmin.openCreate();
    fakeElements['cat-name'].value = 'Hatalı Kategori';
    await submitHandler({ preventDefault: () => {} });
    assert.strictEqual(fakeElements['category-form-error'].textContent, 'Kategori döngü oluşturamaz.');
    assert.strictEqual(fakeElements['category-form-error'].hidden, false);

    console.log('Admin category UI smoke tests passed');
})().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
