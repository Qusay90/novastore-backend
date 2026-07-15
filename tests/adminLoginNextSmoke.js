const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'admin-login.html'), 'utf8');
const match = source.match(/const ADMIN_LOGIN_TARGETS[\s\S]*?function getAdminLoginTarget\(search = window\.location\.search\) \{[\s\S]*?\n        \}/);
assert.ok(match, 'admin login allowlist helper bulunmalı');

const context = vm.createContext({ URLSearchParams, window: { location: { search: '' } } });
vm.runInContext(`${match[0]}; globalThis.getAdminLoginTarget = getAdminLoginTarget;`, context);

assert.equal(context.getAdminLoginTarget(''), 'admin.html');
assert.equal(context.getAdminLoginTarget('?next=admin-commerce-pro-live.html'), 'admin-commerce-pro-live.html');
assert.equal(context.getAdminLoginTarget('?next=admin.html'), 'admin.html');
assert.equal(context.getAdminLoginTarget('?next=https://evil.example'), 'admin.html');
assert.equal(context.getAdminLoginTarget('?next=//evil.example'), 'admin.html');
assert.equal(context.getAdminLoginTarget('?next=admin-commerce-pro.html'), 'admin.html', 'mock preview login dönüş hedefi olmamalı');

assert.match(source, /window\.location\.href = getAdminLoginTarget\(\)/);
console.log('admin login next allowlist smoke passed');
