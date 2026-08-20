'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { TextDecoder } = require('node:util');

const repoRoot = path.resolve(__dirname, '..');
const sellerDocsDirectory = path.join(repoRoot, 'docs', 'seller');
const expectedDocuments = new Map([
    ['ADDITIVE-MIGRATION-AND-FORWARD-RECOVERY.md', '845ebc959562d3625c2c626320ccf4d4d4579fdf9f8490f17cdae598afeb6162'],
    ['ADR-0001-SELLER-BOUNDARY.md', 'b88e227fe4c72906e6c1be7f673ce91445976caefa51a6f06197886f263ef7a0'],
    ['PHASE-GATES.md', '5679773beeeb950feb9b57f63b52b4b636840502274e15555af436cd3e4b6540'],
    ['SCREEN-BACKEND-MATRIX.tsv', '0e2465ee4169b823bd3a02740b69c16689db9cd8acf73b5dee483afdfc574ee9'],
    ['SELLER-API-V1.md', '9f9d9820ba0ee6b540742c8327844cce81e76548d57b390aad8679eb6f2d3413']
]);

const readStrictUtf8 = (filePath) => {
    const bytes = fs.readFileSync(filePath);
    assert.ok(bytes.length > 0, `document is empty: ${filePath}`);
    assert.notDeepEqual(
        [...bytes.subarray(0, 3)],
        [0xef, 0xbb, 0xbf],
        `UTF-8 BOM is forbidden: ${filePath}`
    );

    let text;
    try {
        text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch (error) {
        assert.fail(`invalid UTF-8 in ${filePath}: ${error.message}`);
    }

    assert.equal(text.includes('\r'), false, `CR or CRLF found: ${filePath}`);
    assert.equal(text.endsWith('\n'), true, `missing final LF newline: ${filePath}`);
    text.split('\n').forEach((line, index) => {
        assert.doesNotMatch(
            line,
            /[ \t]$/,
            `trailing ASCII space or tab: ${filePath}:${index + 1}`
        );
    });

    return { bytes, text };
};

const requireMatch = (text, pattern, label) => {
    assert.match(text, pattern, `missing seller contract invariant: ${label}`);
};

const parseEndpointBlocks = (api) => {
    const pattern = /^### ([A-Z]+-[0-9A-Z]+) — ([^\n]+)\n([\s\S]*?)(?=^### |^## |(?![\s\S]))/gm;
    return [...api.matchAll(pattern)].map((match) => ({
        id: match[1],
        title: match[2],
        body: match[3]
    }));
};

const parsePhaseBlocks = (phaseDocument) => {
    const pattern = /^## (F(?:0A|0B|[1-9]|1[0-5])) — ([^\n]+)\n([\s\S]*?)(?=^## |(?![\s\S]))/gm;
    return [...phaseDocument.matchAll(pattern)].map((match) => ({
        id: match[1],
        title: match[2],
        body: match[3]
    }));
};

try {
    const sellerDocsStats = fs.lstatSync(sellerDocsDirectory);
    assert.equal(sellerDocsStats.isDirectory(), true, 'docs/seller must be a real directory');
    assert.equal(sellerDocsStats.isSymbolicLink(), false, 'docs/seller must not be a symbolic link');
    const directoryEntries = fs.readdirSync(sellerDocsDirectory, { withFileTypes: true });
    for (const entry of directoryEntries) {
        assert.equal(entry.isSymbolicLink(), false, `symbolic link is forbidden under docs/seller: ${entry.name}`);
        assert.equal(
            entry.isFile() || entry.isDirectory(),
            true,
            `filesystem special entry is forbidden under docs/seller: ${entry.name}`
        );
    }
    const actualNames = directoryEntries.filter((entry) => entry.isFile()).map((entry) => entry.name).sort();
    const expectedNames = [...expectedDocuments.keys()].sort();
    assert.deepEqual(actualNames, expectedNames, 'docs/seller must contain exactly the five F0A documents');

    const documents = {};
    for (const [name, expectedHash] of expectedDocuments) {
        const entry = directoryEntries.find((candidate) => candidate.name === name);
        assert.ok(entry && entry.isFile(), `F0A input is not a regular file: docs/seller/${name}`);
        const filePath = path.join(sellerDocsDirectory, name);
        const fileStats = fs.lstatSync(filePath);
        assert.equal(fileStats.isSymbolicLink(), false, `F0A input must not be a symbolic link: docs/seller/${name}`);
        assert.equal(fileStats.isFile(), true, `F0A input is not a regular file: docs/seller/${name}`);
        const { bytes, text } = readStrictUtf8(filePath);
        const actualHash = crypto.createHash('sha256').update(bytes).digest('hex');
        assert.equal(actualHash, expectedHash, `SHA-256 mismatch: docs/seller/${name}`);
        documents[name] = text;
    }

    const adr = documents['ADR-0001-SELLER-BOUNDARY.md'];
    const api = documents['SELLER-API-V1.md'];
    const migration = documents['ADDITIVE-MIGRATION-AND-FORWARD-RECOVERY.md'];
    const phases = documents['PHASE-GATES.md'];
    const collective = [adr, api, migration, phases].join('\n');

    const boundaryInvariants = [
        [adr, /Mevcut backend içinde ayrı bir seller bounded context kurulacaktır\./u, 'separate seller domain'],
        [adr, /Seller istemci API’si yalnız `\/api\/seller\/v1\/\*\*` namespace’ini kullanacaktır\./u, 'seller API namespace'],
        [adr, /`\/api\/admin\/\*\*` seller uygulamasına açılmayacaktır\./u, 'no seller dependency on admin API'],
        [adr, /Customer, admin ve seller auth audience’ları ayrıdır\./u, 'separate authentication audiences'],
        [adr, /Gelecekte ayrı `:seller-app` Android application modülü kurulacaktır\./u, 'future seller Android module'],
        [adr, /Mevcut `:app` müşteri modülü seller mode’a çevrilmeyecektir\./u, 'customer app remains customer-only'],
        [adr, /her korumalı istekte DB’deki etkin session ve membership ile yeniden bağlanır/u, 'DB-backed membership authority'],
        [adr, /Token claim’leri membership, permission, organization\/store sahipliği veya kaynak erişimi için tek otorite değildir\./u, 'token claims are not authority'],
        [adr, /Organization\/store scope sunucu tarafından çözülür/u, 'server-resolved tenant scope'],
        [adr, /Bilinmeyen permission, role, capability veya state `deny` olur\./u, 'unknown permission is denied'],
        [adr, /Cross-tenant, mevcut olmayan ve soft-deleted kaynak aynı güvenli not-found davranışını verir\./u, 'safe not-found'],
        [adr, /Global ürün kimliği; seller offer\/listing, SKU, varyant, fiyat, stok ve yayın durumundan ayrılacaktır\./u, 'product and offer separation'],
        [adr, /Marketplace siparişi seller-owned order\/item\/package görünümlerine tahsis edilecektir\./u, 'seller order allocation'],
        [adr, /Finansal seller bakiyesi ve raporları append-only ledger kayıtlarından türetilecektir\./u, 'ledger-derived finance'],
        [collective, /Ledger ve audit kayıtları hard-delete veya geriye dönük düzenleme görmez\./u, 'append-only ledger and audit'],
        [adr, /Production payout icrası kapalı kalacak/u, 'production payout is out of scope'],
        [adr, /Mevcut customer login, sipariş, ürün ve checkout sözleşmeleri değişmez\./u, 'customer compatibility'],
        [adr, /Mevcut admin auth ve first-party katalog davranışı değişmez\./u, 'admin compatibility'],
        [adr, /Tablet kapsam dışıdır\./u, 'tablet is out of scope'],
        [adr, /001–296 kanonik ekranını destekleyecek/u, 'canonical screens 001–296 are binding']
    ];
    boundaryInvariants.forEach(([text, pattern, label]) => requireMatch(text, pattern, label));

    const endpointBlocks = parseEndpointBlocks(api);
    assert.equal(endpointBlocks.length, 58, 'SELLER-API-V1.md must contain exactly 58 endpoint blocks');
    const endpointIds = endpointBlocks.map((block) => block.id);
    assert.equal(new Set(endpointIds).size, endpointIds.length, 'endpoint identifiers must be unique');

    const allowedStatuses = new Set([
        'PROPOSED_NOT_IMPLEMENTED',
        'EXISTING_REUSABLE',
        'BLOCKED'
    ]);
    const requiredCompactLabels = [
        'Status / method / route / domain',
        'Auth / permission / scope',
        'Request / success',
        'Stable errors / page-filter-sort',
        'Revision / idempotency / audit',
        'PII / offline-cache',
        'Phase / screens'
    ];

    for (const block of endpointBlocks) {
        for (const label of requiredCompactLabels) {
            const matches = block.body.match(new RegExp(`^- ${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:`, 'gm')) || [];
            assert.equal(matches.length, 1, `${block.id} must contain exactly one "${label}" field group`);
        }

        const identityLine = block.body
            .split('\n')
            .find((line) => line.startsWith('- Status / method / route / domain:'));
        const values = [...identityLine.matchAll(/`([^`]+)`/g)].map((match) => match[1]);
        assert.equal(values.length, 4, `${block.id} status/method/route/domain must expose four values`);
        const [status, method, route, domain] = values;
        assert.ok(allowedStatuses.has(status), `${block.id} has unsupported contract status: ${status}`);
        assert.match(method, /^[A-Z]+$/, `${block.id} method must be uppercase`);
        assert.match(route, /^\/api\/seller\/v1(?:\/|$)/, `${block.id} route is outside seller v1: ${route}`);
        assert.equal(route.startsWith('/api/admin'), false, `${block.id} must not declare an admin route`);
        assert.notEqual(domain.trim(), '', `${block.id} domain must not be blank`);
    }

    requireMatch(
        api,
        /Bu dosyadaki `\/api\/seller\/v1\/\*\*` yolları, aksi açıkça yazılmadıkça `PROPOSED_NOT_IMPLEMENTED` durumundadır\./u,
        'proposed endpoints are explicitly not implemented'
    );
    requireMatch(
        api,
        /Bu sözleşme endpoint yaratmaz\./u,
        'contract does not represent runtime implementation'
    );

    const exceptionSection = api.match(
        /İkincil-bağımlılık exception’ları:\n\n([\s\S]*?)\n\nBunun dışındaki registry endpoint’leri/u
    );
    assert.ok(exceptionSection, 'secondary-dependency exception section is missing');
    const secondaryExceptionIds = [
        ...exceptionSection[1].matchAll(/^- `([A-Z]+-[0-9A-Z]+)\s/gm)
    ].map((match) => match[1]).sort();
    assert.deepEqual(
        secondaryExceptionIds,
        ['OFFER-03', 'ORG-01', 'ORG-02'],
        'secondary-dependency exceptions must be exactly ORG-01, ORG-02 and OFFER-03'
    );

    const phaseBlocks = parsePhaseBlocks(phases);
    const expectedPhaseIds = ['F0A', 'F0B', ...Array.from({ length: 15 }, (_, index) => `F${index + 1}`)];
    assert.equal(phaseBlocks.length, 17, 'PHASE-GATES.md must contain exactly 17 phase blocks');
    assert.deepEqual(
        [...phaseBlocks.map((block) => block.id)].sort(),
        [...expectedPhaseIds].sort(),
        'phase identifiers must be exactly F0A, F0B and F1 through F15'
    );
    assert.equal(
        new Set(phaseBlocks.map((block) => block.id)).size,
        phaseBlocks.length,
        'phase identifiers must be unique'
    );

    const requiredPhaseLabels = [
        'Purpose',
        'Authorized surface',
        'Explicitly forbidden surface',
        'Entry conditions',
        'Expected branch/HEAD verification',
        'Data/migration impact',
        'API impact',
        'Android impact',
        'Security gates',
        'Test gates',
        'Visual/canonical gates',
        'Exit criteria',
        'Expected evidence',
        'Commit boundary',
        'Separate owner authorizations still required',
        'Forward-recovery or rollback boundary'
    ];
    for (const block of phaseBlocks) {
        for (const label of requiredPhaseLabels) {
            const matches = block.body.match(new RegExp(`^- ${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:`, 'gm')) || [];
            assert.equal(matches.length, 1, `${block.id} must contain exactly one "${label}" field`);
        }
    }

    const waveAssignments = new Map([
        ['F8', '001–054'],
        ['F9', '055–141'],
        ['F10', '142–184'],
        ['F11', '185–222'],
        ['F12', '223–256'],
        ['F13', '257–281'],
        ['F14', '282–296']
    ]);
    for (const [phaseId, range] of waveAssignments) {
        const block = phaseBlocks.find((candidate) => candidate.id === phaseId);
        assert.ok(block, `missing phase block: ${phaseId}`);
        assert.match(block.body, new RegExp(range), `${phaseId} must bind canonical screens ${range}`);
    }

    const expectedDesignGaps = [
        'DG-001 MULTI_ORGANIZATION_STORE_SELECTOR',
        'DG-002 OWNER_TRANSFER_AND_FOUR_EYES_FLOW',
        'DG-003 MANUAL_PAYOUT_REQUEST_OR_RELEASE',
        'DG-004 FULL_ADDRESS_REVEAL_PRIVACY_POLICY',
        'DG-005 BOTTOM_NAV_MOTION_TIMING'
    ];
    const actualDesignGaps = [...adr.matchAll(/^\| (DG-\d{3}) \| ([A-Z0-9_]+) \|/gm)]
        .map((match) => `${match[1]} ${match[2]}`);
    assert.deepEqual(actualDesignGaps, expectedDesignGaps, 'design-gap catalog must contain exactly the five frozen gaps');

    console.log(
        'sellerF0bDocumentContractSmoke: PASS documents=5 endpoints=58 phases=17 design-gaps=5'
    );
} catch (error) {
    console.error(`sellerF0bDocumentContractSmoke: FAIL ${error.message}`);
    process.exitCode = 1;
}
