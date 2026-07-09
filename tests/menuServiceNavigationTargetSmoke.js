const assert = require('assert');
const fs = require('fs');
const path = require('path');

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://novastore_test:novastore_test@127.0.0.1:1/novastore_test';
process.env.DB_SSL = 'false';

const root = path.join(__dirname, '..');
const serviceSource = fs.readFileSync(path.join(root, 'services', 'menuService.js'), 'utf8');
const { buildPublicCategoryTarget } = require('../services/menuService');

assert.deepStrictEqual(
    buildPublicCategoryTarget({
        id: 3,
        slug: 'pantolon',
        path: 'kadin/giyim/pantolon'
    }),
    {
        type: 'category',
        id: 3,
        slug: 'pantolon',
        path: 'kadin/giyim/pantolon',
        url: '/kategori/kadin/giyim/pantolon'
    }
);

assert.strictEqual(
    buildPublicCategoryTarget({ id: 4, slug: 'elektronik', path: null }).url,
    '/kategori/elektronik'
);
assert.strictEqual(buildPublicCategoryTarget(null), null);
assert.strictEqual(buildPublicCategoryTarget({ id: 9, slug: null, path: null }), null);
assert(serviceSource.includes("url: `/koleksiyon/${encodeURIComponent(collection.slug)}`"));
assert(serviceSource.includes('if (!target && children.length === 0) return null;'));

console.log('menu service navigation target smoke passed');
