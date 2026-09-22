'use strict';

const v = require('./themePlatformValidation');
const STATES = Object.freeze(['HIDDEN', 'READ_ONLY', 'EDITABLE', 'MANAGE', 'PUBLISH']);
// A profile is an editor experience, not a billing plan or an authorization role.
const CATALOG = Object.freeze({
    'theme.logo': ['Logo', 'theme.editor', 'EDITABLE'],
    'theme.colors': ['Renkler', 'theme.editor', 'EDITABLE'],
    'theme.typography': ['Yazı biçimi', 'theme.editor', 'EDITABLE'],
    'theme.header': ['Üst bölüm', 'theme.custom_header', 'MANAGE'],
    'theme.footer': ['Alt bölüm', 'theme.editor', 'MANAGE'],
    'theme.navigation': ['Gezinme', 'theme.editor', 'MANAGE'],
    'theme.product_grid': ['Ürün listeleri', 'theme.editor', 'EDITABLE'],
    'theme.category_grid': ['Kategoriler', 'theme.editor', 'EDITABLE'],
    'theme.banner': ['Kampanya görseli', 'theme.editor', 'EDITABLE'],
    'theme.text': ['Metinler', 'theme.editor', 'EDITABLE'],
    'theme.homepage_blocks': ['Sayfa bölümleri', 'theme.editor', 'MANAGE'],
    'theme.campaign_canvas': ['Kampanya tuvali', 'theme.advanced_blocks', 'MANAGE'],
    'theme.advanced_blocks': ['Gelişmiş bölümler', 'theme.advanced_blocks', 'MANAGE'],
    'theme.assets': ['Görsel kütüphanesi', 'theme.asset_bytes', 'MANAGE'],
    'theme.preview': ['Önizleme', 'theme.editor', 'EDITABLE'],
    'theme.save_draft': ['Taslağı kaydet', 'theme.editor', 'EDITABLE'],
    'theme.mobile_editor': ['Uygulama düzeni', 'theme.mobile_customization', 'EDITABLE'],
    'theme.version_history': ['Sürüm geçmişi', 'theme.editor', 'READ_ONLY'],
    'theme.publish': ['Yayın isteği', 'theme.publish', 'PUBLISH'],
    'theme.direct_publish': ['Doğrudan yayın', null, 'HIDDEN'],
    'theme.scheduling': ['Zamanlama', null, 'HIDDEN'],
    'theme.custom_css': ['Özel CSS', null, 'HIDDEN'],
    'theme.custom_html': ['Özel HTML', null, 'HIDDEN'],
    'theme.custom_js': ['Özel JavaScript', null, 'HIDDEN'],
    'theme.ai_builder': ['Yapay zekâ araçları', null, 'HIDDEN']
});
const writable = (state) => ['EDITABLE', 'MANAGE', 'PUBLISH'].includes(state);
const validateStates = (input) => {
    v.keys(input, Object.keys(CATALOG));
    for (const [code, state] of Object.entries(input)) {
        v.choice(state, STATES);
        if (CATALOG[code][2] === 'HIDDEN' && state !== 'HIDDEN') v.fail('THEME_CAPABILITY_UNSUPPORTED');
        if (code === 'theme.publish' && !['HIDDEN', 'READ_ONLY', 'PUBLISH'].includes(state)) v.fail('THEME_INVALID_CAPABILITY_STATE');
        if (code !== 'theme.publish' && state === 'PUBLISH') v.fail('THEME_INVALID_CAPABILITY_STATE');
        if (code === 'theme.version_history' && writable(state)) v.fail('THEME_INVALID_CAPABILITY_STATE');
    }
    return input;
};
const validateOverrides = (input) => {
    v.keys(input, Object.keys(CATALOG));
    for (const [code, decision] of Object.entries(input)) {
        v.keys(decision, ['effect', 'state'], ['effect']);
        v.choice(decision.effect, ['ALLOW', 'DENY']);
        if (decision.effect === 'ALLOW') {
            if (!Object.hasOwn(decision, 'state')) v.fail('THEME_INVALID_CAPABILITY_STATE');
            validateStates({ [code]: decision.state });
        } else if (decision.state !== undefined && decision.state !== 'HIDDEN') v.fail('THEME_INVALID_CAPABILITY_STATE');
    }
    return input;
};
const defaultProfile = (code) => {
    const states = Object.fromEntries(Object.keys(CATALOG).map((key) => [key, 'HIDDEN']));
    if (code === 'CUSTOM') return states;
    for (const key of ['logo', 'colors', 'typography', 'banner', 'text', 'product_grid', 'category_grid', 'preview', 'save_draft']) states[`theme.${key}`] = 'EDITABLE';
    for (const key of ['header', 'footer', 'navigation', 'assets', 'version_history']) states[`theme.${key}`] = 'READ_ONLY';
    if (code !== 'BASIC') {
        for (const key of ['footer', 'navigation', 'assets', 'homepage_blocks']) states[`theme.${key}`] = 'MANAGE';
        states['theme.mobile_editor'] = 'EDITABLE';
    }
    if (code === 'PRO') for (const [key, value] of Object.entries(CATALOG)) states[key] = value[2];
    return states;
};
const effectivePolicy = async (client, service, actor, candidate = null) => {
    const { effective, activeService } = require('./themePlatformService');
    await activeService(client, service);
    const config = candidate || (await client.query('SELECT * FROM theme_service_experiences WHERE service_id=$1 FOR SHARE', [service.id])).rows[0];
    const code = config?.profile_code || 'BASIC';
    const profile = (await client.query('SELECT * FROM theme_experience_profiles WHERE code=$1 FOR SHARE', [code])).rows[0];
    if (!profile) v.fail('THEME_PROFILE_UNAVAILABLE', 409);
    const overrides = config?.overrides || {};
    const decisions = {}, configuredCapabilities = {}, features = new Map();
    for (const [key, [label, billing, maxState]] of Object.entries(CATALOG)) {
        let state = profile.capabilities[key] || 'HIDDEN', reason = 'PROFILE_DEFAULT';
        if (actor?.kind === 'admin') { state = maxState; reason = 'ADMIN_ROLE'; }
        else if (overrides[key]?.effect === 'DENY') { state = 'HIDDEN'; reason = 'EXPLICIT_DENY'; }
        else if (overrides[key]?.effect === 'ALLOW') { state = overrides[key].state; reason = 'SERVICE_GRANT'; }
        if (!billing) { state = 'HIDDEN'; reason = 'NOT_IMPLEMENTED'; }
        else {
            if (!features.has(billing)) features.set(billing, await effective(client, service, billing));
            const decision = features.get(billing);
            if (!decision.allowed) { state = 'HIDDEN'; reason = decision.reason; }
        }
        const permission = key === 'theme.publish' ? 'publication.request' : key === 'theme.preview' ? 'preview.create' : key === 'theme.assets' ? 'asset.register' : 'draft.edit';
        configuredCapabilities[key] = { state, reason, label, supported: !!billing };
        if (!actor) { state = 'HIDDEN'; reason = 'LIVE_SELLER_SESSION_REQUIRED'; }
        else if (writable(state) && !actor.permissions.includes(permission)) { state = 'READ_ONLY'; reason = 'ROLE_READ_ONLY'; }
        decisions[key] = { state, reason, label, supported: !!billing };
    }
    return { serviceId: service.id, mode: actor?.kind || 'configured-only', profile: { code, name: profile.name, revision: profile.revision },
        profileCode: code, policyRevision: Number(service.policy_revision), overrides, capabilities: decisions,
        configuredCapabilities, sellerAccess: {status:actor?'VERIFIED':'UNAVAILABLE',reason:actor?null:'LIVE_SELLER_SESSION_REQUIRED'} };
};
const requireCapability = (policy, code, { read = false } = {}) => {
    const state = policy.capabilities[code]?.state || 'HIDDEN';
    if (read ? state === 'HIDDEN' : !writable(state)) v.fail('THEME_CAPABILITY_DENIED', 403);
};
const changedCapabilities = (base, current, next) => {
    if (base.schemaVersion === 2) return require('./themePlatformStudioDocument').changedCapabilities(base, current, next);
    const before = v.artifact(base, current), after = v.artifact(base, next), codes = new Set();
    for (const key of new Set([...Object.keys(before.tokens), ...Object.keys(after.tokens)])) {
        if (before.tokens[key] !== after.tokens[key]) codes.add(['fontFamily', 'fontSize'].includes(key) ? 'theme.typography' : ['radius', 'spacing'].includes(key) ? 'theme.homepage_blocks' : 'theme.colors');
    }
    if (v.digest(before.assetIds) !== v.digest(after.assetIds)) codes.add('theme.assets');
    for (const item of before.components) {
        const updated = after.components.find((entry) => entry.id === item.id);
        if (v.digest(item) === v.digest(updated)) continue;
        const code = { header: 'header', footer: 'footer', hero: 'banner', campaign: 'campaign_canvas', image: 'banner', text: 'text', product_grid: 'product_grid', category_grid: 'category_grid' }[item.type];
        codes.add(`theme.${code}`);
        if (item.hidden !== updated.hidden || item.order !== updated.order) codes.add('theme.homepage_blocks');
        if (item.props.target !== updated.props.target) codes.add('theme.navigation');
        if (item.type === 'header' && item.props.imageAssetId !== updated.props.imageAssetId) codes.add('theme.logo');
    }
    return [...codes];
};
const enforceDraftPolicy = async (client, service, actor, draft, base, proposed, policyRevision, channel) => {
    const configured = (await client.query('SELECT service_id FROM theme_service_experiences WHERE service_id=$1', [service.id])).rowCount;
    if (!configured && base.schemaVersion !== 2) return; // Wave 1 services retain their accepted entitlement contract.
    if (Number(service.policy_revision) !== policyRevision) v.fail('THEME_POLICY_REVISION_CONFLICT', 409);
    let policy = await effectivePolicy(client, service, actor);
    if (base.schemaVersion===2) {
        const assignment=(await client.query('SELECT theme_version_id FROM theme_assignments WHERE id=$1 AND service_id=$2 FOR SHARE',[draft.assignment_id,service.id])).rows[0];
        if (!assignment) v.fail('THEME_RESOURCE_NOT_FOUND',404);
        const presentationService=require('./themePlatformPresentationService');
        const presentation=await presentationService.loadPresentation(client,assignment.theme_version_id,channel);
        policy=presentationService.intersectPresentationCapabilities(policy,presentation,channel);
    }
    requireCapability(policy, 'theme.save_draft');
    if (channel === 'app') requireCapability(policy, 'theme.mobile_editor');
    for (const code of changedCapabilities(base, draft.overrides, proposed)) requireCapability(policy, code);
};
module.exports = { STATES, CATALOG, writable, validateStates, validateOverrides, defaultProfile, effectivePolicy, requireCapability, changedCapabilities, enforceDraftPolicy };
