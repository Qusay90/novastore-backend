const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const productController = read('controllers/productController.js');
const catalogSearch = read('services/catalogSearchService.js');
const reviewInsight = read('services/reviewInsightService.js');
const reviewController = read('controllers/reviewController.js');

assert.match(productController, /LEFT JOIN reviews r ON p\.id = r\.product_id AND r\.status = 'PUBLISHED'/);
assert.equal((catalogSearch.match(/LEFT JOIN reviews r ON r\.product_id = p\.id AND r\.status = 'PUBLISHED'/g) || []).length, 2);
assert.match(reviewInsight, /WHERE product_id = \$1\s+AND status = 'PUBLISHED'/);
assert.match(reviewController, /r\.status = 'PUBLISHED'/);
assert.match(reviewController, /INSERT INTO reviews[^]*'PENDING'/);
console.log('reviewPublicationVisibilitySmoke: OK');
