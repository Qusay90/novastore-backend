'use strict';

const dataset = require('../shared/turkiye-provinces-districts.v1.json');

const TURKISH_MOBILE_PATTERN = /^05[0-9]{9}$/;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/;

const searchKey = (value) => String(value ?? '')
    .trim()
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .normalize('NFD')
    .replace(/\p{M}+/gu, '');

const provinceBySearchKey = new Map(dataset.provinces.map((province) => [searchKey(province.name), province]));

const normalizeTurkishMobilePhone = (value) => {
    if (typeof value !== 'string') return null;
    const phone = value.trim();
    return TURKISH_MOBILE_PATTERN.test(phone) ? phone : null;
};

const canonicalProvince = (value) => provinceBySearchKey.get(searchKey(value))?.name || null;

const districtsForProvince = (provinceValue) => {
    const province = provinceBySearchKey.get(searchKey(provinceValue));
    return province ? Object.freeze([...province.districts]) : Object.freeze([]);
};

const canonicalProvinceDistrict = (provinceValue, districtValue) => {
    const province = provinceBySearchKey.get(searchKey(provinceValue));
    if (!province) return null;
    const districtNeedle = searchKey(districtValue);
    const district = province.districts.find((candidate) => searchKey(candidate) === districtNeedle);
    return district ? Object.freeze({ province: province.name, district }) : null;
};

const validateAddressText = (value, { minimum, maximum }) => (
    typeof value === 'string'
    && value.trim().length >= minimum
    && value.trim().length <= maximum
    && !CONTROL_CHARACTER_PATTERN.test(value)
);

const getDatasetSummary = () => Object.freeze({
    schemaVersion: dataset.schemaVersion,
    countryCode: dataset.countryCode,
    provinceCount: dataset.provinceCount,
    districtCount: dataset.districtCount
});

module.exports = Object.freeze({
    TURKISH_MOBILE_PATTERN,
    canonicalProvince,
    canonicalProvinceDistrict,
    districtsForProvince,
    getDatasetSummary,
    normalizeTurkishMobilePhone,
    searchKey,
    validateAddressText
});
