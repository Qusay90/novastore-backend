'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const docsDirectory = path.join(repoRoot, 'docs', 'seller');
const matrixPath = path.join(docsDirectory, 'SCREEN-BACKEND-MATRIX.tsv');
const apiPath = path.join(docsDirectory, 'SELLER-API-V1.md');
const adrPath = path.join(docsDirectory, 'ADR-0001-SELLER-BOUNDARY.md');
const phasePath = path.join(docsDirectory, 'PHASE-GATES.md');

const expectedHeader = [
    'screen_id',
    'canonical_png',
    'flow_group',
    'screen_title',
    'ui_state',
    'seller_entry_route',
    'backend_domain',
    'api_method',
    'api_route',
    'capability',
    'permission',
    'tenant_scope',
    'data_models',
    'current_backend_status',
    'backend_phase',
    'android_phase',
    'acceptance_criteria',
    'design_gap_status',
    'evidence_source'
];

const allowedStatuses = new Set(['AVAILABLE', 'PARTIAL', 'BLOCKED']);
const allowedMethods = new Set(['DELETE', 'GET', 'NONE', 'PATCH', 'POST']);
const singlePhases = new Set([
    'F0A',
    'F0B',
    ...Array.from({ length: 15 }, (_, index) => `F${index + 1}`)
]);

const parseEndpointRegistry = (api) => {
    const pattern = /^### ([A-Z]+-[0-9A-Z]+) — [^\n]+\n([\s\S]*?)(?=^### |^## |(?![\s\S]))/gm;
    return [...api.matchAll(pattern)].map((match) => {
        const identityLine = match[2]
            .split('\n')
            .find((line) => line.startsWith('- Status / method / route / domain:'));
        assert.ok(identityLine, `${match[1]} is missing status/method/route/domain`);
        const values = [...identityLine.matchAll(/`([^`]+)`/g)].map((value) => value[1]);
        assert.equal(values.length, 4, `${match[1]} identity line must expose four values`);
        return {
            id: match[1],
            status: values[0],
            method: values[1],
            route: values[2],
            pair: `${values[1]} ${values[2]}`
        };
    });
};

const parseExplicitCombinedPhases = (phaseDocument) => {
    const combined = new Set();
    const tableRows = phaseDocument.match(/^\| Faz \d+ [^\n]*\| ([^|]+) \|$/gm) || [];
    for (const row of tableRows) {
        const match = row.match(/\| ([^|]+) \|$/);
        if (match) {
            const value = match[1].trim();
            const components = value.split(' + ');
            if (
                components.length > 1 &&
                components.every((component) => singlePhases.has(component))
            ) {
                combined.add(value);
            }
        }
    }
    return combined;
};

const parseDesignGapCatalog = (adr) => new Map(
    [...adr.matchAll(/^\| (DG-\d{3}) \| ([A-Z0-9_]+) \|/gm)]
        .map((match) => [match[1], match[2]])
);

try {
    const matrix = fs.readFileSync(matrixPath, 'utf8');
    const api = fs.readFileSync(apiPath, 'utf8');
    const adr = fs.readFileSync(adrPath, 'utf8');
    const phaseDocument = fs.readFileSync(phasePath, 'utf8');

    assert.equal(matrix.includes('\r'), false, 'matrix must use LF line endings');
    assert.equal(matrix.endsWith('\n'), true, 'matrix must end with a final newline');

    const physicalLines = matrix.split('\n');
    const header = physicalLines[0].split('\t');
    assert.deepEqual(header, expectedHeader, 'matrix header must match the exact 19-column order');

    const dataLines = [];
    physicalLines.slice(1).forEach((line, index) => {
        if (line === '') return;
        const lineNumber = index + 2;
        const columns = line.split('\t');
        assert.equal(
            columns.length,
            expectedHeader.length,
            `matrix line ${lineNumber} has ${columns.length} TSV columns; expected 19`
        );
        dataLines.push({ columns, lineNumber });
    });
    assert.equal(dataLines.length, 296, 'matrix must contain exactly 296 nonblank data rows');

    const rows = dataLines.map(({ columns, lineNumber }) => ({
        ...Object.fromEntries(expectedHeader.map((key, index) => [key, columns[index]])),
        lineNumber
    }));

    for (const row of rows) {
        for (const field of expectedHeader) {
            assert.notEqual(
                row[field],
                '',
                `matrix line ${row.lineNumber} screen ${row.screen_id || '?'} has blank required cell: ${field}`
            );
        }
    }

    const expectedIds = Array.from({ length: 296 }, (_, index) => String(index + 1).padStart(3, '0'));
    const actualIds = rows.map((row) => row.screen_id);
    assert.deepEqual(actualIds, expectedIds, 'screen IDs must be ordered exactly 001 through 296');
    assert.equal(new Set(actualIds).size, actualIds.length, 'screen IDs must be unique');

    const endpointRegistry = parseEndpointRegistry(api);
    assert.equal(endpointRegistry.length, 58, 'API registry must expose 58 endpoint blocks');
    const registryPairs = new Set(endpointRegistry.map((endpoint) => endpoint.pair));
    assert.equal(
        registryPairs.size,
        endpointRegistry.length,
        'each API endpoint must have a unique method + route pair'
    );

    const concretePrimaryPairs = new Set();
    const canonicalPngPaths = new Set();
    for (const row of rows) {
        assert.ok(
            allowedStatuses.has(row.current_backend_status),
            `screen ${row.screen_id} has unsupported backend status: ${row.current_backend_status}`
        );
        assert.ok(
            allowedMethods.has(row.api_method),
            `screen ${row.screen_id} has unsupported or non-uppercase method: ${row.api_method}`
        );
        assert.match(row.api_method, /^[A-Z]+$/, `screen ${row.screen_id} method must be uppercase`);

        if (row.current_backend_status === 'AVAILABLE') {
            assert.equal(
                row.api_method,
                'NONE',
                `AVAILABLE screen ${row.screen_id} must use api_method=NONE`
            );
            assert.equal(
                row.api_route,
                'N/A-BACKEND',
                `AVAILABLE screen ${row.screen_id} must use api_route=N/A-BACKEND`
            );
        }

        if (row.api_method === 'NONE') {
            assert.equal(
                row.api_route,
                'N/A-BACKEND',
                `screen ${row.screen_id} with api_method=NONE must use N/A-BACKEND`
            );
        } else {
            assert.match(
                row.api_route,
                /^\/api\/seller\/v1(?:\/|$)/,
                `screen ${row.screen_id} concrete route is outside seller v1: ${row.api_route}`
            );
            assert.equal(
                row.api_route.startsWith('/api/admin'),
                false,
                `screen ${row.screen_id} must not depend on /api/admin`
            );
            const pair = `${row.api_method} ${row.api_route}`;
            assert.ok(
                registryPairs.has(pair),
                `screen ${row.screen_id} primary dependency is absent from API registry: ${pair}`
            );
            concretePrimaryPairs.add(pair);
        }

        assert.equal(
            row.api_route.includes('/api/admin'),
            false,
            `screen ${row.screen_id} declares an unsafe admin dependency`
        );

        assert.equal(
            row.canonical_png.includes('\\'),
            false,
            `screen ${row.screen_id} canonical path must use forward slashes`
        );
        assert.doesNotMatch(
            row.canonical_png,
            /tablet/iu,
            `screen ${row.screen_id} canonical path must not reference tablet`
        );
        assert.doesNotMatch(
            row.canonical_png,
            /\.zip(?:\/|$)/iu,
            `screen ${row.screen_id} canonical path must not reference the external ZIP`
        );
        const pngMatch = row.canonical_png.match(
            /^source\/phone\/seller-phone-(\d{3})-[a-z0-9-]+\.png$/
        );
        assert.ok(
            pngMatch,
            `screen ${row.screen_id} canonical path violates phone-source naming contract: ${row.canonical_png}`
        );
        assert.equal(
            pngMatch[1],
            row.screen_id,
            `screen ${row.screen_id} does not match canonical PNG identity`
        );
        assert.equal(
            canonicalPngPaths.has(row.canonical_png),
            false,
            `duplicate canonical PNG path: ${row.canonical_png}`
        );
        canonicalPngPaths.add(row.canonical_png);
    }

    const exceptionSection = api.match(
        /İkincil-bağımlılık exception’ları:\n\n([\s\S]*?)\n\nBunun dışındaki registry endpoint’leri/u
    );
    assert.ok(exceptionSection, 'secondary-dependency exception section is missing');
    const declaredSecondaryIds = new Set(
        [...exceptionSection[1].matchAll(/^- `([A-Z]+-[0-9A-Z]+)\s/gm)]
            .map((match) => match[1])
    );
    assert.deepEqual(
        [...declaredSecondaryIds].sort(),
        ['OFFER-03', 'ORG-01', 'ORG-02'],
        'declared secondary dependencies must be exactly ORG-01, ORG-02 and OFFER-03'
    );

    const registryOnlyEndpoints = endpointRegistry
        .filter((endpoint) => !concretePrimaryPairs.has(endpoint.pair))
        .map((endpoint) => endpoint.id)
        .sort();
    assert.deepEqual(
        registryOnlyEndpoints,
        ['OFFER-03', 'ORG-01', 'ORG-02'],
        'only the three documented secondary dependencies may lack a primary matrix row'
    );
    for (const endpoint of endpointRegistry) {
        if (!concretePrimaryPairs.has(endpoint.pair)) {
            assert.ok(
                declaredSecondaryIds.has(endpoint.id),
                `undeclared secondary dependency: ${endpoint.id} ${endpoint.pair}`
            );
        }
    }

    const combinedPhases = parseExplicitCombinedPhases(phaseDocument);
    for (const row of rows) {
        for (const [field, value] of [
            ['backend_phase', row.backend_phase],
            ['android_phase', row.android_phase]
        ]) {
            assert.ok(
                singlePhases.has(value) || combinedPhases.has(value),
                `screen ${row.screen_id} has invalid ${field}: ${value}`
            );
        }
    }

    const waveAssignments = [
        { phase: 'F8', start: 1, end: 54 },
        { phase: 'F9', start: 55, end: 141 },
        { phase: 'F10', start: 142, end: 184 },
        { phase: 'F11', start: 185, end: 222 },
        { phase: 'F12', start: 223, end: 256 },
        { phase: 'F13', start: 257, end: 281 },
        { phase: 'F14', start: 282, end: 296 }
    ];
    const assignedScreenIds = [];
    for (const assignment of waveAssignments) {
        const expectedRange = Array.from(
            { length: assignment.end - assignment.start + 1 },
            (_, index) => String(assignment.start + index).padStart(3, '0')
        );
        const actualRange = rows
            .filter((row) => row.android_phase === assignment.phase)
            .map((row) => row.screen_id);
        assert.deepEqual(
            actualRange,
            expectedRange,
            `${assignment.phase} must cover ${expectedRange[0]}–${expectedRange.at(-1)} exactly`
        );
        assignedScreenIds.push(...actualRange);
    }
    assert.deepEqual(
        assignedScreenIds.sort(),
        [...expectedIds].sort(),
        'F8 through F14 must cover 001–296 exactly once without overlap or omission'
    );

    const stateContracts = new Map([
        ['loading', /(?:loading|yükleniyor)/iu],
        ['empty', /(?:empty|boş)/iu],
        ['no result', /(?:no result|sonuç yok|veri yok)/iu],
        ['validation', /(?:validation|doğrulama hatası|form doğrulama)/iu],
        ['error', /(?:error|hata|başarısız)/iu],
        ['offline', /(?:offline|çevrimdışı)/iu],
        ['permission denied', /(?:permission denied|yetki yetersizliği)/iu],
        ['expired session', /(?:session expired|oturum süresi doldu)/iu],
        ['re-authentication', /(?:re-authentication|re-auth|yeniden doğrulama)/iu]
    ]);
    for (const [state, pattern] of stateContracts) {
        const matchingRows = rows.filter((row) => pattern.test(
            `${row.screen_title} ${row.ui_state} ${row.acceptance_criteria}`
        ));
        assert.ok(matchingRows.length > 0, `matrix does not account for canonical ${state} state`);
    }

    const designGapCatalog = parseDesignGapCatalog(adr);
    assert.equal(designGapCatalog.size, 5, 'design-gap catalog must contain five entries');
    for (const row of rows) {
        const references = [...row.design_gap_status.matchAll(/(DG-\d{3}) ([A-Z0-9_]+)/g)];
        if (row.design_gap_status === 'NONE') {
            assert.equal(references.length, 0, `screen ${row.screen_id} NONE gap state contains a gap ID`);
            continue;
        }

        assert.match(
            row.design_gap_status,
            /^BLOCKED — /u,
            `screen ${row.screen_id} unresolved design gap must be explicitly BLOCKED`
        );
        assert.ok(references.length > 0, `screen ${row.screen_id} gap state has no known gap reference`);
        for (const reference of references) {
            assert.equal(
                designGapCatalog.get(reference[1]),
                reference[2],
                `screen ${row.screen_id} references unknown or renamed design gap: ${reference[0]}`
            );
        }
        assert.equal(
            row.current_backend_status,
            'BLOCKED',
            `screen ${row.screen_id} with unresolved design gap must have backend status BLOCKED`
        );
        const acceptanceIsRestricted =
            /Gap owner kararı olmadan PASS değildir\./u.test(row.acceptance_criteria) ||
            (
                row.design_gap_status.includes('DG-003') &&
                /manuel payout yok/u.test(row.acceptance_criteria)
            );
        assert.equal(
            acceptanceIsRestricted,
            true,
            `screen ${row.screen_id} must state the unresolved gap restriction in acceptance criteria`
        );
    }

    const dg005Rows = rows.filter((row) => row.design_gap_status.includes('DG-005'));
    assert.deepEqual(
        dg005Rows.map((row) => row.screen_id),
        ['055', '074', '142', '185', '243'],
        'DG-005 must remain scoped to its five canonical bottom-navigation screens'
    );
    for (const row of dg005Rows) {
        const motionScope = `${row.design_gap_status} ${row.acceptance_criteria}`;
        assert.doesNotMatch(
            motionScope,
            /\b\d+(?:\.\d+)?\s*(?:ms|milliseconds?|seconds?|secs?|fps|hz|frames?)\b/iu,
            `screen ${row.screen_id} invents numeric motion timing for DG-005`
        );
        assert.doesNotMatch(
            motionScope,
            /\b(?:duration|easing|spring|frame[- ]?timing)\s*[:=]\s*\d/iu,
            `screen ${row.screen_id} invents numeric DG-005 motion parameters`
        );
    }

    console.log(
        'sellerF0bScreenMatrixContractSmoke: PASS rows=296 first=001 last=296 duplicates=0 gaps=0 extras=0'
    );
} catch (error) {
    console.error(`sellerF0bScreenMatrixContractSmoke: FAIL ${error.message}`);
    process.exitCode = 1;
}
