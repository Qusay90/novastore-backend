const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const vm = require('node:vm');

const repositoryRoot = path.join(__dirname, '..');
const previewPath = process.env.COMMERCE_PRO_PREVIEW_PATH
    ? path.resolve(process.env.COMMERCE_PRO_PREVIEW_PATH)
    : path.join(repositoryRoot, 'frontend', 'admin-commerce-pro.html');
const adminPath = path.join(repositoryRoot, 'frontend', 'admin.html');
const commerceProRoot = path.join(repositoryRoot, 'admin-commerce-pro');
const sourceRoot = path.join(commerceProRoot, 'src');
const stylesPath = path.join(repositoryRoot, 'admin-commerce-pro', 'src', 'styles.css');
const designQaPath = path.join(repositoryRoot, 'admin-commerce-pro', 'design-qa.md');
const standaloneBuilderPath = path.join(commerceProRoot, 'scripts', 'build-standalone.mjs');
const sourceFingerprintPath = path.join(commerceProRoot, 'scripts', 'source-fingerprint.mjs');
const viteConfigPath = path.join(commerceProRoot, 'vite.config.mjs');
const gitAttributesPath = path.join(repositoryRoot, '.gitattributes');

const preservedGitAttributeRules = [
    '/frontend/assets/fonts/inter/OFL-1.1.txt text eol=lf',
    '/frontend/assets/vendor/fontawesome/LICENSE.txt text eol=lf',
    '/storefront-commerce-pro/canonical/NovaStore-Commerce-Pro.html text eol=lf',
    '/storefront-commerce-pro/src/App.jsx text eol=lf',
    '/storefront-commerce-pro/src/catalog.js text eol=lf',
    '/storefront-commerce-pro/index.html text eol=lf',
    '/storefront-commerce-pro/src/CanonicalRuntimePresentation.jsx text eol=lf'
];
const generatedArtifactAttributeRules = new Map([
    ['frontend/admin-commerce-pro.html', 'frontend/admin-commerce-pro.html text eol=lf'],
    ['frontend/admin-commerce-pro-live.html', 'frontend/admin-commerce-pro-live.html text eol=lf']
]);
const rawByteMatrixArtifactKeys = ['preview', 'live'];
const rawByteMatrixStageKeys = ['blob', 'checkout', 'build1', 'build2'];
const rawByteArtifactDefinitions = {
    preview: { relativePath: 'frontend/admin-commerce-pro.html' },
    live: { relativePath: 'frontend/admin-commerce-pro-live.html' }
};
const childProcessMaxBuffer = 32 * 1024 * 1024;

const compareNames = (left, right) => (left < right ? -1 : left > right ? 1 : 0);

function listSourceModules(directory) {
    const entries = fs.readdirSync(directory, { withFileTypes: true })
        .sort((left, right) => compareNames(left.name, right.name));

    return entries.flatMap((entry) => {
        const entryPath = path.join(directory, entry.name);
        if (entry.isDirectory()) return listSourceModules(entryPath);
        if (!entry.isFile() || !/\.(?:js|jsx|ts|tsx)$/.test(entry.name)) return [];
        return [path.relative(commerceProRoot, entryPath).split(path.sep).join('/')];
    }).sort(compareNames);
}

function listSourceFiles(directory) {
    const entries = fs.readdirSync(directory, { withFileTypes: true })
        .sort((left, right) => compareNames(left.name, right.name));

    return entries.flatMap((entry) => {
        const entryPath = path.join(directory, entry.name);
        if (entry.isDirectory()) return listSourceFiles(entryPath);
        if (!entry.isFile()) return [];
        return [path.relative(commerceProRoot, entryPath).split(path.sep).join('/')];
    }).sort(compareNames);
}

function executeBuffer(command, args, cwd = repositoryRoot) {
    const output = execFileSync(command, args, {
        cwd,
        encoding: null,
        maxBuffer: childProcessMaxBuffer,
        stdio: ['ignore', 'pipe', 'pipe']
    });
    assert.ok(Buffer.isBuffer(output), `${command} stdout Buffer olmalı`);
    return output;
}

function executeText(command, args, cwd = repositoryRoot) {
    return executeBuffer(command, args, cwd).toString('utf8');
}

function executeNpmScript(scriptName) {
    if (process.platform === 'win32') {
        executeBuffer(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', 'npm.cmd', 'run', scriptName], commerceProRoot);
        return;
    }
    executeBuffer('npm', ['run', scriptName], commerceProRoot);
}

function sha256(buffer) {
    assert.ok(Buffer.isBuffer(buffer), 'SHA-256 girdisi Buffer olmalı');
    return createHash('sha256').update(buffer).digest('hex');
}

function countCrBytes(buffer) {
    assert.ok(Buffer.isBuffer(buffer), 'CR sayımı girdisi Buffer olmalı');
    let count = 0;
    for (const byte of buffer) {
        if (byte === 0x0d) count += 1;
    }
    return count;
}

function parseNullDelimitedGitAttributes(output, expectedPaths) {
    assert.ok(Buffer.isBuffer(output), 'git check-attr çıktısı Buffer olmalı');
    const fields = output.toString('utf8').split('\0');
    if (fields.at(-1) === '') fields.pop();
    assert.equal(fields.length, expectedPaths.length * 2 * 3, 'git check-attr -z tam sonuç dönmeli');

    const parsed = new Map();
    for (let index = 0; index < fields.length; index += 3) {
        const [filePath, attribute, value] = fields.slice(index, index + 3);
        assert.ok(expectedPaths.includes(filePath), `beklenmeyen git check-attr yolu: ${filePath}`);
        assert.ok(attribute === 'text' || attribute === 'eol', `beklenmeyen git attribute: ${attribute}`);
        const attributes = parsed.get(filePath) || new Map();
        assert.equal(attributes.has(attribute), false, `${filePath} için ${attribute} bir kez dönmeli`);
        attributes.set(attribute, value);
        parsed.set(filePath, attributes);
    }

    for (const filePath of expectedPaths) {
        assert.equal(parsed.get(filePath)?.get('text'), 'set', `${filePath} text attribute set olmalı`);
        assert.equal(parsed.get(filePath)?.get('eol'), 'lf', `${filePath} eol attribute lf olmalı`);
    }
    return parsed;
}

function buildRawByteOutputs(temporaryDirectory, buildLabel) {
    const previewOutput = path.join(temporaryDirectory, `${buildLabel}-preview.html`);
    const liveOutput = path.join(temporaryDirectory, `${buildLabel}-live.html`);

    executeNpmScript('build');
    executeBuffer(process.execPath, [standaloneBuilderPath, '--output', previewOutput], commerceProRoot);
    const preview = fs.readFileSync(previewOutput);

    executeNpmScript('build:live');
    executeBuffer(
        process.execPath,
        [standaloneBuilderPath, '--mode', 'integrated', '--output', liveOutput],
        commerceProRoot
    );
    const live = fs.readFileSync(liveOutput);

    assert.ok(Buffer.isBuffer(preview) && preview.length > 0, `${buildLabel} preview output Buffer olmalı`);
    assert.ok(Buffer.isBuffer(live) && live.length > 0, `${buildLabel} live output Buffer olmalı`);
    return { preview, live };
}

function assertRawByteMatrices(matrices, { emitDiagnostics = false } = {}) {
    assert.deepEqual(Object.keys(matrices), rawByteMatrixArtifactKeys, 'matrix artifact anahtarları exact preview + live olmalı');
    const diagnostics = {};

    for (const artifactKey of rawByteMatrixArtifactKeys) {
        const matrix = matrices[artifactKey];
        assert.deepEqual(
            Object.keys(matrix),
            rawByteMatrixStageKeys,
            `${artifactKey} matrix stage anahtarları exact blob + checkout + build1 + build2 olmalı`
        );
        assert.equal(Object.entries(matrix).length, 4, `${artifactKey} matrix tam dört entry içermeli`);
        const blob = matrix.blob;
        assert.ok(Buffer.isBuffer(blob) && blob.length > 0, `${artifactKey} blob gerçek ve dolu Buffer olmalı`);
        const blobSha = sha256(blob);
        diagnostics[artifactKey] = {};

        for (const stageKey of rawByteMatrixStageKeys) {
            const buffer = matrix[stageKey];
            assert.ok(Buffer.isBuffer(buffer), `${artifactKey} ${stageKey} gerçek Buffer olmalı`);
            assert.ok(buffer.length > 0, `${artifactKey} ${stageKey} Buffer boş olmamalı`);
            const crBytes = countCrBytes(buffer);
            const stageSha = sha256(buffer);
            assert.equal(crBytes, 0, `${artifactKey} ${stageKey} CR byte sayısı 0 olmalı`);
            assert.equal(buffer.equals(blob), true, `${artifactKey} ${stageKey} blob ile byte-for-byte eşit olmalı`);
            assert.equal(stageSha, blobSha, `${artifactKey} ${stageKey} SHA-256 blob SHA ile eşit olmalı`);
            diagnostics[artifactKey][stageKey] = { sha256: stageSha, crBytes };
            if (emitDiagnostics) {
                console.log(`${artifactKey} ${stageKey} sha256=${stageSha} cr=${crBytes}`);
            }
        }
    }
    return diagnostics;
}

function removeOwnedMatrixDirectory(temporaryDirectory) {
    const resolvedTemporaryDirectory = path.resolve(temporaryDirectory);
    const resolvedTempRoot = path.resolve(os.tmpdir());
    const normalizeCase = (value) => (process.platform === 'win32' ? value.toLocaleLowerCase('en-US') : value);
    assert.equal(
        normalizeCase(path.dirname(resolvedTemporaryDirectory)),
        normalizeCase(resolvedTempRoot),
        'matrix cleanup yalnız os.tmpdir() altındaki doğrudan görev dizinini kaldırmalı'
    );
    assert.match(
        path.basename(resolvedTemporaryDirectory),
        /^novastore-admin-raw-byte-matrix-[A-Za-z0-9_-]+$/,
        'matrix cleanup görev prefixini doğrulamalı'
    );
    assert.equal(fs.existsSync(resolvedTemporaryDirectory), true, 'matrix cleanup hedefi mevcut olmalı');
    fs.rmSync(resolvedTemporaryDirectory, { recursive: true, force: false, maxRetries: 3, retryDelay: 100 });
    assert.equal(fs.existsSync(resolvedTemporaryDirectory), false, 'matrix disposable dizini tamamen kaldırılmalı');
}

function assertRawByteArtifactMatrix() {
    const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'novastore-admin-raw-byte-matrix-'));
    const checkoutRoot = path.join(temporaryDirectory, 'checkout');
    const artifactPaths = Object.values(rawByteArtifactDefinitions).map(({ relativePath }) => relativePath);
    const primaryBefore = Object.fromEntries(Object.entries(rawByteArtifactDefinitions).map(([artifactKey, definition]) => [
        artifactKey,
        fs.readFileSync(path.join(repositoryRoot, ...definition.relativePath.split('/')))
    ]));
    let operationError;

    try {
        const headCommit = executeText('git', ['rev-parse', 'HEAD']).trim();
        assert.match(headCommit, /^[0-9a-f]{40,64}$/, 'HEAD tam commit kimliği olmalı');
        const blobs = Object.fromEntries(Object.entries(rawByteArtifactDefinitions).map(([artifactKey, definition]) => [
            artifactKey,
            executeBuffer('git', ['cat-file', 'blob', `HEAD:${definition.relativePath}`])
        ]));

        executeBuffer(
            'git',
            ['clone', '--local', '--no-hardlinks', '--no-checkout', '--no-tags', '--', repositoryRoot, checkoutRoot],
            temporaryDirectory
        );
        executeBuffer('git', ['config', 'core.autocrlf', 'true'], checkoutRoot);
        assert.equal(executeText('git', ['config', '--get', 'core.autocrlf'], checkoutRoot).trim(), 'true');
        executeBuffer('git', ['checkout', '--detach', headCommit], checkoutRoot);
        assert.equal(executeText('git', ['rev-parse', 'HEAD'], checkoutRoot).trim(), headCommit, 'checkout exact HEAD commit olmalı');
        assert.equal(
            executeText('git', ['status', '--porcelain=v1', '--untracked-files=all'], checkoutRoot),
            '',
            'clean Windows checkout status temiz olmalı'
        );

        const checkoutAttributes = parseNullDelimitedGitAttributes(
            executeBuffer('git', ['check-attr', '-z', 'text', 'eol', '--', ...artifactPaths], checkoutRoot),
            artifactPaths
        );
        const checkouts = Object.fromEntries(Object.entries(rawByteArtifactDefinitions).map(([artifactKey, definition]) => [
            artifactKey,
            fs.readFileSync(path.join(checkoutRoot, ...definition.relativePath.split('/')))
        ]));
        const build1 = buildRawByteOutputs(temporaryDirectory, 'build1');
        const build2 = buildRawByteOutputs(temporaryDirectory, 'build2');
        const matrices = {
            preview: { blob: blobs.preview, checkout: checkouts.preview, build1: build1.preview, build2: build2.preview },
            live: { blob: blobs.live, checkout: checkouts.live, build1: build1.live, build2: build2.live }
        };

        assertRawByteMatrices(matrices, { emitDiagnostics: true });
        for (const [artifactKey, definition] of Object.entries(rawByteArtifactDefinitions)) {
            assert.equal(
                fs.readFileSync(path.join(repositoryRoot, ...definition.relativePath.split('/'))).equals(primaryBefore[artifactKey]),
                true,
                `${artifactKey} primary tracked artifact test sırasında değişmemeli`
            );
            console.log(
                `check-attr ${artifactKey} text=${checkoutAttributes.get(definition.relativePath).get('text')} `
                + `eol=${checkoutAttributes.get(definition.relativePath).get('eol')}`
            );
        }
        assert.equal(
            executeText('git', ['status', '--porcelain=v1', '--untracked-files=all'], checkoutRoot),
            '',
            'matrix sonunda disposable checkout temiz kalmalı'
        );

        const missingEntryMatrix = {
            preview: {
                blob: matrices.preview.blob,
                checkout: matrices.preview.checkout,
                build1: matrices.preview.build1
            },
            live: matrices.live
        };
        assert.throws(
            () => assertRawByteMatrices(missingEntryMatrix),
            /matrix stage anahtarları/,
            'eksik matrix entry fail-closed assertion üretmeli'
        );
        const crMismatchMatrix = {
            preview: {
                ...matrices.preview,
                checkout: Buffer.concat([matrices.preview.checkout, Buffer.from([0x0d])])
            },
            live: matrices.live
        };
        assert.throws(
            () => assertRawByteMatrices(crMismatchMatrix),
            /CR byte sayısı 0 olmalı/,
            'checkout CR uyuşmazlığı fail-closed assertion üretmeli'
        );
        console.log('CLEAN_WINDOWS_CORE_AUTOCRLF=true');
        console.log('MISSING_MATRIX_ENTRY_FAIL_CLOSED=PASS');
        console.log('CR_MISMATCH_FAIL_CLOSED=PASS');
        console.log('RAW_BYTE_MATRIX=PASS');
    } catch (error) {
        operationError = error;
        throw error;
    } finally {
        try {
            removeOwnedMatrixDirectory(temporaryDirectory);
        } catch (cleanupError) {
            if (operationError) {
                throw new AggregateError([operationError, cleanupError], 'matrix işlemi ve disposable cleanup başarısız oldu');
            }
            throw cleanupError;
        }
    }
}

function assertGeneratedArtifactGitAttributes() {
    assert.ok(fs.existsSync(gitAttributesPath), '.gitattributes bulunmalı');
    const attributeLines = fs.readFileSync(gitAttributesPath, 'utf8').split(/\r?\n/);

    for (const rule of preservedGitAttributeRules) {
        assert.equal(
            attributeLines.filter((line) => line === rule).length,
            1,
            `mevcut .gitattributes kuralı korunmalı: ${rule}`
        );
    }
    for (const rule of generatedArtifactAttributeRules.values()) {
        assert.equal(
            attributeLines.filter((line) => line === rule).length,
            1,
            `generated artifact LF kuralı exact bir kez bulunmalı: ${rule}`
        );
    }

    const checkAttributeOutput = execFileSync(
        'git',
        ['check-attr', '-z', 'text', 'eol', '--', ...generatedArtifactAttributeRules.keys()],
        { cwd: repositoryRoot }
    ).toString('utf8');
    const fields = checkAttributeOutput.split('\0');
    if (fields.at(-1) === '') fields.pop();
    assert.equal(fields.length, generatedArtifactAttributeRules.size * 2 * 3, 'git check-attr -z tam sonuç dönmeli');

    const effectiveAttributes = new Map();
    for (let index = 0; index < fields.length; index += 3) {
        const [filePath, attribute, value] = fields.slice(index, index + 3);
        assert.ok(generatedArtifactAttributeRules.has(filePath), `beklenmeyen git check-attr yolu: ${filePath}`);
        assert.ok(attribute === 'text' || attribute === 'eol', `beklenmeyen git attribute: ${attribute}`);
        const fileAttributes = effectiveAttributes.get(filePath) || new Map();
        assert.equal(fileAttributes.has(attribute), false, `${filePath} için ${attribute} bir kez dönmeli`);
        fileAttributes.set(attribute, value);
        effectiveAttributes.set(filePath, fileAttributes);
    }

    for (const filePath of generatedArtifactAttributeRules.keys()) {
        assert.equal(effectiveAttributes.get(filePath)?.get('text'), 'set', `${filePath} text attribute set olmalı`);
        assert.equal(effectiveAttributes.get(filePath)?.get('eol'), 'lf', `${filePath} eol attribute lf olmalı`);
    }
}

async function run() {
const {
    canonicalizeFingerprintContent,
    canonicalizeFingerprintPath,
    createSourceFingerprint,
    updateSourceFingerprint
} = await import(pathToFileURL(sourceFingerprintPath).href);

assertGeneratedArtifactGitAttributes();

assert.ok(
    fs.existsSync(previewPath),
    [
        'frontend/admin-commerce-pro.html bulunamadı.',
        'Önce bağımsız Commerce Pro çıktısını oluşturun:',
        '  cd admin-commerce-pro && npm run build:integrated'
    ].join('\n')
);

assert.ok(fs.existsSync(adminPath), 'frontend/admin.html bulunamadı');

const previewBytes = fs.readFileSync(previewPath);
assert.equal(previewBytes.includes(0x0d), false, 'preview artifact CR byte içermemeli');
const previewSource = previewBytes.toString('utf8');
const adminSource = fs.readFileSync(adminPath, 'utf8');
const sourceModuleFiles = listSourceModules(sourceRoot);
const sourceFiles = listSourceFiles(sourceRoot);
const isPreviewSource = (relativePath) => (
    relativePath !== 'src/IntegratedApp.jsx'
    && relativePath !== 'src/integrated.css'
    && relativePath !== 'src/main-integrated.jsx'
    && !relativePath.startsWith('src/adapters/')
    && !relativePath.startsWith('src/integration/')
);
const sourceModules = sourceModuleFiles.map((relativePath) => ({
    relativePath,
    source: fs.readFileSync(path.join(commerceProRoot, relativePath), 'utf8')
}));
const previewSourceModules = sourceModules.filter(({ relativePath }) => isPreviewSource(relativePath));
const previewSourceFiles = sourceFiles.filter(isPreviewSource);
const applicationSource = previewSourceModules
    .map(({ relativePath, source }) => `/* ${relativePath} */\n${source}`)
    .join('\n');
const stylesSource = fs.readFileSync(stylesPath, 'utf8');
const designQaSource = fs.readFileSync(designQaPath, 'utf8');
const standaloneBuilderSource = fs.readFileSync(standaloneBuilderPath, 'utf8');
const viteConfigSource = fs.readFileSync(viteConfigPath, 'utf8');
const { value: expectedFingerprint, fingerprintFiles } = await createSourceFingerprint(
    commerceProRoot,
    { mode: 'preview' }
);

assert.ok(sourceModuleFiles.length > 0, 'src altında en az bir JavaScript modülü bulunmalı');
assert.ok(sourceFiles.includes('src/styles.css'), 'tüm src girdileri fingerprint kapsamına alınmalı');
assert.deepEqual(sourceFiles, [...sourceFiles].sort(compareNames), 'src fingerprint girdileri deterministik sırada taranmalı');
assert.ok(
    sourceModuleFiles.includes('src/previewModel.js'),
    'previewModel.js kaynak taraması ve fingerprint kapsamına alınmalı'
);
assert.deepEqual(
    sourceModuleFiles,
    [...sourceModuleFiles].sort(compareNames),
    'kaynak modülleri deterministik sırada taranmalı'
);
assert.match(
    standaloneBuilderSource,
    /builtFingerprint\.trim\(\) !== sourceFingerprint/,
    'standalone üretici eski Vite çıktısını güncel kaynak parmak iziyle damgalamamalı'
);
assert.match(
    viteConfigSource,
    /buildStart\(\)[\s\S]{0,220}createSourceFingerprint\(root, \{ mode \}\)[\s\S]{0,300}writeFile\(path\.join\(root, outputDirectory, "\.source-fingerprint"\), buildSourceFingerprint/,
    'Vite build kendi kaynak parmak izini seçili çıktı dizinine yazmalı'
);
assert.deepEqual(
    fingerprintFiles,
    [...fingerprintFiles].sort(compareNames),
    'fingerprint girdileri deterministik sırada olmalı'
);
assertRawByteArtifactMatrix();
assert.ok(
    fingerprintFiles.every((relativePath) => !relativePath.includes('\\') && !path.isAbsolute(relativePath)),
    'fingerprint yalnız canonical repository-relative yollar içermeli'
);

const digestEntry = (relativePath, content) => {
    const fingerprint = createHash('sha256');
    updateSourceFingerprint(fingerprint, relativePath, content);
    return fingerprint.digest('hex');
};
const lfText = Buffer.from('birinci\nikinci\nson\n', 'utf8');
const crlfText = Buffer.from('birinci\r\nikinci\r\nson\r\n', 'utf8');
const loneCrText = Buffer.from('birinci\rikinci\rson\r', 'utf8');

assert.equal(
    digestEntry('src/example.js', lfText),
    digestEntry('src/example.js', crlfText),
    'LF ve CRLF metin temsilleri aynı fingerprint değerini üretmeli'
);
assert.equal(
    digestEntry('src/example.js', lfText),
    digestEntry('src/example.js', loneCrText),
    'lone CR satır sonları LF olarak canonicalize edilmeli'
);
assert.deepEqual(
    canonicalizeFingerprintContent('src/example.js', loneCrText),
    lfText,
    'metin canonicalization yalnız satır sonlarını LF yapmalı'
);

const binaryFixture = Buffer.from([0x00, 0x0d, 0x0a, 0x7f, 0xff]);
const changedBinaryFixture = Buffer.from(binaryFixture);
changedBinaryFixture[3] ^= 0x01;
assert.deepEqual(
    canonicalizeFingerprintContent('public/example.png', binaryFixture),
    binaryFixture,
    'binary fingerprint girdisi byte-birebir korunmalı'
);
assert.notEqual(
    digestEntry('public/example.png', binaryFixture),
    digestEntry('public/example.png', changedBinaryFixture),
    'binary girdide tek byte değişikliği fingerprint değerini değiştirmeli'
);
assert.equal(
    digestEntry('src/example.js', lfText),
    digestEntry('src\\example.js', lfText),
    'Windows ve POSIX path separator temsilleri aynı fingerprint değerini üretmeli'
);
assert.equal(canonicalizeFingerprintPath('src\\example.js'), 'src/example.js');
const windowsMachinePath = ['X:', 'machine-root', 'source.js'].join('\\');
const posixMachinePath = ['', 'machine-root', 'source.js'].join('/');
assert.throws(
    () => canonicalizeFingerprintPath(windowsMachinePath),
    /repository-relative/,
    'Windows makine yolu fingerprint girdisi olamamalı'
);
assert.throws(
    () => canonicalizeFingerprintPath(posixMachinePath),
    /repository-relative/,
    'POSIX makine yolu fingerprint girdisi olamamalı'
);
assert.throws(
    () => canonicalizeFingerprintContent('public/example.bin', binaryFixture),
    /Desteklenmeyen fingerprint girdisi/,
    'tanımsız uzantı geniş text varsayımına düşmemeli'
);

assert.match(previewSource, /<!doctype html>/i, 'önizleme geçerli bir HTML belgesi olmalı');
assert.match(previewSource, /<html\b[^>]*\blang=["']tr["']/i, 'önizleme Türkçe belge dili tanımlamalı');
assert.match(previewSource, /<div\s+id=["']root["']\s*>\s*<\/div>/i, 'React kök elemanı bulunmalı');
assert.match(
    previewSource,
    /<link\b[^>]*\brel=["']icon["'][^>]*\bhref=["']data:image\/png;base64,/i,
    'önizleme favicon isteği için haricî veya eksik bir dosyaya bağlı olmamalı'
);

const robotsMeta = previewSource.match(/<meta\b[^>]*\bname=["']robots["'][^>]*>/i)?.[0];
assert.ok(robotsMeta, 'önizleme robots meta etiketi içermeli');
assert.match(robotsMeta, /\bcontent=["'][^"']*noindex[^"']*["']/i, 'önizleme noindex olmalı');
assert.match(robotsMeta, /\bcontent=["'][^"']*nofollow[^"']*["']/i, 'önizleme nofollow olmalı');

const fingerprintMeta = previewSource.match(/<meta\b[^>]*\bname=["']novastore-source-fingerprint["'][^>]*>/i)?.[0];
assert.ok(fingerprintMeta, 'önizleme kaynak parmak izi içermeli');
assert.match(
    fingerprintMeta,
    new RegExp(`\\bcontent=["']${expectedFingerprint}["']`, 'i'),
    'frontend/admin-commerce-pro.html kaynak kod ve assetlerle aynı build’den üretilmiş olmalı'
);

for (const marker of [
    'Commerce Pro önizlemesi',
    'Örnek veriler kullanılır',
    'hiçbir işlem kaydedilmez',
    'ödeme isteği gönderilmez'
]) {
    assert.ok(
        previewSource.includes(marker),
        `önizleme güvenlik sınırı metni eksik: ${marker}`
    );
}

assert.ok(
    /data-testid["']?\s*(?:=|:)\s*["']admin-shell["']/.test(previewSource),
    'Commerce Pro uygulama kabuğu build çıktısında bulunmalı'
);
assert.ok(
    /data-testid["']?\s*(?:=|:)\s*["']preview-banner["']/.test(previewSource),
    'kalıcı önizleme uyarısı build çıktısında bulunmalı'
);

assert.doesNotMatch(previewSource, /<script\b[^>]*\bsrc\s*=/i, 'harici script kaynağı kullanılamaz');
assert.doesNotMatch(previewSource, /<script\b[^>]*\btype=["']module["']/i, 'build çıktısı modül yükleyicisine bağlı olmamalı');
assert.doesNotMatch(
    previewSource,
    /<link\b[^>]*\brel=["'][^"']*stylesheet[^"']*["'][^>]*>/i,
    'harici stylesheet bağlantısı kullanılamaz'
);
assert.doesNotMatch(
    previewSource,
    /<(?:img|script|link|source)\b[^>]*\b(?:src|href|srcset)=["'](?:https?:)?\/\//i,
    'önizleme aktif bir harici kaynağa bağlanamaz'
);
assert.doesNotMatch(previewSource, /(?:src|href)=["']\/assets\//i, 'çözümlenmemiş /assets yolu kalmamalı');
assert.doesNotMatch(previewSource, /(?:src|href)=["']\/src\//i, 'çözümlenmemiş /src yolu kalmamalı');
assert.doesNotMatch(previewSource, /(?:src|href)=["'][^"']*icons\.js/i, 'ikon paketi HTML içine gömülmeli');
assert.match(previewSource, /data:image\/webp;base64,/i, 'ürün görselleri HTML içine gömülmeli');
assert.match(previewSource, /data:font\/woff2;base64,/i, 'font dosyaları HTML içine gömülmeli');
const previewCspMeta = previewSource.match(/<meta\b[^>]*\bhttp-equiv=["']Content-Security-Policy["'][^>]*>/i)?.[0];
assert.ok(previewCspMeta, 'bağımsız önizleme CSP meta etiketi içermeli');
assert.ok(previewCspMeta.includes("connect-src 'none'"), 'bağımsız önizleme runtime bağlantılarını CSP ile kapatmalı');
assert.ok(previewCspMeta.includes("default-src 'none'"), 'bağımsız önizleme varsayılan kaynakları kapatmalı');
assert.ok(previewCspMeta.includes("base-uri 'none'"), 'bağımsız önizleme base URI enjeksiyonunu kapatmalı');

const forbiddenRuntimePatterns = [
    [/\bfetch\s*\(/, 'fetch çağrısı'],
    [/\bnew\s+XMLHttpRequest\b|\bXMLHttpRequest\s*\(/, 'XMLHttpRequest çağrısı'],
    [/\bnew\s+WebSocket\b|\bWebSocket\s*\(/, 'WebSocket bağlantısı'],
    [/\bnew\s+EventSource\b|\bEventSource\s*\(/, 'EventSource bağlantısı'],
    [/\bsendBeacon\s*\(/, 'sendBeacon çağrısı'],
    [/\bsocket\.io\b|\/socket\.io\//i, 'Socket.IO bağlantısı'],
    [/["'`]\/api(?:\/|["'`])/, '/api endpoint referansı'],
    [/\bpaytr\b/i, 'PayTR referansı'],
    [/\biyzico\b/i, 'iyzico referansı']
];

for (const { relativePath, source } of previewSourceModules) {
    assert.doesNotMatch(
        source,
        /\bfetch\s*\(|\bXMLHttpRequest\b|\bWebSocket\b|\bEventSource\b|\bsendBeacon\s*\(/,
        `${relativePath} ağ çağrısı içeremez`
    );
    for (const [pattern, label] of forbiddenRuntimePatterns) {
        assert.doesNotMatch(source, pattern, `${relativePath} ${label} içeremez`);
    }
}

assert.match(
    applicationSource,
    /\{domain === "operations" && \(\s*<section className="saved-views"/,
    'sipariş kaydedilmiş görünümleri yalnız operasyon alanında sunulmalı'
);
assert.doesNotMatch(
    applicationSource,
    /domain === "operations" \|\| domain === "catalog"/,
    'sipariş kaydedilmiş görünümleri katalog alanına sızmamalı'
);
assert.match(
    applicationSource,
    /const visibleSelected = pagination\.rows\.filter/,
    'toplu işlem sayacı yalnız sayfadaki görünür sipariş seçimlerini kullanmalı'
);
assert.match(
    applicationSource,
    /setOrderStatuses\(rows, visibleIds, status\)/,
    'toplu durum güncellemesi görünmeyen siparişleri değiştirmemeli'
);
assert.match(
    applicationSource,
    /<select\s+aria-label="Örnek kapsam"\s+value=\{store\}/,
    'bağlamsal kapsam seçicisi ortak mağaza durumuna bağlı olmalı'
);
assert.match(
    applicationSource,
    /toastTimerRef/,
    'bildirim zamanlayıcısı renderlar arasında kalıcı bir ref kullanmalı'
);
assert.match(
    applicationSource,
    /className="row-entity-button"[\s\S]{0,300}aria-label=/,
    'satıcı satırları klavye ve ekran okuyucu için adlandırılmış kontrol içermeli'
);
assert.match(
    stylesSource,
    /@media \(max-width: 760px\)[\s\S]*?\.command-trigger \{ display: grid;/,
    'mobil görünüm komut paleti için dokunmatik tetikleyiciyi korumalı'
);
assert.equal(
    (stylesSource.match(/\.command-trigger > span:not\(\.icon-wrap\),\s*\.command-trigger kbd \{ display: none; \}/g) || []).length,
    2,
    'iki mobil breakpoint de yalnız komut etiketini gizleyip span.icon-wrap ikonunu korumalı'
);
assert.doesNotMatch(
    stylesSource,
    /\.command-trigger span,\s*\.command-trigger kbd \{ display: none; \}/,
    'mobil komut etiketi selectorü span.icon-wrap ikonunu gizlememeli'
);
assert.match(
    applicationSource,
    /className="command-trigger"[^>]*aria-label="Komut paletini aç"/,
    'mobil komut paleti tetikleyicisi görünür metin saklandığında da erişilebilir ada sahip olmalı'
);
assert.match(
    applicationSource,
    /\.\.\.orders\.map\(\(item\) => \(\{ id: "order-" \+ item\.id/,
    'komut paleti örnek siparişlerin tamamını aranabilir tutmalı'
);
assert.doesNotMatch(
    applicationSource,
    /orders\.slice\(0,\s*8\)\.map/,
    'komut paleti sipariş aramasını ilk kayıtlarla sınırlamamalı'
);
assert.match(
    applicationSource,
    /setFilter\(\{ status: view\.status, query: view\.query \|\| "" \}\)/,
    'kaydedilmiş görünüm uygulanırken arama sorgusu geri yüklenmeli'
);
assert.match(
    applicationSource,
    /savedViews\.concat\(\{ name, status: filter\.status, query: filter\.query, scope \}\)/,
    'kaydedilmiş görünüm etkin arama sorgusunu ve kapsam etiketini saklamalı'
);
assert.match(
    applicationSource,
    /savedViews\.some\(\(view\) => view\.name\.toLocaleLowerCase\("tr-TR"\) === normalizedName\)/,
    'yinelenen kaydedilmiş görünüm adları büyük-küçük harf duyarsız engellenmeli'
);
assert.match(
    applicationSource,
    /className="modal-error"[^>]*id="save-view-error"[^>]*role="alert"/,
    'kaydedilmiş görünüm doğrulama hatası modal içinde erişilebilir biçimde açıklanmalı'
);
assert.match(
    applicationSource,
    /aria-invalid=\{saveViewError \? "true" : undefined\}[\s\S]{0,160}aria-describedby=\{saveViewError \? "save-view-error" : undefined\}/,
    'kaydedilmiş görünüm adı alanı modal doğrulama mesajına bağlanmalı'
);
assert.match(
    applicationSource,
    /event\.preventDefault\(\);[\s\S]{0,180}if \(!dialog && !document\.querySelector\("dialog\[open\]"\)\) openDialog\("command"\)/,
    'komut paleti kısayolu açık bir modalı ve odak geri dönüş hedefini değiştirmemeli'
);

for (const [pattern, label] of [
    [/\bpaginateRows\(filtered, page, pageSize\)/, 'gerçek sipariş sayfalama modeli'],
    [/function OperationsPreviewTable\(/, 'satıcı siparişi, iade ve stok tablo yüzeyi'],
    [/function ProductDialog\(/, 'yerel ürün oluşturma ve düzenleme yüzeyi'],
    [/function MarketplaceScopeNotice\(/, 'mevcut tek satıcılı backend ile hedef pazaryeri ayrımı'],
    [/\bvalidateProductDraft\(draft, products, product\?\.offerId \|\| ""\)/, 'offer kimlikli ürün doğrulama sözleşmesi'],
    [/product\.publicationStatus === "İstisna incelemesi"/, 'yalnız politika istisnasına özgü ürün aksiyonu'],
    [/readOnly=\{externalOffer\}/, 'haricî satıcı teklif alanlarının admin düzenlemesine kapatılması'],
    [/!isFirstPartyOffer\(product\)/, 'teklif sahipliğinin gösterim adından bağımsız korunması'],
    [/record\.offerId === editingOfferId/, 'teklif güncellemesinin global offer kimliğiyle yapılması'],
    [/record\.canonicalId === normalized\.canonicalId/, 'kanonik içeriğin bağlı tekliflere yayılması'],
    [/requiredPolicySignals/, 'politika motorunun zorunlu girdileri fail-closed doğrulaması'],
    [/SELLER_NOT_ACTIVE/, 'aktif olmayan satıcı teklifini engelleyen politika kuralı'],
    [/POLICY_CHECKS_PASSED/, 'başarılı otomatik yayın reason code kaydı'],
    [/review\.reasons\.map/, 'açıklanabilir onboarding inceleme nedenleri'],
    [/itemReview\.level/, 'türetilmiş satıcı inceleme önceliği'],
    [/isSellerDocumentComplete\(key, value\)/, 'belge muafiyetinin modele bağlı görsel doğrulaması'],
    [/Bantlar: 0–19 Rutin · 20–49 İnceleme gerekli · 50–100 Öncelikli/, 'inceleme önceliği eşik açıklaması'],
    [/function downloadCsv\(/, 'güvenli yerel CSV üretimi'],
    [/disabled=\{item\.disabled\}/, 'entegrasyona ertelenen bağlam kontrolleri'],
    [/role="combobox"[\s\S]{0,240}aria-activedescendant=/, 'klavye erişilebilir komut paleti'],
    [/function EmptyTable\(/, 'filtrelenmiş boş tablo durumu'],
    [/setDateRange\(next\)/, 'kontrollü tarih aralığı'],
    [/setStoreScope/, 'ortak mağaza kapsamı uygulaması']
]) {
    assert.match(applicationSource, pattern, 'uygulama ' + label + ' içermeli');
}

assert.doesNotMatch(
    applicationSource,
    /Ürün Onayları|Onay Bekleyen|Bekleyen Satıcı Onayı|Canlı Sipariş Operasyonu|seller\.risk|item\.risk|filters\.risk/,
    'ürün bazlı manuel onay ve hardcode satıcı risk sözleşmesi kalmamalı'
);
assert.match(
    applicationSource,
    /Otomatik karar değildir[\s\S]{0,900}İsim, yetkili, komisyon ve ürün sayısı puana girmez/,
    'inceleme skoru otomatik karar olmadığını ve puan dışı alanları açıklamalı'
);
assert.match(
    applicationSource,
    /Mevcut backend tek satıcılıdır/,
    'hedef pazaryeri ekranı mevcut backend sınırını görünür kılmalı'
);
assert.match(
    applicationSource,
    /seller-scope henüz uygulanmamıştır/,
    'katalog hedef mimariyi çalışan backend gibi sunmamalı'
);
assert.match(
    applicationSource,
    /aria-disabled=\{seller\.status === "Onaylandı" \|\| !review\.approvalEligible\}[\s\S]{0,180}aria-describedby=/,
    'onboarding onay kapısı açıklamasını klavye ve yardımcı teknolojiye bağlamalı'
);
assert.match(
    applicationSource,
    /sellerRequiredDocumentKeys\.map[\s\S]{0,420}Kaynak verisi eksik/,
    'eksik doğrulama kaydı detay ekranını çökertmeden görünür açıklanmalı'
);

for (const [pattern, label] of [
    [/current && compact && \([\s\S]{0,220}<Modal[^>]+testId="row-inspector"/, 'compact sipariş modalı'],
    [/document\.activeElement === container[\s\S]{0,160}event\.shiftKey \? last : first/, 'container başlangıçlı odak döngüsü'],
    [/contextItem === "Segmentler"[\s\S]{0,300}className="segment-grid"/, 'etkileşimli müşteri segment görünümü'],
    [/contextItem === "Rol Düzenleri"[\s\S]{0,500}role-module-summary/, 'rol düzenine özgü modül özeti'],
    [/contextItem !== "Bugün" \|\| order\.today/, 'bugüne özgü sipariş kapsamı'],
    [/cardClass="seller-detail-modal"/, 'dört satırlı mobil satıcı modalı'],
    [/Dönüşüm", disabled: true/, 'ertelenmiş dönüşüm raporu kontrolü'],
    [/Ürün İçgörüleri", disabled: true/, 'ertelenmiş ürün içgörüleri kontrolü']
]) {
    assert.match(applicationSource, pattern, 'uygulama ' + label + ' içermeli');
}

assert.match(stylesSource, /\.seller-detail-modal\s*\{[\s\S]{0,140}grid-template-rows:\s*auto auto minmax\(0, 1fr\) auto/, 'mobil satıcı modalı dört açık grid satırı tanımlamalı');
assert.match(stylesSource, /\.topbar \.date-select \{ display: none; \}/, 'dar üst çubuk bağlamsal tarih kontrolünü çoğaltmamalı');
assert.match(stylesSource, /\.statusbar > span \{ display: none; \}/, 'mobil durum çubuğu yalnız metinleri gizleyip sıfırlama düğmesini korumalı');

for (const [pattern, label] of forbiddenRuntimePatterns) {
    assert.doesNotMatch(previewSource, pattern, `önizleme ${label} içeremez`);
}

const inlineScripts = Array.from(
    previewSource.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi),
    (match) => match[1]
);
assert.ok(inlineScripts.length >= 1, 'bağımsız build en az bir gömülü script içermeli');
inlineScripts.forEach((script, index) => {
    assert.doesNotThrow(
        () => new vm.Script(script, { filename: `admin-commerce-pro.inline-${index + 1}.js` }),
        `gömülü script ${index + 1} sözdizimi geçerli olmalı`
    );
});

const previewLink = adminSource.match(
    /<a\b(?=[^>]*\bhref=["'](?:\.\/|\/)?admin-commerce-pro\.html["'])[^>]*>/i
)?.[0];
assert.ok(previewLink, 'frontend/admin.html Commerce Pro önizlemesine bağlantı vermeli');
assert.match(previewLink, /\btarget=["']_blank["']/i, 'önizleme bağlantısı yeni sekmede açılmalı');
assert.match(previewLink, /\brel=["'][^"']*noopener[^"']*["']/i, 'yeni sekme bağlantısı noopener kullanmalı');
assert.match(
    adminSource,
    /<option\s+value=["']pending_approval["']>Yayın İncelemesinde<\/option>[\s\S]{0,520}satıcı ürün izni değildir\./,
    'kabul edilen admin pending_approval durumunu satıcı onayı gibi göstermemeli'
);
assert.match(
    adminSource,
    /pending_approval:\s*["']Yayın İncelemesinde["']/,
    'ürün listesi iç yayın durumunu açıklayıcı etiketle göstermeli'
);

const designQaFinalResults = Array.from(
    designQaSource.matchAll(/^final result:\s*(\S+)\s*$/gim),
    (match) => match[1].toLocaleLowerCase('tr-TR')
);
assert.deepEqual(
    designQaFinalResults,
    ['blocked'],
    'masaüstü/mobil browser kanıtı tamamlanana kadar tasarım QA tek bir blocked sonucu taşımalı'
);
assert.match(
    designQaSource,
    /^## Açık browser kanıtı blokeri\s*$/im,
    'design QA güncel browser kanıtı blokerini açıkça belgelemeli'
);
assert.match(
    designQaSource,
    /Draft PR[\s\S]{0,240}merge-ready kabul edilmemelidir\./i,
    'design QA browser kanıtı tamamlanmadan PR için merge-ready sonucu vermemeli'
);

console.log('admin Commerce Pro preview smoke passed');
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
