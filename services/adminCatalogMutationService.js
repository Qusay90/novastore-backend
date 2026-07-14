const {
    AdminCatalogMutationError,
    normalizeCatalogRevision,
    assertCatalogRevisionMatches,
    normalizeAdminCatalogMutationContext,
    recordAdminCatalogAuditEvent
} = require('./adminCatalogMutationPolicy');

const CATALOG_REVISION_TARGETS = Object.freeze({
    product: 'products',
    category: 'categories',
    attribute: 'attribute_definitions',
    attribute_option: 'attribute_options',
    attribute_template: 'attribute_templates',
    template_attribute: 'attribute_templates',
    collection: 'collections',
    collection_product: 'collections',
    menu: 'menus',
    menu_item: 'menu_items'
});
const PARENT_SCOPED_CATALOG_ENTITIES = Object.freeze([
    'template_attribute',
    'collection_product'
]);

const normalizeRevisionTargetId = (value) => {
    const id = Number(value);
    if (!Number.isSafeInteger(id) || id < 1) {
        throw new AdminCatalogMutationError('Katalog revision hedefi geçersiz.', {
            code: 'ADMIN_CATALOG_REVISION_TARGET_INVALID'
        });
    }
    return id;
};

const executeAdminCatalogMutation = async ({
    database,
    actor,
    entityType,
    entityKey,
    action,
    expectedRevision = null,
    revisionTargetId = null,
    changedFields = [],
    requestId = null,
    metadata = {},
    applyMutation
}) => {
    if (!database || typeof database.connect !== 'function') {
        throw new TypeError('Catalog mutation executor requires a PostgreSQL pool.');
    }
    if (typeof applyMutation !== 'function') {
        throw new TypeError('Catalog mutation executor requires applyMutation.');
    }

    // Validate the complete audit/mutation envelope before opening a transaction or
    // allowing the callback to run. Mutation callbacks must be DB-only and use the
    // provided client; external side effects belong after a successful commit.
    const context = normalizeAdminCatalogMutationContext({
        actor,
        entityType,
        entityKey,
        action,
        expectedRevision,
        changedFields,
        requestId,
        metadata
    }, { allowDeferredCreateEntityKey: true });
    const isCreate = context.action === 'create';
    const revisionTable = CATALOG_REVISION_TARGETS[context.entityType];
    let targetId = null;
    if (!isCreate) {
        if (PARENT_SCOPED_CATALOG_ENTITIES.includes(context.entityType)) {
            targetId = normalizeRevisionTargetId(revisionTargetId);
        } else {
            targetId = normalizeRevisionTargetId(context.entityKey);
            if (revisionTargetId !== null && revisionTargetId !== undefined
                && normalizeRevisionTargetId(revisionTargetId) !== targetId) {
                throw new AdminCatalogMutationError('Katalog entity ve revision hedefi eşleşmiyor.', {
                    code: 'ADMIN_CATALOG_REVISION_TARGET_MISMATCH'
                });
            }
        }
    }

    const client = await database.connect();
    try {
        await client.query('BEGIN');
        const lockedResult = isCreate
            ? null
            : await client.query(
                `SELECT id, revision
                 FROM ${revisionTable}
                 WHERE id = $1
                 FOR UPDATE`,
                [targetId]
            );
        if (!isCreate && !lockedResult.rows?.length) {
            throw new AdminCatalogMutationError('Katalog kaydı bulunamadı.', {
                code: 'ADMIN_CATALOG_ENTITY_NOT_FOUND',
                statusCode: 404
            });
        }
        const current = isCreate
            ? null
            : Object.freeze({
                id: Number(lockedResult.rows[0].id),
                revision: normalizeCatalogRevision(lockedResult.rows[0].revision, {
                    field: 'current_revision'
                })
            });
        const previousRevision = isCreate
            ? null
            : assertCatalogRevisionMatches(current.revision, context.expectedRevision);
        const mutationResult = await applyMutation(client, Object.freeze({
            actor: context.actor,
            current,
            expectedRevision: context.expectedRevision
        }));
        if (!mutationResult || Array.isArray(mutationResult) || typeof mutationResult !== 'object') {
            throw new AdminCatalogMutationError('Katalog mutation sonucu nesne olmalıdır.', {
                code: 'ADMIN_CATALOG_MUTATION_RESULT_INVALID',
                statusCode: 500
            });
        }

        let resultRevision;
        let auditEntityKey = context.entityKey;
        if (isCreate) {
            resultRevision = normalizeCatalogRevision(mutationResult.revision, {
                field: 'result_revision'
            });
            const createdId = normalizeRevisionTargetId(mutationResult.id);
            auditEntityKey = String(createdId);
            if (context.entityKey !== null && context.entityKey !== auditEntityKey) {
                throw new AdminCatalogMutationError('Oluşturulan katalog kimliği audit anahtarıyla eşleşmiyor.', {
                    code: 'ADMIN_CATALOG_CREATE_ENTITY_KEY_MISMATCH',
                    statusCode: 500
                });
            }
        } else {
            const revisionResult = await client.query(
                `UPDATE ${revisionTable}
                 SET revision = revision + 1,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE id = $1 AND revision = $2
                 RETURNING revision`,
                [targetId, previousRevision]
            );
            if (!revisionResult.rows?.length) {
                throw new AdminCatalogMutationError('Katalog revision artışı uygulanamadı.', {
                    code: 'ADMIN_CATALOG_REVISION_WRITE_CONFLICT',
                    statusCode: 500
                });
            }
            resultRevision = normalizeCatalogRevision(revisionResult.rows[0].revision, {
                field: 'result_revision'
            });
        }
        const requiredResultRevision = isCreate ? 1 : previousRevision + 1;
        if (resultRevision !== requiredResultRevision) {
            throw new AdminCatalogMutationError('Katalog mutation revision sözleşmesini ihlal etti.', {
                code: 'ADMIN_CATALOG_REVISION_RESULT_INVALID',
                statusCode: 500,
                details: Object.freeze({
                    expectedResultRevision: requiredResultRevision,
                    actualResultRevision: resultRevision
                })
            });
        }
        const result = Object.freeze({ ...mutationResult, revision: resultRevision });

        const audit = await recordAdminCatalogAuditEvent(client, {
            ...context,
            entityKey: auditEntityKey,
            expectedRevision: previousRevision,
            resultRevision
        });
        await client.query('COMMIT');
        return Object.freeze({ result, audit });
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
    } finally {
        client.release();
    }
};

module.exports = {
    CATALOG_REVISION_TARGETS,
    PARENT_SCOPED_CATALOG_ENTITIES,
    normalizeRevisionTargetId,
    executeAdminCatalogMutation
};
