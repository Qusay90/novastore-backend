const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const collectionSource = fs.readFileSync(path.join(root, 'frontend', 'storefront-collections.js'), 'utf8');
const indexSource = fs.readFileSync(path.join(root, 'frontend', 'index.html'), 'utf8');
const pageSource = fs.readFileSync(path.join(root, 'frontend', 'collections.html'), 'utf8');
const serverSource = fs.readFileSync(path.join(root, 'server.js'), 'utf8');

const headNodes = [];
const sandbox = {
    window: {
        location: {
            origin: 'https://store.test',
            pathname: '/koleksiyon/vitrin',
            search: ''
        },
        history: { replaceState: () => {} }
    },
    document: {
        readyState: 'complete',
        getElementById: () => null,
        querySelector: (selector) => {
            if (selector === 'link[rel="canonical"]') return headNodes.find((node) => node.rel === 'canonical') || null;
            if (selector === 'meta[name="description"]') return headNodes.find((node) => node.name === 'description') || null;
            return null;
        },
        createElement: (tagName) => ({ tagName }),
        head: { appendChild: (node) => headNodes.push(node) },
        title: ''
    },
    fetch: async () => {
        throw new Error('not called in pure renderer smoke');
    },
    URL,
    URLSearchParams,
    console
};
vm.runInNewContext(collectionSource, sandbox, { filename: 'storefront-collections.js' });
const collections = sandbox.window.NovaStorefrontCollections;
assert(collections);
assert.strictEqual(collections._test.collectionSlugFromPath('/koleksiyon/vitrin'), 'vitrin');
assert.strictEqual(collections.collectionUrl({ slug: 'yeni-gelenler' }), '/koleksiyon/yeni-gelenler');

const soldOutMarkup = collections._test.renderProductCard({
    id: 2,
    name: '<script>alert(1)</script>',
    price: 80,
    stock: 0,
    is_purchasable: false,
    image_url: 'javascript:alert(1)'
});
assert(soldOutMarkup.includes('Stokta Yok'));
assert(soldOutMarkup.includes('disabled'));
assert(soldOutMarkup.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
assert(!soldOutMarkup.includes('javascript:alert(1)'));

const block = collections._test.renderCollectionBlock({
    collection: {
        name: '<img src=x>',
        slug: 'vitrin',
        collection_type: 'manual',
        description: 'Seçili ürünler'
    },
    products: [{ id: 1, name: 'Stoklu', price: 100, stock: 2, is_purchasable: true }]
});
assert(block.includes('/koleksiyon/vitrin'));
assert(block.includes('&lt;img src=x&gt;'));
assert(!block.includes('<img src=x>'));

collections._test.updateMetadata({
    name: 'Vitrin',
    slug: 'vitrin',
    seo_title: 'Vitrin SEO',
    seo_description: 'Vitrin açıklaması'
});
assert.strictEqual(sandbox.document.title, 'Vitrin SEO | NovaStore');
assert.strictEqual(headNodes.find((node) => node.rel === 'canonical').href, 'https://store.test/koleksiyon/vitrin');

assert(indexSource.includes('id="home-collections"'));
assert(indexSource.includes('storefront-collections.js'));
assert(pageSource.includes('id="collection-page-content"'));
assert(pageSource.includes('/storefront-collections.js'));
assert(serverSource.includes("app.get('/koleksiyon/:slug'"));

console.log('web collection storefront smoke passed');
