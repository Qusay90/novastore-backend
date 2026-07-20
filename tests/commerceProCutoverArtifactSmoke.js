const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const repositoryRoot = path.resolve(__dirname, '..');
const commerceRoot = path.join(repositoryRoot, 'storefront-commerce-pro');
const frontendRoot = path.join(repositoryRoot, 'frontend');
const artifactPath = path.join(frontendRoot, 'commerce-pro', 'index.html');

const EXPECTED = Object.freeze({
    'canonical/NovaStore-Commerce-Pro.html': '8b6301362b6c01b649db1d7cfa4dc00d5b4392309e4ece2c7c14870cab0f2b0d',
    'src/App.jsx': 'd31e7642f6bccb75094361be3dc2dd3b85cc38a4d968bbfd57ee3ee7ffd80fb6',
    'src/catalog.js': 'a38d2e5f5a09fdc47bd9102800b04c423cf19b8d4d6bc952b77a5b77dc74062d',
    'src/canonical.css': '5b8e0d4a4eb1fb954e089f5c0e9dbabcad8217032ef12e3a67a03d89072e0896'
});

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const readCommerce = (relativePath, encoding = null) => fs.readFileSync(path.join(commerceRoot, relativePath), encoding || undefined);

assert(fs.existsSync(artifactPath), 'Commerce Pro production artifact must exist');
const artifact = fs.readFileSync(artifactPath);
assert(artifact.length > 100_000, 'Commerce Pro production artifact must contain the bundled application');
const html = artifact.toString('utf8');

for (const [relativePath, expectedHash] of Object.entries(EXPECTED)) {
    assert.equal(sha256(readCommerce(relativePath)), expectedHash, `${relativePath} canonical hash must remain locked`);
}

const cutoverSource = readCommerce('cutover.html', 'utf8');
const mainIntegrated = readCommerce('src/main-integrated.jsx', 'utf8');
const integratedApp = readCommerce('src/IntegratedApp.jsx', 'utf8');
const runtimeHook = readCommerce('src/integration/useCommerceRuntime.js', 'utf8');
const runtimeFactory = readCommerce('src/integration/createCommerceRuntime.js', 'utf8');
const packageJson = JSON.parse(readCommerce('package.json', 'utf8'));

assert(cutoverSource.includes('/src/main-integrated.jsx'));
assert(mainIntegrated.includes('from "./IntegratedApp.jsx"'));
assert(integratedApp.includes('from "./integration/useCommerceRuntime.js"'));
assert(integratedApp.includes('from "./CanonicalRuntimePresentation.jsx"'));
assert(runtimeHook.includes('from "./createCommerceRuntime.js"'));
for (const adapter of ['createCatalogAdapter', 'createCartAdapter', 'createFavoritesAdapter', 'createCheckoutAdapter', 'createCustomerAccountAdapter']) {
    assert(runtimeFactory.includes(adapter), `integrated runtime must retain ${adapter}`);
}
assert.equal(packageJson.scripts['build:cutover'], 'node scripts/finalize-cutover.mjs');
assert.equal(packageJson.scripts['test:cutover'], 'node ../tests/commerceProCutoverArtifactSmoke.js');

for (const required of [
    '<!doctype html>',
    'novastore-artifact-kind',
    'production-candidate',
    'scripts/finalize-cutover.mjs',
    'src/main-integrated.jsx',
    'IntegratedApp:createCommerceRuntime',
    "connect-src 'self'",
    '/shared-state-sync.js',
    '/favorites-sync.js',
    '/api/products',
    '/api/public/categories',
    '/api/public/collections',
    '/api/addresses',
    '/api/campaigns/quote',
    '/api/payments/initialize',
    '/api/notifications/user/',
    '/api/messages/history/',
    '/api/reviews/product/',
    '/api/questions/product/',
    '/api/assistant/chat',
    '#/giris',
    '#/hesabim',
    '#/favoriler',
    '#/sepet',
    '#/odeme/teslimat',
    'Tükendi'
]) {
    assert(html.includes(required), `production artifact must contain ${required}`);
}

assert.match(
    html,
    /import\s*["']\/shared-state-sync\.js["'];\s*import\s*["']\/favorites-sync\.js["']/,
    'shared state owner must load before favorites owner'
);

for (const [pattern, label] of [
    [/createCanonicalFixtureRuntime|main-integrated-fixture|fixture-integrated/i, 'fixture runtime marker'],
    [/commerce-pro-(?:preview|integration-preview)|noindex|nofollow/i, 'preview/noindex marker'],
    [/https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?/i, 'local development URL'],
    [/file:\/\//i, 'file URL'],
    [/[A-Za-z]:[\\/](?:Users|Windows|Program Files|AppData|Temp)[\\/]/i, 'Windows absolute path'],
    [/(?:AppData[\\/]Local[\\/]Temp|novastore-commerce-pro-cutover-)/i, 'temporary path'],
    [/(?:@vite\/client|vite\/dist\/client|sourceMappingURL)/i, 'dev/sourcemap marker']
]) {
    assert(!pattern.test(html), `production artifact must exclude ${label}`);
}

assert(!html.includes('\r'), 'artifact must use LF line endings');
assert(html.endsWith('\n'), 'artifact must end with one newline');

const externalOrigins = [...html.matchAll(/https?:\/\/[^"'`\s<>\)]+/g)]
    .map((match) => match[0])
    .filter((origin) => !origin.startsWith('http://www.w3.org/'));
assert.deepEqual([...new Set(externalOrigins)], [], 'artifact must not contain unexpected external origins');

const referencedPaths = new Set();
const shellHtml = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');
for (const match of shellHtml.matchAll(/\b(?:src|href)=["']([^"']+)["']/gi)) referencedPaths.add(match[1]);
for (const styleMatch of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) {
    for (const match of styleMatch[1].matchAll(/url\((?:["']?)([^"')]+)(?:["']?)\)/gi)) referencedPaths.add(match[1]);
}
for (const reference of referencedPaths) {
    if (!reference || reference.startsWith('data:') || reference.startsWith('#')) continue;
    if (/^[a-z][a-z\d+.-]*:/i.test(reference)) continue;
    const cleanReference = reference.split(/[?#]/, 1)[0];
    const resolved = cleanReference.startsWith('/')
        ? path.join(frontendRoot, cleanReference.slice(1))
        : path.resolve(path.dirname(artifactPath), cleanReference);
    assert(fs.existsSync(resolved), `artifact reference must resolve locally: ${reference}`);
}

const serverSource = fs.readFileSync(path.join(repositoryRoot, 'server.js'), 'utf8');
assert(!serverSource.includes('commerce-pro/index.html'), 'artifact tour must not activate a server route');
for (const legacyFile of [
    'index.html',
    'categories.html',
    'collections.html',
    'product.html',
    'login.html',
    'forgot-password.html',
    'reset-password.html',
    'profile.html',
    'checkout.html',
    'paytr-checkout.html',
    'payment-result.html'
]) {
    assert(fs.existsSync(path.join(frontendRoot, legacyFile)), `legacy rollback file must remain: ${legacyFile}`);
}

console.log(`Commerce Pro cutover artifact smoke passed: ${sha256(artifact)}`);
