const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const adminHtml = fs.readFileSync(path.join(root, 'frontend', 'admin.html'), 'utf8');
const menuSource = fs.readFileSync(path.join(root, 'frontend', 'admin-menus.js'), 'utf8');
const collectionSource = fs.readFileSync(path.join(root, 'frontend', 'admin-collections.js'), 'utf8');

const sandbox = {
    window: {},
    document: { getElementById: () => null },
    console
};
vm.runInNewContext(menuSource, sandbox, { filename: 'admin-menus.js' });
vm.runInNewContext(collectionSource, sandbox, { filename: 'admin-collections.js' });

const menuModule = sandbox.window.NovaStoreAdminMenus;
const collectionModule = sandbox.window.NovaStoreAdminCollections;
assert(menuModule);
assert(collectionModule);
assert(menuModule._test.escapeHtml('<img src=x>') === '&lt;img src=x&gt;');
assert(collectionModule._test.escapeHtml('<script>x</script>').includes('&lt;script&gt;'));
assert.strictEqual(
    collectionModule._test.ruleLabels.best_sellers,
    'Çok Satanlar · son 30 gün · ödemesi alınmış ve teslim edilmiş'
);

for (const marker of [
    "switchTab('menus'",
    "switchTab('collections'",
    'id="admin-menu-manager"',
    'id="admin-collection-manager"',
    '<script src="admin-menus.js"></script>',
    '<script src="admin-collections.js"></script>'
]) {
    assert(adminHtml.includes(marker), `Missing admin integration marker: ${marker}`);
}

for (const endpoint of [
    '/api/admin/menus',
    '/api/admin/menu-items',
    '/api/admin/menu-items/reorder',
    '/api/admin/menu-items/${id}/archive',
    '/api/admin/categories?format=flat',
    '/api/admin/collections'
]) {
    assert(menuSource.includes(endpoint), `Missing menu UI endpoint: ${endpoint}`);
}
assert(menuSource.includes('<option value="category">Kategori</option>'));
assert(menuSource.includes('<option value="collection">Koleksiyon</option>'));
assert(menuSource.includes('<option value="internal_url">Site İçi Bağlantı</option>'));
assert(menuSource.includes('<option value="main">Ana Menü</option>'));
assert(menuSource.includes('<option value="footer">Alt Bilgi Menüsü</option>'));
assert(menuSource.includes('<option value="mobile">Mobil Menü</option>'));
assert(menuSource.includes('<option value="home">Ana Sayfa Menüsü</option>'));
assert(menuSource.includes('Hedef Türü'));
assert(menuSource.includes('(Sistem Kodu:'));
assert(!menuSource.includes('external_url'));
assert(menuSource.includes('Seviye ${depth + 1}'));
assert(menuSource.includes("method: 'PATCH'"));
assert(menuSource.includes("method: id ? 'PATCH' : 'POST'"));

for (const endpoint of [
    '/api/admin/collections',
    '/api/admin/collections/${id}/archive',
    '/api/admin/collections/${id}/products',
    '/api/admin/collections/${state.selectedManualId}/products'
]) {
    assert(collectionSource.includes(endpoint), `Missing collection UI endpoint: ${endpoint}`);
}
for (const field of [
    'admin-collection-name',
    'admin-collection-slug',
    'admin-collection-type',
    'admin-collection-rule',
    'admin-collection-description',
    'admin-collection-image',
    'admin-collection-banner',
    'admin-collection-sort',
    'admin-collection-home',
    'admin-collection-seo-title',
    'admin-collection-seo-description',
    'admin-collection-active'
]) {
    assert(collectionSource.includes(`id="${field}"`), `Missing collection field: ${field}`);
}
assert(collectionSource.includes('Boş: mağazada görünmez.'));
assert(collectionSource.includes('<option value="manual">Manuel</option>'));
assert(collectionSource.includes('<option value="dynamic">Dinamik</option>'));
assert(collectionSource.includes("collection.is_active ? 'Arşivle' : 'Arşivden Çıkar'"));
assert(collectionSource.includes('Koleksiyon Türü'));
assert(collectionSource.includes('URL Adı: /'));
assert(collectionSource.includes("method: 'DELETE'"));
assert(collectionSource.includes("method: id ? 'PATCH' : 'POST'"));

console.log('admin menu/collection UI smoke passed');
