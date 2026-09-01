'use strict';

const assert = require('assert');
const dataset = require('../shared/turkiye-provinces-districts.v1.json');
const {
    canonicalProvince,
    canonicalProvinceDistrict,
    districtsForProvince,
    getDatasetSummary,
    normalizeTurkishMobilePhone,
    searchKey
} = require('../services/turkiyeAddressContract');
const { __test: addressTest } = require('../controllers/addressController');

assert.deepStrictEqual(getDatasetSummary(), {
    schemaVersion: 'tr-address-v1',
    countryCode: 'TR',
    provinceCount: 81,
    districtCount: 973
});
assert.strictEqual(dataset.provinces.length, 81);
assert.strictEqual(dataset.provinces.reduce((sum, province) => sum + province.districts.length, 0), 973);
assert.strictEqual(new Set(dataset.provinces.map((province) => province.name)).size, 81);
assert.ok(dataset.provinces.every((province) => province.districts.length > 0));
assert.ok(dataset.provinces.every((province) => new Set(province.districts).size === province.districts.length));

assert.strictEqual(canonicalProvince('istanbul'), 'İstanbul');
assert.strictEqual(canonicalProvince('KİLİS'), 'Kilis');
assert.strictEqual(searchKey('Şırnak'), 'sirnak');
assert.deepStrictEqual(districtsForProvince('kilis'), ['Elbeyli', 'Merkez', 'Musabeyli', 'Polateli']);
assert.deepStrictEqual(canonicalProvinceDistrict('KİLİS', 'merkez'), { province: 'Kilis', district: 'Merkez' });
assert.strictEqual(canonicalProvinceDistrict('Kilis', 'Kadıköy'), null);
assert.strictEqual(canonicalProvinceDistrict('Atlantis', 'Merkez'), null);

assert.strictEqual(normalizeTurkishMobilePhone('05551234567'), '05551234567');
assert.strictEqual(normalizeTurkishMobilePhone(' 05551234567 '), '05551234567');
for (const invalid of [
    '5551234567',
    '0555123456',
    '055512345678',
    '0555 123 45 67',
    '+905551234567',
    '05551234abc',
    5551234567,
    null,
    undefined
]) {
    assert.strictEqual(normalizeTurkishMobilePhone(invalid), null, `phone must be rejected: ${String(invalid)}`);
}

const validAddress = {
    title: 'Ev',
    fullName: 'Nova Müşteri',
    phone: '05551234567',
    city: 'Kilis',
    district: 'Merkez',
    addressLine: 'Test Mahallesi Test Sokak No 1',
    isDefault: true
};
assert.strictEqual(addressTest.validateAddressInput(validAddress), null);
assert.match(addressTest.validateAddressInput({ ...validAddress, phone: '055512345678' }), /11 haneli/);
assert.match(addressTest.validateAddressInput({ ...validAddress, city: 'Kilis', district: 'Kadıköy' }), /eşleşmesi geçersiz/);
assert.deepStrictEqual(addressTest.canonicalizeAddressInput({ ...validAddress, city: 'kİlİs', district: 'merkez' }), validAddress);
assert.strictEqual(addressTest.normalizeAddressId('12'), 12);
assert.strictEqual(addressTest.normalizeAddressId('12abc'), null);

console.log('Türkiye address contract smoke passed');
