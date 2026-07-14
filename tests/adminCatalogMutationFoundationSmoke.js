const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

process.env.NODE_ENV = 'test';
process.env.NOVASTORE_SAFE_LOCAL_BACKEND = 'true';
process.env.NOVASTORE_ALLOW_REMOTE_DB = 'false';
process.env.SKIP_SCHEMA_INIT = 'true';
process.env.NOVASTORE_ALLOW_SCHEMA_INIT = 'false';
process.env.DB_HOST = '127.0.0.1';
process.env.DB_PORT = '55432';
process.env.DB_NAME = 'novastore_catalog_foundation_test';
process.env.DB_USER = 'novastore_test';
process.env.DB_PASSWORD = 'novastore_test_only';
process.env.DB_SSL = 'false';

const {
    getAdminCommerceCapabilities,
    isAdminCommerceCapabilityEnabled
} = require('../services/adminCommerceCapabilityService');
const {
    requireAdminCommerceCapability
} = require('../middlewares/adminCommerceCapability');
const {
    AdminCatalogMutationError,
    normalizeAdminCatalogActor,
    normalizeCatalogRevision,
    readExpectedCatalogRevision,
    assertCatalogRevisionMatches,
    normalizeAdminCatalogMutationContext,
    createAdminCatalogAuditEvent,
    recordAdminCatalogAuditEvent
} = require('../services/adminCatalogMutationPolicy');
const {
    getAdminCatalogAuditSchemaSql,
    applyAdminCatalogAuditSchema
} = require('../models/adminCatalogAuditSchema');
const { deleteProduct } = require('../controllers/productController');
const { executeAdminCatalogMutation } = require('../services/adminCatalogMutationService');
const { addTemplateAttribute } = require('../services/attributeService');
const { addManualCollectionProduct } = require('../services/collectionService');

const repositoryRoot = path.join(__dirname, '..');
const readSource = (relativePath) => fs.readFileSync(path.join(repositoryRoot, relativePath), 'utf8');

const createResponse = () => ({
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

(async () => {
    const defaults = getAdminCommerceCapabilities({});
    assert.equal(defaults.firstPartyCatalogWrite, false);
    assert.equal(defaults.catalogStructureWrite, false);
    assert.equal(isAdminCommerceCapabilityEnabled('firstPartyCatalogWrite', {}), false);
    assert.equal(isAdminCommerceCapabilityEnabled('catalogStructureWrite', {}), false);
    assert.equal(isAdminCommerceCapabilityEnabled('firstPartyCatalogWrite', {
        NOVASTORE_ADMIN_CATALOG_PRODUCT_WRITE_ENABLED: 'true'
    }), true);
    assert.equal(isAdminCommerceCapabilityEnabled('catalogStructureWrite', {
        NOVASTORE_ADMIN_CATALOG_STRUCTURE_WRITE_ENABLED: 'true'
    }), true);
    for (const value of ['1', 'yes', 'TRUE ', 'on', 'false']) {
        assert.equal(isAdminCommerceCapabilityEnabled('firstPartyCatalogWrite', {
            NOVASTORE_ADMIN_CATALOG_PRODUCT_WRITE_ENABLED: value
        }), value.trim().toLowerCase() === 'true');
    }

    const previousProductWriteFlag = process.env.NOVASTORE_ADMIN_CATALOG_PRODUCT_WRITE_ENABLED;
    delete process.env.NOVASTORE_ADMIN_CATALOG_PRODUCT_WRITE_ENABLED;
    let disabledNextCalls = 0;
    const disabledResponse = createResponse();
    requireAdminCommerceCapability('firstPartyCatalogWrite')({}, disabledResponse, () => {
        disabledNextCalls += 1;
    });
    assert.equal(disabledResponse.statusCode, 503);
    assert.equal(disabledResponse.payload.code, 'ADMIN_CATALOG_PRODUCT_WRITE_DISABLED');
    assert.equal(disabledNextCalls, 0, 'kapalı capability sonraki DB/current-admin adımına geçmemeli');
    if (previousProductWriteFlag === undefined) {
        delete process.env.NOVASTORE_ADMIN_CATALOG_PRODUCT_WRITE_ENABLED;
    } else {
        process.env.NOVASTORE_ADMIN_CATALOG_PRODUCT_WRITE_ENABLED = previousProductWriteFlag;
    }

    assert.deepEqual(normalizeAdminCatalogActor({ id: '17', role: 'admin' }), { id: 17, role: 'admin' });
    assert.throws(
        () => normalizeAdminCatalogActor({ id: 17, role: 'customer' }),
        (error) => error instanceof AdminCatalogMutationError
            && error.code === 'ADMIN_CATALOG_ACTOR_INVALID'
            && error.statusCode === 403
    );
    assert.equal(normalizeCatalogRevision('7'), 7);
    assert.throws(
        () => normalizeCatalogRevision(undefined),
        (error) => error.code === 'ADMIN_CATALOG_PRECONDITION_REQUIRED'
            && error.statusCode === 428
            && error.details.refetchRequired === true
    );
    assert.throws(() => normalizeCatalogRevision('1.5'), /tam sayı/);
    assert.equal(readExpectedCatalogRevision({ expected_revision: 4, expectedRevision: '4' }), 4);
    assert.throws(
        () => readExpectedCatalogRevision({ expected_revision: 4, expectedRevision: 5 }),
        (error) => error.code === 'ADMIN_CATALOG_REVISION_CONFLICT'
    );
    assert.equal(assertCatalogRevisionMatches(8, '8'), 8);
    assert.throws(
        () => assertCatalogRevisionMatches(9, 8),
        (error) => error.code === 'ADMIN_CATALOG_REVISION_CONFLICT'
            && error.statusCode === 409
            && error.details.refetchRequired === true
            && error.details.currentRevision === 9
            && error.details.expectedRevision === 8
    );
    const normalizedContext = normalizeAdminCatalogMutationContext({
        actor: { id: 17, role: 'admin' },
        entityType: 'product',
        entityKey: '29',
        action: 'update',
        expectedRevision: 3,
        changedFields: ['stock', 'name', 'stock'],
        requestId: 'request-123',
        metadata: { source: 'commerce-pro' }
    });
    assert.deepEqual(normalizedContext.changedFields, ['name', 'stock']);
    assert.equal(Object.isFrozen(normalizedContext), true);

    const event = createAdminCatalogAuditEvent({
        actor: { id: 17, role: 'admin' },
        entityType: 'product',
        entityKey: '29',
        action: 'update',
        expectedRevision: 3,
        resultRevision: 4,
        changedFields: ['stock', 'name', 'stock'],
        requestId: 'request-123',
        metadata: { source: 'commerce-pro' }
    });
    assert.equal(Object.isFrozen(event), true);
    assert.equal(Object.isFrozen(event.actor), true);
    assert.equal(Object.isFrozen(event.metadata), true);
    assert.deepEqual(event.changedFields, ['name', 'stock']);
    assert.throws(
        () => createAdminCatalogAuditEvent({
            actor: { id: 17, role: 'admin' },
            entityType: 'product',
            entityKey: '29',
            action: 'update',
            resultRevision: 4
        }),
        (error) => error.statusCode === 428
    );
    assert.throws(
        () => createAdminCatalogAuditEvent({
            actor: { id: 17, role: 'admin' },
            entityType: 'product',
            entityKey: '29',
            action: 'create',
            expectedRevision: 2,
            resultRevision: 1
        }),
        (error) => error.code === 'ADMIN_CATALOG_CREATE_PRECONDITION_INVALID'
    );
    assert.throws(
        () => createAdminCatalogAuditEvent({
            actor: { id: 17, role: 'admin' },
            entityType: 'product',
            entityKey: '29',
            action: 'create',
            resultRevision: 1,
            changedFields: ['description<script>']
        }),
        (error) => error.code === 'ADMIN_CATALOG_CHANGED_FIELDS_INVALID'
    );

    const auditQueries = [];
    const savedEvent = await recordAdminCatalogAuditEvent({
        async query(sql, params) {
            auditQueries.push({ sql, params });
            return { rows: [{ id: 91, created_at: '2026-07-14T12:00:00.000Z' }] };
        }
    }, event);
    assert.equal(savedEvent.id, 91);
    assert.equal(auditQueries.length, 1);
    assert.match(auditQueries[0].sql, /INSERT INTO admin_catalog_audit_events/i);
    assert.doesNotMatch(auditQueries[0].sql, /UPDATE|DELETE/i);
    assert.deepEqual(auditQueries[0].params.slice(0, 7), [
        17, 'admin', 'product', '29', 'update', 3, 4
    ]);
    assert.equal(JSON.stringify(auditQueries[0].params).includes('description'), false);

    const mutationCalls = [];
    const mutationClient = {
        async query(sql) {
            const normalized = String(sql).replace(/\s+/g, ' ').trim();
            mutationCalls.push(normalized);
            if (/^SELECT id, revision FROM products/i.test(normalized)) {
                return { rows: [{ id: 29, revision: 3 }] };
            }
            if (/^UPDATE products SET revision = revision \+ 1/i.test(normalized)) {
                return { rows: [{ revision: 4 }] };
            }
            if (/INSERT INTO admin_catalog_audit_events/i.test(normalized)) {
                return { rows: [{ id: 92, created_at: '2026-07-14T12:01:00.000Z' }] };
            }
            return { rows: [] };
        },
        release() {
            mutationCalls.push('RELEASE');
        }
    };
    const executed = await executeAdminCatalogMutation({
        database: { async connect() { return mutationClient; } },
        actor: { id: 17, role: 'admin' },
        entityType: 'product',
        entityKey: '29',
        action: 'update',
        expectedRevision: 3,
        changedFields: ['name'],
        applyMutation: async (client) => {
            await client.query("UPDATE products SET name = 'Guncel' WHERE id = 29");
            return { id: 29, name: 'Guncel' };
        }
    });
    assert.equal(executed.result.revision, 4);
    assert.equal(mutationCalls.length, 7);
    assert.equal(mutationCalls[0], 'BEGIN');
    assert.match(mutationCalls[1], /^SELECT id, revision FROM products .* FOR UPDATE$/i);
    assert.equal(mutationCalls[2], "UPDATE products SET name = 'Guncel' WHERE id = 29");
    assert.match(mutationCalls[3], /^UPDATE products SET revision = revision \+ 1.*WHERE id = \$1 AND revision = \$2/i);
    assert.match(mutationCalls[4], /INSERT INTO admin_catalog_audit_events/i);
    assert.equal(mutationCalls[5], 'COMMIT');
    assert.equal(mutationCalls[6], 'RELEASE');

    const createCalls = [];
    let createAuditParams;
    const createClient = {
        async query(sql, params = []) {
            const normalized = String(sql).replace(/\s+/g, ' ').trim();
            createCalls.push(normalized);
            if (/^INSERT INTO products/i.test(normalized)) {
                return { rows: [{ id: 44, revision: 1 }] };
            }
            if (/INSERT INTO admin_catalog_audit_events/i.test(normalized)) {
                createAuditParams = params;
                return { rows: [{ id: 93, created_at: '2026-07-14T12:02:00.000Z' }] };
            }
            return { rows: [] };
        },
        release() {
            createCalls.push('RELEASE');
        }
    };
    const created = await executeAdminCatalogMutation({
        database: { async connect() { return createClient; } },
        actor: { id: 17, role: 'admin' },
        entityType: 'product',
        action: 'create',
        changedFields: ['name'],
        applyMutation: async (client) => {
            const result = await client.query("INSERT INTO products (name) VALUES ('Yeni') RETURNING id, revision");
            return result.rows[0];
        }
    });
    assert.equal(created.result.id, 44);
    assert.equal(created.result.revision, 1);
    assert.equal(createAuditParams[3], '44', 'create audit anahtarı dönen gerçek kimlikten türetilmeli');
    assert.equal(createCalls.some((call) => /FOR UPDATE/i.test(call)), false);

    let invalidContextConnectCalls = 0;
    let invalidContextMutationCalls = 0;
    await assert.rejects(
        () => executeAdminCatalogMutation({
            database: {
                async connect() {
                    invalidContextConnectCalls += 1;
                    return mutationClient;
                }
            },
            actor: { id: 17, role: 'admin' },
            entityType: 'product',
            entityKey: '29',
            action: 'update',
            expectedRevision: 3,
            metadata: { oversized: 'x'.repeat(5000) },
            applyMutation: async () => {
                invalidContextMutationCalls += 1;
                return { id: 29 };
            }
        }),
        (error) => error.code === 'ADMIN_CATALOG_AUDIT_METADATA_INVALID'
    );
    assert.equal(invalidContextConnectCalls, 0);
    assert.equal(invalidContextMutationCalls, 0);

    const staleCalls = [];
    const staleClient = {
        async query(sql) {
            const normalized = String(sql).replace(/\s+/g, ' ').trim();
            staleCalls.push(normalized);
            if (/^SELECT id, revision FROM products/i.test(normalized)) {
                return { rows: [{ id: 29, revision: 3 }] };
            }
            return { rows: [] };
        },
        release() {
            staleCalls.push('RELEASE');
        }
    };
    await assert.rejects(
        () => executeAdminCatalogMutation({
            database: { async connect() { return staleClient; } },
            actor: { id: 17, role: 'admin' },
            entityType: 'product',
            entityKey: '29',
            action: 'update',
            expectedRevision: 2,
            applyMutation: async () => {
                throw new Error('stale mutation çalışmamalı');
            }
        }),
        (error) => error.code === 'ADMIN_CATALOG_REVISION_CONFLICT'
    );
    assert.deepEqual(staleCalls, [
        'BEGIN',
        staleCalls[1],
        'ROLLBACK',
        'RELEASE'
    ]);
    assert.match(staleCalls[1], /^SELECT id, revision FROM products .* FOR UPDATE$/i);

    const auditFailureCalls = [];
    const auditFailureClient = {
        async query(sql) {
            const normalized = String(sql).replace(/\s+/g, ' ').trim();
            auditFailureCalls.push(normalized);
            if (/^SELECT id, revision FROM categories/i.test(normalized)) {
                return { rows: [{ id: 4, revision: 5 }] };
            }
            if (/^UPDATE categories SET revision = revision \+ 1/i.test(normalized)) {
                return { rows: [{ revision: 6 }] };
            }
            if (/INSERT INTO admin_catalog_audit_events/i.test(normalized)) {
                throw new Error('audit unavailable');
            }
            return { rows: [] };
        },
        release() {
            auditFailureCalls.push('RELEASE');
        }
    };
    await assert.rejects(
        () => executeAdminCatalogMutation({
            database: { async connect() { return auditFailureClient; } },
            actor: { id: 17, role: 'admin' },
            entityType: 'category',
            entityKey: '4',
            action: 'archive',
            expectedRevision: 5,
            changedFields: ['deleted_at', 'is_active'],
            applyMutation: async (client) => {
                await client.query('UPDATE categories SET is_active = FALSE WHERE id = 4');
                return { id: 4, is_active: false };
            }
        }),
        /audit unavailable/
    );
    assert.equal(auditFailureCalls.includes('COMMIT'), false);
    assert.equal(auditFailureCalls.at(-2), 'ROLLBACK');
    assert.equal(auditFailureCalls.at(-1), 'RELEASE');

    const templateLinkCalls = [];
    const templateLinkClient = {
        async query(sql) {
            const normalized = String(sql).replace(/\s+/g, ' ').trim();
            templateLinkCalls.push(normalized);
            if (/^INSERT INTO template_attributes/i.test(normalized)) {
                return { rows: [{ template_id: 4, attribute_id: 8, sort_order: 0 }] };
            }
            return { rows: [] };
        },
        release() {
            templateLinkCalls.push('RELEASE');
        }
    };
    await addTemplateAttribute(4, { attribute_id: 8 }, {
        queryable: { async connect() { return templateLinkClient; } }
    });
    assert.equal(templateLinkCalls[0], 'BEGIN');
    assert.match(templateLinkCalls[1], /^INSERT INTO template_attributes/i);
    assert.match(templateLinkCalls[2], /^UPDATE attribute_templates SET revision = revision \+ 1/i);
    assert.equal(templateLinkCalls[3], 'COMMIT');
    assert.equal(templateLinkCalls[4], 'RELEASE');

    const existingClientCalls = [];
    const existingClient = {
        async connect() {
            throw new Error('bağlı PoolClient yeniden connect edilmemeli');
        },
        async query(sql) {
            const normalized = String(sql).replace(/\s+/g, ' ').trim();
            existingClientCalls.push(normalized);
            if (/^INSERT INTO template_attributes/i.test(normalized)) {
                return { rows: [{ template_id: 4, attribute_id: 9, sort_order: 0 }] };
            }
            return { rows: [] };
        },
        release() {
            existingClientCalls.push('RELEASE');
        }
    };
    await addTemplateAttribute(4, { attribute_id: 9 }, { queryable: existingClient });
    assert.equal(existingClientCalls.some((call) => ['BEGIN', 'COMMIT', 'ROLLBACK', 'RELEASE'].includes(call)), false);
    assert.match(existingClientCalls[0], /^INSERT INTO template_attributes/i);
    assert.match(existingClientCalls[1], /^UPDATE attribute_templates SET revision = revision \+ 1/i);

    const collectionLinkCalls = [];
    const collectionLinkClient = {
        async query(sql) {
            const normalized = String(sql).replace(/\s+/g, ' ').trim();
            collectionLinkCalls.push(normalized);
            if (/^SELECT \* FROM collections/i.test(normalized)) {
                return { rows: [{ id: 5, collection_type: 'manual', sort_order: 0 }] };
            }
            if (/^INSERT INTO collection_products/i.test(normalized)) {
                return { rows: [{ collection_id: 5, product_id: 29, sort_order: 2 }] };
            }
            return { rows: [] };
        },
        release() {
            collectionLinkCalls.push('RELEASE');
        }
    };
    await addManualCollectionProduct(5, 29, 2, {
        queryable: { async connect() { return collectionLinkClient; } }
    });
    assert.equal(collectionLinkCalls[0], 'BEGIN');
    assert.match(collectionLinkCalls[1], /^SELECT \* FROM collections/i);
    assert.match(collectionLinkCalls[2], /^INSERT INTO collection_products/i);
    assert.match(collectionLinkCalls[3], /^UPDATE collections SET revision = revision \+ 1/i);
    assert.equal(collectionLinkCalls[4], 'COMMIT');
    assert.equal(collectionLinkCalls[5], 'RELEASE');

    let integratedTemplateRevision = 3;
    const integratedLinkCalls = [];
    const integratedLinkClient = {
        async query(sql, params = []) {
            const normalized = String(sql).replace(/\s+/g, ' ').trim();
            integratedLinkCalls.push(normalized);
            if (/^SELECT id, revision FROM attribute_templates/i.test(normalized)) {
                return { rows: [{ id: 4, revision: integratedTemplateRevision }] };
            }
            if (/^INSERT INTO template_attributes/i.test(normalized)) {
                return { rows: [{ template_id: 4, attribute_id: 8, sort_order: 0 }] };
            }
            if (/^UPDATE attribute_templates SET revision = revision \+ 1/i.test(normalized)
                && /WHERE id = \$1 AND revision = \$2/i.test(normalized)) {
                if (params[1] !== integratedTemplateRevision) return { rows: [] };
                integratedTemplateRevision += 1;
                return { rows: [{ revision: integratedTemplateRevision }] };
            }
            if (/INSERT INTO admin_catalog_audit_events/i.test(normalized)) {
                return { rows: [{ id: 94, created_at: '2026-07-14T12:03:00.000Z' }] };
            }
            return { rows: [] };
        },
        release() {
            integratedLinkCalls.push('RELEASE');
        }
    };
    const integratedLink = await executeAdminCatalogMutation({
        database: { async connect() { return integratedLinkClient; } },
        actor: { id: 17, role: 'admin' },
        entityType: 'template_attribute',
        entityKey: '4:8',
        action: 'link',
        expectedRevision: 3,
        revisionTargetId: 4,
        changedFields: ['attributes'],
        applyMutation: (client) => addTemplateAttribute(4, { attribute_id: 8 }, {
            queryable: client,
            bumpRevision: false
        })
    });
    assert.equal(integratedLink.result.revision, 4);
    assert.equal(integratedTemplateRevision, 4);
    assert.equal(
        integratedLinkCalls.filter((call) => /^UPDATE attribute_templates SET revision/i.test(call)).length,
        1,
        'executor ile çalışan helper revision artışını executor sahipliğine bırakmalı'
    );

    const linkRollbackCalls = [];
    const linkRollbackClient = {
        async query(sql) {
            const normalized = String(sql).replace(/\s+/g, ' ').trim();
            linkRollbackCalls.push(normalized);
            if (/^INSERT INTO template_attributes/i.test(normalized)) {
                return { rows: [{ template_id: 4, attribute_id: 8 }] };
            }
            if (/^UPDATE attribute_templates/i.test(normalized)) {
                throw new Error('revision write failed');
            }
            return { rows: [] };
        },
        release() {
            linkRollbackCalls.push('RELEASE');
        }
    };
    await assert.rejects(
        () => addTemplateAttribute(4, { attribute_id: 8 }, {
            queryable: { async connect() { return linkRollbackClient; } }
        }),
        /revision write failed/
    );
    assert.equal(linkRollbackCalls.includes('COMMIT'), false);
    assert.equal(linkRollbackCalls.at(-2), 'ROLLBACK');
    assert.equal(linkRollbackCalls.at(-1), 'RELEASE');

    const schemaSql = getAdminCatalogAuditSchemaSql();
    for (const table of [
        'products', 'categories', 'attribute_definitions', 'attribute_options',
        'attribute_templates', 'collections', 'menus', 'menu_items'
    ]) {
        assert.match(schemaSql, new RegExp(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS revision`, 'i'));
    }
    assert.match(schemaSql, /CREATE TABLE IF NOT EXISTS admin_catalog_audit_events/i);
    assert.match(schemaSql, /BEFORE UPDATE OR DELETE ON admin_catalog_audit_events/i);
    assert.match(schemaSql, /append-only/i);
    assert.match(schemaSql, /chk_admin_catalog_audit_entity_type/i);
    assert.match(schemaSql, /chk_admin_catalog_audit_expected_by_action/i);
    assert.doesNotMatch(schemaSql, /actor_user_id[^,]+REFERENCES/i, 'audit aktörü kullanıcı silinince kaybolmamalı');
    let schemaApplyCalls = 0;
    await applyAdminCatalogAuditSchema({
        async query(sql) {
            schemaApplyCalls += 1;
            assert.equal(sql, schemaSql);
        }
    });
    assert.equal(schemaApplyCalls, 1);

    const invalidDeleteResponse = createResponse();
    await deleteProduct({ params: { id: 'invalid' } }, invalidDeleteResponse);
    assert.equal(invalidDeleteResponse.statusCode, 400);
    const hardDeleteResponse = createResponse();
    await deleteProduct({ params: { id: '29' } }, hardDeleteResponse);
    assert.equal(hardDeleteResponse.statusCode, 410);
    assert.equal(hardDeleteResponse.payload.code, 'PRODUCT_HARD_DELETE_DISABLED');

    const productControllerSource = readSource('controllers/productController.js');
    const hardDeleteSource = productControllerSource.match(/const deleteProduct = async[\s\S]*?\n};/)?.[0] || '';
    assert.doesNotMatch(hardDeleteSource, /pool|cloudinary|DELETE FROM/i);

    const productRoutesSource = readSource('routes/productRoutes.js');
    assert.match(productRoutesSource, /authenticate, requireAdmin, requireCurrentAdmin, previewUpload/);
    assert.match(productRoutesSource, /authenticate, requireAdmin, requireCurrentAdmin, upload\.array/);
    assert.match(productRoutesSource, /router\.delete\('\/:id', authenticate, requireAdmin, requireCurrentAdmin, deleteProduct\)/);
    for (const relativePath of [
        'routes/adminAttributeRoutes.js',
        'routes/adminCollectionRoutes.js',
        'routes/adminMenuRoutes.js'
    ]) {
        assert.match(readSource(relativePath), /router\.use\(authenticate, requireAdmin, requireCurrentAdmin\)/);
    }
    assert.match(readSource('routes/adminCategoryRoutes.js'), /authenticate, requireAdmin, requireCurrentAdmin/);
    assert.match(readSource('routes/categoryRoutes.js'), /authenticate, requireAdmin, requireCurrentAdmin/);

    const legacyAdminSource = readSource('frontend/admin.html');
    assert.doesNotMatch(legacyAdminSource, /onclick="deleteProduct\(|async function deleteProduct\(/);
    assert.match(legacyAdminSource, /<option value="archived">Arşivde<\/option>/);

    const structureReadSource = readSource('services/adminCommerceReadService.js');
    for (const alias of ['p', 'category', 'definition', 'template', 'collection', 'menu', 'menu_item']) {
        assert.match(structureReadSource, new RegExp(`${alias}\\.revision`, 'i'));
    }

    for (const relativePath of [
        'controllers/productController.js',
        'services/categoryService.js',
        'services/attributeService.js',
        'services/collectionService.js',
        'services/menuService.js',
        'services/orderService.js'
    ]) {
        assert.match(
            readSource(relativePath),
            /revision\s*=\s*revision\s*\+\s*(?:1|CASE)/i,
            `${relativePath} revision artırmalı`
        );
    }

    console.log('admin catalog mutation foundation smoke passed');
})().catch((error) => {
    console.error(error);
    process.exit(1);
});
