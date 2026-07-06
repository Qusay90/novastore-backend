const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const adminPath = path.join(__dirname, '..', 'frontend', 'admin.html');
const adminSource = fs.readFileSync(adminPath, 'utf8');

function extractFunction(source, functionName) {
    const match = new RegExp(`(?:async\\s+)?function\\s+${functionName}\\s*\\(`).exec(source);
    assert.ok(match, `${functionName} function should exist`);

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
}

class FakeElement {
    constructor(tagName, id = null) {
        this.tagName = tagName;
        this.id = id;
        this.children = [];
        this.listeners = {};
        this.dataset = {};
        this.style = {};
        this.parentElement = null;
        this._className = '';
        this._innerHTML = '';
    }

    set className(value) {
        this._className = String(value);
    }

    get className() {
        return this._className;
    }

    get classList() {
        return {
            add: (className) => {
                const classes = new Set(this._className.split(/\s+/).filter(Boolean));
                classes.add(className);
                this._className = Array.from(classes).join(' ');
            },
            contains: (className) => this._className.split(/\s+/).includes(className)
        };
    }

    set innerHTML(value) {
        this._innerHTML = String(value);
        this.children = [];
    }

    get innerHTML() {
        return this._innerHTML;
    }

    get firstChild() {
        return this.children[0] || null;
    }

    appendChild(child) {
        child.parentElement = this;
        this.children.push(child);
        return child;
    }

    insertBefore(child, reference) {
        child.parentElement = this;
        const index = this.children.indexOf(reference);
        if (index === -1) {
            this.children.push(child);
        } else {
            this.children.splice(index, 0, child);
        }
        return child;
    }

    querySelector(selector) {
        if (selector === '.notif-empty') {
            return this.children.find((child) => child.className.split(/\s+/).includes('notif-empty')) || null;
        }
        return null;
    }

    addEventListener(type, handler) {
        this.listeners[type] = this.listeners[type] || [];
        this.listeners[type].push(handler);
    }

    remove() {
        if (!this.parentElement) return;
        this.parentElement.children = this.parentElement.children.filter((child) => child !== this);
        this.parentElement = null;
    }
}

const elements = {
    'order-modal-body': new FakeElement('div', 'order-modal-body'),
    'order-modal': new FakeElement('div', 'order-modal'),
    'notif-list': new FakeElement('div', 'notif-list'),
    toastContainer: new FakeElement('div', 'toastContainer')
};

const dangerousOrderName = '<details open ontoggle="window.__orderNameXss=1">name</details>';
const dangerousOrderPhone = '<img src=x onerror="window.__phoneXss=1">';
const dangerousOrderAddress = '<svg onload="window.__addressXss=1"></svg>';
const dangerousNotification = '<details open ontoggle="window.__notifXss=1">return</details>';

const document = {
    getElementById: (id) => elements[id] || null,
    createElement: (tagName) => new FakeElement(tagName)
};

const context = {
    console,
    Date,
    document,
    setTimeout: () => 0,
    globalOrders: [{
        id: 501,
        status: 'Hazırlanıyor',
        customer_name: dangerousOrderName,
        phone: dangerousOrderPhone,
        address: dangerousOrderAddress,
        items: [{ quantity: 1, name: 'Laptop', price: 1200 }]
    }],
    getOrderDisplayStatus: (order) => order.status,
    markNotifRead: () => {},
    navigateAdminNotif: () => {},
    closeNotifDropdown: () => {}
};

vm.runInNewContext(
    [
        extractFunction(adminSource, 'escapeAdminHtml'),
        extractFunction(adminSource, 'openOrderModal'),
        extractFunction(adminSource, 'addNotifToDropdown'),
        extractFunction(adminSource, 'showAdminToast'),
        'openOrderModal(501);',
        `addNotifToDropdown({ id: 7, type: 'new_order', message: ${JSON.stringify(dangerousNotification)}, created_at: '2026-07-05T12:00:00.000Z', is_read: false }, false);`,
        `showAdminToast({ type: 'new_order', message: ${JSON.stringify(dangerousNotification)} });`
    ].join('\n'),
    context,
    { filename: 'admin-order-notification-xss-render-harness.js' }
);

const orderHtml = elements['order-modal-body'].innerHTML;
const dropdownHtml = elements['notif-list'].children[0].innerHTML;
const toastHtml = elements.toastContainer.children[0].innerHTML;

for (const html of [orderHtml, dropdownHtml, toastHtml]) {
    assert.ok(!html.includes(dangerousOrderName), 'order name payload must not be emitted as active HTML');
    assert.ok(!html.includes(dangerousOrderPhone), 'order phone payload must not be emitted as active HTML');
    assert.ok(!html.includes(dangerousOrderAddress), 'order address payload must not be emitted as active HTML');
    assert.ok(!html.includes(dangerousNotification), 'notification payload must not be emitted as active HTML');
}

assert.match(orderHtml, /&lt;details open ontoggle=&quot;window\.__orderNameXss=1&quot;&gt;name&lt;\/details&gt;/);
assert.match(orderHtml, /&lt;img src=x onerror=&quot;window\.__phoneXss=1&quot;&gt;/);
assert.match(orderHtml, /&lt;svg onload=&quot;window\.__addressXss=1&quot;&gt;&lt;\/svg&gt;/);
assert.match(dropdownHtml, /&lt;details open ontoggle=&quot;window\.__notifXss=1&quot;&gt;return&lt;\/details&gt;/);
assert.match(toastHtml, /&lt;details open ontoggle=&quot;window\.__notifXss=1&quot;&gt;return&lt;\/details&gt;/);

assert.match(orderHtml, /Laptop/);
assert.match(dropdownHtml, /notif-text/);
assert.match(toastHtml, /toast-message/);

console.log('adminOrderNotificationXssRenderSmoke: OK');
