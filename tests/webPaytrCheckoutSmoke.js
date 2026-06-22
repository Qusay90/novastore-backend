const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const checkoutPath = path.join(root, 'frontend', 'checkout.html');
const paytrPath = path.join(root, 'frontend', 'paytr-checkout.html');
const paymentResultPath = path.join(root, 'frontend', 'payment-result.html');

const checkoutHtml = fs.readFileSync(checkoutPath, 'utf8');
const paytrHtml = fs.readFileSync(paytrPath, 'utf8');
const paymentResultHtml = fs.readFileSync(paymentResultPath, 'utf8');

const inlineScripts = (html) => [...html.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/gi)]
    .map((match) => match[1]);

const compileInlineScripts = (html, label) => {
    let index = 0;
    for (const script of inlineScripts(html)) {
        index += 1;
        new vm.Script(script, { filename: `${label}#inline-${index}.js` });
    }
};

const runPaytrPage = ({ href, session = {} }) => {
    const storage = new Map(Object.entries(session));
    const elements = {
        'paytr-frame-wrap': { style: {}, id: 'paytr-frame-wrap' },
        'paytr-error': { style: {}, innerText: '', id: 'paytr-error' },
        'paytr-status': { innerText: '', id: 'paytr-status' },
        'paytr-meta': { innerText: '', id: 'paytr-meta' },
        'paytr-frame': {
            src: '',
            addEventListener(eventName, handler) {
                this.listener = { eventName, handler };
            }
        }
    };
    const sandbox = {
        URL,
        window: { location: { href } },
        sessionStorage: {
            getItem(key) {
                return storage.has(key) ? storage.get(key) : null;
            },
            setItem(key, value) {
                storage.set(key, String(value));
            },
            removeItem(key) {
                storage.delete(key);
            }
        },
        document: {
            getElementById(id) {
                assert.ok(elements[id], `missing fake element: ${id}`);
                return elements[id];
            }
        }
    };
    vm.createContext(sandbox);
    vm.runInContext(inlineScripts(paytrHtml)[0], sandbox, { filename: 'paytr-checkout.inline.js' });
    return elements;
};

compileInlineScripts(checkoutHtml, 'checkout.html');
compileInlineScripts(paytrHtml, 'paytr-checkout.html');
compileInlineScripts(paymentResultHtml, 'payment-result.html');

assert.match(checkoutHtml, /function resolvePaytrIframeUrl\(paymentAction\)/);
assert.match(checkoutHtml, /paymentAction\.type !== 'iframe'/);
assert.match(checkoutHtml, /paymentAction\.iframeUrl/);
assert.match(checkoutHtml, /https:\/\/www\.paytr\.com\/odeme\/guvenli\/\$\{encodeURIComponent\(paymentAction\.token\)\}/);
assert.match(checkoutHtml, /function buildPaytrCheckoutUrl\(result\)/);
assert.match(checkoutHtml, /paytr-checkout\.html\?\$\{params\.toString\(\)\}/);
assert.match(checkoutHtml, /const paytrCheckoutUrl = buildPaytrCheckoutUrl\(result\)/);
assert.match(checkoutHtml, /window\.location\.href = paytrCheckoutUrl/);
assert.match(checkoutHtml, /sessionStorage\.setItem\(`novastore\.paytrCheckout\.\$\{paymentRef\}`/);
assert.match(checkoutHtml, /iframeUrl,\s*\n\s*token: paymentAction\.token/);
assert.strictEqual(/new URLSearchParams\(\{\s*iframeUrl/s.test(checkoutHtml), false);
assert.strictEqual(/params\.set\('token'/.test(checkoutHtml), false);

const pendingIndex = checkoutHtml.indexOf('localStorage.setItem(_pendingCheckoutKey()');
const paytrRedirectIndex = checkoutHtml.indexOf('window.location.href = paytrCheckoutUrl');
assert.ok(pendingIndex > -1, 'checkout should preserve pending checkout data');
assert.ok(paytrRedirectIndex > pendingIndex, 'PayTR redirect should happen after pending checkout data is stored');

const checkoutSubmitBlock = checkoutHtml.slice(checkoutHtml.indexOf("fetch('/api/payments/initialize'"));
assert.strictEqual(checkoutSubmitBlock.includes('localStorage.removeItem(_checkoutKey())'), false);
assert.strictEqual(checkoutSubmitBlock.includes('localStorage.removeItem(_pendingCheckoutKey())'), false);
assert.strictEqual(checkoutSubmitBlock.includes('clearFinalizedCheckoutItems'), false);
assert.strictEqual(checkoutSubmitBlock.includes('/api/payments/webhook/paytr'), false);
assert.strictEqual(checkoutSubmitBlock.includes('/api/payments/webhook/iyzico'), false);

assert.match(checkoutHtml, /result\.paymentAction && result\.paymentAction\.action && result\.paymentAction\.action\.successUrl/);
assert.match(checkoutHtml, /input type="radio" name="paymentMethod" value="card" checked/);
assert.strictEqual(/name="paymentMethod"\s+value="havale"|value="bank_transfer"|Banka Havalesi|Havale\/EFT/i.test(checkoutHtml), false);

assert.match(paytrHtml, /id="paytr-frame"/);
assert.match(paytrHtml, /frame\.src = iframeUrl/);
assert.match(paytrHtml, /function isSafeIframeUrl\(value\)/);
assert.match(paytrHtml, /url\.protocol === 'https:'/);
assert.match(paytrHtml, /url\.hostname === 'www\.paytr\.com'/);
assert.match(paytrHtml, /url\.pathname\.startsWith\('\/odeme\/guvenli\/'\)/);
assert.match(paytrHtml, /const paymentRef = readParam\('paymentRef'\)/);
assert.match(paytrHtml, /const orderId = readParam\('orderId'\)/);
assert.match(paytrHtml, /sessionStorage\.getItem\(`novastore\.paytrCheckout\.\$\{paymentRef\}`\)/);
assert.strictEqual(paytrHtml.includes("readParam('iframeUrl')"), false);
assert.strictEqual(paytrHtml.includes("readParam('token')"), false);
assert.strictEqual(paytrHtml.includes('/api/payments/webhook/paytr'), false);
assert.strictEqual(paytrHtml.includes('/api/payments/webhook/iyzico'), false);
assert.strictEqual(paytrHtml.includes('/api/payments/status'), false);
assert.strictEqual(paytrHtml.includes('localStorage.removeItem'), false);
assert.strictEqual(paytrHtml.includes('sessionStorage.removeItem'), false);
assert.strictEqual(paytrHtml.includes('clearFinalizedCheckoutItems'), false);

const paymentRef = 'NST-PAYTR-1-safe';
const orderId = '7001';
const safeSession = {
    [`novastore.paytrCheckout.${paymentRef}`]: JSON.stringify({
        paymentRef,
        orderId,
        iframeUrl: 'https://www.paytr.com/odeme/guvenli/mock-token-secret',
        token: 'mock-token-secret',
        successUrl: 'https://example.test/payment-result.html',
        failUrl: 'https://example.test/payment-result.html',
        createdAt: Date.now()
    })
};
const rendered = runPaytrPage({
    href: `https://example.test/paytr-checkout.html?paymentRef=${paymentRef}&orderId=${orderId}`,
    session: safeSession
});
assert.strictEqual(rendered['paytr-frame'].src, 'https://www.paytr.com/odeme/guvenli/mock-token-secret');
assert.strictEqual(rendered['paytr-error'].style.display, undefined);

const queryOnly = runPaytrPage({
    href: `https://example.test/paytr-checkout.html?paymentRef=${paymentRef}&orderId=${orderId}&iframeUrl=https://www.paytr.com/odeme/guvenli/query-token&token=query-token`,
    session: {}
});
assert.strictEqual(queryOnly['paytr-frame'].src, '');
assert.strictEqual(queryOnly['paytr-error'].style.display, 'block');
assert.match(queryOnly['paytr-error'].innerText, /Ödeme oturumu bulunamadı|Odeme oturumu bulunamad/);

const httpRejected = runPaytrPage({
    href: `https://example.test/paytr-checkout.html?paymentRef=${paymentRef}&orderId=${orderId}`,
    session: {
        [`novastore.paytrCheckout.${paymentRef}`]: JSON.stringify({
            paymentRef,
            orderId,
            iframeUrl: 'http://www.paytr.com/odeme/guvenli/insecure-token'
        })
    }
});
assert.strictEqual(httpRejected['paytr-frame'].src, '');
assert.strictEqual(httpRejected['paytr-error'].style.display, 'block');

const hostRejected = runPaytrPage({
    href: `https://example.test/paytr-checkout.html?paymentRef=${paymentRef}&orderId=${orderId}`,
    session: {
        [`novastore.paytrCheckout.${paymentRef}`]: JSON.stringify({
            paymentRef,
            orderId,
            iframeUrl: 'https://evil.example/odeme/guvenli/mock-token-secret'
        })
    }
});
assert.strictEqual(hostRejected['paytr-frame'].src, '');
assert.strictEqual(hostRejected['paytr-error'].style.display, 'block');

assert.match(paymentResultHtml, /fetch\(`\$\{API_BASE\}\/api\/payments\/status\?\$\{params\.toString\(\)\}`/);
assert.match(paymentResultHtml, /result\.finalized === true && result\.paymentStatus === 'PAID'/);
assert.match(paymentResultHtml, /clearFinalizedCheckoutItems\(result\.orderId \|\| orderId, paymentRef\)/);

console.log('web PayTR checkout smoke passed');
