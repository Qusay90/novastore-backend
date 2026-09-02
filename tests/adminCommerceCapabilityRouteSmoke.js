const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

process.env.NODE_ENV = 'test';
process.env.NOVASTORE_SAFE_LOCAL_BACKEND = 'true';
process.env.NOVASTORE_ALLOW_REMOTE_DB = 'false';
process.env.SKIP_SCHEMA_INIT = 'true';
process.env.NOVASTORE_ALLOW_SCHEMA_INIT = 'false';

const {
    requireAdminCommerceCapability
} = require('../middlewares/adminCommerceCapability');

const repositoryRoot = path.join(__dirname, '..');
const readSource = (relativePath) => fs.readFileSync(path.join(repositoryRoot, relativePath), 'utf8');

const responseRecorder = () => ({
    statusCode: 200,
    payload: null,
    status(code) {
        this.statusCode = code;
        return this;
    },
    json(payload) {
        this.payload = payload;
        return this;
    }
});

(() => {
    const previousDeployEnvironment = process.env.NOVASTORE_DEPLOY_ENV;
    const previousReturnFlag = process.env.NOVASTORE_ADMIN_RETURN_WRITE_ENABLED;
    const previousStructureFlag = process.env.NOVASTORE_ADMIN_CATALOG_STRUCTURE_WRITE_ENABLED;

    try {
        process.env.NOVASTORE_DEPLOY_ENV = 'production';
        delete process.env.NOVASTORE_ADMIN_RETURN_WRITE_ENABLED;
        delete process.env.NOVASTORE_ADMIN_CATALOG_STRUCTURE_WRITE_ENABLED;

        for (const capability of ['returnWrite', 'catalogStructureWrite']) {
            let nextCalls = 0;
            const response = responseRecorder();
            requireAdminCommerceCapability(capability)({}, response, () => {
                nextCalls += 1;
            });
            assert.equal(response.statusCode, 503);
            assert.equal(response.payload.code, capability === 'returnWrite'
                ? 'ADMIN_COMMERCE_CAPABILITY_DISABLED'
                : 'ADMIN_CATALOG_STRUCTURE_WRITE_DISABLED');
            assert.equal(nextCalls, 0, `${capability} production ortamında varsayılan kapalı kalmalı`);
        }

        process.env.NOVASTORE_ADMIN_RETURN_WRITE_ENABLED = 'true';
        process.env.NOVASTORE_ADMIN_CATALOG_STRUCTURE_WRITE_ENABLED = 'true';
        for (const capability of ['returnWrite', 'catalogStructureWrite']) {
            let nextCalls = 0;
            requireAdminCommerceCapability(capability)({}, responseRecorder(), () => {
                nextCalls += 1;
            });
            assert.equal(nextCalls, 1, `${capability} yalnızca açık bayrakla ilerlemeli`);
        }
    } finally {
        if (previousDeployEnvironment === undefined) delete process.env.NOVASTORE_DEPLOY_ENV;
        else process.env.NOVASTORE_DEPLOY_ENV = previousDeployEnvironment;
        if (previousReturnFlag === undefined) delete process.env.NOVASTORE_ADMIN_RETURN_WRITE_ENABLED;
        else process.env.NOVASTORE_ADMIN_RETURN_WRITE_ENABLED = previousReturnFlag;
        if (previousStructureFlag === undefined) delete process.env.NOVASTORE_ADMIN_CATALOG_STRUCTURE_WRITE_ENABLED;
        else process.env.NOVASTORE_ADMIN_CATALOG_STRUCTURE_WRITE_ENABLED = previousStructureFlag;
    }

    for (const relativePath of [
        'routes/returnRoutes.js',
        'routes/adminAttributeRoutes.js',
        'routes/adminCategoryRoutes.js',
        'routes/adminCollectionRoutes.js',
        'routes/adminMenuRoutes.js'
    ]) {
        const source = readSource(relativePath);
        assert.match(source, /requireAdminCommerceCapability/);
        assert.doesNotMatch(source, /requireAdminCommerceCapabilityInStaging/);
        assert.doesNotMatch(source, /requireStaging(?:Return|CatalogStructure)Write/);
    }

    const returnRoutes = readSource('routes/returnRoutes.js');
    assert.match(
        returnRoutes,
        /router\.patch\('\/:id\/status', authenticate, requireAdmin, requireCurrentAdmin, requireReturnWrite, updateReturnStatus\)/
    );

    const categoryRoutes = readSource('routes/adminCategoryRoutes.js');
    assert.match(
        categoryRoutes,
        /authenticate, requireAdmin, requireCurrentAdmin, requireCatalogStructureWrite/
    );

    console.log('admin commerce capability route smoke passed');
})();
