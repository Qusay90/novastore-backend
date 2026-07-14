const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const paymentResultPath = path.join(root, 'frontend', 'payment-result.html');
const checkoutPath = path.join(root, 'frontend', 'checkout.html');
const paytrCheckoutPath = path.join(root, 'frontend', 'paytr-checkout.html');

const paymentResultHtml = fs.readFileSync(paymentResultPath, 'utf8');
const checkoutHtml = fs.readFileSync(checkoutPath, 'utf8');
const paytrCheckoutHtml = fs.readFileSync(paytrCheckoutPath, 'utf8');

const inlineScripts = (html) => [...html.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/gi)]
    .map((match) => match[1]);

const paymentResultScript = inlineScripts(paymentResultHtml)[0];

new vm.Script(paymentResultScript, { filename: 'payment-result.inline.js' });

const makeStorage = (initial = {}) => {
    const store = new Map(Object.entries(initial));
    return {
        store,
        api: {
            getItem(key) {
                return store.has(key) ? store.get(key) : null;
            },
            setItem(key, value) {
                store.set(key, String(value));
            },
            removeItem(key) {
                store.delete(key);
            }
        }
    };
};

const seedStorage = (paymentRef = 'NST-PAYTR-RESULT-1', orderId = '9001') => ({
    local: {
        nova_user_info: JSON.stringify({ id: 10 }),
        nova_user_token: 'token-10',
        novastore_cart_10: JSON.stringify([
            { id: 101, name: 'Telefon', quantity: 1 },
            { id: 102, name: 'Kablo', quantity: 1 }
        ]),
        novastore_checkout_10: JSON.stringify([{ id: 101, name: 'Telefon', quantity: 1 }]),
        novastore_pending_checkout_10: JSON.stringify({
            orderId,
            paymentRef,
            items: [{ id: 101, name: 'Telefon', quantity: 1 }],
            createdAt: Date.now()
        })
    },
    session: {
        [`novastore.paytrCheckout.${paymentRef}`]: JSON.stringify({
            paymentRef,
            orderId,
            iframeUrl: 'https://www.paytr.com/odeme/guvenli/token-should-not-render',
            token: 'token-should-not-render',
            createdAt: Date.now()
        })
    }
});

const okResponse = (payload) => ({
    ok: true,
    async json() {
        return payload;
    }
});

const errorResponse = (payload, status = 500) => ({
    ok: false,
    status,
    async json() {
        return payload;
    }
});

const runPaymentResult = async ({ href, statusPayload, responseFactory = null }) => {
    const paymentRef = new URL(href).searchParams.get('paymentRef') || 'NST-PAYTR-RESULT-1';
    const orderId = new URL(href).searchParams.get('orderId') || '9001';
    const seeded = seedStorage(paymentRef, orderId);
    const local = makeStorage(seeded.local);
    const session = makeStorage(seeded.session);
    const calls = [];
    const elements = {
        title: { innerText: '', className: '', style: {}, id: 'title' },
        desc: { innerText: '', className: '', style: {}, id: 'desc' },
        'retry-btn': { innerText: '', className: '', style: { display: 'none' }, id: 'retry-btn' }
    };
    const sandbox = {
        URL,
        URLSearchParams,
        window: {
            location: { href },
            NovaMobileBridge: {
                messages: [],
                postMessage(message) {
                    this.messages.push(message);
                }
            }
        },
        document: {
            getElementById(id) {
                assert.ok(elements[id], `missing fake element: ${id}`);
                return elements[id];
            }
        },
        localStorage: local.api,
        sessionStorage: session.api,
        fetch: async (url, options = {}) => {
            calls.push({ url, options });
            if (responseFactory) return responseFactory(url, options);
            return okResponse(statusPayload);
        }
    };
    vm.createContext(sandbox);
    vm.runInContext(paymentResultScript, sandbox, { filename: 'payment-result.inline.js' });
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));
    return { elements, calls, local: local.store, session: session.store, sandbox };
};

(async () => {
    const baseHref = 'https://example.test/payment-result.html?paymentRef=NST-PAYTR-RESULT-1&orderId=9001';

    const paid = await runPaymentResult({
        href: `${baseHref}&status=success&iframeUrl=https://www.paytr.com/odeme/guvenli/leak&token=leak`,
        statusPayload: {
            orderId: 9001,
            paymentRef: 'NST-PAYTR-RESULT-1',
            paymentStatus: 'PAID',
            orderStatus: 'Hazırlanıyor',
            provider: 'paytr',
            finalized: true,
            providerFinalized: true,
            commerceFinalized: true,
            message: 'Ödemeniz onaylandı. Siparişiniz hazırlanıyor.'
        }
    });
    assert.strictEqual(paid.calls.length, 1);
    assert.match(paid.calls[0].url, /^\/api\/payments\/status\?/);
    assert.match(paid.calls[0].url, /paymentRef=NST-PAYTR-RESULT-1/);
    assert.match(paid.calls[0].url, /orderId=9001/);
    assert.strictEqual(paid.calls[0].url.includes('/api/payments/webhook/paytr'), false);
    assert.strictEqual(paid.elements.title.innerText, 'Ödeme Başarılı');
    assert.strictEqual(paid.elements.title.className, 'ok');
    assert.deepStrictEqual(JSON.parse(paid.local.get('novastore_cart_10')), [{ id: 102, name: 'Kablo', quantity: 1 }]);
    assert.strictEqual(paid.local.has('novastore_checkout_10'), false);
    assert.strictEqual(paid.local.has('novastore_pending_checkout_10'), false);
    assert.strictEqual(paid.session.has('novastore.paytrCheckout.NST-PAYTR-RESULT-1'), false);

    const failed = await runPaymentResult({
        href: `${baseHref}&status=failed`,
        statusPayload: {
            orderId: 9001,
            paymentRef: 'NST-PAYTR-RESULT-1',
            paymentStatus: 'FAILED',
            orderStatus: 'İptal Edildi',
            provider: 'paytr',
            finalized: true,
            providerFinalized: true,
            commerceFinalized: true,
            message: 'Ödeme tamamlanamadı. Sepetiniz korunur, dilerseniz tekrar deneyebilirsiniz.'
        }
    });
    assert.strictEqual(failed.elements.title.innerText, 'Ödeme Başarısız');
    assert.strictEqual(failed.elements.title.className, 'bad');
    assert.strictEqual(failed.elements.retryBtn, undefined);
    assert.strictEqual(failed.elements['retry-btn'].style.display, 'inline-block');
    assert.deepStrictEqual(JSON.parse(failed.local.get('novastore_cart_10')), [
        { id: 101, name: 'Telefon', quantity: 1 },
        { id: 102, name: 'Kablo', quantity: 1 }
    ]);
    assert.strictEqual(failed.local.has('novastore_checkout_10'), true);
    assert.strictEqual(failed.local.has('novastore_pending_checkout_10'), true);
    assert.strictEqual(failed.session.has('novastore.paytrCheckout.NST-PAYTR-RESULT-1'), false);
    assert.strictEqual(failed.elements.title.innerText.includes('Başarılı'), false);

    const failedReconciliation = await runPaymentResult({
        href: `${baseHref}&status=failed`,
        statusPayload: {
            orderId: 9001,
            paymentRef: 'NST-PAYTR-RESULT-1',
            paymentStatus: 'FAILED',
            orderStatus: 'İptal Edildi',
            provider: 'paytr',
            finalized: true,
            providerFinalized: true,
            commerceFinalized: false,
            reconciliationRequired: true,
            nextAction: 'WAIT_RECONCILIATION',
            message: 'Ödeme ve sipariş kayıtları manuel mutabakat bekliyor. Sepetiniz korunur.'
        }
    });
    assert.strictEqual(failedReconciliation.elements.title.innerText, 'Ödeme Mutabakatı Bekleniyor');
    assert.strictEqual(failedReconciliation.elements['retry-btn'].style.display, 'none');
    assert.strictEqual(failedReconciliation.local.has('novastore_pending_checkout_10'), true);
    assert.strictEqual(failedReconciliation.session.has('novastore.paytrCheckout.NST-PAYTR-RESULT-1'), true);

    const pendingFromSuccessUrl = await runPaymentResult({
        href: `${baseHref}&status=success`,
        statusPayload: {
            orderId: 9001,
            paymentRef: 'NST-PAYTR-RESULT-1',
            paymentStatus: 'REQUIRES_ACTION',
            orderStatus: 'Ödeme Bekliyor',
            provider: 'paytr',
            finalized: false,
            message: 'Ödeme doğrulaması bekleniyor.'
        }
    });
    assert.strictEqual(pendingFromSuccessUrl.elements.title.innerText, 'Ödeme Onayı Bekleniyor');
    assert.deepStrictEqual(JSON.parse(pendingFromSuccessUrl.local.get('novastore_cart_10')), [
        { id: 101, name: 'Telefon', quantity: 1 },
        { id: 102, name: 'Kablo', quantity: 1 }
    ]);
    assert.strictEqual(pendingFromSuccessUrl.session.has('novastore.paytrCheckout.NST-PAYTR-RESULT-1'), true);

    const paidFromFailedUrl = await runPaymentResult({
        href: `${baseHref}&status=failed`,
        statusPayload: {
            orderId: 9001,
            paymentRef: 'NST-PAYTR-RESULT-1',
            paymentStatus: 'PAID',
            orderStatus: 'Hazırlanıyor',
            provider: 'paytr',
            finalized: true,
            providerFinalized: true,
            commerceFinalized: true,
            message: 'Ödemeniz onaylandı.'
        }
    });
    assert.strictEqual(paidFromFailedUrl.elements.title.innerText, 'Ödeme Başarılı');
    assert.deepStrictEqual(JSON.parse(paidFromFailedUrl.local.get('novastore_cart_10')), [{ id: 102, name: 'Kablo', quantity: 1 }]);

    const paidReconciliation = await runPaymentResult({
        href: `${baseHref}&status=success`,
        statusPayload: {
            orderId: 9001,
            paymentRef: 'NST-PAYTR-RESULT-1',
            paymentStatus: 'PAID',
            orderStatus: 'Kargoya Verildi',
            provider: 'paytr',
            finalized: true,
            providerFinalized: true,
            commerceFinalized: false,
            reconciliationRequired: true,
            nextAction: 'WAIT_RECONCILIATION',
            message: 'Ödemeniz alındı; sipariş kaydı operasyonel mutabakat bekliyor. Aynı ödemeyi tekrar denemeyin.'
        }
    });
    assert.strictEqual(paidReconciliation.elements.title.innerText, 'Ödeme Mutabakatı Bekleniyor');
    assert.deepStrictEqual(JSON.parse(paidReconciliation.local.get('novastore_cart_10')), [
        { id: 102, name: 'Kablo', quantity: 1 }
    ]);
    assert.strictEqual(paidReconciliation.local.has('novastore_pending_checkout_10'), false);
    assert.strictEqual(paidReconciliation.session.has('novastore.paytrCheckout.NST-PAYTR-RESULT-1'), false);

    const paidButNotFinalized = await runPaymentResult({
        href: `${baseHref}&status=success`,
        statusPayload: {
            orderId: 9001,
            paymentRef: 'NST-PAYTR-RESULT-1',
            paymentStatus: 'PAID',
            orderStatus: 'Ödeme Bekliyor',
            provider: 'paytr',
            finalized: false,
            message: 'Ödeme sonucu bekleniyor.'
        }
    });
    assert.strictEqual(paidButNotFinalized.elements.title.innerText, 'Ödeme Onayı Bekleniyor');
    assert.deepStrictEqual(JSON.parse(paidButNotFinalized.local.get('novastore_cart_10')), [
        { id: 101, name: 'Telefon', quantity: 1 },
        { id: 102, name: 'Kablo', quantity: 1 }
    ]);

    const failedFetch = await runPaymentResult({
        href: `${baseHref}&status=success`,
        statusPayload: null,
        responseFactory: () => errorResponse({ error: 'status failed' }, 503)
    });
    assert.strictEqual(failedFetch.elements.title.innerText, 'Ödeme Sonucu İşlenemedi');
    assert.deepStrictEqual(JSON.parse(failedFetch.local.get('novastore_cart_10')), [
        { id: 101, name: 'Telefon', quantity: 1 },
        { id: 102, name: 'Kablo', quantity: 1 }
    ]);
    assert.strictEqual(failedFetch.session.has('novastore.paytrCheckout.NST-PAYTR-RESULT-1'), true);

    const paymentResultScriptText = paymentResultScript;
    assert.strictEqual(paymentResultScriptText.includes('/api/payments/webhook/paytr'), false);
    assert.strictEqual(paymentResultScriptText.includes('/api/payments/webhook/iyzico'), false);
    assert.strictEqual(paymentResultScriptText.includes("qs('status')"), false);
    assert.strictEqual(paymentResultScriptText.includes("qs('iframeUrl')"), false);
    assert.strictEqual(paymentResultScriptText.includes("qs('token')"), false);
    assert.strictEqual(paymentResultHtml.includes('iframeUrl'), false);
    assert.strictEqual(paymentResultHtml.includes('token-should-not-render'), false);
    assert.match(checkoutHtml, /paytr-checkout\.html\?\$\{params\.toString\(\)\}/);
    assert.match(paytrCheckoutHtml, /sessionStorage\.getItem\(`novastore\.paytrCheckout\.\$\{paymentRef\}`\)/);

    console.log('web payment-result PayTR smoke passed');
})().catch((err) => {
    console.error(err);
    process.exit(1);
});
