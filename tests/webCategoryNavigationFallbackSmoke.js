const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const helperSource = fs.readFileSync(path.join(root, 'frontend', 'category-navigation-fallback.js'), 'utf8');
const indexSource = fs.readFileSync(path.join(root, 'frontend', 'index.html'), 'utf8');
const productSource = fs.readFileSync(path.join(root, 'frontend', 'product.html'), 'utf8');
const categoriesSource = fs.readFileSync(path.join(root, 'frontend', 'categories.html'), 'utf8');
const footerSource = fs.readFileSync(path.join(root, 'frontend', 'footer.js'), 'utf8');

const sandbox = { window: {} };
vm.runInNewContext(helperSource, sandbox, { filename: 'category-navigation-fallback.js' });

const helper = sandbox.window.NovaStoreCategoryNavigation;
assert(helper, 'category navigation helper should be registered');

const liveTreePayload = [{
    id: 1,
    name: 'Kadın',
    slug: 'kadin',
    path: 'kadin',
    parent_id: null,
    children: [{
        id: 2,
        name: 'Giyim',
        slug: 'giyim',
        path: 'kadin/giyim',
        parent_id: 1,
        children: [{
            id: 3,
            name: 'Pantolon',
            slug: 'pantolon',
            path: 'kadin/giyim/pantolon',
            parent_id: 2,
            children: []
        }]
    }]
}, {
    id: 4,
    name: 'Elektronik',
    slug: 'elektronik',
    path: 'elektronik',
    parent_id: null,
    children: [{
        id: 5,
        name: 'Bilgisayar',
        slug: 'bilgisayar',
        path: 'elektronik/bilgisayar',
        parent_id: 4,
        children: [{
            id: 6,
            name: 'Laptop',
            slug: 'laptop',
            path: 'elektronik/bilgisayar/laptop',
            parent_id: 5,
            children: []
        }]
    }]
}];

const tree = helper.buildNavigationTree(liveTreePayload);
assert.strictEqual(tree.length, 2, 'a successful live tree must not be replaced because it has fewer than four roots');
assert(!tree.some((item) => item.name === 'Moda & Giyim'));
const women = tree.find((item) => item.name === 'Kadın');
assert(women);
assert.strictEqual(helper.categoryUrl(women), '/kategori/kadin');
assert.strictEqual(helper.categoryUrl(women.children[0]), '/kategori/kadin/giyim');
assert.strictEqual(helper.categoryUrl(women.children[0].children[0]), '/kategori/kadin/giyim/pantolon');
assert.strictEqual(
    helper.categoryUrl({ name: 'Erkek', slug: 'erkek', path: 'erkek' }),
    '/kategori/erkek'
);

const menuMarkup = helper.renderStorefrontMenu(tree, ['#F7941D']);
assert(menuMarkup.includes('Kadın'));
assert(menuMarkup.includes('Giyim'));
assert(menuMarkup.includes('Pantolon'));
assert(menuMarkup.includes('href="/kategori/kadin/giyim/pantolon"'));
assert(menuMarkup.includes('href="/kategori/elektronik/bilgisayar/laptop"'));
assert(!menuMarkup.includes('index.html?category='));

const directoryMarkup = helper.renderDirectoryTree(women.children);
assert(directoryMarkup.includes('data-category-depth="2"'));
assert(directoryMarkup.includes('href="/kategori/kadin/giyim/pantolon"'));

const fallbackTree = helper.buildFallbackNavigationTree();
assert(fallbackTree.some((item) => item.name === 'Moda & Giyim'));
assert.strictEqual(helper.categoryUrl(fallbackTree[0]), null);
const fallbackMarkup = helper.renderStorefrontMenu(fallbackTree);
assert(fallbackMarkup.includes('is-presentation-only'));
assert(!fallbackMarkup.includes('href="/kategori/'));

for (const source of [indexSource, productSource, categoriesSource]) {
    assert(source.includes('category-navigation-fallback.js'));
    assert(source.includes('NovaStoreCategoryNavigation'));
}

assert(indexSource.includes('renderStorefrontMenu'));
assert(indexSource.includes('buildFallbackNavigationTree'));
assert(!indexSource.includes('window.location.href = `index.html?category='));
assert(productSource.includes('renderStorefrontMenu'));
assert(productSource.includes('buildFallbackNavigationTree'));
assert(!productSource.includes('window.location.href = `index.html?category='));
assert(categoriesSource.includes('renderDirectoryTree'));
assert(footerSource.includes('footerCategoryUrl'));
assert(footerSource.includes("category?.path || category?.slug || ''"));
assert(!footerSource.includes('categories.html?category='));

console.log('web category navigation fallback smoke passed');
