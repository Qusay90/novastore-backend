const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const helperSource = fs.readFileSync(path.join(root, 'frontend', 'category-navigation-fallback.js'), 'utf8');
const indexSource = fs.readFileSync(path.join(root, 'frontend', 'index.html'), 'utf8');
const productSource = fs.readFileSync(path.join(root, 'frontend', 'product.html'), 'utf8');
const categoriesSource = fs.readFileSync(path.join(root, 'frontend', 'categories.html'), 'utf8');

const sandbox = { window: {} };
vm.runInNewContext(helperSource, sandbox, { filename: 'category-navigation-fallback.js' });

const helper = sandbox.window.NovaStoreCategoryNavigation;
assert(helper, 'category navigation helper should be registered');

const liveLegacyShape = [
    { id: 15, name: 'Erkek', parent_id: null, is_active: true, is_customer_visible: true, show_in_menu: true },
    { id: 33, name: 'Kadın', parent_id: null, is_active: true, is_customer_visible: true, show_in_menu: true },
    { id: 37, name: 'Giyim.', parent_id: 33, is_active: true, is_customer_visible: true, show_in_menu: true },
    { id: 42, name: 'Elbise & Tulum.', parent_id: 37, is_active: true, is_customer_visible: true, show_in_menu: true },
    { id: 44, name: 'Tulum.', parent_id: 42, is_active: true, is_customer_visible: true, show_in_menu: true }
];

const tree = helper.buildNavigationTree(liveLegacyShape);
const rootNames = tree.map((item) => item.name);
assert(rootNames.includes('Anne, Bebek & Oyuncak'));
assert(rootNames.includes('Elektronik'));
assert(rootNames.includes('Moda & Giyim'));
assert(rootNames.includes('Süpermarket & Petshop'));
assert.strictEqual(tree.length, 10);

const fashion = tree.find((item) => item.name === 'Moda & Giyim');
assert(fashion.children.some((item) => item.name === 'Kadın'));
assert(fashion.children.some((item) => item.name === 'Erkek'));

const filterNames = helper.getFilterNames('Kadın');
assert(filterNames.includes('Kadın'));
assert(filterNames.includes('Tulum.'));
assert.strictEqual(helper.normalizeName('Tulum.'), 'tulum');

for (const source of [indexSource, productSource, categoriesSource]) {
    assert(source.includes('category-navigation-fallback.js'));
    assert(source.includes('NovaStoreCategoryNavigation'));
}

assert(indexSource.includes('await fetchNavigationCategories();'));
assert(indexSource.includes('getFilterNames(categoryName)'));

console.log('web category navigation fallback smoke passed');
