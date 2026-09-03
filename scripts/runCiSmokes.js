const { spawnSync } = require('child_process');
const path = require('path');

const rootDir = path.join(__dirname, '..');
const smokeTests = [
    'tests/startupSafetySmoke.js',
    'tests/stagingRuntimeSafetySmoke.js',
    'tests/stagingAccessGateHttpSmoke.js',
    'tests/stagingReleaseContractSmoke.js',
    'tests/stagingVerificationHarnessSmoke.js',
    'tests/socketAuthSmoke.js',
    'tests/socketRevocationLifecycleSmoke.js',
    'tests/adminLogoutBoundedSmoke.mjs',
    'tests/legacyLogoutRevocationSmoke.js',
    'tests/webCustomerLogoutSmoke.mjs',
    'tests/sharedStateSmoke.js',
    'tests/webSharedStatePrincipalIsolationSmoke.js',
    'tests/turkiyeAddressContractSmoke.js',
    'tests/addressCrudSmoke.js',
    'tests/addressMigrationGuardSmoke.js',
    'tests/productionAppConfigSmoke.js',
    'tests/sellerPublicLegalIdentityServiceSmoke.js',
    'tests/checkoutSalesPartyProjectionSmoke.js',
    'tests/legalDocumentServiceSmoke.js',
    'tests/paymentProviderConfigSmoke.js',
    'tests/paymentPaytrServiceSmoke.js',
    'tests/paymentPaytrInitializeSmoke.js',
    'tests/paymentPaytrBackendSecuritySmoke.js',
    'tests/paymentPaytrCallbackHashSmoke.js',
    'tests/paymentPaytrCallbackSuccessSmoke.js',
    'tests/paymentPaytrCallbackIdempotencySmoke.js',
    'tests/paymentCouponUsageLimitSmoke.js',
    'tests/paymentFinalizationSmoke.js',
    'tests/paymentStatusAuthSmoke.js',
    'tests/paymentStatusExpirySmoke.js',
    'tests/webPaytrCheckoutSmoke.js',
    'tests/webPaymentResultPaytrSmoke.js',
    'tests/launchCriticalCommerceContractSmoke.js',
    'tests/returnWritesDisabledSmoke.js',
    'tests/categoryPlpStorefrontSmoke.js',
    'tests/officialRuntimeVisualContractSmoke.mjs',
    'tests/storefrontR4HumanReviewSmoke.mjs',
    'tests/storefrontR5ReviewContractSmoke.mjs',
    'tests/commerceProCutoverArtifactSmoke.js',
    'tests/commerceProCutoverRouteSmoke.js',
    'tests/adminCommerceProResponseHeadersSmoke.js',
    'tests/adminCommerceCapabilityRouteSmoke.js',
    'tests/legacyAdminProductWriteRetirementSmoke.js',
    'tests/adminSessionAuthSmoke.js',
    'tests/adminCommerceProSessionContractSmoke.js',
    'tests/adminCommerceCatalogSummarySmoke.js',
    'tests/adminCatalogMutationFoundationSmoke.js',
    'tests/adminLoginNextSmoke.js',
    'tests/adminCommerceProLiveSmoke.mjs',
    'tests/adminCommerceProFirstSaleUiSmoke.mjs',
    'tests/manualShipmentMutationSmoke.js',
    'tests/manualDeliveryMutationSmoke.js',
    'tests/orderLifecycleMutationSmoke.js',
    'storefront-commerce-pro/tests/integration-boundary.test.mjs',
    'tests/sellerApplicationSummaryPrivacySmoke.mjs',
    'tests/publicStoreProjectionSmoke.js',
    'tests/storeFollowSmoke.js',
    'tests/reviewQuestionOperationsSmoke.js',
    'tests/supportNotificationOperationsSmoke.js',
    'tests/novabotModeContractSmoke.js',
    'tests/novabotInputSecuritySmoke.js',
    'tests/novabotFallbackSmoke.js',
    'tests/couponAdminOperationsSmoke.js',
    'tests/adminCatalogProductCrudSmoke.js',
    'tests/adminCatalogMediaOperationsSmoke.js',
    'tests/legacyCategoryCapabilityHttpSmoke.js',
    'tests/main6yProductCardFramingSmoke.js',
    'tests/adminOperationsContractSmoke.mjs',
    'tests/notificationTargetRoutingSmoke.mjs',
    'tests/androidFcmProviderUnitSmoke.js',
    'tests/sellerNotificationAuthorizationUnitSmoke.js',
    'tests/customerRefreshContractSmoke.js',
    'tests/reviewPublicationVisibilitySmoke.js',
    'tests/localMain6sSchemaInitSmoke.js',
    'tests/main6tCombinedIntegrationSmoke.js',
    'tests/sellerLoginRateLimitSmoke.js',
    'tests/sellerMain6uContractSmoke.js',
    'tests/stagingMigrationFoundationSmoke.js'
];

const smokeEnv = {
    ...process.env,
    NODE_ENV: 'test',
    DATABASE_URL: 'postgresql://novastore_ci:novastore_ci_only@127.0.0.1:55432/novastore_ci',
    DB_SSL: 'false',
    NOVASTORE_SAFE_LOCAL_BACKEND: 'true',
    NOVASTORE_ALLOW_REMOTE_DB: 'false',
    SKIP_SCHEMA_INIT: 'true',
    NOVASTORE_ALLOW_SCHEMA_INIT: 'false',
    SUPABASE_USE_POOLER: 'false',
    SUPABASE_POOLER_HOST: '',
    SUPABASE_REGION: '',
    SUPABASE_PROJECT_REF: ''
};

for (const relativePath of smokeTests) {
    console.log(`\n[ci-smoke] Running ${relativePath}`);

    const result = spawnSync(process.execPath, [path.join(rootDir, relativePath)], {
        cwd: rootDir,
        env: smokeEnv,
        stdio: 'inherit'
    });

    if (result.error) {
        console.error(`[ci-smoke] Could not start ${relativePath}:`, result.error.message);
        process.exit(1);
    }

    if (result.status !== 0) {
        console.error(`[ci-smoke] Failed: ${relativePath} (exit ${result.status})`);
        process.exit(result.status || 1);
    }
}

console.log(`\n[ci-smoke] PASS: ${smokeTests.length} smoke tests completed.`);
