const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const repositoryRoot = path.resolve(__dirname, '..');
const commerceRoot = path.join(repositoryRoot, 'storefront-commerce-pro');
const frontendRoot = path.join(repositoryRoot, 'frontend');
const artifactPath = path.join(frontendRoot, 'commerce-pro', 'index.html');
const artifactRelativePath = 'frontend/commerce-pro/index.html';
const artifactAttributeRule = '/frontend/commerce-pro/index.html text eol=lf';
const packageLockPaths = Object.freeze([
    'package-lock.json',
    'storefront-commerce-pro/package-lock.json',
    'admin-commerce-pro/package-lock.json'
]);
const rawByteMatrixStages = Object.freeze(['blob', 'checkout', 'build1', 'build2']);
const childProcessMaxBuffer = 64 * 1024 * 1024;

const EXPECTED = Object.freeze({
    'canonical/NovaStore-Commerce-Pro.html': '8b6301362b6c01b649db1d7cfa4dc00d5b4392309e4ece2c7c14870cab0f2b0d',
    'src/App.jsx': 'd31e7642f6bccb75094361be3dc2dd3b85cc38a4d968bbfd57ee3ee7ffd80fb6',
    'src/catalog.js': 'a38d2e5f5a09fdc47bd9102800b04c423cf19b8d4d6bc952b77a5b77dc74062d',
    'src/canonical.css': '5b8e0d4a4eb1fb954e089f5c0e9dbabcad8217032ef12e3a67a03d89072e0896'
});

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const readCommerce = (relativePath, encoding = null) => fs.readFileSync(path.join(commerceRoot, relativePath), encoding || undefined);

const executeBuffer = (command, args, cwd = repositoryRoot, environment = {}) => {
    try {
        const output = execFileSync(command, args, {
            cwd,
            encoding: null,
            env: { ...process.env, ...environment },
            maxBuffer: childProcessMaxBuffer,
            stdio: ['ignore', 'pipe', 'pipe'],
            windowsHide: true
        });
        assert(Buffer.isBuffer(output), `${command} stdout must be a Buffer`);
        return output;
    } catch (error) {
        const stderr = Buffer.isBuffer(error?.stderr) ? error.stderr.toString('utf8').trim() : '';
        const stdout = Buffer.isBuffer(error?.stdout) ? error.stdout.toString('utf8').trim() : '';
        const detail = [stderr, stdout].filter(Boolean).join('\n');
        const wrapped = new Error(
            `${command} ${args.join(' ')} failed${detail ? `:\n${detail}` : ''}`,
            { cause: error }
        );
        throw wrapped;
    }
};

const executeText = (command, args, cwd = repositoryRoot, environment = {}) => (
    executeBuffer(command, args, cwd, environment).toString('utf8')
);

const executeNpm = (args, cwd, environment = {}) => {
    if (process.platform === 'win32') {
        return executeBuffer(
            process.env.ComSpec || 'cmd.exe',
            ['/d', '/s', '/c', 'npm.cmd', ...args],
            cwd,
            environment
        );
    }
    return executeBuffer('npm', args, cwd, environment);
};

const countCrBytes = (buffer) => {
    assert(Buffer.isBuffer(buffer), 'CR count input must be a Buffer');
    let count = 0;
    for (const byte of buffer) {
        if (byte === 0x0d) count += 1;
    }
    return count;
};

const countLoneCrBytes = (buffer) => {
    assert(Buffer.isBuffer(buffer), 'lone CR count input must be a Buffer');
    let count = 0;
    for (let index = 0; index < buffer.length; index += 1) {
        if (buffer[index] === 0x0d && buffer[index + 1] !== 0x0a) count += 1;
    }
    return count;
};

const describeRawBuffer = (buffer) => {
    assert(Buffer.isBuffer(buffer), 'raw-byte matrix entry must be a Buffer');
    return Object.freeze({
        sha256: sha256(buffer),
        crBytes: countCrBytes(buffer),
        loneCrBytes: countLoneCrBytes(buffer),
        byteLength: buffer.length
    });
};

const parseNullDelimitedGitAttributes = (output, expectedPath) => {
    assert(Buffer.isBuffer(output), 'git check-attr output must be a Buffer');
    const fields = output.toString('utf8').split('\0');
    if (fields.at(-1) === '') fields.pop();
    assert.equal(fields.length, 6, 'git check-attr -z must return exact text/eol records');

    const attributes = new Map();
    for (let index = 0; index < fields.length; index += 3) {
        const [filePath, attribute, value] = fields.slice(index, index + 3);
        assert.equal(filePath, expectedPath, `unexpected git check-attr path: ${filePath}`);
        assert.ok(attribute === 'text' || attribute === 'eol', `unexpected git attribute: ${attribute}`);
        assert.equal(attributes.has(attribute), false, `${attribute} must be returned exactly once`);
        attributes.set(attribute, value);
    }

    assert.equal(attributes.get('text'), 'set', `${expectedPath} text attribute must be set`);
    assert.equal(attributes.get('eol'), 'lf', `${expectedPath} eol attribute must be lf`);
    return attributes;
};

const assertStorefrontArtifactGitAttributes = (root = repositoryRoot) => {
    const attributesPath = path.join(root, '.gitattributes');
    assert(fs.existsSync(attributesPath), '.gitattributes must exist');
    const lines = fs.readFileSync(attributesPath, 'utf8').split(/\r?\n/);
    assert.equal(
        lines.filter((line) => line === artifactAttributeRule).length,
        1,
        'storefront production artifact LF rule must exist exactly once'
    );
    return parseNullDelimitedGitAttributes(
        executeBuffer('git', ['check-attr', '-z', 'text', 'eol', '--', artifactRelativePath], root),
        artifactRelativePath
    );
};

const captureRepositorySeal = (root) => {
    const lockfiles = Object.fromEntries(packageLockPaths.map((relativePath) => {
        const lockPath = path.join(root, ...relativePath.split('/'));
        assert(fs.existsSync(lockPath), `package lock must exist: ${relativePath}`);
        return [relativePath, sha256(fs.readFileSync(lockPath))];
    }));
    const sealedArtifactPath = path.join(root, ...artifactRelativePath.split('/'));
    assert(fs.existsSync(sealedArtifactPath), 'sealed storefront artifact must exist');
    return Object.freeze({
        head: executeText('git', ['rev-parse', 'HEAD'], root).trim(),
        indexSha256: sha256(executeBuffer('git', ['ls-files', '--stage', '-z'], root)),
        statusSha256: sha256(executeBuffer('git', ['status', '--porcelain=v1', '-z', '--untracked-files=all'], root)),
        artifactSha256: sha256(fs.readFileSync(sealedArtifactPath)),
        lockfiles
    });
};

const assertRepositorySealEqual = (before, after) => {
    assert.deepEqual(after, before, 'outer repository HEAD/index/status/artifact/lockfile seal must remain unchanged');
};

const normalizeRealPath = (value) => {
    const resolved = fs.realpathSync(value);
    return process.platform === 'win32' ? resolved.toLocaleLowerCase('en-US') : resolved;
};

const assertBuildRootInsideCheckout = (checkoutRoot, buildRoot) => {
    assert.equal(
        path.relative(path.resolve(checkoutRoot), path.resolve(buildRoot)),
        'storefront-commerce-pro',
        'build root must be the storefront package inside the disposable checkout'
    );
    assert.notEqual(
        normalizeRealPath(buildRoot),
        normalizeRealPath(commerceRoot),
        'build root must not resolve to the outer repository storefront package'
    );
};

const assertCleanCheckout = (checkoutRoot, label) => {
    assert.equal(
        executeText('git', ['status', '--porcelain=v1', '--untracked-files=all'], checkoutRoot),
        '',
        `${label} disposable checkout must remain clean`
    );
};

const buildRawByteArtifact = (checkoutRoot, buildLabel) => {
    const buildRoot = path.join(checkoutRoot, 'storefront-commerce-pro');
    assertBuildRootInsideCheckout(checkoutRoot, buildRoot);
    executeNpm(
        ['run', 'build:cutover'],
        buildRoot,
        {
            NOVASTORE_RAW_BYTE_BUILD_ROOT: checkoutRoot,
            npm_config_offline: 'true',
            npm_config_audit: 'false',
            npm_config_fund: 'false'
        }
    );
    const output = fs.readFileSync(path.join(checkoutRoot, ...artifactRelativePath.split('/')));
    assert(Buffer.isBuffer(output) && output.length > 0, `${buildLabel} artifact must be a non-empty Buffer`);
    assertCleanCheckout(checkoutRoot, buildLabel);
    return output;
};

const assertRawByteMatrix = (matrix, { emitDiagnostics = false } = {}) => {
    assert.deepEqual(Object.keys(matrix), rawByteMatrixStages, 'matrix must contain exact blob/checkout/build1/build2 entries');
    assert.equal(Object.entries(matrix).length, 4, 'matrix must contain exactly four entries');
    const blob = matrix.blob;
    assert(Buffer.isBuffer(blob) && blob.length > 0, 'matrix blob must be a non-empty Buffer');
    const blobDetails = describeRawBuffer(blob);
    const diagnostics = {};

    for (const stage of rawByteMatrixStages) {
        const buffer = matrix[stage];
        assert(Buffer.isBuffer(buffer) && buffer.length > 0, `${stage} must be a non-empty Buffer`);
        const details = describeRawBuffer(buffer);
        assert.equal(details.crBytes, 0, `${stage} CR byte count must be zero`);
        assert.equal(details.loneCrBytes, 0, `${stage} lone CR byte count must be zero`);
        assert.equal(details.byteLength, blobDetails.byteLength, `${stage} byte length must equal the blob`);
        assert.equal(details.sha256, blobDetails.sha256, `${stage} SHA-256 must equal the blob SHA-256`);
        assert.equal(buffer.equals(blob), true, `${stage} must be byte-for-byte identical to the blob`);
        diagnostics[stage] = details;
        if (emitDiagnostics) {
            console.log(
                `storefront ${stage} sha256=${details.sha256} cr=${details.crBytes} `
                + `lone_cr=${details.loneCrBytes} bytes=${details.byteLength}`
            );
        }
    }
    return diagnostics;
};

const removeOwnedMatrixDirectory = (temporaryDirectory) => {
    const resolvedDirectory = path.resolve(temporaryDirectory);
    const resolvedTempRoot = path.resolve(os.tmpdir());
    const normalizeCase = (value) => (
        process.platform === 'win32' ? value.toLocaleLowerCase('en-US') : value
    );
    assert.equal(
        normalizeCase(path.dirname(resolvedDirectory)),
        normalizeCase(resolvedTempRoot),
        'matrix cleanup may only remove a direct child of os.tmpdir()'
    );
    assert.match(
        path.basename(resolvedDirectory),
        /^novastore-storefront-raw-byte-matrix-[A-Za-z0-9_-]+$/,
        'matrix cleanup must verify the task-owned directory prefix'
    );
    assert.equal(fs.existsSync(resolvedDirectory), true, 'matrix cleanup target must exist');
    fs.rmSync(resolvedDirectory, { recursive: true, force: false, maxRetries: 3, retryDelay: 100 });
    assert.equal(fs.existsSync(resolvedDirectory), false, 'matrix disposable directory must be removed');
};

const assertRawByteArtifactMatrix = () => {
    const outerBefore = captureRepositorySeal(repositoryRoot);
    const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'novastore-storefront-raw-byte-matrix-'));
    const checkoutRoot = path.join(temporaryDirectory, 'checkout');
    const failures = [];

    try {
        const headCommit = outerBefore.head;
        assert.match(headCommit, /^[0-9a-f]{40,64}$/, 'HEAD must be an exact commit identifier');
        const blob = executeBuffer('git', ['cat-file', 'blob', `HEAD:${artifactRelativePath}`], repositoryRoot);

        executeBuffer(
            'git',
            ['clone', '--local', '--no-hardlinks', '--no-checkout', '--no-tags', '--', repositoryRoot, checkoutRoot],
            temporaryDirectory
        );
        executeBuffer('git', ['config', 'core.autocrlf', 'true'], checkoutRoot);
        assert.equal(executeText('git', ['config', '--get', 'core.autocrlf'], checkoutRoot).trim(), 'true');
        executeBuffer('git', ['checkout', '--detach', headCommit], checkoutRoot);
        assert.equal(executeText('git', ['rev-parse', 'HEAD'], checkoutRoot).trim(), headCommit);
        assertCleanCheckout(checkoutRoot, 'initial');

        const checkoutAttributes = assertStorefrontArtifactGitAttributes(checkoutRoot);
        const eolReport = executeText(
            'git',
            ['ls-files', '--eol', '--', artifactRelativePath],
            checkoutRoot
        ).trim();
        assert.match(eolReport, /i\/lf\s+w\/lf\s+attr\/text eol=lf/, 'clean Windows checkout must report i/lf w/lf attr/text eol=lf');

        const checkout = fs.readFileSync(path.join(checkoutRoot, ...artifactRelativePath.split('/')));
        const checkoutLocksBefore = captureRepositorySeal(checkoutRoot).lockfiles;
        const checkoutCommerceRoot = path.join(checkoutRoot, 'storefront-commerce-pro');
        assertBuildRootInsideCheckout(checkoutRoot, checkoutCommerceRoot);
        executeNpm(
            ['ci', '--offline', '--ignore-scripts', '--no-audit', '--no-fund'],
            checkoutCommerceRoot,
            {
                npm_config_offline: 'true',
                npm_config_audit: 'false',
                npm_config_fund: 'false'
            }
        );
        assertCleanCheckout(checkoutRoot, 'post-install');

        const build1 = buildRawByteArtifact(checkoutRoot, 'build1');
        const build2 = buildRawByteArtifact(checkoutRoot, 'build2');
        const checkoutLocksAfter = captureRepositorySeal(checkoutRoot).lockfiles;
        assert.deepEqual(checkoutLocksAfter, checkoutLocksBefore, 'disposable package-lock hashes must remain unchanged');

        const matrix = { blob, checkout, build1, build2 };
        assertRawByteMatrix(matrix, { emitDiagnostics: true });

        const missingEntryMatrix = { blob, checkout, build1 };
        assert.throws(
            () => assertRawByteMatrix(missingEntryMatrix),
            /exact blob\/checkout\/build1\/build2 entries/,
            'missing matrix entry must fail closed'
        );

        const crMismatchMatrix = {
            ...matrix,
            checkout: Buffer.concat([checkout, Buffer.from([0x0d])])
        };
        assert.throws(
            () => assertRawByteMatrix(crMismatchMatrix),
            /CR byte count must be zero/,
            'injected CR mismatch must fail closed'
        );

        const byteMismatch = Buffer.from(build2);
        byteMismatch[0] ^= 0x01;
        assert.throws(
            () => assertRawByteMatrix({ ...matrix, build2: byteMismatch }),
            /SHA-256 must equal the blob|byte-for-byte identical/,
            'buffer or SHA mismatch must fail closed'
        );

        const missingEffectiveAttribute = Buffer.from(
            `${artifactRelativePath}\0text\0set\0${artifactRelativePath}\0eol\0unspecified\0`,
            'utf8'
        );
        assert.throws(
            () => parseNullDelimitedGitAttributes(missingEffectiveAttribute, artifactRelativePath),
            /eol attribute must be lf/,
            'missing effective LF attribute must fail closed'
        );

        assert.throws(
            () => assertBuildRootInsideCheckout(checkoutRoot, commerceRoot),
            /build root must be the storefront package inside the disposable checkout/,
            'build root outside the disposable checkout must fail closed'
        );

        assert.throws(
            () => assertRepositorySealEqual(outerBefore, { ...outerBefore, statusSha256: '0'.repeat(64) }),
            /outer repository HEAD\/index\/status\/artifact\/lockfile seal must remain unchanged/,
            'outer repository seal mismatch must fail closed'
        );

        assert.equal(checkoutAttributes.get('text'), 'set');
        assert.equal(checkoutAttributes.get('eol'), 'lf');
        assertCleanCheckout(checkoutRoot, 'final');
        console.log(`storefront check-attr text=${checkoutAttributes.get('text')} eol=${checkoutAttributes.get('eol')}`);
        console.log(`storefront ls-files --eol ${eolReport}`);
        console.log('CLEAN_WINDOWS_CORE_AUTOCRLF=true');
        console.log('RAW_BYTE_MATRIX_NETWORK=OFFLINE');
        console.log('NEGATIVE_MISSING_ENTRY_ASSERTION=PASS');
        console.log('NEGATIVE_CR_MISMATCH_ASSERTION=PASS');
        console.log('NEGATIVE_BUFFER_SHA_ASSERTION=PASS');
        console.log('NEGATIVE_EFFECTIVE_ATTRIBUTE_ASSERTION=PASS');
        console.log('NEGATIVE_BUILD_ROOT_ASSERTION=PASS');
        console.log('NEGATIVE_OUTER_SEAL_ASSERTION=PASS');
        console.log('RAW_BYTE_MATRIX=PASS');
    } catch (error) {
        failures.push(error);
    }

    try {
        removeOwnedMatrixDirectory(temporaryDirectory);
    } catch (error) {
        failures.push(error);
    }

    try {
        assertRepositorySealEqual(outerBefore, captureRepositorySeal(repositoryRoot));
    } catch (error) {
        failures.push(error);
    }

    if (failures.length === 1) throw failures[0];
    if (failures.length > 1) throw new AggregateError(failures, 'raw-byte matrix, cleanup, or outer seal failed');
};

assert(fs.existsSync(artifactPath), 'Commerce Pro production artifact must exist');
const artifact = fs.readFileSync(artifactPath);
assert(artifact.length > 100_000, 'Commerce Pro production artifact must contain the bundled application');
const html = artifact.toString('utf8');

for (const [relativePath, expectedHash] of Object.entries(EXPECTED)) {
    assert.equal(sha256(readCommerce(relativePath)), expectedHash, `${relativePath} canonical hash must remain locked`);
}

const cutoverSource = readCommerce('cutover.html', 'utf8');
const mainIntegrated = readCommerce('src/main-integrated.jsx', 'utf8');
const integratedApp = readCommerce('src/IntegratedApp.jsx', 'utf8');
const runtimeHook = readCommerce('src/integration/useCommerceRuntime.js', 'utf8');
const runtimeFactory = readCommerce('src/integration/createCommerceRuntime.js', 'utf8');
const packageJson = JSON.parse(readCommerce('package.json', 'utf8'));

assert(cutoverSource.includes('/src/main-integrated.jsx'));
assert(mainIntegrated.includes('from "./IntegratedApp.jsx"'));
assert(integratedApp.includes('from "./integration/useCommerceRuntime.js"'));
assert(integratedApp.includes('from "./CanonicalRuntimePresentation.jsx"'));
assert(runtimeHook.includes('from "./createCommerceRuntime.js"'));
for (const adapter of ['createCatalogAdapter', 'createCartAdapter', 'createFavoritesAdapter', 'createCheckoutAdapter', 'createCustomerAccountAdapter']) {
    assert(runtimeFactory.includes(adapter), `integrated runtime must retain ${adapter}`);
}
assert.equal(packageJson.scripts['build:cutover'], 'node scripts/finalize-cutover.mjs');
assert.equal(packageJson.scripts['test:cutover'], 'node ../tests/commerceProCutoverArtifactSmoke.js');

for (const required of [
    '<!doctype html>',
    'novastore-artifact-kind',
    'production-candidate',
    'scripts/finalize-cutover.mjs',
    'src/main-integrated.jsx',
    'IntegratedApp:createCommerceRuntime',
    "connect-src 'self'",
    '/shared-state-sync.js',
    '/favorites-sync.js',
    '/api/products',
    '/api/public/categories',
    '/api/public/collections',
    '/api/addresses',
    '/api/campaigns/quote',
    '/api/payments/initialize',
    '/api/notifications/user/',
    '/api/messages/history/',
    '/api/reviews/product/',
    '/api/questions/product/',
    '/api/assistant/chat',
    '#/giris',
    '#/hesabim',
    '#/favoriler',
    '#/sepet',
    '#/odeme/teslimat',
    'Tükendi'
]) {
    assert(html.includes(required), `production artifact must contain ${required}`);
}

assert.match(
    html,
    /import\s*["']\/shared-state-sync\.js["'];\s*import\s*["']\/favorites-sync\.js["']/,
    'shared state owner must load before favorites owner'
);

for (const [pattern, label] of [
    [/createCanonicalFixtureRuntime|main-integrated-fixture|fixture-integrated/i, 'fixture runtime marker'],
    [/commerce-pro-(?:preview|integration-preview)|noindex|nofollow/i, 'preview/noindex marker'],
    [/https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?/i, 'local development URL'],
    [/file:\/\//i, 'file URL'],
    [/[A-Za-z]:[\\/](?:Users|Windows|Program Files|AppData|Temp)[\\/]/i, 'Windows absolute path'],
    [/(?:AppData[\\/]Local[\\/]Temp|novastore-commerce-pro-cutover-)/i, 'temporary path'],
    [/(?:@vite\/client|vite\/dist\/client|sourceMappingURL)/i, 'dev/sourcemap marker']
]) {
    assert(!pattern.test(html), `production artifact must exclude ${label}`);
}

assert(!html.includes('\r'), 'artifact must use LF line endings');
assert(html.endsWith('\n'), 'artifact must end with one newline');

const externalOrigins = [...html.matchAll(/https?:\/\/[^"'`\s<>\)]+/g)]
    .map((match) => match[0])
    .filter((origin) => !origin.startsWith('http://www.w3.org/'));
assert.deepEqual([...new Set(externalOrigins)], [], 'artifact must not contain unexpected external origins');

const referencedPaths = new Set();
const shellHtml = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');
for (const match of shellHtml.matchAll(/\b(?:src|href)=["']([^"']+)["']/gi)) referencedPaths.add(match[1]);
for (const styleMatch of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) {
    for (const match of styleMatch[1].matchAll(/url\((?:["']?)([^"')]+)(?:["']?)\)/gi)) referencedPaths.add(match[1]);
}
for (const reference of referencedPaths) {
    if (!reference || reference.startsWith('data:') || reference.startsWith('#')) continue;
    if (/^[a-z][a-z\d+.-]*:/i.test(reference)) continue;
    const cleanReference = reference.split(/[?#]/, 1)[0];
    const resolved = cleanReference.startsWith('/')
        ? path.join(frontendRoot, cleanReference.slice(1))
        : path.resolve(path.dirname(artifactPath), cleanReference);
    assert(fs.existsSync(resolved), `artifact reference must resolve locally: ${reference}`);
}

const serverSource = fs.readFileSync(path.join(repositoryRoot, 'server.js'), 'utf8');
assert(!serverSource.includes('commerce-pro/index.html'), 'artifact tour must not activate a server route');
for (const legacyFile of [
    'index.html',
    'categories.html',
    'collections.html',
    'product.html',
    'login.html',
    'forgot-password.html',
    'reset-password.html',
    'profile.html',
    'checkout.html',
    'paytr-checkout.html',
    'payment-result.html'
]) {
    assert(fs.existsSync(path.join(frontendRoot, legacyFile)), `legacy rollback file must remain: ${legacyFile}`);
}

assertStorefrontArtifactGitAttributes();
assertRawByteArtifactMatrix();
console.log(`Commerce Pro cutover artifact smoke passed: ${sha256(artifact)}`);
