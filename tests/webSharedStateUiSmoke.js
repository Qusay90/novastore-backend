const assert = require('assert');
const fs = require('fs');
const path = require('path');

const frontendDir = path.join(__dirname, '..', 'frontend');
const sharedStateSource = fs.readFileSync(path.join(frontendDir, 'shared-state-sync.js'), 'utf8');
const pages = ['index.html', 'product.html', 'profile.html', 'checkout.html'];
const pageSource = pages.map((file) => fs.readFileSync(path.join(frontendDir, file), 'utf8')).join('\n');

assert.strictEqual(sharedStateSource.includes('Storage.prototype.setItem'), false);
assert.strictEqual(pageSource.includes("alert('Favori işlemi tamamlanamadı. Lütfen tekrar deneyin.')"), false);
assert.strictEqual(pageSource.includes("alert('Sepet senkronlanamadi. Lutfen tekrar deneyin.')"), false);
assert.strictEqual(pageSource.includes("alert('Odeme taslagi senkronlanamadi. Lutfen tekrar deneyin.')"), false);
assert.strictEqual(pageSource.includes("alert('Odeme taslagi alinamadi. Lutfen tekrar deneyin.')"), false);
assert.strictEqual(pageSource.includes('reportError'), true);

console.log('web shared state UI smoke passed');
