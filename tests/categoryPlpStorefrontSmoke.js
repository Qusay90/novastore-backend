const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

class FakeElement {
    constructor(tagName = 'div') {
        this.tagName = tagName;
        this.innerHTML = '';
        this.textContent = '';
        this.dataset = {};
        this.attributes = new Map();
        this.listeners = new Map();
    }

    setAttribute(name, value) {
        this.attributes.set(name, String(value));
    }

    getAttribute(name) {
        return this.attributes.get(name);
    }

    appendChild(child) {
        this.child = child;
        return child;
    }

    addEventListener(type, handler) {
        this.listeners.set(type, handler);
    }

    querySelector() {
        return null;
    }
}

class FakeDocument {
    constructor(container, title, lead) {
        this.title = 'NovaStore | Kategoriler';
        this.container = container;
        this.titleElement = title;
        this.leadElement = lead;
        this.metaDescription = null;
        this.canonical = null;
        this.head = {
            appendChild: (element) => {
                if (element.attributes.get('name') === 'description') this.metaDescription = element;
                if (element.attributes.get('rel') === 'canonical') this.canonical = element;
                return element;
            }
        };
    }

    createElement(tagName) {
        return new FakeElement(tagName);
    }

    getElementById(id) {
        return id === 'native-categories-list' ? this.container : null;
    }

    querySelector(selector) {
        if (selector === '.native-categories-title') return this.titleElement;
        if (selector === '.native-categories-lead') return this.leadElement;
        if (selector === 'meta[name="description"]') return this.metaDescription;
        if (selector === 'link[rel="canonical"]') return this.canonical;
        return null;
    }
}

const rootDir = path.join(__dirname, '..');
const plpSource = fs.readFileSync(path.join(rootDir, 'frontend', 'catalog-plp.js'), 'utf8');
const helperSource = fs.readFileSync(path.join(rootDir, 'frontend', 'category-navigation-fallback.js'), 'utf8');
const categoriesSource = fs.readFileSync(path.join(rootDir, 'frontend', 'categories.html'), 'utf8');
const serverSource = fs.readFileSync(path.join(rootDir, 'server.js'), 'utf8');

const sandbox = {
    console,
    URL,
    URLSearchParams,
    CustomEvent: class CustomEvent {
        constructor(type, init = {}) {
            this.type = type;
            this.detail = init.detail;
        }
    },
    localStorage: {
        getItem() { return null; },
        setItem() {}
    },
    dispatchEvent() {},
    NovaStoreFavorites: {
        async loadFavoriteIds() {
            return new Set([7]);
        },
        async setFavorite() {
            return { ok: true };
        },
        reportError(error) {
            throw error;
        }
    }
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;

vm.runInNewContext(helperSource, sandbox, { filename: 'category-navigation-fallback.js' });
vm.runInNewContext(plpSource, sandbox, { filename: 'catalog-plp.js' });

const plp = sandbox.NovaStoreCategoryPlp;
assert(plp, 'PLP helper should be registered');

assert.strictEqual(
    plp.parseCategoryPath({ pathname: '/categories.html', search: '?category=kadin%2Fgiyim%2Fpantolon' }),
    'kadin/giyim/pantolon'
);
assert.strictEqual(
    plp.parseCategoryPath({ pathname: '/kategori/kadin/giyim/pantolon', search: '' }),
    'kadin/giyim/pantolon'
);
assert.strictEqual(
    plp.categoryProductsUrl('kadin/giyim/pantolon'),
    '/api/products?category=kadin%2Fgiyim%2Fpantolon&includeDescendants=true'
);
assert.strictEqual(
    plp.categoryQueryUrl('kadin/giyim/pantolon'),
    '/kategori/kadin/giyim/pantolon'
);

const publicTree = [{
    id: 1,
    name: 'Kadın',
    slug: 'kadin',
    path: 'kadin',
    subtree_visible_product_count: 2,
    children: [{
        id: 2,
        name: 'Giyim',
        slug: 'kadin-giyim',
        path: 'kadin/giyim',
        subtree_visible_product_count: 2,
        children: [{
            id: 3,
            name: 'Pantolon',
            slug: 'kadin-pantolon',
            path: 'kadin/giyim/pantolon',
            subtree_visible_product_count: 1,
            children: []
        }]
    }]
}];

const tree = plp.normalizePublicTree(publicTree);
const pantolon = plp.findCategoryDetail(tree, 'kadin/giyim/pantolon');
assert(pantolon, 'path should resolve category detail');
assert.strictEqual(
    JSON.stringify(pantolon.breadcrumb.map((item) => item.name)),
    JSON.stringify(['Kadın', 'Giyim', 'Pantolon'])
);
assert(plp.buildBreadcrumbHtml(pantolon).includes('Ana Sayfa'));
assert(plp.buildBreadcrumbHtml(pantolon).includes('Kadın'));
assert(plp.buildChildCategoryHtml(tree[0].children).includes('/kategori/kadin/giyim'));

const productCard = plp.buildProductCardHtml({
    id: 7,
    name: 'Siyah Pantolon',
    price: 899,
    old_price: 999,
    stock: 4,
    image_url: 'pantolon.jpg'
}, new Set([7]));
assert(productCard.includes('data-plp-favorite="7"'));
assert(productCard.includes('data-plp-add-to-cart="7"'));
assert(productCard.includes('btn-favorite active'));
assert(plp.buildProductsHtml([], new Set(), 'categoryEmpty').includes('Bu kategoride henüz ürün yok.'));
assert(plp.buildProductsHtml([], new Set(), 'filterEmpty').includes('Seçili filtrelere uygun ürün bulunamadı.'));
assert(plp.buildEmptyStateHtml('notFound').includes('Kategori bulunamadı.'));

const fetchCalls = [];
const fetcher = async (requestPath) => {
    fetchCalls.push(requestPath);
    if (requestPath === '/api/public/categories?format=tree') {
        return {
            ok: true,
            status: 200,
            async text() {
                return JSON.stringify(publicTree);
            }
        };
    }
    if (requestPath === '/api/products?category=kadin%2Fgiyim%2Fpantolon&includeDescendants=true') {
        return {
            ok: true,
            status: 200,
            async text() {
                return JSON.stringify([{
                    id: 7,
                    name: 'Siyah Pantolon',
                    price: 899,
                    stock: 4,
                    image_url: 'pantolon.jpg'
                }]);
            }
        };
    }
    throw new Error(`Unexpected fetch: ${requestPath}`);
};

(async () => {
    const container = new FakeElement();
    const title = new FakeElement('h1');
    const lead = new FakeElement('p');
    const document = new FakeDocument(container, title, lead);
    const historyCalls = [];
    const result = await plp.mountCategoryPlp({
        document,
        location: {
            pathname: '/categories.html',
            search: '?category=kadin%2Fgiyim%2Fpantolon',
            origin: 'https://novastore.test'
        },
        history: {
            replaceState: (...args) => historyCalls.push(args)
        },
        fetch: fetcher,
        container,
        title,
        lead
    });

    assert(result.category);
    assert.strictEqual(
        JSON.stringify(fetchCalls),
        JSON.stringify([
            '/api/public/categories?format=tree',
            '/api/products?category=kadin%2Fgiyim%2Fpantolon&includeDescendants=true'
        ])
    );
    assert(container.innerHTML.includes('Pantolon Ürünleri'));
    assert(container.innerHTML.includes('1 ürün'));
    assert(container.innerHTML.includes('Siyah Pantolon'));
    assert.strictEqual(document.title, 'Pantolon Ürünleri | NovaStore');
    assert.strictEqual(
        document.metaDescription.getAttribute('content'),
        "Pantolon kategorisindeki ürünleri NovaStore'da keşfet."
    );
    assert.strictEqual(
        document.canonical.getAttribute('href'),
        'https://novastore.test/kategori/kadin/giyim/pantolon'
    );
    assert.strictEqual(historyCalls[0][2], '/kategori/kadin/giyim/pantolon');

    const missingContainer = new FakeElement();
    const missingTitle = new FakeElement('h1');
    const missingLead = new FakeElement('p');
    const missingDocument = new FakeDocument(missingContainer, missingTitle, missingLead);
    const missingResult = await plp.mountCategoryPlp({
        document: missingDocument,
        location: {
            pathname: '/categories.html',
            search: '?category=olmayan',
            origin: 'https://novastore.test'
        },
        history: { replaceState() {} },
        fetch: async () => ({
            ok: true,
            status: 200,
            async text() {
                return JSON.stringify(publicTree);
            }
        }),
        container: missingContainer,
        title: missingTitle,
        lead: missingLead
    });
    assert.strictEqual(missingResult.category, null);
    assert(missingContainer.innerHTML.includes('Kategori bulunamadı.'));

    assert(categoriesSource.includes('src="/catalog-plp.js"'));
    assert(categoriesSource.includes('src="/category-navigation-fallback.js"'));
    assert(categoriesSource.includes('src="/shared-state-sync.js"'));
    assert(categoriesSource.includes('src="/favorites-sync.js"'));
    assert(categoriesSource.includes('href="/style.css"'));
    assert(categoriesSource.includes('/api/public/categories?format=tree'));
    assert(categoriesSource.includes('NovaStoreCategoryPlp'));
    assert(serverSource.includes('kategori|category'));
    assert(serverSource.includes('sendCategoryPage(res)'));

    const navTree = sandbox.NovaStoreCategoryNavigation.buildNavigationTree([
        { id: 10, name: 'Moda & Giyim', slug: 'moda-giyim', path: 'moda-giyim', parent_id: null },
        { id: 11, name: 'Kadın', slug: 'kadin', path: 'moda-giyim/kadin', parent_id: 10 },
        { id: 12, name: 'Giyim', slug: 'kadin-giyim', path: 'moda-giyim/kadin/giyim', parent_id: 11 },
        { id: 20, name: 'Elektronik', slug: 'elektronik', path: 'elektronik', parent_id: null },
        { id: 30, name: 'Ev & Yaşam', slug: 'ev-yasam', path: 'ev-yasam', parent_id: null },
        { id: 40, name: 'Spor & Outdoor', slug: 'spor-outdoor', path: 'spor-outdoor', parent_id: null }
    ]);
    const modaRoot = navTree.find((item) => item.name === 'Moda & Giyim');
    assert.strictEqual(modaRoot.path, 'moda-giyim');
    assert.strictEqual(modaRoot.children[0].path, 'moda-giyim/kadin');
    assert.strictEqual(
        sandbox.NovaStoreCategoryNavigation.categoryUrl(modaRoot.children[0]),
        '/kategori/moda-giyim/kadin'
    );

    console.log('category PLP storefront smoke passed');
})().catch((error) => {
    console.error(error);
    process.exit(1);
});
