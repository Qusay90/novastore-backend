const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const {
    ProductCategoryValidationError,
    assertProductCategoryPublicationReady
} = require('../services/productCategoryService');

const root = path.join(__dirname, '..');
const adminHtml = fs.readFileSync(path.join(root, 'frontend', 'admin.html'), 'utf8');
const productModuleSource = fs.readFileSync(path.join(root, 'frontend', 'admin-products.js'), 'utf8');
const categoryModuleSource = fs.readFileSync(path.join(root, 'frontend', 'admin-categories.js'), 'utf8');

const elements = {
    'prod-category': { innerHTML: '', value: '' },
    'prod-primary-category': { innerHTML: '', value: '' },
    'selected-product-categories': { innerHTML: '' },
    'product-category-warning': { textContent: '', hidden: true },
    'product-category-error': { textContent: '', hidden: true }
};
const sandbox = {
    window: {},
    document: {
        getElementById: (id) => elements[id] || null
    }
};

vm.runInNewContext(productModuleSource, sandbox, { filename: 'admin-products.js' });
const productAdmin = sandbox.window.NovaStoreAdminProducts;
assert(productAdmin, 'Admin product module should be exposed');

const categories = [
    { id: 1, name: 'Root', parent_id: null, depth: 0 },
    { id: 2, name: 'Level 2', parent_id: 1, depth: 1 },
    { id: 3, name: 'Level 3', parent_id: 2, depth: 2 },
    { id: 4, name: 'Leaf A', parent_id: 3, depth: 3 },
    { id: 5, name: '<img src=x onerror=alert(1)>', parent_id: 3, depth: 3 },
    { id: 6, name: 'Other Root', parent_id: null, depth: 0 },
    { id: 7, name: 'Tekrarlı', parent_id: 6, depth: 1 },
    { id: 8, name: 'Tekrarlı', parent_id: 3, depth: 3 },
    { id: 9, name: 'Archived Leaf', parent_id: 3, depth: 3, deleted_at: '2026-07-02T00:00:00Z' }
];

productAdmin.setCategories(categories);
assert(elements['prod-category'].innerHTML.includes('Level 3 · parent'));
assert(elements['prod-category'].innerHTML.includes('&lt;img src=x'));
assert(!elements['prod-category'].innerHTML.includes('<img src=x'));

assert.strictEqual(productAdmin.selectCategory(3), false, 'Parent category must be rejected');
assert.match(elements['product-category-error'].textContent, /parent kategori seçilemez/i);
assert.strictEqual(productAdmin.selectCategory(4), true);
assert.strictEqual(productAdmin.selectCategory(5), true);
assert.strictEqual(productAdmin.setPrimary(5), true);

const activeSubmission = productAdmin.getSubmission('active');
assert.deepStrictEqual(JSON.parse(JSON.stringify(activeSubmission)), {
    hasAssignment: true,
    categoryIds: [5, 4],
    primaryCategoryId: 5,
    categoryNames: ['<img src=x onerror=alert(1)>', 'Leaf A']
});
assert(elements['selected-product-categories'].innerHTML.includes('&lt;img src=x'));
assert(!elements['selected-product-categories'].innerHTML.includes('<img src=x'));

productAdmin.reset();
assert.deepStrictEqual(
    JSON.parse(JSON.stringify(productAdmin.getSubmission('draft'))),
    { hasAssignment: false, categoryIds: [], primaryCategoryId: null, categoryNames: [] }
);
assert.throws(
    () => productAdmin.getSubmission('active'),
    /Aktif ürün için en az bir leaf kategori/
);

const linkedResolution = productAdmin.loadProduct({
    categoryIds: [4, 5],
    primaryCategoryId: 4,
    category: 'Legacy ignored'
});
assert.deepStrictEqual(Array.from(linkedResolution.selectedIds), [4, 5]);
assert.strictEqual(linkedResolution.primaryId, 4);
assert.strictEqual(linkedResolution.warnings.length, 0);

const legacyResolution = productAdmin.loadProduct({
    category: 'Leaf A',
    categories: ['Leaf A']
});
assert.deepStrictEqual(Array.from(legacyResolution.selectedIds), [4]);
assert.strictEqual(legacyResolution.primaryId, 4);

const ambiguousResolution = productAdmin.loadProduct({ categories: ['Tekrarlı', 'Bulunamayan'] });
assert.strictEqual(ambiguousResolution.selectedIds.length, 0);
assert.match(ambiguousResolution.warnings.join(' '), /manuel seçim gerekli/i);
assert.match(elements['product-category-warning'].textContent, /eşleşmesi bulunamadı/i);

assert.throws(
    () => assertProductCategoryPublicationReady('active', []),
    (error) => error instanceof ProductCategoryValidationError && /primaryCategoryId/.test(error.message)
);
assert.strictEqual(assertProductCategoryPublicationReady('draft', []), true);
assert.strictEqual(
    assertProductCategoryPublicationReady('active', [{ categoryId: 4, isPrimary: true }]),
    true
);

[
    'prod-category',
    'prod-primary-category',
    'prod-publication-status',
    'prod-is-customer-visible',
    'product-category-warning',
    'product-category-error'
].forEach((id) => assert(adminHtml.includes(`id="${id}"`), `Missing product category field: ${id}`));

assert(adminHtml.includes('<script src="admin-products.js"></script>'));
assert(adminHtml.includes("formData.append('categoryIds'"));
assert(adminHtml.includes("formData.append('primaryCategoryId'"));
assert(adminHtml.includes("formData.append('publicationStatus'"));
assert(adminHtml.includes("formData.append(\n                    'isCustomerVisible'"));
assert(categoryModuleSource.includes("request('/api/admin/categories?format=tree')"));
assert(!productModuleSource.includes('/api/categories'));
assert(productModuleSource.includes('textContent = message'));

console.log('admin product category UI smoke passed');
