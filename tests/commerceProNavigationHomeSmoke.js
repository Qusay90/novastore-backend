const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const repositoryRoot = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(repositoryRoot, relativePath), 'utf8');

const integratedSource = read('storefront-commerce-pro/src/IntegratedApp.jsx');
const runtimeCatalogPath = path.join(
    repositoryRoot,
    'storefront-commerce-pro',
    'src',
    'integration',
    'runtimeCatalog.js'
);
const artifact = read('frontend/commerce-pro/index.html');
const serverSource = read('server.js');

for (const documentRoute of ['kategori', 'urun', 'koleksiyon']) {
    assert(
        integratedSource.includes(`(?:kategori|urun|koleksiyon)`),
        `IntegratedApp must preserve document-native ${documentRoute} navigation`
    );
}

for (const legacyAlias of [
    '/login.html',
    '/forgot-password.html',
    '/reset-password.html',
    '/checkout.html',
    '/profile.html',
    '/product.html'
]) {
    assert(integratedSource.includes(legacyAlias), `IntegratedApp must recognize ${legacyAlias}`);
}

for (const route of [
    '/kategori/',
    '/urun/',
    '/urun-id/',
    '/koleksiyon/',
    '/favoriler',
    '/sepet',
    '/hesabim',
    '/giris',
    '/kayit',
    '/sifremi-unuttum',
    '/sifre-sifirla',
    '/odeme/teslimat'
]) {
    assert(integratedSource.includes(route), `IntegratedApp must parse ${route}`);
}

assert(integratedSource.includes('function Breadcrumbs({ category, productName })'));
assert(integratedSource.includes('href={`#/kategori/${item.canonicalPath}`}'));
assert(integratedSource.includes('getVisibleChildren(category.id)'));
assert(integratedSource.includes('category.descendantVisibleProductCount === 0'));
assert(integratedSource.includes('href="#/"'), 'home navigation must remain hash-stable');

assert(artifact.includes('novastore-artifact-kind'));
assert(artifact.includes('production-candidate'));
assert(artifact.includes('IntegratedApp:createCommerceRuntime'));
assert(artifact.includes('#/kategori/'));
assert(artifact.includes('#/favoriler'));
assert(artifact.includes('#/sepet'));
assert(!/createCanonicalFixtureRuntime|main-integrated-fixture|fixture-integrated/i.test(artifact));
assert(!/commerce-pro-(?:preview|integration-preview)|noindex|nofollow/i.test(artifact));

(async () => {
    const runtimeCatalog = await import(pathToFileURL(runtimeCatalogPath).href);
    runtimeCatalog.configureRuntimeCatalog({
        categories: [
            { id: 1, name: 'Kadın', slug: 'kadin', path: 'kadin', parentId: null },
            { id: 2, name: 'Giyim', slug: 'giyim', path: 'kadin/giyim', parentId: 1 },
            { id: 3, name: 'Pantolon', slug: 'pantolon', path: 'kadin/giyim/pantolon', parentId: 2 },
            { id: 4, name: 'Boş', slug: 'bos', path: 'bos', parentId: null },
            { id: 5, name: 'Arşiv', slug: 'arsiv', path: 'arsiv', parentId: null, archived: true }
        ],
        products: [
            {
                id: 101,
                name: 'Kanonik Pantolon',
                slug: 'kanonik-pantolon',
                categoryId: 3,
                categoryIds: [3],
                price: 1299,
                stock: 4
            },
            {
                id: 102,
                name: 'Gizli Ürün',
                slug: 'gizli-urun',
                categoryId: 5,
                categoryIds: [5],
                price: 1,
                stock: 1
            }
        ]
    });

    assert.deepEqual(runtimeCatalog.getVisibleRoots().map((item) => item.path), ['kadin']);
    assert.deepEqual(runtimeCatalog.getVisibleChildren(1).map((item) => item.path), ['kadin/giyim']);
    assert.deepEqual(runtimeCatalog.getVisibleChildren(2).map((item) => item.path), ['kadin/giyim/pantolon']);
    const deepCategory = runtimeCatalog.resolveCategoryPath('/kategori/kadin/giyim/pantolon');
    assert.equal(deepCategory?.canonicalPath, 'kadin/giyim/pantolon');
    assert.deepEqual(
        runtimeCatalog.getBreadcrumb(deepCategory.id).map((item) => item.canonicalPath),
        ['kadin', 'kadin/giyim', 'kadin/giyim/pantolon']
    );
    assert.deepEqual(runtimeCatalog.getProductsForCategory(1).map((item) => item.id), [101]);
    assert.equal(runtimeCatalog.resolveCategoryPath('/kategori/bos'), null);
    assert.equal(runtimeCatalog.resolveCategoryPath('/kategori/arsiv'), null);

    assert(
        serverSource.includes('NOVASTORE_STOREFRONT_MODE'),
        'legacy storefront routing is still active: the rollback selector is missing'
    );
    assert(
        /path\.join\(\s*__dirname,\s*['"]frontend['"],\s*['"]commerce-pro['"],\s*['"]index\.html['"]\s*\)/.test(serverSource),
        'legacy storefront routing is still active: the production artifact is not route-owned'
    );

    console.log('Commerce Pro navigation and home smoke passed');
})().catch((error) => {
    console.error(error);
    process.exit(1);
});
