const CATALOG_ENTITY_TYPES = Object.freeze([
    'product',
    'category',
    'attribute',
    'attribute_option',
    'attribute_template',
    'template_attribute',
    'collection',
    'collection_product',
    'menu',
    'menu_item'
]);

const CATALOG_MUTATION_ACTIONS = Object.freeze([
    'create',
    'update',
    'archive',
    'restore',
    'link',
    'unlink',
    'move',
    'reorder'
]);

const REVISION_REQUIRED_ACTIONS = new Set(CATALOG_MUTATION_ACTIONS.filter((action) => action !== 'create'));
const entityTypes = new Set(CATALOG_ENTITY_TYPES);
const mutationActions = new Set(CATALOG_MUTATION_ACTIONS);
const SAFE_TOKEN_PATTERN = /^[A-Za-z0-9._:-]+$/;
const SAFE_FIELD_PATTERN = /^[a-z][a-z0-9_]{0,79}$/;

const deepFreeze = (value) => {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.values(value).forEach(deepFreeze);
    return Object.freeze(value);
};

class AdminCatalogMutationError extends Error {
    constructor(message, { code = 'ADMIN_CATALOG_MUTATION_INVALID', statusCode = 400, details } = {}) {
        super(message);
        this.name = 'AdminCatalogMutationError';
        this.code = code;
        this.statusCode = statusCode;
        this.details = details;
    }
}

const normalizeAdminCatalogActor = (actor) => {
    const id = Number(actor?.id);
    if (!Number.isInteger(id) || id < 1 || actor?.role !== 'admin') {
        throw new AdminCatalogMutationError('Katalog yazımı için güncel yönetici kimliği zorunludur.', {
            code: 'ADMIN_CATALOG_ACTOR_INVALID',
            statusCode: 403
        });
    }
    return Object.freeze({ id, role: 'admin' });
};

const normalizeCatalogRevision = (value, { field = 'expected_revision', required = true } = {}) => {
    if (value === undefined || value === null || value === '') {
        if (!required) return null;
        throw new AdminCatalogMutationError(`${field} zorunludur.`, {
            code: 'ADMIN_CATALOG_PRECONDITION_REQUIRED',
            statusCode: 428,
            details: Object.freeze({ refetchRequired: true })
        });
    }
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < 1) {
        throw new AdminCatalogMutationError(`${field} pozitif güvenli tam sayı olmalıdır.`, {
            code: 'ADMIN_CATALOG_REVISION_INVALID'
        });
    }
    return parsed;
};

const readExpectedCatalogRevision = (body = {}) => {
    const hasSnakeCase = Object.prototype.hasOwnProperty.call(body, 'expected_revision');
    const hasCamelCase = Object.prototype.hasOwnProperty.call(body, 'expectedRevision');
    if (hasSnakeCase && hasCamelCase) {
        const snakeCase = normalizeCatalogRevision(body.expected_revision);
        const camelCase = normalizeCatalogRevision(body.expectedRevision);
        if (snakeCase !== camelCase) {
            throw new AdminCatalogMutationError('expected_revision alanları birbiriyle çelişiyor.', {
                code: 'ADMIN_CATALOG_REVISION_CONFLICT'
            });
        }
        return snakeCase;
    }
    return normalizeCatalogRevision(
        hasSnakeCase ? body.expected_revision : body.expectedRevision
    );
};

const assertCatalogRevisionMatches = (currentValue, expectedValue) => {
    const currentRevision = normalizeCatalogRevision(currentValue, {
        field: 'current_revision'
    });
    const expectedRevision = normalizeCatalogRevision(expectedValue);
    if (currentRevision !== expectedRevision) {
        throw new AdminCatalogMutationError('Katalog kaydı başka bir işlem tarafından güncellendi.', {
            code: 'ADMIN_CATALOG_REVISION_CONFLICT',
            statusCode: 409,
            details: Object.freeze({
                refetchRequired: true,
                expectedRevision,
                currentRevision
            })
        });
    }
    return currentRevision;
};

const normalizeCatalogEntityType = (value) => {
    const entityType = String(value || '').trim().toLowerCase();
    if (!entityTypes.has(entityType)) {
        throw new AdminCatalogMutationError('Desteklenmeyen katalog varlık türü.', {
            code: 'ADMIN_CATALOG_ENTITY_INVALID'
        });
    }
    return entityType;
};

const normalizeCatalogMutationAction = (value) => {
    const action = String(value || '').trim().toLowerCase();
    if (!mutationActions.has(action)) {
        throw new AdminCatalogMutationError('Desteklenmeyen katalog işlemi.', {
            code: 'ADMIN_CATALOG_ACTION_INVALID'
        });
    }
    return action;
};

const normalizeEntityKey = (value) => {
    const entityKey = String(value ?? '').trim();
    if (!entityKey || entityKey.length > 160 || !SAFE_TOKEN_PATTERN.test(entityKey)) {
        throw new AdminCatalogMutationError('Katalog varlık anahtarı geçersiz.', {
            code: 'ADMIN_CATALOG_ENTITY_KEY_INVALID'
        });
    }
    return entityKey;
};

const normalizeChangedFields = (values = []) => {
    if (!Array.isArray(values) || values.length > 80) {
        throw new AdminCatalogMutationError('Değişen alan listesi geçersiz.', {
            code: 'ADMIN_CATALOG_CHANGED_FIELDS_INVALID'
        });
    }
    const fields = [...new Set(values.map((value) => String(value || '').trim()))].sort();
    if (fields.some((field) => !SAFE_FIELD_PATTERN.test(field))) {
        throw new AdminCatalogMutationError('Değişen alan listesi izin verilmeyen bir alan içeriyor.', {
            code: 'ADMIN_CATALOG_CHANGED_FIELDS_INVALID'
        });
    }
    return Object.freeze(fields);
};

const normalizeRequestId = (value) => {
    const requestId = String(value || '').trim();
    if (!requestId) return null;
    if (requestId.length > 120 || !SAFE_TOKEN_PATTERN.test(requestId)) {
        throw new AdminCatalogMutationError('İstek kimliği geçersiz.', {
            code: 'ADMIN_CATALOG_REQUEST_ID_INVALID'
        });
    }
    return requestId;
};

const normalizeMetadata = (value = {}) => {
    if (!value || Array.isArray(value) || typeof value !== 'object') {
        throw new AdminCatalogMutationError('Audit metadata nesne olmalıdır.', {
            code: 'ADMIN_CATALOG_AUDIT_METADATA_INVALID'
        });
    }
    let serialized;
    try {
        serialized = JSON.stringify(value);
    } catch (_) {
        throw new AdminCatalogMutationError('Audit metadata JSON olarak kaydedilemedi.', {
            code: 'ADMIN_CATALOG_AUDIT_METADATA_INVALID'
        });
    }
    if (serialized.length > 4096) {
        throw new AdminCatalogMutationError('Audit metadata sınırı aşıldı.', {
            code: 'ADMIN_CATALOG_AUDIT_METADATA_INVALID'
        });
    }
    return deepFreeze(JSON.parse(serialized));
};

const normalizeAdminCatalogMutationContext = ({
    actor,
    entityType,
    entityKey,
    action,
    expectedRevision = null,
    changedFields = [],
    requestId = null,
    metadata = {}
}, { allowDeferredCreateEntityKey = false } = {}) => {
    const normalizedAction = normalizeCatalogMutationAction(action);
    if (normalizedAction === 'create'
        && expectedRevision !== undefined
        && expectedRevision !== null
        && expectedRevision !== '') {
        throw new AdminCatalogMutationError('Create işlemi expected_revision kabul etmez.', {
            code: 'ADMIN_CATALOG_CREATE_PRECONDITION_INVALID'
        });
    }
    const canDeferEntityKey = allowDeferredCreateEntityKey
        && normalizedAction === 'create'
        && (entityKey === undefined || entityKey === null || entityKey === '');
    return Object.freeze({
        actor: normalizeAdminCatalogActor(actor),
        entityType: normalizeCatalogEntityType(entityType),
        entityKey: canDeferEntityKey ? null : normalizeEntityKey(entityKey),
        action: normalizedAction,
        expectedRevision: normalizeCatalogRevision(expectedRevision, {
            required: REVISION_REQUIRED_ACTIONS.has(normalizedAction)
        }),
        changedFields: normalizeChangedFields(changedFields),
        requestId: normalizeRequestId(requestId),
        metadata: normalizeMetadata(metadata)
    });
};

const createAdminCatalogAuditEvent = ({
    actor,
    entityType,
    entityKey,
    action,
    expectedRevision = null,
    resultRevision,
    changedFields = [],
    requestId = null,
    metadata = {}
}) => {
    const context = normalizeAdminCatalogMutationContext({
        actor,
        entityType,
        entityKey,
        action,
        expectedRevision,
        changedFields,
        requestId,
        metadata
    });
    const result = normalizeCatalogRevision(resultRevision, {
        field: 'result_revision'
    });
    return Object.freeze({
        ...context,
        resultRevision: result
    });
};

const recordAdminCatalogAuditEvent = async (queryable, rawEvent) => {
    if (!queryable || typeof queryable.query !== 'function') {
        throw new TypeError('Catalog audit writer requires a PostgreSQL queryable.');
    }
    const event = createAdminCatalogAuditEvent(rawEvent);
    const result = await queryable.query(
        `INSERT INTO admin_catalog_audit_events (
            actor_user_id, actor_role, entity_type, entity_key, action,
            expected_revision, result_revision, changed_fields, request_id, metadata
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         RETURNING id, created_at`,
        [
            event.actor.id,
            event.actor.role,
            event.entityType,
            event.entityKey,
            event.action,
            event.expectedRevision,
            event.resultRevision,
            event.changedFields,
            event.requestId,
            event.metadata
        ]
    );
    if (!result.rows?.length) {
        throw new Error('Katalog audit olayı kaydedilemedi.');
    }
    return Object.freeze({
        id: Number(result.rows[0].id),
        createdAt: result.rows[0].created_at
    });
};

module.exports = {
    CATALOG_ENTITY_TYPES,
    CATALOG_MUTATION_ACTIONS,
    AdminCatalogMutationError,
    normalizeAdminCatalogActor,
    normalizeCatalogRevision,
    readExpectedCatalogRevision,
    assertCatalogRevisionMatches,
    normalizeAdminCatalogMutationContext,
    createAdminCatalogAuditEvent,
    recordAdminCatalogAuditEvent
};
