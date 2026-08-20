'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const hash = (relative) => crypto.createHash('sha256').update(fs.readFileSync(path.join(root, relative))).digest('hex');

const expandReferenceRanges = (value) => value.split(',').flatMap((part) => {
    const [from, to = from] = part.split('-').map((entry) => Number(entry));
    assert.ok(Number.isInteger(from) && Number.isInteger(to) && from <= to, `invalid audit range: ${part}`);
    return Array.from({ length: to - from + 1 }, (_, offset) => String(from + offset).padStart(3, '0'));
});

;(async () => {
    const build = read('seller-app/build.gradle.kts');
    const manifest = read('seller-app/src/main/AndroidManifest.xml');
    const debugManifest = read('seller-app/src/debug/AndroidManifest.xml');
    const settings = read('settings.gradle.kts');
    const repository = read('seller-app/src/main/java/com/novastore/seller/data/SellerRepository.kt');
    const sellerApi = read('seller-app/src/main/java/com/novastore/seller/data/SellerApi.kt');
    const sellerApp = read('seller-app/src/main/java/com/novastore/seller/ui/SellerApp.kt');
    const sellerScreens = read('seller-app/src/main/java/com/novastore/seller/ui/SellerScreens.kt');
    const captureInstrumentation = read('seller-app/src/androidTest/java/com/novastore/seller/SellerCanonicalCaptureInstrumentationTest.kt');
    const svgSourceTool = read('tools/sellerWave4SvgSourceSpec.py');
    const visualEvidenceTool = read('tools/sellerWave4VisualEvidence.ps1');
    const visualHandoff = read('docs/seller/wave4/SELLER-WAVE4-VISUAL-TEST-AND-HANDOFF.md');
    const ownerReferenceMapPath = 'docs/seller/wave4/SELLER-WAVE4-OWNER-SUPPLEMENTAL-REFERENCE-MAP.tsv';
    const catalog = read('seller-app/src/main/assets/seller_screen_catalog.tsv').trim().split('\n');
    assert.match(settings, /include\(":seller-app"\)/u);
    assert.match(build, /http:\/\/10\.0\.2\.2:5001\//u);
    assert.match(build, /SELLER_RELEASE_BUILD", "true"/u);
    assert.match(build, /debug\s*\{[\s\S]*SELLER_TEST_STATE_ENABLED", "true"/u);
    assert.match(build, /release\s*\{[\s\S]*SELLER_TEST_STATE_ENABLED", "false"/u);
    assert.match(build, /gradleProperty\("sellerReleaseApiBaseUrl"\)/u);
    assert.match(build, /sellerReleaseApiHostAllowlist = setOf\("novastore-backend\.onrender\.com"\)/u);
    assert.match(build, /normalizedHost !in sellerReleaseApiHostAllowlist[\s\S]*uri\.rawPath != "\/"[\s\S]*uri\.port !in setOf\(-1, 443\)[\s\S]*uri\.userInfo != null[\s\S]*uri\.rawQuery != null[\s\S]*uri\.rawFragment != null/u);
    assert.equal(
        build.includes('buildConfigField("String", "SELLER_API_BASE_URL", "\\\"$escapedSellerReleaseApiBaseUrl\\\"")'),
        true
    );
    assert.match(manifest, /android:usesCleartextTraffic="false"/u);
    assert.match(debugManifest, /android:usesCleartextTraffic="true"/u);
    assert.doesNotMatch(repository, /MockWebServer|mock provider|fixture data/iu);
    for (const signature of [
        'suspend fun dashboard(): Response<JsonElement>',
        'suspend fun offers(): Response<JsonElement>',
        'suspend fun inventory(): Response<JsonElement>',
        'suspend fun orders(): Response<JsonElement>',
        'suspend fun financeSummary(): Response<JsonElement>',
        'suspend fun financeLedger(): Response<JsonElement>',
        'suspend fun store(@Path("storeId") storeId: Long): Response<JsonElement>',
        'suspend fun support(): Response<JsonElement>',
        'suspend fun sessions(): Response<JsonElement>',
        'suspend fun teamMembers(): Response<JsonElement>'
    ]) assert.equal(sellerApi.includes(signature), true, `missing JsonElement response contract: ${signature}`);
    for (const mutationSignature of [
        'suspend fun updateStore(',
        'suspend fun updateOffer(',
        'suspend fun adjustInventory(',
        'suspend fun orderCommand(',
        'suspend fun createSupportConversation(',
        'suspend fun addSupportMessage('
    ]) assert.equal(sellerApi.includes(mutationSignature), true, `missing Android mutation contract: ${mutationSignature}`);
    assert.match(repository, /private fun page\(screen: SellerScreen, body: JsonElement\?\): SellerUiState/u);
    assert.match(repository, /body\.safeRows\(\)/u);
    assert.match(repository, /if \(all\) \{\s*api!!\.logoutAll\(\)\s*api!!\.logout\(\)/u);
    assert.match(repository, /suspend fun load\(screen: SellerScreen\): SellerUiState = load\(screen, allowRefresh = true\)/u);
    assert.match(repository, /if \(allowRefresh && refreshIfPossible\(\)\) return loadStore\(allowRefresh = false\)/u);
    assert.match(repository, /if \(!allowRefresh\) return failure\(store\)/u);
    assert.doesNotMatch(repository, /return load(?:Dashboard|Store|Team)?\(\)/u);
    assert.match(repository, /val rawLedger = ledgerResponse\.body\(\)[\s\S]*if \(rawLedger\.any \{ !it\.isJsonObject \}\) return malformedResponse\(\)[\s\S]*id = row\.long\("id"\) \?: return malformedResponse\(\)/u);
    assert.match(repository, /val body = candidates\.firstOrNull \{ it\.text\("status"\) == preferredStatus \}\s*\?: return null/u);
    assert.doesNotMatch(repository, /firstOrNull \{ it\.text\("status"\) == preferredStatus \}[\s\S]{0,120}\?: candidates\.firstOrNull/u);
    assert.match(repository, /if \(!BuildConfig\.SELLER_TEST_STATE_ENABLED\) \{\s*return mutationResult\(action, false, "SELLER_TEST_HARNESS_DISABLED"\)/u);
    assert.doesNotMatch(repository, /BuildConfig\.SELLER_RELEASE_BUILD\s*\|\|\s*api == null/u);
    const dashboardLoad = repository.slice(repository.indexOf('private suspend fun loadDashboard'), repository.indexOf('private suspend fun loadFinance'));
    assert.doesNotMatch(dashboardLoad, /api!!\.support\(\)/u, 'dashboard.read must not depend on support.read');
    assert.doesNotMatch(read('seller-app/src/main/java/com/novastore/seller/data/SellerModels.kt'), /supportConversationCount/u);
    assert.match(sellerScreens, /"Müşteri soruları; bu sürümde kapalı"[\s\S]*enabled = false/u);
    assert.doesNotMatch(sellerScreens, /"destek görüşmesi"/u, 'disabled reputation inbox must not be relabeled as seller support');
    assert.match(sellerScreens, /if \(!fixture\) \{[\s\S]*SellerScreen\.SUPPORT[\s\S]*"Satıcı desteğini görüntüle"/u);
    assert.match(sellerApp, /mutationHarnessActive = mutationHarnessForBuild\([\s\S]*BuildConfig\.SELLER_TEST_STATE_ENABLED,[\s\S]*mutationHarnessActive \|\| SellerMutationHarnessControl\.enabled/u);
    assert.doesNotMatch(sellerApp, /mutationHarnessActive = mutationHarnessActive \|\|/u);
    assert.match(sellerScreens, /val members = page\.team\?\.members\.orEmpty\(\)/u);
    assert.doesNotMatch(sellerScreens, /members\.orEmpty\(\)\.ifEmpty/u);
    assert.match(sellerScreens, /val visibleMembers = visibleTeamMembers\(members, fixture\)/u);
    assert.match(sellerScreens, /if \(fixture\) members\.take\(3\) else members/u);
    assert.match(sellerScreens, /else -> "Rol kapsamı doğrulanamadı; izinler gösterilmedi\."/u);
    assert.doesNotMatch(sellerScreens, /productCount = if \(fixture\) 18 else lowStock/u);
    assert.doesNotMatch(sellerScreens, /if \(fixture\) "Hazırlanıyor" else "Canlı"|Sunucudan doğrulandı/u);
    assert.match(sellerScreens, /if \(fixture\) \{\s*Text\("●  Mağaza açık"/u);
    assert.match(sellerScreens, /if \(fixture\) \{\s*Text\("KS"[\s\S]{0,350}else \{\s*Icon\([\s\S]{0,160}contentDescription = "Doğrulanmış satıcı oturumu"/u);
    assert.match(sellerScreens, /if \(fixture\) \{\s*item \{ ContextCard\("Mağaza", "NovaStore Demo Mağaza"/u);
    assert.match(sellerApp, /alpha = if \(selected\) 1f else 0f/u);
    assert.doesNotMatch(sellerApp, /lerp\(Navy, selectedColor/u);
    assert.match(read('seller-app/src/main/java/com/novastore/seller/SellerMainActivity.kt'), /BuildConfig\.SELLER_TEST_STATE_ENABLED/u);
    assert.match(read('seller-app/src/main/java/com/novastore/seller/SellerMainActivity.kt'), /mutationHarnessForBuild\([\s\S]*testStateEnabled && requested/u);
    assert.match(read('seller-app/src/androidTest/java/com/novastore/seller/SellerNavigationInstrumentationTest.kt'), /realSellerMutationAndConflictPathsUseOnlyTheAndroidUi/u);
    const mutationInstrumentation = read('seller-app/src/androidTest/java/com/novastore/seller/SellerNavigationInstrumentationTest.kt');
    for (const action of [
        'STORE_CROSS_TENANT_DENIAL',
        'OFFER_CROSS_TENANT_DENIAL',
        'INVENTORY_CROSS_TENANT_DENIAL',
        'ORDER_CROSS_TENANT_DENIAL',
        'SUPPORT_CROSS_TENANT_DENIAL'
    ]) {
        assert.equal(repository.includes(`SellerMutationAction.${action}`), true, `missing repository foreign-store action: ${action}`);
        assert.equal(mutationInstrumentation.includes(`runMutation(instrumentation, "${action}")`), true, `missing Android foreign-store action: ${action}`);
    }
    for (const argument of [
        'sellerCrossTenantStoreId',
        'sellerCrossTenantOfferId',
        'sellerCrossTenantInventoryItemId',
        'sellerCrossTenantOrderId',
        'sellerCrossTenantConversationId'
    ]) assert.equal(mutationInstrumentation.includes(argument), true, `missing Android foreign-store target: ${argument}`);
    assert.equal((read('seller-app/src/main/java/com/novastore/seller/ui/SellerViewModel.kt').match(/repository\.performMutation\(/gu) || []).length, 1);
    assert.match(read('seller-app/src/main/java/com/novastore/seller/ui/SellerViewModel.kt'), /canonicalStateForHarness/u);
    const stateCatalog = read('docs/seller/wave4/SELLER-WAVE4-CANONICAL-STATE-CATALOG.tsv').trim().split(/\r?\n/u);
    const stateColumns = stateCatalog[0].split('\t');
    assert.deepEqual(stateColumns, [
        'test_state',
        'canonical_references',
        'state_purpose',
        'route',
        'fixture_strategy',
        'expected_semantic_markers',
        'expected_api_calls',
        'screenshot_path',
        'release_effect',
        'capture_requirement'
    ]);
    const stateRows = stateCatalog.slice(1).map((line) => {
        const values = line.split('\t');
        assert.equal(values.length, stateColumns.length, `state catalog column count: ${line}`);
        return Object.fromEntries(stateColumns.map((column, index) => [column, values[index]]));
    });
    assert.equal(stateRows.length, 48);
    assert.equal(new Set(stateRows.map((row) => row.test_state)).size, stateRows.length);
    const claimedCanonicalReferences = stateRows
        .filter((row) => row.canonical_references !== 'NONE')
        .flatMap((row) => row.canonical_references.split(','));
    assert.equal(new Set(claimedCanonicalReferences).size, claimedCanonicalReferences.length, 'canonical reference ownership must be unique');
    const highThroughputStates = stateRows.filter((row) => /^ref_\d{3}$/u.test(row.test_state));
    assert.equal(highThroughputStates.length, 40);
    const canonicalHarness = read('seller-app/src/androidTest/java/com/novastore/seller/SellerCanonicalStateHarness.kt');
    const canonicalCaptureTest = read('seller-app/src/androidTest/java/com/novastore/seller/SellerCanonicalCaptureInstrumentationTest.kt');
    assert.match(canonicalHarness, /SellerCanonicalStateHarness/u);
    assert.match(canonicalCaptureTest, /closedAffordancesExposeDisabledReadOnlySemantics/u);
    assert.match(canonicalCaptureTest, /Closed affordance must not be enabled/u);
    assert.match(canonicalCaptureTest, /Closed affordance must not be clickable/u);
    assert.match(canonicalCaptureTest, /rememberMeCheckboxIsIndependentFromDisabledPasswordRecovery/u);
    assert.match(canonicalCaptureTest, /Password-recovery interaction must not toggle remember-me/u);
    assert.match(sellerApp, /\.toggleable\([\s\S]*value = remembered,[\s\S]*role = Role\.Checkbox/u);
    assert.doesNotMatch(sellerApp, /fillMaxWidth\(\)[\s\S]{0,100}\.height\(48\.dp\)[\s\S]{0,100}\.clickable\(role = Role\.Checkbox\)/u);
    assert.match(canonicalCaptureTest, /teamInformationAffordancesExposeMeaningfulDescriptions/u);
    for (const description of [
        'Mağaza ve oturum rolü hakkında bilgi',
        'Ekip yönetimi kapsamı hakkında bilgi',
        'Güvenli sonraki adım hakkında bilgi'
    ]) {
        assert.equal(sellerScreens.includes(description), true, `missing team information semantics: ${description}`);
        assert.equal(canonicalCaptureTest.includes(description), true, `missing team information instrumentation assertion: ${description}`);
    }
    assert.match(canonicalHarness, /bottomNavigationSpecifications = listOf\([\s\S]*nav_dashboard[\s\S]*nav_products[\s\S]*nav_orders[\s\S]*nav_finance[\s\S]*nav_store/u);
    assert.match(canonicalCaptureTest, /canonicalHarnessDrivesOnlyDeclaredDebugStates/u);
    assert.match(canonicalCaptureTest, /bottomNavigationCapturesAllSelectedStatesAndTransitionFrames/u);
    assert.match(sellerApp, /SellerScreen\.PRODUCTS -> "offers"/u);
    assert.match(sellerApp, /SellerScreen\.SECURITY -> "settings\/security"/u);
    assert.match(read('seller-app/src/main/java/com/novastore/seller/data/SellerModels.kt'), /fun JsonElement\?\.safeRows\(\): List<Pair<String, String>>/u);
    assert.equal(catalog.length, 297);
    assert.match(catalog[1], /^001\t/u);
    assert.match(catalog.at(-1), /^296\t/u);
    const ownerReferenceLines = read(ownerReferenceMapPath).trim().split(/\r?\n/u);
    const ownerReferenceColumns = ownerReferenceLines[0].split('\t');
    assert.deepEqual(ownerReferenceColumns, [
        'OWNER_REFERENCE_ID',
        'ATTACHMENT',
        'SHA256',
        'MATCHED_REFERENCE',
        'ROUTE',
        'STATE',
        'CATEGORY',
        'SUPERSEDES',
        'BINDING_STATUS',
        'NOTES'
    ]);
    const ownerReferenceRows = ownerReferenceLines.slice(1).map((line) => {
        const values = line.split('\t');
        assert.equal(values.length, ownerReferenceColumns.length, `owner reference column count: ${line}`);
        return Object.fromEntries(ownerReferenceColumns.map((column, index) => [column, values[index]]));
    });
    assert.equal(ownerReferenceRows.length, 9);
    assert.equal(new Set(ownerReferenceRows.map((row) => row.OWNER_REFERENCE_ID)).size, 9);
    assert.equal(new Set(ownerReferenceRows.map((row) => row.ATTACHMENT)).size, 9);
    const ownerReferencePolicies = new Map([
        ['001', { route: 'seller://auth/login', state: 'login' }],
        ['055', { route: 'seller://dashboard', state: 'ref_055' }],
        ['282', { route: 'seller://team', state: 'ref_282' }]
    ]);
    for (const row of ownerReferenceRows) {
        const policy = ownerReferencePolicies.get(row.MATCHED_REFERENCE);
        assert.ok(policy, `unexpected owner reference match: ${row.MATCHED_REFERENCE}`);
        assert.equal(row.ROUTE, policy.route);
        assert.equal(row.STATE, policy.state);
        assert.equal(row.CATEGORY, 'EXACT_DUPLICATE');
        assert.equal(row.SUPERSEDES, 'NONE');
        assert.equal(row.BINDING_STATUS, 'OWNER_SUPPLIED_DUPLICATE_EVIDENCE_NO_SUPERSESSION');
        assert.match(row.NOTES, /^MATCH_CONFIDENCE=1\.00; MATCH_REASON=.+/u);
        assert.doesNotMatch(`${row.OWNER_REFERENCE_ID}\t${row.NOTES}`, /UNKNOWN|UNMAPPED|IGNORED/u);
        assert.match(row.SHA256, /^[a-f0-9]{64}$/u);
        assert.equal(hash(row.ATTACHMENT), row.SHA256, `owner attachment hash mismatch: ${row.ATTACHMENT}`);
    }
    assert.deepEqual(
        [...new Set(ownerReferenceRows.map((row) => row.MATCHED_REFERENCE))].sort(),
        ['001', '055', '282']
    );
    assert.equal(visualHandoff.includes('OWNER_SUPPLIED_DUPLICATE_EVIDENCE_NO_SUPERSESSION'), true);
    const canonicalMatrix = read('docs/seller/wave4/SELLER-WAVE4-CANONICAL-SCREEN-MATRIX.tsv').trim().split(/\r?\n/u);
    const [matrixHeader, ...canonicalReferences] = canonicalMatrix;
    const matrixColumns = matrixHeader.split('\t');
    const requiredMatrixColumns = [
        'reference_number',
        'original_file',
        'canonical_flow',
        'canonical_screen',
        'canonical_state',
        'source_reference_type',
        'canonical_category',
        'unique_variant_classification',
        'android_route',
        'android_component',
        'api_or_local_state_dependency',
        'user_action_required_to_reach',
        'launch_inclusion_exclusion',
        'runtime_test_id',
        'screenshot_evidence_path',
        'overlay_diff_evidence_path',
        'result'
    ];
    assert.deepEqual(matrixColumns, requiredMatrixColumns);
    assert.equal(canonicalReferences.length, 296);
    const categoryCounts = new Map();
    const matrixRows = canonicalReferences.map((line, index) => {
        const values = line.split('\t');
        assert.equal(values.length, requiredMatrixColumns.length, `matrix column count at row ${index + 2}`);
        const row = Object.fromEntries(requiredMatrixColumns.map((column, columnIndex) => [column, values[columnIndex]]));
        assert.equal(row.reference_number, String(index + 1).padStart(3, '0'));
        for (const column of requiredMatrixColumns) assert.notEqual(row[column], '', `empty ${column} at ${row.reference_number}`);
        assert.match(row.original_file, new RegExp(`^source/phone/seller-phone-${row.reference_number}-.*\\.png$`, 'u'));
        assert.match(row.canonical_category, /^[A-H]$/u);
        assert.doesNotMatch(JSON.stringify(row), /UNKNOWN|TBD|UNMAPPED/u);
        categoryCounts.set(row.canonical_category, (categoryCounts.get(row.canonical_category) || 0) + 1);
        return row;
    });
    assert.deepEqual(Object.fromEntries(categoryCounts), { A: 1, E: 31, G: 106, B: 133, C: 25 });
    const matrixByReference = new Map(matrixRows.map((row) => [row.reference_number, row]));
    assert.equal(new Set(matrixRows.map((row) => row.android_route)).size, 32);
    assert.equal(new Set(matrixRows.filter((row) => row.launch_inclusion_exclusion === 'INCLUDED_CANONICAL_LAUNCH').map((row) => row.android_route)).size, 19);
    assert.equal(matrixRows.filter((row) => row.launch_inclusion_exclusion === 'INCLUDED_CANONICAL_LAUNCH').length, 190);
    const catalogColumns = catalog[0].trim().split('\t');
    const catalogById = new Map(catalog.slice(1).map((line) => {
        const values = line.trim().split('\t');
        const row = Object.fromEntries(catalogColumns.map((column, index) => [column, values[index]]));
        return [row.id, row];
    }));
    matrixRows.forEach((row) => {
        assert.equal(catalogById.get(row.reference_number)?.canonical_source, row.original_file, `catalog/matrix source mismatch: ${row.reference_number}`);
    });
    const activeRepresentativeReferences = [
        '001', '055', '057', '066', '069', '074', '089', '124', '142', '156',
        '185', '243', '276', '282', '292'
    ];
    const representativeLiteral = /representativeGateSpecifications = listOf\("001", "055", "057", "066", "069", "074", "089", "124", "142", "156", "185", "243", "276", "282", "292"\)/u;
    assert.match(canonicalHarness, representativeLiteral);
    assert.equal(new Set(activeRepresentativeReferences).size, 15);
    activeRepresentativeReferences.forEach((reference) => {
        assert.equal(matrixByReference.get(reference)?.launch_inclusion_exclusion, 'INCLUDED_CANONICAL_LAUNCH', `active representative must be included: ${reference}`);
    });
    for (const reference of ['027', '205', '223', '257', '271']) {
        assert.equal(activeRepresentativeReferences.includes(reference), false, `fail-closed reference remained active: ${reference}`);
    }
    const representativeReconciliations = [
        ['027', '057', 'seller://dashboard', 'Dashboard first-use/root', 'EXCLUSION-AUDIT:012-018,023-054'],
        ['205', '066', 'seller://dashboard', 'Dashboard performance', 'EXCLUSION-AUDIT:205-222'],
        ['223', '089', 'seller://offers', 'Offer listing/catalog', 'EXCLUSION-AUDIT:223-242'],
        ['257', '069', 'seller://dashboard', 'Dashboard notification summary', 'EXCLUSION-AUDIT:257-270'],
        ['271', '276', 'seller://support', 'Customer communication/support', 'LOCAL_CAPABILITY_DISABLED:customer-conversation.read']
    ];
    representativeReconciliations.forEach(([oldReference, newReference, route, family, evidence]) => {
        const oldRow = matrixByReference.get(oldReference);
        const newRow = matrixByReference.get(newReference);
        const oldIsFailClosed = oldRow.launch_inclusion_exclusion === 'EXCLUDED_FAIL_CLOSED' || (
            oldRow.api_or_local_state_dependency.startsWith('LOCAL_CAPABILITY_DISABLED:') &&
            oldRow.result === 'IMPLEMENTED_FAIL_CLOSED_SURFACE'
        );
        assert.equal(oldIsFailClosed, true, `old representative is not fail closed: ${oldReference}`);
        assert.equal(newRow.launch_inclusion_exclusion, 'INCLUDED_CANONICAL_LAUNCH', `replacement is not included: ${newReference}`);
        assert.equal(newRow.android_route, route, `replacement route mismatch: ${newReference}`);
        for (const value of [oldReference, newReference, route, family, evidence]) {
            assert.equal(visualHandoff.includes(value), true, `missing reconciliation record value: ${value}`);
        }
    });
    highThroughputStates.forEach((state) => {
        const reference = state.test_state.slice(4);
        const matrix = matrixByReference.get(reference);
        assert.ok(matrix, `missing matrix row for ${state.test_state}`);
        assert.equal(state.canonical_references, reference);
        assert.equal(state.route, matrix.android_route);
        assert.equal(state.expected_api_calls, matrix.api_or_local_state_dependency);
        assert.equal(state.screenshot_path, matrix.screenshot_evidence_path);
        assert.equal(state.fixture_strategy, 'DEBUG_ONLY_SYNTHETIC_CANONICAL');
        assert.ok(state.expected_semantic_markers.split('|').length >= 3);
    });
    for (const [reference, dependency] of [
        ['156', 'GET /api/seller/v1/orders/{sellerOrderId}'],
        ['185', 'GET /api/seller/v1/finance/summary'],
        ['089', 'GET /api/seller/v1/offers'],
        ['276', 'GET /api/seller/v1/support/conversations']
    ]) {
        assert.equal(canonicalHarness.includes(`canonical("${reference}"`) && canonicalHarness.includes(dependency), true, `canonical harness dependency mismatch: ${reference}`);
    }
    const svgSourceMap = read('docs/seller/wave4/SELLER-WAVE4-SVG-SOURCE-MAP.tsv').trim().split(/\r?\n/u);
    const [svgMapHeader, ...svgMapLines] = svgSourceMap;
    const svgMapColumns = svgMapHeader.split('\t');
    assert.deepEqual(svgMapColumns, [
        'REFERENCE_ID', 'PNG_PATH', 'PNG_SHA256', 'PNG_WIDTH', 'PNG_HEIGHT',
        'FULL_SCREEN_SVG_PATH', 'SVG_EXISTS', 'SVG_CLASSIFICATION', 'SVG_SHA256',
        'SVG_VIEWBOX', 'SVG_WIDTH', 'SVG_HEIGHT', 'MANIFEST_HASH_VERIFIED',
        'SVG_RENDERER', 'SVG_TO_PNG_DELTA_PERCENT', 'SVG_TO_PNG_RESULT', 'DESIGN_TURN/MANIFEST',
        'CANONICAL_INCLUDED_OR_EXCLUDED'
    ]);
    assert.equal(svgMapLines.length, 296);
    const svgRows = svgMapLines.map((line, index) => {
        const values = line.split('\t');
        assert.equal(values.length, svgMapColumns.length, `SVG source-map column count at row ${index + 2}`);
        return Object.fromEntries(svgMapColumns.map((column, columnIndex) => [column, values[columnIndex]]));
    });
    assert.equal(svgRows.filter((row) => row.SVG_CLASSIFICATION === 'FULL_SCREEN_SVG').length, 194);
    assert.equal(svgRows.filter((row) => row.SVG_CLASSIFICATION === 'NONE').length, 102);
    assert.equal(svgRows.filter((row) => row.SVG_CLASSIFICATION.includes('HELPER')).length, 0);
    svgRows.forEach((row, index) => {
        const reference = String(index + 1).padStart(3, '0');
        assert.equal(row.REFERENCE_ID, reference);
        assert.equal(row.PNG_PATH, catalogById.get(reference)?.canonical_source);
        assert.equal(row.CANONICAL_INCLUDED_OR_EXCLUDED, matrixByReference.get(reference)?.launch_inclusion_exclusion);
        assert.match(row.PNG_SHA256, /^[a-f0-9]{64}$/u);
        assert.equal(row.MANIFEST_HASH_VERIFIED, 'PASS');
        if (row.SVG_EXISTS === 'YES') {
            assert.equal(row.SVG_CLASSIFICATION, 'FULL_SCREEN_SVG');
            assert.equal(row.SVG_VIEWBOX, '0 0 852 1846');
            assert.equal(row.SVG_WIDTH, '852');
            assert.equal(row.SVG_HEIGHT, '1846');
            assert.match(row.SVG_SHA256, /^[a-f0-9]{64}$/u);
            assert.match(row.SVG_RENDERER, /^msedge\.exe:sha256:[a-f0-9]{64}$/u);
            assert.ok(Number.isFinite(Number(row.SVG_TO_PNG_DELTA_PERCENT)));
            assert.ok(['PASS', 'FAIL'].includes(row.SVG_TO_PNG_RESULT));
        } else {
            assert.equal(row.SVG_RENDERER, 'N/A');
            assert.equal(row.SVG_TO_PNG_DELTA_PERCENT, 'N/A');
            assert.equal(row.SVG_TO_PNG_RESULT, 'N/A');
        }
    });
    assert.deepEqual(
        svgRows.filter((row) => row.SVG_TO_PNG_RESULT === 'FAIL').map((row) => row.REFERENCE_ID),
        ['031', '209', '271']
    );
    assert.match(svgSourceTool, /EXPECTED_PACKAGE_MANIFEST_SHA256 = "17fcbf0f80509753d3ce2239726ef5fab5a62ae739c85562440b63b6e5ed4e65"/u);
    assert.match(svgSourceTool, /def validate_svg_render_input\(/u);
    assert.match(svgSourceTool, /--disable-javascript/u);
    assert.match(svgSourceTool, /--host-resolver-rules=MAP \* 0\.0\.0\.0/u);
    assert.doesNotMatch(svgSourceTool, /EXCLUDE localhost/u);
    assert.ok(svgSourceTool.indexOf('actual_manifest_hash = sha256(manifest_path)') < svgSourceTool.indexOf('browser = find_browser(args.browser)'), 'manifest digest must be pinned before browser startup');
    assert.ok(svgSourceTool.indexOf('validate_svg_render_input(svg_path, handoff, package_manifest)') < svgSourceTool.indexOf('browser = find_browser(args.browser)'), 'SVG inputs must be validated before browser startup');
    assert.match(visualEvidenceTool, /\[ValidateRange\(0\.0, 5\.0\)\]/u);
    assert.match(visualEvidenceTool, /Caller evidence expectations differ from committed canonical policy/u);
    assert.match(visualEvidenceTool, /ReferencePath differs from the committed canonical PNG path/u);
    assert.match(visualEvidenceTool, /Canonical PNG hash differs from the committed SVG source map/u);
    assert.match(visualEvidenceTool, /Golden reference requires its committed layout specification/u);
    assert.match(visualEvidenceTool, /Layout specification binding PNG differs from the committed source map/u);
    assert.match(visualEvidenceTool, /\$visualGatePassed = \$deltaPercent -le \$MaximumDeltaPercent/u);
    assert.match(visualEvidenceTool, /Capture receipt hash mismatch/u);
    assert.match(visualEvidenceTool, /Capture-time runtime hash mismatch/u);
    assert.match(visualEvidenceTool, /captureReceipt\.apk_sha256 -ne \$sellerInstalledApkSha256/u);
    assert.match(visualEvidenceTool, /StartsWith\('\/data\/app\/'[\s\S]*EndsWith\('\/base\.apk'[\s\S]*-cmatch '\[\^A-Za-z0-9\._=\+~\/-\]'/u);
    assert.doesNotMatch(visualEvidenceTool, /ExpectedCaptureManifestSha256|ExpectedRuntimeSha256/u);
    assert.match(visualEvidenceTool, /expected=\$ExpectedAvdName actual=\$actualAvdName/u);
    assert.match(visualEvidenceTool, /\$wrongContext = \$actualRoute -ne \$ExpectedRoute/u);
    assert.match(visualEvidenceTool, /UNMASKED_FULL_FRAME_RGB_ABSOLUTE_DIFFERENCE_SUM_GT_36/u);
    assert.match(captureInstrumentation, /\.put\("schema_version", 2\)/u);
    assert.match(captureInstrumentation, /"capture_canvas_px"/u);
    assert.match(captureInstrumentation, /"runtime_bounds_raw_px"/u);
    assert.match(visualEvidenceTool, /Golden reference requires schema-v2 capture receipt runtime bounds/u);
    assert.match(visualEvidenceTool, /\[int\]\$captureReceiptAttestation\.schema_version -eq 2/u);
    assert.doesNotMatch(visualEvidenceTool, /schema_version -ge 2/u);
    assert.match(visualEvidenceTool, /runtime_bounds_raw_px/u);
    for (const reference of ['001', '055', '156', '185', '243', '276', '282', '292']) {
        const spec = JSON.parse(read(`docs/seller/wave4/spec/${reference}-layout-spec.json`));
        assert.equal(spec.reference_id, reference);
        assert.ok(Number(spec.canvas.width) > 0 && Number(spec.canvas.height) > 0);
        if (['001', '055'].includes(reference)) {
            assert.equal(spec.authority, 'PNG_ONLY');
            assert.ok(spec.regions.every((region) => region.normalized));
        } else {
            assert.equal(spec.authority, 'FULL_SCREEN_SVG');
            assert.deepEqual(spec.canvas.viewBox, [0, 0, 852, 1846]);
            assert.ok(spec.objects.length > 0);
            assert.ok(spec.regions.length > 0);
            assert.equal(spec.svg_to_png_verification.package_manifest_hash, 'PASS');
            assert.equal(spec.svg_to_png_verification.result, 'PASS');
            assert.ok(spec.svg_to_png_verification.delta_percent <= 5);
        }
    }
    const representativeEvidenceDirectory = 'docs/seller/wave4/evidence/representative';
    const representativeEvidenceEntries = fs.readdirSync(
        path.join(root, representativeEvidenceDirectory),
        { withFileTypes: true }
    );
    const representativeEvidenceFiles = representativeEvidenceEntries
        .filter((entry) => entry.isFile())
        .map((entry) => entry.name)
        .sort();
    const expectedRepresentativeEvidenceFiles = [
        ...['001', '055', '282'].flatMap((reference) => [
            `${reference}-diff.json`,
            `${reference}-overlay.png`,
            `${reference}-runtime.png`,
            `${reference}-side-by-side.png`
        ]),
        'SHA256SUMS.txt'
    ].sort();
    assert.deepEqual(representativeEvidenceFiles, expectedRepresentativeEvidenceFiles);
    assert.deepEqual(
        representativeEvidenceEntries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort(),
        ['r2-owner-authority']
    );
    const evidenceHashLines = read(`${representativeEvidenceDirectory}/SHA256SUMS.txt`).trim().split(/\r?\n/u);
    assert.equal(evidenceHashLines.length, 12);
    for (const line of evidenceHashLines) {
        const match = line.match(/^([a-f0-9]{64})  ([^/\\]+)$/u);
        assert.ok(match, `invalid representative evidence hash row: ${line}`);
        assert.equal(hash(`${representativeEvidenceDirectory}/${match[2]}`), match[1], `representative evidence hash mismatch: ${match[2]}`);
    }
    const expectedGoldenDeltas = { '001': 9.6047, '055': 19.8533, '282': 11.2235 };
    for (const [reference, expectedDelta] of Object.entries(expectedGoldenDeltas)) {
        const diff = JSON.parse(read(`${representativeEvidenceDirectory}/${reference}-diff.json`));
        assert.equal(diff.delta_percent, expectedDelta);
        assert.equal(diff.threshold_percent, 5);
        assert.equal(diff.result, 'FAIL');
        assert.equal(diff.geometry_gate.result, 'FAIL');
        assert.equal(diff.layout_spec.path, `docs/seller/wave4/spec/${reference}-layout-spec.json`);
        assert.match(diff.layout_spec.sha256, /^[a-f0-9]{64}$/u);
        assert.equal(diff.evidence_provenance.comparison_algorithm, 'UNMASKED_FULL_FRAME_RGB_ABSOLUTE_DIFFERENCE_SUM_GT_36');
        assert.match(diff.evidence_provenance.capture_manifest_sha256, /^[a-f0-9]{64}$/u);
        assert.match(diff.evidence_provenance.runtime_input_sha256, /^[a-f0-9]{64}$/u);
        assert.match(diff.evidence_provenance.capture_receipt_sha256, /^[a-f0-9]{64}$/u);
        assert.equal(diff.evidence_provenance.capture_time_avd_name, 'novastore-seller-wave4-uat');
        assert.match(diff.evidence_provenance.capture_time_apk_sha256, /^[a-f0-9]{64}$/u);
        assert.equal(diff.evidence_provenance.capture_time_apk_sha256, diff.evidence_provenance.installed_apk_sha256);
        assert.match(diff.evidence_provenance.capture_time_utc, /^20\d\d-/u);
        assert.equal(diff.evidence_provenance.capture_manifest_row.reference, reference);
        assert.equal(diff.evidence_provenance.capture_manifest_row.runtime_sha256, diff.evidence_provenance.runtime_input_sha256);
        assert.equal(diff.evidence_provenance.capture_receipt.canonical_state_id, reference);
        assert.equal(diff.evidence_provenance.capture_receipt.runtime_sha256, diff.evidence_provenance.runtime_input_sha256);
        assert.equal(diff.evidence_provenance.normalized_runtime_sha256, hash(`${representativeEvidenceDirectory}/${reference}-runtime.png`));
        assert.equal(diff.evidence_provenance.capture_receipt.capture_valid, 'YES');
        assert.match(diff.evidence_provenance.capture_record_sha256, /^[a-f0-9]{64}$/u);
        assert.equal(diff.evidence_provenance.avd_name, 'novastore-seller-wave4-uat');
        assert.equal(diff.evidence_provenance.capture_profile.capture_valid, 'YES');
        assert.equal(diff.evidence_provenance.capture_profile.wrong_context, 'NO');
    }
    const r2EvidenceDirectory = `${representativeEvidenceDirectory}/r2-owner-authority`;
    const expectedR2EvidenceFiles = [
        '001-capture.json',
        '001-runtime.png',
        '055-capture.json',
        '055-runtime.png',
        '282-capture.json',
        '282-diff.json',
        '282-runtime.png',
        '282-side-by-side.png',
        'R2-EVIDENCE-MANIFEST.json',
        'SHA256SUMS.txt'
    ].sort();
    assert.deepEqual(
        fs.readdirSync(path.join(root, r2EvidenceDirectory)).sort(),
        expectedR2EvidenceFiles
    );
    const r2HashLines = read(`${r2EvidenceDirectory}/SHA256SUMS.txt`).trim().split(/\r?\n/u);
    assert.equal(r2HashLines.length, expectedR2EvidenceFiles.length - 1);
    for (const line of r2HashLines) {
        const match = line.match(/^([a-f0-9]{64})  ([^/\\]+)$/u);
        assert.ok(match, `invalid R2 evidence hash row: ${line}`);
        assert.equal(hash(`${r2EvidenceDirectory}/${match[2]}`), match[1], `R2 evidence hash mismatch: ${match[2]}`);
    }
    const r2Evidence = JSON.parse(read(`${r2EvidenceDirectory}/R2-EVIDENCE-MANIFEST.json`));
    assert.equal(r2Evidence.schema_version, 1);
    assert.equal(r2Evidence.avd_name, 'novastore-seller-wave4-uat');
    assert.equal(r2Evidence.same_apk_sha256, '5efdba9e3e26530539fb80bb8890924a6fc6d3887638a91f4fd00c1ada8b2a44');
    const expectedR2Routes = {
        '001': ['login', 'seller://auth/login'],
        '055': ['ref_055', 'seller://dashboard'],
        '282': ['ref_282', 'seller://team']
    };
    for (const [reference, [state, route]] of Object.entries(expectedR2Routes)) {
        const evidence = r2Evidence.references[reference];
        const receipt = JSON.parse(read(`${r2EvidenceDirectory}/${evidence.capture_receipt_file}`));
        assert.equal(evidence.state, state);
        assert.equal(evidence.route, route);
        assert.equal(evidence.visual_result, 'PASS');
        assert.equal(hash(`${r2EvidenceDirectory}/${evidence.runtime_file}`), evidence.runtime_sha256);
        assert.equal(hash(`${r2EvidenceDirectory}/${evidence.capture_receipt_file}`), evidence.capture_receipt_sha256);
        assert.equal(receipt.schema_version, 2);
        assert.equal(receipt.canonical_state_id, reference);
        assert.equal(receipt.state, state);
        assert.equal(receipt.expected_route, route);
        assert.equal(receipt.actual_route, route);
        assert.equal(receipt.runtime_sha256, evidence.runtime_sha256);
        assert.equal(receipt.apk_sha256, r2Evidence.same_apk_sha256);
        assert.equal(receipt.avd_name, r2Evidence.avd_name);
        assert.equal(receipt.capture_valid, 'YES');
        assert.equal(receipt.frame_stable, 'YES');
        assert.equal(receipt.ui_idle, 'YES');
        assert.equal(receipt.wrong_context, 'NO');
    }
    const r2Team = r2Evidence.references['282'];
    const r2TeamDiff = JSON.parse(read(`${r2EvidenceDirectory}/${r2Team.diff_file}`));
    assert.equal(hash(`${r2EvidenceDirectory}/${r2Team.diff_file}`), r2Team.diff_sha256);
    assert.equal(hash(`${r2EvidenceDirectory}/${r2Team.side_by_side_file}`), r2Team.side_by_side_sha256);
    assert.equal(r2TeamDiff.delta_percent, 4.8425);
    assert.equal(r2TeamDiff.threshold_percent, 5);
    assert.equal(r2TeamDiff.result, 'PASS');
    assert.equal(r2TeamDiff.geometry_gate.result, 'PASS');
    assert.deepEqual(r2TeamDiff.geometry_gate.failed_region_ids, []);
    assert.equal(r2TeamDiff.evidence_provenance.installed_apk_sha256, r2Evidence.same_apk_sha256);
    assert.equal(r2TeamDiff.evidence_provenance.capture_time_apk_sha256, r2Evidence.same_apk_sha256);
    assert.equal(r2TeamDiff.evidence_provenance.runtime_input_sha256, r2Team.runtime_sha256);
    const ownerRecoveryEvidenceDirectory = 'docs/seller/wave4/evidence/owner-supplemental-recovery';
    const ownerRecoveryEvidenceFiles = fs.readdirSync(path.join(root, ownerRecoveryEvidenceDirectory)).sort();
    assert.deepEqual(ownerRecoveryEvidenceFiles, expectedRepresentativeEvidenceFiles);
    const ownerRecoveryHashLines = read(`${ownerRecoveryEvidenceDirectory}/SHA256SUMS.txt`).trim().split(/\r?\n/u);
    assert.equal(ownerRecoveryHashLines.length, 12);
    for (const line of ownerRecoveryHashLines) {
        const match = line.match(/^([a-f0-9]{64})  ([^/\\]+)$/u);
        assert.ok(match, `invalid owner recovery evidence hash row: ${line}`);
        assert.equal(hash(`${ownerRecoveryEvidenceDirectory}/${match[2]}`), match[1], `owner recovery evidence hash mismatch: ${match[2]}`);
    }
    const expectedOwnerRecoveryDeltas = { '001': 8.9735, '055': 19.2761, '282': 10.4813 };
    for (const [reference, expectedDelta] of Object.entries(expectedOwnerRecoveryDeltas)) {
        const diff = JSON.parse(read(`${ownerRecoveryEvidenceDirectory}/${reference}-diff.json`));
        assert.equal(diff.delta_percent, expectedDelta);
        assert.equal(diff.threshold_percent, 5);
        assert.equal(diff.result, 'FAIL');
        assert.equal(diff.geometry_gate.result, 'FAIL');
        assert.equal(diff.evidence_provenance.capture_time_avd_name, 'novastore-seller-wave4-uat');
        assert.equal(diff.evidence_provenance.capture_profile.capture_valid, 'YES');
        assert.equal(diff.evidence_provenance.capture_profile.wrong_context, 'NO');
        assert.equal(diff.evidence_provenance.capture_receipt.capture_valid, 'YES');
        assert.equal(diff.evidence_provenance.capture_receipt.frame_stable, 'YES');
        assert.equal(diff.evidence_provenance.capture_time_apk_sha256, '9f6912d428112ef3d612ecf8136433d373f9b5b0b1f70b847646e3e9bd82b713');
        assert.equal(diff.evidence_provenance.capture_time_apk_sha256, diff.evidence_provenance.installed_apk_sha256);
        assert.equal(diff.evidence_provenance.normalized_runtime_sha256, hash(`${ownerRecoveryEvidenceDirectory}/${reference}-runtime.png`));
    }
    const designQa = read('docs/seller/wave4/SELLER-DESIGN-QA.md');
    assert.match(designQa, /current owner-approved NovaStore Seller design system/u);
    assert.match(designQa, /### 001 login — PASS/u);
    assert.match(designQa, /### 055 dashboard — PASS/u);
    assert.match(designQa, /### 282 team — PASS, regression frozen/u);
    assert.match(designQa, /`4\.8425%` at a `5%` threshold, full-frame `PASS`, geometry `PASS`/u);
    assert.match(designQa, /docs\/seller\/wave4\/evidence\/representative\/r2-owner-authority/u);
    assert.match(designQa, /Current three-screen pass count: `3\/3`/u);
    assert.match(designQa, /final result: passed\s*$/u);
    const excludedReferences = matrixRows
        .filter((row) => row.launch_inclusion_exclusion === 'EXCLUDED_FAIL_CLOSED')
        .map((row) => row.reference_number)
        .sort();
    const auditLines = read('docs/seller/wave4/SELLER-WAVE4-EXCLUSION-AUDIT.tsv').trim().split(/\r?\n/u);
    const [auditHeader, ...auditRows] = auditLines;
    const auditColumns = auditHeader.split('\t');
    assert.deepEqual(auditColumns, ['reference_numbers', 'exclusion_basis', 'contract_locator', 'screen_backend_matrix_locator', 'source_catalog_locator', 'audit_disposition']);
    const auditedReferences = auditRows.flatMap((line) => {
        const values = line.split('\t');
        assert.equal(values.length, auditColumns.length, `audit column count: ${line}`);
        const row = Object.fromEntries(auditColumns.map((column, index) => [column, values[index]]));
        for (const column of auditColumns) assert.notEqual(row[column], '', `empty ${column} in exclusion audit`);
        assert.match(row.contract_locator, /^docs\/seller\/wave4\/SELLER-WAVE4-MOBILE-INTEGRATION-CONTRACT\.md:Exact launch mapping:/u);
        assert.match(row.screen_backend_matrix_locator, /^docs\/seller\/SCREEN-BACKEND-MATRIX\.tsv:screen_id=/u);
        assert.match(row.source_catalog_locator, /^seller-app\/src\/main\/assets\/seller_screen_catalog\.tsv:id=/u);
        assert.equal(row.audit_disposition, 'KEEP_EXCLUDED');
        return expandReferenceRanges(row.reference_numbers);
    }).sort();
    assert.equal(new Set(auditedReferences).size, auditedReferences.length, 'duplicate audited exclusion reference');
    assert.deepEqual(auditedReferences, excludedReferences, 'every retained exclusion requires one binding source audit');
    for (const reference of ['021', '022', '282', '286', '288', '289']) {
        assert.equal(excludedReferences.includes(reference), false, `incorrectly retained exclusion: ${reference}`);
    }
    const assets = fs.readdirSync(path.join(root, 'seller-app/src/main/res/drawable-nodpi'))
        .filter((name) => name.startsWith('seller_tur_') && name.endsWith('_illustration.png'))
        .sort();
    assert.equal(assets.length, 13);
    for (const asset of assets) assert.match(hash(`seller-app/src/main/res/drawable-nodpi/${asset}`), /^[a-f0-9]{64}$/u);
    assert.equal(hash('seller-app/src/main/res/drawable-nodpi/novastore_logo.png'), '9024bd039e12e67fabE4c7e4614e86345a14bcf8bb8a7b5502c0f71d3fb3d872'.toLowerCase());
    assert.match(read('seller-app/src/main/java/com/novastore/seller/ui/SellerApp.kt'), /painterResource\(R\.drawable\.novastore_logo\)/u);
    console.log('sellerWave4MobileContractSmoke: PASS');
})().catch((error) => {
    console.error('sellerWave4MobileContractSmoke: FAIL');
    console.error(error.stack);
    process.exitCode = 1;
});
