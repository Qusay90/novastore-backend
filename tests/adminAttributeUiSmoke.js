const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const adminHtml = fs.readFileSync(path.join(root, 'frontend', 'admin.html'), 'utf8');
const attributeSource = fs.readFileSync(path.join(root, 'frontend', 'admin-attributes.js'), 'utf8');
const productSource = fs.readFileSync(path.join(root, 'frontend', 'admin-products.js'), 'utf8');

const sandbox = {
    window: {},
    document: { getElementById: () => null },
    console
};
vm.runInNewContext(attributeSource, sandbox, { filename: 'admin-attributes.js' });
assert(sandbox.window.NovaStoreAdminAttributes);
assert.strictEqual(
    sandbox.window.NovaStoreAdminAttributes._test.escapeHtml('<script>x</script>'),
    '&lt;script&gt;x&lt;/script&gt;'
);
assert.strictEqual(sandbox.window.NovaStoreAdminAttributes._test.attributeTypeLabel('multi_option'), 'Çoklu Seçenek');

for (const marker of [
    "switchTab('attributes'",
    'id="admin-attribute-manager"',
    '<script src="admin-attributes.js"></script>',
    'id="product-attributes-fields"',
    "formData.append('attributes'"
]) {
    assert(adminHtml.includes(marker), `Missing admin attribute integration marker: ${marker}`);
}

for (const endpoint of [
    '/api/admin/attributes',
    '/api/admin/attribute-options',
    '/api/admin/attribute-templates',
    '/api/admin/categories?format=flat'
]) {
    assert(attributeSource.includes(endpoint), `Missing attribute UI endpoint: ${endpoint}`);
}
for (const type of ['text', 'number', 'boolean', 'option', 'multi_option', 'range']) {
    assert(attributeSource.includes(`value="${type}"`), `Missing UI attribute type: ${type}`);
}
assert(attributeSource.includes("method: 'DELETE'"));
assert(attributeSource.includes('is_required'));
assert(attributeSource.includes('is_filterable'));
assert(productSource.includes('/api/admin/attribute-templates/resolve?categoryIds='));
assert(productSource.includes('getAttributeSubmission'));
assert(productSource.includes('Aktif ürün için'));
assert(attributeSource.includes('Doğrulama Kuralları (JSON)'));
assert(attributeSource.includes('Filtrede Göster'));
assert(attributeSource.includes('Varyantta Kullan'));
assert(attributeSource.includes('Ürün Bilgisi'));
assert(attributeSource.includes('Özellik Türü'));
assert(attributeSource.includes('Sistem Kodu:'));

console.log('admin attribute UI smoke passed');
