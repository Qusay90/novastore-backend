const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const moduleSource = fs.readFileSync(path.join(root, 'frontend', 'catalog-navigation.js'), 'utf8');
const indexSource = fs.readFileSync(path.join(root, 'frontend', 'index.html'), 'utf8');
const categoriesSource = fs.readFileSync(path.join(root, 'frontend', 'categories.html'), 'utf8');
const productSource = fs.readFileSync(path.join(root, 'frontend', 'product.html'), 'utf8');
const controllerSource = fs.readFileSync(path.join(root, 'controllers', 'productController.js'), 'utf8');

const tree = [{
    id: 1,
    name: 'Elektronik',
    slug: 'elektronik',
    children: [{
        id: 2,
        parent_id: 1,
        name: 'Bilgisayar',
        slug: 'bilgisayar',
        children: [{
            id: 3,
            parent_id: 2,
            name: '<img src=x onerror=alert(1)>',
            slug: 'dizustu',
            children: []
        }]
    }]
}];

const headNodes = [];
const sandbox = {
    window: {
        location: {
            href: 'https://store.test/index.html?category=Bilgisayar',
            origin: 'https://store.test',
            pathname: '/index.html',
            search: '?category=Bilgisayar',
            hash: ''
        },
        history: {
            replaced: '',
            replaceState(_state, _title, url) {
                this.replaced = url;
            }
        }
    },
    document: {
        getElementById: () => null,
        addEventListener: () => {},
        title: '',
        head: {
            appendChild(node) {
                headNodes.push(node);
            }
        },
        createElement: (tagName) => ({ tagName }),
        querySelector: (selector) => {
            if (selector === 'link[rel="canonical"]') return headNodes.find((node) => node.rel === 'canonical') || null;
            if (selector === 'meta[name="description"]') return headNodes.find((node) => node.name === 'description') || null;
            return null;
        }
    },
    fetch: async (url) => {
        assert.strictEqual(url, '/api/public/categories');
        return {
            ok: true,
            status: 200,
            json: async () => tree
        };
    },
    URL,
    URLSearchParams,
    console
};

vm.runInNewContext(moduleSource, sandbox, { filename: 'catalog-navigation.js' });
const catalog = sandbox.window.NovaStoreCatalogNavigation;
assert(catalog, 'Catalog navigation module should be exposed');

const threeLevelMenu = catalog._test.renderTreeItems(tree);
assert(threeLevelMenu.includes('level-0'));
assert(threeLevelMenu.includes('level-1'));
assert(threeLevelMenu.includes('level-2'));
assert(threeLevelMenu.includes('catalog-nav-toggle'));
assert(threeLevelMenu.includes('aria-expanded="false"'));
assert(threeLevelMenu.includes('&lt;img src=x'));
assert(!threeLevelMenu.includes('<img src=x'));

const breadcrumb = catalog._test.renderBreadcrumb([tree[0], tree[0].children[0]]);
assert(breadcrumb.includes('catalog-breadcrumb'));
assert(breadcrumb.includes('/kategori/elektronik'));
assert(breadcrumb.includes('aria-current="page"'));

const productsMarkup = catalog._test.renderCategoryProducts([
    { id: 10, name: 'Stoklu', price: 100, stock: 2, image_url: 'https://cdn.test/in.jpg' },
    { id: 11, name: '<script>alert(1)</script>', price: 90, stock: 0, image_url: 'javascript:alert(1)' }
]);
assert(productsMarkup.includes('Tükendi'));
assert(productsMarkup.includes('Satın alınamaz'));
assert(productsMarkup.includes('disabled'));
assert(productsMarkup.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
assert(!productsMarkup.includes('javascript:alert(1)'));
assert.strictEqual(catalog._test.safeAccentColor('#F7941D'), '#F7941D');
assert.strictEqual(catalog._test.safeAccentColor('red; background:url(x)'), '');
assert.strictEqual(catalog.categoryUrl(tree[0]), '/kategori/elektronik');
catalog._test.updateCategoryMetadata({
    slug: 'elektronik',
    name: 'Elektronik',
    seo_title: 'Elektronik SEO',
    seo_description: '<script>safe text only</script>'
});
assert.strictEqual(headNodes.find((node) => node.rel === 'canonical').href, 'https://store.test/kategori/elektronik');
assert.strictEqual(
    headNodes.find((node) => node.name === 'description').content,
    '<script>safe text only</script>'
);
assert.strictEqual(sandbox.document.title, 'Elektronik SEO | NovaStore');

(async () => {
    const legacyResolution = await catalog.resolveCategoryFromLocation(sandbox.window.location);
    assert.strictEqual(legacyResolution.category.slug, 'bilgisayar');
    assert.strictEqual(legacyResolution.legacy, true);
    assert.strictEqual(sandbox.window.history.replaced, '/kategori/bilgisayar');
    assert.strictEqual(catalog._test.categorySlugFromPath('/kategori/dizustu'), 'dizustu');
    assert.strictEqual(catalog._test.categorySlugFromPath('/category/dizustu'), 'dizustu');

    for (const [name, source] of [
        ['index.html', indexSource],
        ['categories.html', categoriesSource],
        ['product.html', productSource]
    ]) {
        assert(source.includes('catalog-navigation.js'), `${name} must load the shared category module`);
        assert(!source.includes("fetch('/api/categories')"), `${name} must not use legacy categories as its source`);
    }

    assert(indexSource.includes('/api/products?categorySlug='));
    assert(indexSource.includes('NovaStoreCatalogNavigation.mountMenu'));
    assert(!indexSource.includes('productMatchesCategory'));
    assert(indexSource.includes('catalog-sold-out-badge'));
    assert(productSource.includes('Tükendi · satın alınamaz'));
    assert(productSource.includes('renderProductBreadcrumb(product)'));
    assert(productSource.includes('NovaStoreCatalogNavigation.mountMenu'));
    assert(categoriesSource.includes('loadCategoryPage'));
    assert(moduleSource.includes("fetch('/api/public/categories')"));
    assert(moduleSource.includes('/api/public/categories/${encodeURIComponent(slug)}'));
    assert(moduleSource.includes('/api/products?categorySlug='));
    assert(controllerSource.includes('WITH RECURSIVE selected_categories'));
    assert(controllerSource.includes('CASE WHEN p.stock > 0 THEN 0 ELSE 1 END'));

    console.log('web public category UI smoke passed');
})().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
