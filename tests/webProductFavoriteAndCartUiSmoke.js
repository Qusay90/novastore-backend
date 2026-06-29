const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

class FakeStorage {
    constructor() {
        this.values = new Map();
    }

    getItem(key) {
        return this.values.has(key) ? this.values.get(key) : null;
    }

    setItem(key, value) {
        this.values.set(key, String(value));
    }

    removeItem(key) {
        this.values.delete(key);
    }
}

class FakeClassList {
    constructor(...values) {
        this.values = new Set(values);
    }

    add(value) {
        this.values.add(value);
    }

    remove(value) {
        this.values.delete(value);
    }

    contains(value) {
        return this.values.has(value);
    }

    toggle(value, force) {
        const enabled = force === undefined ? !this.contains(value) : Boolean(force);
        if (enabled) this.add(value);
        else this.remove(value);
        return enabled;
    }
}

const extractFunction = (source, functionName) => {
    const match = new RegExp(`(?:async\\s+)?function\\s+${functionName}\\s*\\(`).exec(source);
    assert(match, `${functionName} function should exist in product.html`);

    const start = match.index;
    const bodyStart = source.indexOf('{', start);
    let depth = 0;

    for (let index = bodyStart; index < source.length; index += 1) {
        if (source[index] === '{') depth += 1;
        if (source[index] === '}') {
            depth -= 1;
            if (depth === 0) return source.slice(start, index + 1);
        }
    }

    throw new Error(`${functionName} function body could not be extracted`);
};

const ok = (payload, status = 200) => ({
    ok: true,
    status,
    async text() {
        return JSON.stringify(payload);
    }
});

const frontendDir = path.join(__dirname, '..', 'frontend');
const productSource = fs.readFileSync(path.join(frontendDir, 'product.html'), 'utf8');

assert.match(
    productSource,
    /class="btn-favorite \$\{isFav\}" onclick="toggleFavorite\(this, event, \$\{product\.id\}\)"/
);
assert.match(productSource, /class="cart-btn" onclick="openCart\(\)"/);
assert.match(productSource, /class="remove-item" onclick="removeFromCart\(\$\{index\}\)"/);

global.localStorage = new FakeStorage();
global.CustomEvent = class CustomEvent {
    constructor(type, init = {}) {
        this.type = type;
        this.detail = init.detail;
    }
};
global.addEventListener = () => {};
global.dispatchEvent = () => {};

localStorage.setItem('nova_user_info', JSON.stringify({ id: 5 }));
localStorage.setItem('nova_user_token', 'safe-test-token');

const requests = [];
global.fetch = async (requestPath, options = {}) => {
    requests.push({ path: requestPath, options });

    if (requestPath === '/api/favorites/29' && options.method === 'POST') {
        return ok({ productId: 29, favorited: true, created: true }, 201);
    }

    if (requestPath === '/api/shared-state/cart' && options.method === 'PUT') {
        const body = JSON.parse(options.body);
        return ok({ key: 'cart', exists: true, payload: body.payload });
    }

    throw new Error(`Unexpected request: ${options.method || 'GET'} ${requestPath}`);
};

require('../frontend/shared-state-sync');
require('../frontend/favorites-sync');

const sidebar = { classList: new FakeClassList('cart-sidebar') };
const overlay = { classList: new FakeClassList('cart-overlay') };
const cartCount = { textContent: '0' };
const cartTotal = { textContent: '0.00' };

const elements = {
    'cart-sidebar': sidebar,
    'cart-overlay': overlay,
    'cart-count': cartCount,
    'cart-total-price': cartTotal
};

const initialCart = [
    { id: 11, name: 'Urun 11', price: 1500, image: '11.png', quantity: 1 },
    { id: 29, name: 'DUNYA BUTIK', price: 1000, image: '29.png', quantity: 1 }
];
localStorage.setItem('novastore_cart_5', JSON.stringify(initialCart));

const context = vm.createContext({
    console,
    document: {
        getElementById(id) {
            return elements[id] || null;
        }
    },
    localStorage,
    NovaStoreFavorites: global.NovaStoreFavorites,
    window: {
        NovaStoreSharedState: global.NovaStoreSharedState
    }
});

const pageFunctions = [
    extractFunction(productSource, 'toggleFavorite'),
    extractFunction(productSource, 'persistCart'),
    extractFunction(productSource, 'openCart'),
    extractFunction(productSource, 'removeFromCart')
].join('\n');

vm.runInContext(`
    let cart = JSON.parse(localStorage.getItem('novastore_cart_5')) || [];
    function renderCartUI() {
        document.getElementById('cart-count').textContent = String(
            cart.reduce((total, item) => total + item.quantity, 0)
        );
        document.getElementById('cart-total-price').textContent = cart
            .reduce((total, item) => total + (item.price * item.quantity), 0)
            .toFixed(2);
    }
    ${pageFunctions}
    globalThis.productPage = {
        toggleFavorite,
        openCart,
        removeFromCart,
        getCart: () => cart.map((item) => ({ ...item }))
    };
`, context);

(async () => {
    const favoriteButton = {
        dataset: {},
        classList: new FakeClassList('btn-favorite'),
        visible: true,
        onclick: 'toggleFavorite(this, event, 29)'
    };
    const favoriteEvent = {
        defaultPrevented: false,
        propagationStopped: false,
        preventDefault() {
            this.defaultPrevented = true;
        },
        stopPropagation() {
            this.propagationStopped = true;
        }
    };

    assert.strictEqual(favoriteButton.visible, true);
    assert.strictEqual(favoriteButton.onclick, 'toggleFavorite(this, event, 29)');
    await context.productPage.toggleFavorite(favoriteButton, favoriteEvent, 29);

    const favoriteRequest = requests.find((request) => request.path === '/api/favorites/29');
    assert(favoriteRequest, 'favorite click should call the favorites API');
    assert.strictEqual(favoriteRequest.options.method, 'POST');
    assert.strictEqual(favoriteButton.classList.contains('active'), true);
    assert.strictEqual(favoriteEvent.defaultPrevented, true);
    assert.strictEqual(favoriteEvent.propagationStopped, true);
    assert.deepStrictEqual(global.NovaStoreFavorites.readLocalIds('5'), [29]);

    assert.strictEqual(sidebar.classList.contains('open'), false);
    assert.strictEqual(overlay.classList.contains('open'), false);

    context.productPage.openCart();
    assert.strictEqual(sidebar.classList.contains('open'), true);
    assert.strictEqual(overlay.classList.contains('open'), true);
    assert.strictEqual(cartCount.textContent, '2');
    assert.strictEqual(cartTotal.textContent, '2500.00');

    const visibleRemoveButton = {
        isVisible() {
            return sidebar.classList.contains('open') && overlay.classList.contains('open');
        },
        async click() {
            assert.strictEqual(this.isVisible(), true, 'remove button must only be clicked in an open cart');
            await context.productPage.removeFromCart(1);
        }
    };

    assert.strictEqual(visibleRemoveButton.isVisible(), true);
    await visibleRemoveButton.click();

    const cartRequest = requests.find((request) => request.path === '/api/shared-state/cart');
    assert(cartRequest, 'visible remove click should save the shared cart');
    assert.strictEqual(cartRequest.options.method, 'PUT');

    const cartPayload = JSON.parse(cartRequest.options.body).payload;
    assert.deepStrictEqual(cartPayload.items.map((item) => item.productId), [11]);
    assert.deepStrictEqual(context.productPage.getCart().map((item) => item.productId), [11]);
    assert.strictEqual(cartCount.textContent, '1');
    assert.strictEqual(cartTotal.textContent, '1500.00');

    console.log('web product favorite and visible cart UI smoke passed');
})().catch((error) => {
    console.error(error);
    process.exit(1);
});
