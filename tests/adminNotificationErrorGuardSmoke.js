const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const adminSource = fs.readFileSync(
    path.join(__dirname, '..', 'frontend', 'admin.html'),
    'utf8'
);

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
    constructor(tagName = 'div') {
        this.tagName = tagName;
        this.children = [];
        this.listeners = {};
        this.dataset = {};
        this._className = '';
        this._innerHTML = '';
    }

    set className(value) {
        this._className = String(value);
    }

    get className() {
        return this._className;
    }

    set innerHTML(value) {
        this._innerHTML = String(value);
        this.children = [];
    }

    get innerHTML() {
        return this._innerHTML;
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

    querySelector(selector) {
        if (selector === '.notif-empty') {
            return this.children.find((child) => child.classList.contains('notif-empty')) || null;
        }
        return null;
    }

    appendChild(child) {
        child.parentElement = this;
        this.children.push(child);
        return child;
    }

    insertBefore(child, reference) {
        child.parentElement = this;
        const index = this.children.indexOf(reference);
        this.children.splice(index === -1 ? this.children.length : index, 0, child);
        return child;
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

const functions = [
    'escapeAdminHtml',
    'adminReadJson',
    'addNotifToDropdown',
    'fetchAdminNotifications'
].map((name) => extractFunction(adminSource, name)).join('\n');

const runLoader = async (response) => {
    const list = new FakeElement();
    const errors = [];
    let badgeUpdates = 0;
    const context = {
        console: { error: (...args) => errors.push(args.map(String).join(' ')) },
        Date,
        document: {
            getElementById: (id) => id === 'notif-list' ? list : null,
            createElement: (tagName) => new FakeElement(tagName)
        },
        adminApiFetch: async () => response,
        updateBadge: () => { badgeUpdates += 1; },
        unreadCount: 0,
        setTimeout: () => 0
    };

    vm.runInNewContext(`${functions}\nfetchAdminNotifications();`, context, {
        filename: 'admin-notification-error-guard-harness.js'
    });

    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));
    return { list, errors, badgeUpdates };
};

(async () => {
    const errorResult = await runLoader({
        ok: false,
        status: 500,
        json: async () => ({ error: 'Admin bildirimleri getirilemedi.' })
    });
    assert.match(errorResult.list.innerHTML, /Bildirimler yüklenemedi\./);
    assert(!errorResult.errors.some((message) => message.includes('forEach')));
    assert(!errorResult.errors.some((message) => message.includes('TypeError')));
    assert.strictEqual(errorResult.badgeUpdates, 1);

    const objectResult = await runLoader({
        ok: true,
        status: 200,
        json: async () => ({ error: 'Beklenmeyen bildirim payloadı.' })
    });
    assert.match(objectResult.list.innerHTML, /Bildirimler yüklenemedi\./);
    assert(!objectResult.errors.some((message) => message.includes('forEach')));
    assert.strictEqual(objectResult.badgeUpdates, 1);

    const successResult = await runLoader({
        ok: true,
        status: 200,
        json: async () => [{
            id: 7,
            type: 'new_order',
            message: 'Yeni sipariş',
            created_at: '2026-07-13T12:00:00.000Z',
            is_read: false
        }]
    });
    assert.strictEqual(successResult.list.children.length, 1);
    assert.match(successResult.list.children[0].innerHTML, /Yeni sipariş/);
    assert.strictEqual(successResult.errors.length, 0);
    assert.strictEqual(successResult.badgeUpdates, 1);

    console.log('adminNotificationErrorGuardSmoke: OK');
})().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
