const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { SELLER_URL, assertProductionOrigins } = require('../storefront-commerce-pro/scripts/production-navigation-contract.cjs');
const root = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'frontend/commerce-pro/index.html'), 'utf8');
const productionClosure = [
 {label:'generated HTML',content:html},
 ...['shared-state-sync.js','favorites-sync.js'].map(p=>({label:p,content:fs.readFileSync(path.join(root,'frontend',p),'utf8')}))
];
// Validate the compiled navigation binding, not a general hostname allowlist.
for (const entry of productionClosure) {
    assertProductionOrigins(entry.content, { generatedHtml: entry.label === 'generated HTML' });
}
for (const extra of [
    `fetch('${SELLER_URL}')`,
    `fetch('${SELLER_URL}/api/products')`,
    `const authenticationOrigin = '${SELLER_URL}'`,
    `const paymentOrigin = '${SELLER_URL}'`,
    `const asset = '${SELLER_URL}/image.png'`,
    `fetch('https://arbitrary.invalid')`,
]) {
    assert.throws(() => assertProductionOrigins(`${html}<script>${extra}</script>`, { generatedHtml: true }));
}
for (const replacement of [
    'https://novastore-stage.com.evil.invalid',
    'https://novastore-stage.com/path',
    'http://novastore-stage.com',
    'https://deneme.novastore.tr',
    'http://localhost',
]) {
    assert.throws(() => assertProductionOrigins(html.replace(SELLER_URL, replacement), { generatedHtml: true }));
}
assert.throws(() => assertProductionOrigins(html.replace('seller-recruitment-action', 'unapproved-navigation'), { generatedHtml: true }));
assert.throws(() => assertProductionOrigins(`<script src="${SELLER_URL}"></script>${html}`, { generatedHtml: true }));
assert.throws(() => assertProductionOrigins(`<img src="${SELLER_URL}">${html}`, { generatedHtml: true }));
assert.throws(() => assertProductionOrigins(`fetch('${SELLER_URL}')`));
console.log('SELLER_RECRUITMENT_NAVIGATION_ONLY_CONTRACT=PASS');
const bindingName = html.match(/([A-Za-z_$][\w$]*)="https:\/\/novastore-stage\.com"/)?.[1];
assert(bindingName, 'Compiled Seller binding must be identifiable for misuse probes');
assert.throws(() => assertProductionOrigins(html.replace(`href:${bindingName}`, `src:${bindingName}`), { generatedHtml: true }));
assert.throws(() => assertProductionOrigins(html.replace(`href:${bindingName}`, `href:fetch(${bindingName})`), { generatedHtml: true }));
assert.throws(() => assertProductionOrigins(html.replace(`href:${bindingName}`, `href:${bindingName},api:${bindingName}`), { generatedHtml: true }));
assert.throws(() => assertProductionOrigins(html.replace(/\w+\.jsxs\("a",\{className:"mobile-seller-recruitment"/, 'fetch("a",{className:"mobile-seller-recruitment"'), { generatedHtml: true }));
console.log('SELLER_RECRUITMENT_RUNTIME_MISUSE_PROBES=PASS');
