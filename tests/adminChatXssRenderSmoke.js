const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const scriptPath = path.join(__dirname, '..', 'frontend', 'admin-chat.js');
const source = fs.readFileSync(scriptPath, 'utf8');

const dangerousMessage = '<img src=x onerror="window.__xss=1">';
const dangerousName = '<svg onload="window.__nameXss=1"></svg>';
const dangerousEmail = '<script>window.__emailXss=1</script>';
const htmlWrites = [];
const allElements = [];

class FakeElement {
    constructor(tagName, id = null) {
        this.tagName = tagName;
        this.id = id;
        this.children = [];
        this.listeners = {};
        this.style = {};
        this.value = '';
        this.disabled = false;
        this.scrollTop = 0;
        this.scrollHeight = 0;
        this._className = '';
        this._innerHTML = '';
        this._textContent = '';
        allElements.push(this);
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
            remove: (className) => {
                this._className = this._className
                    .split(/\s+/)
                    .filter((item) => item && item !== className)
                    .join(' ');
            }
        };
    }

    set innerHTML(value) {
        const html = String(value);
        this._innerHTML = html;
        this.children = [];
        htmlWrites.push({ target: this.id || this.tagName, html });
    }

    get innerHTML() {
        return this._innerHTML;
    }

    set textContent(value) {
        this._textContent = String(value);
        this.children = [];
        this._innerHTML = '';
    }

    get textContent() {
        if (this.children.length > 0) {
            return this.children.map((child) => child.textContent).join('');
        }
        return this._textContent;
    }

    appendChild(child) {
        this.children.push(child);
        this._innerHTML = '';
        return child;
    }

    insertAdjacentHTML(_position, html) {
        const value = String(html);
        this._innerHTML += value;
        htmlWrites.push({ target: this.id || this.tagName, html: value });
    }

    addEventListener(type, handler) {
        this.listeners[type] = this.listeners[type] || [];
        this.listeners[type].push(handler);
    }

    dispatch(typeOrEvent) {
        const event = typeof typeOrEvent === 'string' ? { type: typeOrEvent } : typeOrEvent;
        for (const handler of this.listeners[event.type] || []) {
            handler(event);
        }
    }

    focus() {}

    querySelectorAll() {
        return [];
    }
}

const elements = {
    'admin-chat-users': new FakeElement('div', 'admin-chat-users'),
    'admin-chat-messages': new FakeElement('div', 'admin-chat-messages'),
    'admin-chat-input': new FakeElement('input', 'admin-chat-input'),
    'admin-send-chat': new FakeElement('button', 'admin-send-chat'),
    'admin-chat-header': new FakeElement('div', 'admin-chat-header')
};

const domListeners = {};
const document = {
    addEventListener: (type, handler) => {
        domListeners[type] = handler;
    },
    getElementById: (id) => elements[id] || null,
    createElement: (tagName) => new FakeElement(tagName),
    createTextNode: (text) => {
        const node = new FakeElement('#text');
        node.textContent = text;
        return node;
    },
    querySelectorAll: (selector) => {
        if (selector === '.chat-user-item') {
            return allElements.filter((element) => element.className.split(/\s+/).includes('chat-user-item'));
        }
        return [];
    }
};

const window = {
    switchTab: () => {}
};
window.window = window;

const tokenPayload = Buffer.from(JSON.stringify({ id: 1 })).toString('base64url');
const fetchCalls = [];

const context = {
    Buffer,
    console,
    document,
    window,
    localStorage: {
        getItem: () => `header.${tokenPayload}.signature`
    },
    atob: (value) => Buffer.from(value, 'base64').toString('binary'),
    fetch: async (url) => {
        fetchCalls.push(url);
        if (url === '/api/messages/users') {
            return {
                ok: true,
                json: async () => [{
                    id: 42,
                    name: dangerousName,
                    email: dangerousEmail
                }]
            };
        }
        if (url === '/api/messages/history/42') {
            return {
                ok: true,
                json: async () => [{
                    sender_id: 42,
                    receiver_id: 1,
                    message: dangerousMessage,
                    created_at: '2026-07-05T12:00:00.000Z'
                }]
            };
        }
        throw new Error(`Unexpected fetch: ${url}`);
    },
    setTimeout: (handler) => handler(),
    Date
};

async function flushPromises() {
    for (let i = 0; i < 6; i += 1) {
        await Promise.resolve();
    }
}

(async () => {
    vm.runInNewContext(source, context, { filename: scriptPath });

    assert.equal(typeof domListeners.DOMContentLoaded, 'function');
    domListeners.DOMContentLoaded();

    window.switchTab('chat');
    await flushPromises();

    const userItem = elements['admin-chat-users'].children[0];
    assert.ok(userItem, 'chat user should render');
    assert.match(userItem.textContent, /onload/);
    assert.match(userItem.textContent, /script/);

    userItem.dispatch('click');
    await flushPromises();

    assert.ok(fetchCalls.includes('/api/messages/users'));
    assert.ok(fetchCalls.includes('/api/messages/history/42'));
    assert.match(elements['admin-chat-header'].textContent, /onload/);
    assert.match(elements['admin-chat-messages'].textContent, /onerror/);

    const dynamicPayloads = [dangerousMessage, dangerousName, dangerousEmail];
    for (const { html, target } of htmlWrites) {
        for (const payload of dynamicPayloads) {
            assert.ok(
                !html.includes(payload),
                `user-controlled payload was written as HTML in ${target}`
            );
        }
    }

    console.log('adminChatXssRenderSmoke: OK');
})().catch((err) => {
    console.error(err);
    process.exitCode = 1;
});
