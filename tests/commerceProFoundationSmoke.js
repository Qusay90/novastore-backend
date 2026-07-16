const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');
const frontendDir = path.join(rootDir, 'frontend');
const foundationPath = path.join(frontendDir, 'commerce-pro-foundation.css');
const fontDir = path.join(frontendDir, 'assets', 'fonts', 'inter');
const footerPath = path.join(frontendDir, 'footer.js');
const fontAwesomeLicensePath = path.join(frontendDir, 'assets', 'vendor', 'fontawesome', 'LICENSE.txt');
const pageFiles = [
    'index.html',
    'categories.html',
    'collections.html',
    'product.html',
    'profile.html',
    'checkout.html'
];
const weights = [400, 500, 600, 700, 800];
const turkishSample = 'ÇĞİÖŞÜ çğıöşü';

function read(relativePath) {
    return fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
}

function sha256(filePath) {
    return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex').toUpperCase();
}

function parseUnicodeRange(value) {
    return value.split(',').map((part) => {
        const match = part.trim().match(/^U\+([0-9A-F?]+)(?:-([0-9A-F]+))?$/i);
        assert(match, `Unsupported unicode-range segment: ${part}`);
        assert(!match[1].includes('?'), `Wildcard unicode ranges are not expected: ${part}`);
        const start = Number.parseInt(match[1], 16);
        const end = match[2] ? Number.parseInt(match[2], 16) : start;
        return [start, end];
    });
}

const foundation = fs.readFileSync(foundationPath, 'utf8');
const footer = fs.readFileSync(footerPath, 'utf8');

for (const pageFile of pageFiles) {
    const source = fs.readFileSync(path.join(frontendDir, pageFile), 'utf8');
    const baseStyleIndex = source.indexOf('style.css');
    const foundationIndex = source.indexOf('commerce-pro-foundation.css');
    const lastInlineStyleEnd = source.lastIndexOf('</style>');

    assert(baseStyleIndex >= 0, `${pageFile} must keep the legacy style.css foundation`);
    assert(foundationIndex > baseStyleIndex, `${pageFile} must load Commerce Pro after style.css`);
    assert(
        lastInlineStyleEnd < 0 || foundationIndex > lastInlineStyleEnd,
        `${pageFile} must load Commerce Pro after its inline page styles`
    );
    assert(source.includes('commerce-pro-v3'), `${pageFile} must opt in through the body class`);
    assert(!/fonts\.googleapis\.com|fonts\.gstatic\.com/i.test(source), `${pageFile} must not request remote fonts`);
}

const criticalPageContracts = {
    'index.html': ['mobile-bridge.js', 'storefront-collections.js', 'shared-state-sync.js', 'favorites-sync.js', 'cart-items-container'],
    'categories.html': ['mobile-bridge.js', 'shared-state-sync.js', 'favorites-sync.js', 'category-navigation-fallback.js', 'catalog-plp.js'],
    'collections.html': ['mobile-bridge.js', 'storefront-collections.js', 'collection-page-content'],
    'product.html': ['mobile-bridge.js', 'category-navigation-fallback.js', 'shared-state-sync.js', 'favorites-sync.js', 'main-media-container'],
    'profile.html': ['mobile-bridge.js', 'shared-state-sync.js', 'favorites-sync.js', 'favorites-container', 'orders-container'],
    'checkout.html': ['mobile-bridge.js', 'shared-state-sync.js', 'checkout-form', 'submit-btn']
};

for (const [pageFile, markers] of Object.entries(criticalPageContracts)) {
    const source = fs.readFileSync(path.join(frontendDir, pageFile), 'utf8');
    for (const marker of markers) {
        assert(source.includes(marker), `${pageFile} must preserve ${marker}`);
    }
}

const expectedFontHashes = {
    'inter-latin-400-normal.woff2': '8909904AB6C872EB994093482A88A28ECA2CD95912D7B6FECD72103B0DC07EDC',
    'inter-latin-500-normal.woff2': 'F3779F1EFCCC4BDCDF9C0A02AB95BF6BD092ED09C48C08CEDC725889EDD1D19F',
    'inter-latin-600-normal.woff2': 'F9A06E79CD3A2A20951C0F0E28F66DD0E6D3FDA73911D640A2125C8FCB78F21A',
    'inter-latin-700-normal.woff2': '6F56409FD3D64BB85F7D070BCE20749DB2D66B6D63CEC586CC22D1C761BE2491',
    'inter-latin-800-normal.woff2': 'A7D0A50F15D389CAD679238466BDB5FC9787AA0715719064CE25ABAFF042820D',
    'inter-latin-ext-400-normal.woff2': '6744A7F509EBC6AB220A6CD4EA77E898ADF014F03D88DCDA5D45D8A9FEEFB4E9',
    'inter-latin-ext-500-normal.woff2': '2C6FBC42D315528BEB06C1096DF45487BF4186C4B78B8111D12C9C951F8ACCA2',
    'inter-latin-ext-600-normal.woff2': 'E4BDF67B0CD15CA9E184509275BE95DB942195D3CC2B17F6A0452F2ADF75D0BF',
    'inter-latin-ext-700-normal.woff2': '143F9504F1377012AA3E39C90C4354EF429CB0494B9AC0E1437F1A81E5412236',
    'inter-latin-ext-800-normal.woff2': 'EADE55593308B9E4916DD7F47826929CE3E40CAD85A2B338D56E5FD1E7BF8E5E',
    'OFL-1.1.txt': '3B0A5FCA3D17942CDE889069889DEDBBBD075E9B599968C82A95F4D944E9B345'
};

const actualFontFiles = fs.readdirSync(fontDir).sort();
assert.deepStrictEqual(actualFontFiles, Object.keys(expectedFontHashes).sort(), 'Only approved Inter assets may be copied');

for (const [fileName, expectedHash] of Object.entries(expectedFontHashes)) {
    const filePath = path.join(fontDir, fileName);
    assert.strictEqual(sha256(filePath), expectedHash, `${fileName} must match @fontsource/inter@5.2.8`);
    if (fileName.endsWith('.woff2')) {
        assert.strictEqual(fs.readFileSync(filePath).subarray(0, 4).toString('ascii'), 'wOF2', `${fileName} must be WOFF2`);
    }
}

const license = fs.readFileSync(path.join(fontDir, 'OFL-1.1.txt'), 'utf8');
assert(license.includes('SIL OPEN FONT LICENSE Version 1.1'), 'Inter must ship with the OFL-1.1 license');
assert(license.includes('Copyright 2016 The Inter Project Authors'), 'Inter attribution must be preserved');

assert.strictEqual(
    sha256(fontAwesomeLicensePath),
    '9B914EAE88817D63B576EAB5AAFDE7068C7A1ABAE125D7CDFB034F1DA43A9AFC',
    'Font Awesome Free 6.5.2 license must be preserved'
);
const fontAwesomeLicense = fs.readFileSync(fontAwesomeLicensePath, 'utf8');
assert(fontAwesomeLicense.includes('# Icons: CC BY 4.0 License'), 'Font Awesome brand icon license must be present');
assert(fontAwesomeLicense.includes('Copyright (c) 2024 Fonticons, Inc.'), 'Font Awesome attribution must be present');

assert(!/cdnjs\.cloudflare\.com|use\.fontawesome\.com|font-awesome\/|all\.min\.css/i.test(footer), 'Footer must not load a Font Awesome CDN stylesheet');
assert(!/nova-footer-icon-font|injectIconFont|fa-brands|fa-(?:instagram|youtube|tiktok|facebook-f|x-twitter|linkedin-in|pinterest-p)/i.test(footer), 'Footer must not depend on Font Awesome CSS classes');
assert(!/createElement\(['"]link['"]\)/.test(footer), 'Footer must not inject a remote stylesheet link');
assert(footer.includes('FOOTER_BRAND_ICONS'), 'Footer must keep its approved local brand icon map');
assert(footer.includes('renderFooterSocialIcon(item.iconKey)'), 'Footer must render local brand icons inline');
assert(footer.includes('class="nova-footer-social-icon"'), 'Footer inline icons must keep a stable styling hook');
assert(footer.includes('aria-hidden="true" focusable="false"'), 'Decorative footer icons must stay out of the accessibility tree');
assert(footer.includes('<span class="nova-footer-social-label">${item.label}</span>'), 'Social links must retain visible accessible names');
assert(footer.includes('target="_blank" rel="noopener noreferrer"'), 'External footer links must keep safe new-tab behavior');

for (const iconKey of ['instagram', 'youtube', 'tiktok', 'facebook', 'x', 'linkedin', 'pinterest']) {
    assert(footer.includes(`iconKey: '${iconKey}'`), `Footer must retain the ${iconKey} social icon`);
}

assert(!/https?:\/\//i.test(foundation), 'Foundation CSS must use same-origin assets only');
assert(foundation.includes('font-synthesis: none'), 'Synthetic Inter weights must be disabled');
assert(foundation.includes('--commerce-navy-950: #031D39'), 'Commerce Pro navy token must be present');
assert(foundation.includes('--commerce-orange-bright: #FF7A00'), 'Commerce Pro orange token must be present');
assert(foundation.includes('--commerce-shadow-sm:'), 'Commerce Pro shadow token must be present');
assert(foundation.includes('--commerce-radius-md:'), 'Commerce Pro radius token must be present');
assert(foundation.includes('--commerce-space-4:'), 'Commerce Pro spacing token must be present');
assert(foundation.includes('outline: 3px solid var(--commerce-focus-color) !important'), 'Keyboard focus must remain visible');
assert(foundation.includes('aspect-ratio: 1 / 1'), 'Product media frames must be square');
assert(foundation.includes('.product-media-frame > .product-media-track'), 'Gallery track must inherit the square frame');
assert(foundation.includes('.product-media-frame .product-media-slide'), 'Gallery slides must inherit the square frame');
assert(foundation.includes('object-fit: contain !important'), 'Product media assets must not be cropped');
assert(foundation.includes('object-position: center !important'), 'Product media assets must be centered');
assert(!foundation.includes('.commerce-pro-v3 img {'), 'The media primitive must not affect every storefront image');

const faceBlocks = [...foundation.matchAll(/@font-face\s*\{([\s\S]*?)\}/g)].map((match) => match[1]);
assert.strictEqual(faceBlocks.length, 10, 'Five Latin and five Latin Extended faces are required');

for (const weight of weights) {
    const faces = faceBlocks.filter((block) => new RegExp(`font-weight:\\s*${weight}(?:;|\\s)`).test(block));
    assert.strictEqual(faces.length, 2, `Inter ${weight} must include Latin and Latin Extended`);
    assert(faces.some((block) => block.includes(`inter-latin-${weight}-normal.woff2`)), `Inter ${weight} Latin face is missing`);
    assert(faces.some((block) => block.includes(`inter-latin-ext-${weight}-normal.woff2`)), `Inter ${weight} Latin Extended face is missing`);

    const ranges = faces.flatMap((block) => {
        const match = block.match(/unicode-range:\s*([^;]+);/);
        assert(match, `Inter ${weight} must declare unicode-range`);
        return parseUnicodeRange(match[1]);
    });

    for (const glyph of turkishSample.replace(/\s/g, '')) {
        const codePoint = glyph.codePointAt(0);
        assert(
            ranges.some(([start, end]) => codePoint >= start && codePoint <= end),
            `Inter ${weight} must cover Turkish glyph ${glyph}`
        );
    }
}

assert(!fs.existsSync(path.join(frontendDir, 'prototype')), 'The canonical prototype must not be copied into the repo');
assert(!fs.existsSync(path.join(rootDir, 'node_modules', '@fontsource', 'inter')), 'The source package node_modules must not be copied into the repo');

console.log('Commerce Pro foundation smoke passed');
