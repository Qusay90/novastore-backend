'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');

const sourceExtensions = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs']);
const previewDependencies = new Set(['react', 'react/jsx-runtime', 'react-dom/client', 'uplot', 'uplot/dist/uPlot.min.css']);
function assertPreviewModule(relativePath) {
    assert.ok(relativePath.startsWith('src/') && !relativePath.split('/').includes('..'), `Preview modülü src kapsamı dışına çıkamaz: ${relativePath}`);
    assert.ok(!['src/IntegratedApp.jsx', 'src/main-integrated.jsx', 'src/integrated.css'].includes(relativePath)
        && !relativePath.startsWith('src/theme-platform/')
        && !relativePath.startsWith('src/adapters/')
        && !(relativePath.startsWith('src/integration/') && relativePath !== 'src/integration/inputModality.js'),
    `Canlı Admin/tema entegrasyonu bağımsız preview girişinden erişilemez olmalı: ${relativePath}`);
}

// Traverse the actual preview entry instead of treating every new source folder
// as preview code. The original HTML/network/CSP checks remain separate gates.
// Literal lazy imports are included even when not executed in a sample run;
// computed imports fail closed rather than disappearing from the graph.
function collectPreviewSourceGraph(projectRoot, { readSource } = {}) {
    const requireProject = createRequire(path.join(projectRoot, 'package.json'));
    const { transformSync } = requireProject('esbuild');
    const { parseAst } = requireProject('rollup/parseAst');
    const read = readSource || (relativePath => fs.readFileSync(path.join(projectRoot, ...relativePath.split('/')), 'utf8'));
    const index = read('index.html');
    const entries = [...index.matchAll(/<script\b(?=[^>]*\btype=["']module["'])[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)].map(match => match[1]);
    assert.deepEqual(entries, ['/src/main.jsx'], 'Bağımsız HTML tam olarak doğrulanan main.jsx girişini kullanmalı');
    const pending = ['src/main.jsx'], modules = [], files = new Set();
    while (pending.length) {
        const relativePath = pending.pop();
        if (files.has(relativePath)) continue;
        assertPreviewModule(relativePath);
        const source = read(relativePath);
        files.add(relativePath);
        const extension = path.posix.extname(relativePath);
        if (!sourceExtensions.has(extension)) {
            assert.ok(['.css', '.json'].includes(extension), `Preview bağımlılık türü doğrulanmadı: ${relativePath}`);
            continue;
        }
        modules.push({ relativePath, source });
        const loader = extension.slice(1) === 'mjs' ? 'js' : extension.slice(1);
        const { code } = transformSync(source, { loader, jsx: 'transform', target: 'esnext', sourcefile: relativePath });
        const imports = [];
        function literal(node) {
            assert.ok(node?.type === 'Literal' && typeof node.value === 'string', `Preview hesaplanan modül yolunu yükleyemez: ${relativePath}`);
            imports.push(node.value);
        }
        function visit(node) {
            if (!node || typeof node !== 'object') return;
            if (['ImportDeclaration', 'ExportNamedDeclaration', 'ExportAllDeclaration', 'ImportExpression'].includes(node.type) && node.source) literal(node.source);
            if (node.type === 'CallExpression' && node.callee?.type === 'Identifier' && node.callee.name === 'require') {
                assert.equal(node.arguments.length, 1, `Preview require girdisi belirsiz: ${relativePath}`);
                literal(node.arguments[0]);
            }
            for (const value of Object.values(node)) if (Array.isArray(value)) value.forEach(visit); else if (value && typeof value === 'object') visit(value);
        }
        visit(parseAst(code));
        for (const specifier of imports) {
            if (!specifier.startsWith('.')) {
                assert.ok(previewDependencies.has(specifier), `Preview haricî modülü doğrulanmadı: ${specifier}`);
                continue;
            }
            assert.doesNotMatch(specifier, /[?#\\]/, `Preview modül yolu belirsiz: ${specifier}`);
            const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(relativePath), specifier));
            assertPreviewModule(resolved);
            pending.push(resolved);
        }
    }
    modules.sort((a, b) => a.relativePath.localeCompare(b.relativePath, 'en'));
    return { modules, files: [...files].sort() };
}

module.exports = { collectPreviewSourceGraph };
