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

assert.match(checkoutHtml, /window\.location\.replace\('\/#\/odeme\/teslimat'\)/);
assert.match(checkoutHtml, /Eski ödeme ekranı kullanımdan kaldırıldı/);
assert.strictEqual(checkoutHtml.includes('/api/payments/initialize'), false);
assert.strictEqual(/cardNumber|cardExpiry|cardCvv|name="paymentMethod"/i.test(checkoutHtml), false);
assert.strictEqual(/status=success|status=failed|PENDING_3DS|Ödeme Onayı Bekleniyor/i.test(checkoutHtml), false);

assert.match(paytrHtml, /id="paytr-frame"/);
assert.match(paytrHtml, /id="paytr-status" role="status" aria-live="polite"/);
assert.match(paytrHtml, /id="paytr-error" role="alert" aria-live="assertive"/);
assert.match(paytrHtml, /referrerpolicy="no-referrer"/);
assert.strictEqual(paytrHtml.includes('referrerpolicy="no-referrer-when-downgrade"'), false);
assert.match(paytrHtml, /PayTR güvenli ödeme formu hazırlanıyor\./);
assert.match(paytrHtml, /PayTR ödeme formu görüntülendi\. Ödeme sonucu sağlayıcı doğrulamasından sonra kesinleşir\./);
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
assert.strictEqual(paytrHtml.includes('footer.js'), false, 'PayTR kabuğu eski sabit hukuk/iletişim footerını yüklememeli');
assert.strictEqual(paytrHtml.includes('localStorage.removeItem'), false);
assert.strictEqual(paytrHtml.includes('sessionStorage.removeItem'), false);
assert.strictEqual(paytrHtml.includes('clearFinalizedCheckoutItems'), false);

const paymentRef = 'NSTPAYTR1safe';
const orderId = '7001';
const safeSession = {
    [`novastore.paytrCheckout.${paymentRef}`]: JSON.stringify({
        paymentRef,
        orderId,
        iframeUrl: 'https://www.paytr.com/odeme/guvenli/test-provider-token',
        token: 'test-provider-token',
        successUrl: 'https://example.test/payment-result.html',
        failUrl: 'https://example.test/payment-result.html',
        createdAt: Date.now()
    })
};
const rendered = runPaytrPage({
    href: `https://example.test/paytr-checkout.html?paymentRef=${paymentRef}&orderId=${orderId}`,
    session: safeSession
});
assert.strictEqual(rendered['paytr-frame'].src, 'https://www.paytr.com/odeme/guvenli/test-provider-token');
assert.strictEqual(rendered['paytr-error'].style.display, undefined);
assert.strictEqual(rendered['paytr-frame'].listener.eventName, 'load');
rendered['paytr-frame'].listener.handler();
assert.strictEqual(
    rendered['paytr-status'].innerText,
    'PayTR ödeme formu görüntülendi. Ödeme sonucu sağlayıcı doğrulamasından sonra kesinleşir.'
);
assert.doesNotMatch(rendered['paytr-status'].innerText, /ödeme (başarılı|tamamlandı|onaylandı)/i);

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
            iframeUrl: 'https://evil.example/odeme/guvenli/test-provider-token'
        })
    }
});
assert.strictEqual(hostRejected['paytr-frame'].src, '');
assert.strictEqual(hostRejected['paytr-error'].style.display, 'block');

assert.match(paymentResultHtml, /fetch\(`\$\{API_BASE\}\/api\/payments\/status\?\$\{params\.toString\(\)\}`/);
assert.match(paymentResultHtml, /const providerFinalized = result\.providerFinalized === true/);
assert.match(paymentResultHtml, /const commerceFinalized = result\.commerceFinalized === true/);
assert.match(paymentResultHtml, /providerFinalized && commerceFinalized && result\.paymentStatus === 'PAID'/);
assert.match(paymentResultHtml, /result\.nextAction === 'WAIT_RECONCILIATION' \|\| result\.reconciliationRequired === true/);
assert.match(paymentResultHtml, /clearFinalizedCheckoutItems\(result\.orderId \|\| orderId, paymentRef\)/);
assert.strictEqual(/readParam\(['"]status['"]\)|params\.get\(['"]status['"]\)/.test(paymentResultHtml), false);

console.log('web PayTR checkout smoke passed');
