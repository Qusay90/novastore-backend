const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const navigationSource = fs.readFileSync(path.join(root, 'frontend', 'catalog-navigation.js'), 'utf8');
const productSource = fs.readFileSync(path.join(root, 'frontend', 'product.html'), 'utf8');
const styleSource = fs.readFileSync(path.join(root, 'frontend', 'style.css'), 'utf8');

const sandbox = {
    window: {},
    document: { getElementById: () => null, addEventListener: () => {} },
    fetch: async () => ({ ok: true, status: 200, json: async () => [] }),
    URL,
    URLSearchParams,
    console
};
vm.runInNewContext(navigationSource, sandbox, { filename: 'catalog-navigation.js' });
const navigationModule = sandbox.window.NovaStoreCatalogNavigation;
const markup = navigationModule._test.renderCategoryFilters([
    {
        code: 'brand',
        name: '<img src=x>',
        type: 'option',
        options: [{ value: 'apple', label: '<script>alert(1)</script>' }]
    },
    { code: 'ram_gb', name: 'RAM', type: 'number', unit: 'GB', min: 4, max: 16 },
    {
        code: 'waterproof',
        name: 'Suya Dayanıklı',
        type: 'boolean',
        options: [{ value: true, label: 'Evet' }]
    }
]);
assert(markup.includes('&lt;img src=x&gt;'));
assert(markup.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
assert(!markup.includes('<script>alert(1)</script>'));
assert(markup.includes('data-filter-min'));
assert(markup.includes('data-filter-boolean'));
assert(navigationSource.includes('/api/public/categories/${encodeURIComponent(category.slug)}/filters'));
assert(navigationSource.includes('&attributes=${encodeURIComponent(JSON.stringify(filters))}'));
assert(productSource.includes('renderProductSpecifications(product.attributes)'));
assert(productSource.includes('escapeHtml(attribute.name)'));
assert(styleSource.includes('.catalog-filter-panel'));
assert(styleSource.includes('.product-specifications'));

console.log('web attribute filter smoke passed');
