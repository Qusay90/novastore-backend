'use strict';

const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const docsDirectory = path.join(repoRoot, 'docs', 'seller');
const documentNames = [
    'ADR-0001-SELLER-BOUNDARY.md',
    'SCREEN-BACKEND-MATRIX.tsv',
    'SELLER-API-V1.md',
    'ADDITIVE-MIGRATION-AND-FORWARD-RECOVERY.md',
    'PHASE-GATES.md'
];
const documents = Object.fromEntries(
    documentNames.map((name) => [
        name,
        fs.readFileSync(path.join(docsDirectory, name), 'utf8')
    ])
);

const adr = documents['ADR-0001-SELLER-BOUNDARY.md'];
const matrix = documents['SCREEN-BACKEND-MATRIX.tsv'];
const api = documents['SELLER-API-V1.md'];
const migration = documents['ADDITIVE-MIGRATION-AND-FORWARD-RECOVERY.md'];
const phases = documents['PHASE-GATES.md'];
const collective = documentNames.map((name) => documents[name]).join('\n');
const extractSection = (text, start, end, label) => {
    const match = text.match(new RegExp(`${start}([\\s\\S]*?)${end}`, 'u'));
    if (!match) throw new Error(`missing deterministic security section: ${label}`);
    return match[1];
};
const sessionSecurityContract = [
    extractSection(adr, '## 7\\. Güvenlik değişmezleri\\n', '\\n## 8\\.', 'ADR security invariants'),
    extractSection(api, '## Auth ve onboarding\\n', '\\n## Organization', 'API auth and onboarding'),
    extractSection(
        migration,
        '## 4\\. Seller session, audit ve outbox temeli\\n',
        '\\n## 5\\.',
        'migration session foundation'
    ),
    extractSection(phases, '## F2 —', '\\n## F3 —', 'F2 auth and security gate')
].join('\n');
const failures = [];

const requirePattern = (text, pattern, label) => {
    if (!pattern.test(text)) failures.push(`${label} (${pattern})`);
};

const requireAbsent = (text, pattern, label) => {
    if (pattern.test(text)) failures.push(`${label} (${pattern})`);
};

const requireEndpointEvidence = (endpointId, pattern, label) => {
    const blockPattern = new RegExp(
        `^### ${endpointId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} — [^\\n]+\\n([\\s\\S]*?)(?=^### |^## |(?![\\s\\S]))`,
        'mu'
    );
    const block = api.match(blockPattern);
    if (!block) {
        failures.push(`missing endpoint contract block: ${endpointId}`);
        return;
    }
    requirePattern(block[1], pattern, label);
};

// Identity and session contract evidence.
requirePattern(
    adr,
    /Customer, admin ve seller auth audience’ları ayrıdır\./u,
    'customer, admin and seller audiences must be separate'
);
requirePattern(
    api,
    /Kimlik: seller audience access token \+ güncel server-side session\./u,
    'seller tokens must use seller-specific audience semantics'
);
requirePattern(
    collective,
    /Customer\/admin table, route, token audience ve response contract’ı korunur\./u,
    'seller credentials must not broaden customer/admin token boundaries'
);
requirePattern(
    api,
    /`SELLER_AUDIENCE_REQUIRED`/u,
    'admin/customer tokens must be rejected by the seller audience boundary'
);
requirePattern(
    api,
    /Customer\/admin auth ve session primitives \| Seller audience\/membership değildir; doğrudan kullanılamaz\./u,
    'customer/admin auth primitives must not substitute for seller auth'
);
requirePattern(
    adr,
    /her korumalı istekte DB’deki etkin session ve membership ile yeniden bağlanır/u,
    'DB-backed live session and membership must be authoritative'
);
requirePattern(
    adr,
    /Token claim’leri membership, permission, organization\/store sahipliği veya kaynak erişimi için tek otorite değildir\./u,
    'token role, tenant and ownership claims alone must not be authoritative'
);
requirePattern(
    migration,
    /Session membership revision\/security stamp taşır; permission değişikliğinde yeniden değerlendirilir\./u,
    'authorization-version changes must immediately re-evaluate active access'
);
requirePattern(
    adr,
    /Membership\/permission değişikliği etkin session’ları yeniden değerlendirmeye veya iptale zorlar\./u,
    'membership status changes must restrict or invalidate sessions'
);
requirePattern(
    phases,
    /session revocation/u,
    'seller session revocation must be required'
);
requireEndpointEvidence(
    'AUTH-04',
    /\{changed:true,sessions_revoked\}/u,
    'password reset must revoke relevant sessions'
);
requirePattern(
    sessionSecurityContract,
    /refresh[_ -]token(?=[^.\n]{0,240}(?:rotation|rotate|rotasyon|döndür))(?=[^.\n]{0,240}(?:must|required|zorunlu|uygulanır|uygulanacaktır|edilir|döndürülür|döndürülmelidir))[^.\n]{0,240}(?:rotation|rotate|rotasyon|döndür)/iu,
    'refresh-token rotation must be explicitly required'
);
requirePattern(
    sessionSecurityContract,
    /refresh[_ -]token.{0,300}(?:replay|reuse|tekrar kullanım|yeniden kullanım).{0,180}(?:deny|reject|revoke|redd|iptal|engelle)/isu,
    'refresh-token replay handling must be explicitly required'
);

// Tenant and authorization contract evidence.
requirePattern(
    api,
    /server session\/membership’ten organization\/store çözülür\. Client header\/query\/body tenant otoritesi değildir\./u,
    'organization/store scope must be server-owned'
);
requirePattern(
    api,
    /Unknown permission\/role\/state: deny\./u,
    'unknown permission must be denied'
);
requirePattern(
    migration,
    /İndeksler tenant anahtarı başta olacak şekilde tasarlanır\./u,
    'resource queries must be tenant-scoped'
);
requirePattern(
    api,
    /Cross-tenant\/missing\/deleted: aynı `404 RESOURCE_NOT_FOUND`\./u,
    'cross-tenant probes must use safe not-found'
);
requirePattern(
    adr,
    /IDOR kontrolleri revision\/idempotency doğrulamasından ve veri ifşasından önce yapılır\./u,
    'IDOR scope checks must precede revision, state or resource disclosure'
);
requirePattern(
    adr,
    /İstemciden gelen `organization_id`, `store_id`, role veya amount değerini yetki\/finans otoritesi kabul etmek\./u,
    'client-provided tenant and ownership values must not be authoritative'
);
requirePattern(
    api,
    /Admin endpoint’ler geçici substitute değildir\./u,
    'admin endpoints must not substitute for seller authorization'
);
requirePattern(
    adr,
    /Son owner silinemez/u,
    'last-owner protection must be required'
);
requireEndpointEvidence(
    'TEAM-03',
    /`seller\.team\.member_permissions_changed`/u,
    'role and scope changes must be audited'
);

// Verification and step-up contract evidence.
requirePattern(collective, /`RESET_TOKEN_BOUND`/u, 'RESET_TOKEN_BOUND must exist');
requirePattern(collective, /`LOGIN_CHALLENGE_BOUND`/u, 'LOGIN_CHALLENGE_BOUND must exist');
requireEndpointEvidence(
    'AUTH-04',
    /Seller session değildir; `RESET_TOKEN_BOUND`; pre-auth principal account\/device\/expiry’ye bağlı, tek kullanımlı reset token ile çözülür ve başka hesabı hedefleyemez\./u,
    'password reset must operate on the reset-token principal'
);
requireEndpointEvidence(
    'AUTH-05',
    /session öncesi `LOGIN_CHALLENGE_BOUND`/u,
    'login MFA must operate on a pre-authentication login challenge'
);
requirePattern(
    migration,
    /Step-up challenge action, target, session ve expiry’ye bağlı/u,
    'step-up authorization must be action-bound, target-bound and session-bound'
);
requirePattern(
    adr,
    /step-up\/re-auth tek kullanımlı, süreli ve hedef\/aksiyon bağlıdır\./u,
    'step-up authorization must be short-lived'
);
requireEndpointEvidence(
    'AUTH-05',
    /\{verified:true,step_up_token\}/u,
    'step-up must produce bound authorization evidence rather than a global MFA boolean'
);
requireAbsent(
    sessionSecurityContract,
    /["']?(?:global_mfa|globalMfa|mfa_verified|mfaVerified|step_up|stepUp)["']?\s*[:=]\s*(?:true|false)\b/u,
    'step-up must not be represented as a reusable global MFA boolean'
);
requirePattern(
    collective,
    /Payout account değişikliği step-up/u,
    'bank-account changes must require stronger authorization'
);
requireEndpointEvidence(
    'TEAM-03',
    /Seller session \+ step-up/u,
    'role changes must require stronger authorization'
);
requireEndpointEvidence(
    'TEAM-04',
    /Seller session \+ step-up/u,
    'owner/member removal must require stronger authorization'
);
requireEndpointEvidence(
    'SEC-02',
    /action-dependent step-up/u,
    'security actions must require stronger authorization'
);
requireEndpointEvidence(
    'RET-02',
    /Seller session \+ step-up where required/u,
    'high-impact refund actions must require stronger authorization'
);

// Audit and finance contract evidence.
requirePattern(
    adr,
    /Audit append-only’dir/u,
    'audit must be append-only'
);
requirePattern(
    migration,
    /`seller_ledger_entries` append-only ve immutable olur\./u,
    'ledger must be append-only'
);
requirePattern(
    collective,
    /Finans düzeltmeleri reversal\/compensating kayıtla yapılır\./u,
    'financial corrections must use reversal or compensating records'
);
requireEndpointEvidence(
    'RET-02',
    /client refund amount kabul edilmez/u,
    'client refund amounts must not be authoritative'
);
requirePattern(
    adr,
    /Seller’ın gönderdiği refund, settlement veya payout amount otorite değildir\./u,
    'client settlement and payout amounts must not be authoritative'
);
requirePattern(
    api,
    /Payout release\/provider money movement için seller endpoint’i tanımlanmamıştır\./u,
    'provider payout release must remain platform-only'
);
requirePattern(
    adr,
    /Payout release ve provider money movement platform-only ve kapsam dışıdır\./u,
    'provider money movement must remain outside seller integration scope'
);
requirePattern(
    migration,
    /Ledger currency bazında debit\/credit invariant: tanımlı tolerans içinde tam eşleşme\./u,
    'ledger debit/credit balance must be required'
);
requirePattern(
    migration,
    /Settlement aynı ledger aralığını iki kez sahiplenemez\./u,
    'duplicate settlement protection must be required'
);
requirePattern(
    migration,
    /Aynı source event ikinci kez post edilemez\./u,
    'double-spend/duplicate financial posting protection must be required'
);
requirePattern(
    adr,
    /Payout account değişikliği step-up, audit ve maskeli response gerektirir\./u,
    'payout-account changes must require step-up'
);
requirePattern(
    migration,
    /Tam banka\/vergi değeri uygulama logu, audit payload veya response’a girmez\./u,
    'sensitive bank/payment data must be redacted and not logged'
);

// Offline-sensitive mutation contract evidence.
requirePattern(
    api,
    /Sensitive mutation offline queue’ya girmez\./u,
    'sensitive mutations must not queue offline'
);
const offlineCategories = [
    ['finance', /Offline finance, order, refund, role, bank veya security mutation queue\./u],
    ['refund', /Offline finance, order, refund, role, bank veya security mutation queue\./u],
    ['bank-account', /Offline finance, order, refund, role, bank veya security mutation queue\./u],
    ['role', /Offline finance, order, refund, role, bank veya security mutation queue\./u],
    ['security', /Offline finance, order, refund, role, bank veya security mutation queue\./u]
];
for (const [category, pattern] of offlineCategories) {
    requirePattern(api, pattern, `${category} mutations must not queue offline`);
}
requireEndpointEvidence('TEAM-02', /offline yasak/u, 'membership invitations must not queue offline');
requireEndpointEvidence('TEAM-03', /offline yasak/u, 'membership/role changes must not queue offline');
requireEndpointEvidence('TEAM-04', /offline yasak/u, 'owner/member removals must not queue offline');
requireEndpointEvidence('AUTH-05', /offline yok/u, 're-authentication must not queue offline');
requireEndpointEvidence(
    'AUTH-06',
    /server revoke yeniden bağlantıda tamamlanmadan success varsayılmaz/u,
    'session revocation must not claim offline success'
);
requireEndpointEvidence(
    'ORD-03',
    /offline mutation yasak/u,
    'high-impact order transitions must not queue offline'
);
requirePattern(
    collective,
    /Manual payout release|Manual payout\/release|Manuel payout talebi/u,
    'manual payout mutation must remain unavailable offline and at runtime'
);
requirePattern(
    migration,
    /Settlement düzeltmesi eski kaydı silmez; yeni settlement\/reversal zinciri kurar\./u,
    'settlement changes must remain server-side forward records, not offline queued mutation'
);

// Feature flags.
requirePattern(adr, /Başlangıç varsayılanı `false`:/u, 'seller feature flags must default off');
const expectedFeatureFlags = [
    'SELLER_API_V1_ENABLED',
    'SELLER_ONBOARDING_ENABLED',
    'SELLER_OFFER_WRITE_ENABLED',
    'SELLER_ORDER_WRITE_ENABLED',
    'SELLER_FINANCE_READ_ENABLED',
    'SELLER_PAYOUT_PREP_ENABLED',
    'EXTERNAL_SELLER_VISIBILITY_ENABLED'
];
for (const flag of expectedFeatureFlags) {
    requirePattern(
        adr,
        new RegExp('^- `' + flag + '`$', 'mu'),
        `${flag} must exist in the default-off flag catalog`
    );
}

// Static-image motion safety. Scope numeric checks only to the DG-005 contract text.
const dg005TableLine = adr.match(/^\| DG-005 \| BOTTOM_NAV_MOTION_TIMING \|[^\n]+$/mu);
if (!dg005TableLine) {
    failures.push('DG-005 BOTTOM_NAV_MOTION_TIMING must remain in the design-gap table');
} else {
    const motionContract = dg005TableLine[0];
    requirePattern(
        motionContract,
        /PNG geometri, bubble\/shine, shadow, spacing ve safe-area’yı gösterir/u,
        'static PNGs may establish the frozen geometry and safe-area contract'
    );
    for (const absentProperty of ['duration', 'easing', 'spring', 'reduced-motion', 'frame timing']) {
        requirePattern(
            motionContract,
            new RegExp(`${absentProperty.replace('-', '[- ]')}[^.]*göstermez`, 'iu'),
            `static PNGs must not establish ${absentProperty}`
        );
    }
    requirePattern(motionContract, /\| BLOCKED \|/u, 'DG-005 must remain unresolved and BLOCKED');
    requireAbsent(
        motionContract,
        /\b\d+(?:\.\d+)?\s*(?:ms|milliseconds?|seconds?|secs?|fps|hz|frames?)\b/iu,
        'DG-005 must not derive numeric duration or frame timing from static PNGs'
    );
    requireAbsent(
        motionContract,
        /\b(?:duration|easing|spring|frame[- ]?timing)\s*[:=]\s*\d/iu,
        'DG-005 must not assert numeric motion parameters'
    );
}
requirePattern(
    adr,
    /`DG-005` için statik PNG’den animasyon süresi, easing curve, spring parametresi, reduced-motion transition veya frame timing çıkarılmayacaktır\./u,
    'static PNG motion non-inference rule must remain explicit'
);
requirePattern(
    matrix,
    /BLOCKED — DG-005 BOTTOM_NAV_MOTION_TIMING/u,
    'matrix must preserve unresolved DG-005 references'
);

if (failures.length > 0) {
    console.error('sellerF0bSecurityInvariantContractSmoke: FAIL');
    failures.forEach((failure) => console.error(`- ${failure}`));
    process.exitCode = 1;
} else {
    console.log(
        'sellerF0bSecurityInvariantContractSmoke: PASS audience-separation=PASS tenant-isolation=PASS step-up=PASS ledger=PASS offline-sensitive=PASS motion-gap=PASS'
    );
}
