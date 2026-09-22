'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { collectPreviewSourceGraph } = require('./helpers/adminCommerceProPreviewGraph');
const projectRoot = path.join(__dirname, '..', 'admin-commerce-pro');
const read = relativePath => fs.readFileSync(path.join(projectRoot, ...relativePath.split('/')), 'utf8');
const injected = (relativePath, addition) => ({ readSource: item => read(item) + (item === relativePath ? addition : '') });

test('actual standalone preview reaches the shared input-modality module and never live theme/auth code', () => {
    const graph = collectPreviewSourceGraph(projectRoot);
    assert.deepEqual(graph.files, ['src/AdminPresentationShell.jsx', 'src/App.jsx', 'src/integration/inputModality.js', 'src/main.jsx', 'src/previewModel.js', 'src/styles.css']);
    assert.equal(graph.modules.length, 5);
    for (const module of graph.modules) assert.doesNotMatch(module.source, /\bfetch\s*\(|\bXMLHttpRequest\b|\bWebSocket\b|\bEventSource\b|\bsendBeacon\s*\(|["'`]\/api(?:\/|["'`])/);
});
test('a direct theme import is a failure, not an excluded folder', () => {
    assert.throws(() => collectPreviewSourceGraph(projectRoot, injected('src/main.jsx', '\nimport "./theme-platform/adminThemeClient.js";')), /Canlı Admin\/tema entegrasyonu/);
});
test('a transitive theme re-export is rejected even when the entry itself is unchanged', () => {
    assert.throws(() => collectPreviewSourceGraph(projectRoot, injected('src/previewModel.js', '\nexport { createAdminThemeClient } from "./theme-platform/adminThemeClient.js";')), /Canlı Admin\/tema entegrasyonu/);
});
test('a literal lazy theme import is checked without having to click the hidden branch', () => {
    assert.throws(() => collectPreviewSourceGraph(projectRoot, injected('src/App.jsx', '\nexport const forbiddenLazy=()=>import("./theme-platform/ThemePlatform.jsx");')), /Canlı Admin\/tema entegrasyonu/);
});
test('computed imports and requires fail closed', () => {
    for (const code of ['import(window.previewModule)', 'require(window.previewModule)']) assert.throws(() => collectPreviewSourceGraph(projectRoot, injected('src/main.jsx', `\n${code};`)), /hesaplanan modül yolu/);
});
test('live Admin transport cannot enter through the otherwise shared integration folder', () => {
    assert.throws(() => collectPreviewSourceGraph(projectRoot, injected('src/integration/inputModality.js', '\nimport "./adminHttp.js";')), /Canlı Admin\/tema entegrasyonu/);
});
test('missing relative modules, source escapes and unreviewed external imports cannot be silently skipped', () => {
    assert.throws(() => collectPreviewSourceGraph(projectRoot, injected('src/main.jsx', '\nimport "./missing-preview-file.js";')), /ENOENT/);
    assert.throws(() => collectPreviewSourceGraph(projectRoot, injected('src/main.jsx', '\nimport "../../studio-core/src/module-entry.jsx";')), /src kapsamı dışına/);
    assert.throws(() => collectPreviewSourceGraph(projectRoot, injected('src/main.jsx', '\nimport "https://remote.invalid/code.js";')), /haricî modülü doğrulanmadı/);
});
test('changing the HTML module entry cannot evade preview dependency validation', () => {
    assert.throws(() => collectPreviewSourceGraph(projectRoot, { readSource: item => item === 'index.html' ? read(item).replace('/src/main.jsx', '/src/main-integrated.jsx') : read(item) }), /doğrulanan main.jsx/);
});
