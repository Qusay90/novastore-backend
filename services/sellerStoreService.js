'use strict';

const crypto = require('node:crypto');
const { writeAuditAndOutbox } = require('./sellerAuditOutboxService');

class SellerStoreError extends Error {
    constructor(code, statusCode = 409) {
        super(code);
        this.name = 'SellerStoreError';
        this.code = code;
        this.statusCode = statusCode;
    }
}

const fail = (code, statusCode) => { throw new SellerStoreError(code, statusCode); };
const positiveInteger = (value, code = 'VALIDATION_FAILED') => {
    const parsed = typeof value === 'string' && /^\d+$/u.test(value) ? Number(value) : value;
    if (!Number.isSafeInteger(parsed) || parsed < 1) fail(code, 400);
    return parsed;
};
const text = (value, max, code = 'VALIDATION_FAILED', allowEmpty = false) => {
    if (typeof value !== 'string') fail(code, 400);
    const normalized = value.trim();
    if ((!allowEmpty && !normalized) || normalized.length > max || /[\u0000-\u001f\u007f]/u.test(normalized)) fail(code, 400);
    return normalized;
};
const requireContext = (context) => {
    const organizationId = positiveInteger(context?.organizationId, 'RESOURCE_NOT_FOUND');
    const membershipId = positiveInteger(context?.membershipId, 'RESOURCE_NOT_FOUND');
    const userId = positiveInteger(context?.userId, 'RESOURCE_NOT_FOUND');
    const storeIds = Array.isArray(context?.storeIds) ? context.storeIds.map((value) => positiveInteger(value, 'RESOURCE_NOT_FOUND')) : [];
    if (storeIds.length === 0) fail('RESOURCE_NOT_FOUND', 404);
    return Object.freeze({ organizationId, membershipId, userId, storeIds, sessionId: context.sessionId || null });
};
const stableStringify = (value) => {
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
    if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
    return JSON.stringify(value);
};
const fingerprint = (value) => crypto.createHash('sha256').update(stableStringify(value)).digest('hex');
const idempotencyKey = (value) => text(value, 160, 'VALIDATION_FAILED');

const loadScopedStore = async (queryable, context, storeId, lock = '') => {
    const safeContext = requireContext(context);
    const targetStoreId = positiveInteger(storeId, 'RESOURCE_NOT_FOUND');
    if (!safeContext.storeIds.includes(targetStoreId)) fail('RESOURCE_NOT_FOUND', 404);
    const result = await queryable.query(
        `SELECT store.id, store.organization_id, store.display_name, store.status, store.revision,
                profile.description, profile.shipping_policy, profile.return_policy, profile.operational_status,
                profile.verified_contact_visibility, COALESCE(profile.revision, 1) AS profile_revision
           FROM seller_stores store
      LEFT JOIN seller_store_profiles profile ON profile.organization_id = store.organization_id AND profile.store_id = store.id
          WHERE store.organization_id = $1 AND store.id = $2 AND store.status = 'active' ${lock ? 'FOR UPDATE OF store' : ''}`,
        [safeContext.organizationId, targetStoreId]
    );
    if (!result.rows?.[0]) fail('RESOURCE_NOT_FOUND', 404);
    return Object.freeze(result.rows[0]);
};

const safeStore = (row) => Object.freeze({
    id: Number(row.id),
    display_name: String(row.display_name),
    status: String(row.status),
    description: String(row.description || ''),
    shipping_policy: String(row.shipping_policy || ''),
    return_policy: String(row.return_policy || ''),
    operational_status: String(row.operational_status || 'open'),
    verified_contact_visibility: row.verified_contact_visibility === true,
    revision: Number(row.revision)
});

const readStore = async (database, context, storeId) => {
    if (!database || typeof database.query !== 'function') throw new TypeError('Seller store database is required.');
    return safeStore(await loadScopedStore(database, context, storeId));
};

const validatePatch = (input) => {
    if (!input || typeof input !== 'object' || Array.isArray(input)) fail('VALIDATION_FAILED', 400);
    const allowed = new Set(['display_name', 'description', 'shipping_policy', 'return_policy', 'operational_status', 'verified_contact_visibility', 'revision', 'idempotency_key', 'step_up_verified']);
    if (Object.keys(input).some((key) => !allowed.has(key))) fail('VALIDATION_FAILED', 400);
    const revision = positiveInteger(input.revision, 'PRECONDITION_REQUIRED');
    const values = {};
    if (Object.hasOwn(input, 'display_name')) values.display_name = text(input.display_name, 160);
    if (Object.hasOwn(input, 'description')) values.description = text(input.description, 2000, 'VALIDATION_FAILED', true);
    if (Object.hasOwn(input, 'shipping_policy')) values.shipping_policy = text(input.shipping_policy, 2000, 'VALIDATION_FAILED', true);
    if (Object.hasOwn(input, 'return_policy')) values.return_policy = text(input.return_policy, 2000, 'VALIDATION_FAILED', true);
    if (Object.hasOwn(input, 'operational_status')) {
        if (!['open', 'paused'].includes(input.operational_status)) fail('VALIDATION_FAILED', 400);
        values.operational_status = input.operational_status;
    }
    if (Object.hasOwn(input, 'verified_contact_visibility')) {
        if (typeof input.verified_contact_visibility !== 'boolean') fail('VALIDATION_FAILED', 400);
        values.verified_contact_visibility = input.verified_contact_visibility;
    }
    if (Object.keys(values).length === 0) fail('VALIDATION_FAILED', 400);
    if ((Object.hasOwn(values, 'operational_status') || Object.hasOwn(values, 'verified_contact_visibility')) && input.step_up_verified !== true) {
        fail('STEP_UP_REQUIRED', 403);
    }
    return Object.freeze({ values, revision, idempotencyKey: idempotencyKey(input.idempotency_key), stepUpVerified: input.step_up_verified === true });
};

const readReceipt = async (client, organizationId, key, requestFingerprint) => {
    const result = await client.query(
        'SELECT request_fingerprint, response_redacted FROM seller_mutation_receipts WHERE organization_id = $1 AND idempotency_key = $2',
        [organizationId, key]
    );
    const row = result.rows?.[0];
    if (!row) return null;
    if (row.request_fingerprint !== requestFingerprint) fail('IDEMPOTENCY_KEY_REUSED', 409);
    return Object.freeze(row.response_redacted);
};

const atomic = async (database, input) => {
    if (!database || typeof database.connect !== 'function') throw new TypeError('Seller store database pool is required.');
    const client = await database.connect();
    let began = false;
    try {
        await client.query('BEGIN');
        began = true;
        const mutationResult = await input.mutation(client);
        const events = await writeAuditAndOutbox(client, input);
        await client.query('COMMIT');
        return Object.freeze({ mutationResult, ...events });
    } catch (error) {
        if (began) await client.query('ROLLBACK').catch(() => {});
        throw error;
    } finally {
        client.release();
    }
};

const updateStore = async (database, context, storeId, input) => {
    const safeContext = requireContext(context);
    const patch = validatePatch(input);
    const requestFingerprint = fingerprint({ storeId: positiveInteger(storeId), values: patch.values, revision: patch.revision });
    await loadScopedStore(database, safeContext, storeId);
    const replay = await readReceipt(database, safeContext.organizationId, patch.idempotencyKey, requestFingerprint);
    if (replay) return Object.freeze({ reused: true, store: replay });
    const completed = await atomic(database, {
        organizationId: safeContext.organizationId,
        audit: {
            storeId: positiveInteger(storeId), actorUserId: safeContext.userId, actorMembershipId: safeContext.membershipId,
            sessionId: safeContext.sessionId, eventType: 'seller.store.updated', targetType: 'seller_store', targetId: String(storeId), resultCode: 'success',
            metadata: { action: 'update', target_class: 'seller_store' }
        },
        outbox: {
            storeId: positiveInteger(storeId), aggregateType: 'seller_store', aggregateId: String(storeId), eventType: 'seller.store.updated',
            aggregateRevision: patch.revision + 1, idempotencyKey: patch.idempotencyKey, payload: { action: 'update', target_class: 'seller_store' }
        },
        mutation: async (client) => {
            const current = await loadScopedStore(client, safeContext, storeId, 'FOR UPDATE');
            if (Number(current.revision) !== patch.revision) fail('REVISION_CONFLICT', 409);
            await client.query(
                'INSERT INTO seller_store_profiles (organization_id, store_id) VALUES ($1, $2) ON CONFLICT (store_id) DO NOTHING',
                [safeContext.organizationId, Number(storeId)]
            );
            const name = patch.values.display_name === undefined ? current.display_name : patch.values.display_name;
            const updateStoreResult = await client.query(
                'UPDATE seller_stores SET display_name = $1, revision = revision + 1, updated_at = CURRENT_TIMESTAMP WHERE organization_id = $2 AND id = $3 AND revision = $4 RETURNING revision',
                [name, safeContext.organizationId, Number(storeId), patch.revision]
            );
            if (!updateStoreResult.rows?.[0]) fail('REVISION_CONFLICT', 409);
            await client.query(
                `UPDATE seller_store_profiles
                    SET description = COALESCE($1, description), shipping_policy = COALESCE($2, shipping_policy),
                        return_policy = COALESCE($3, return_policy), operational_status = COALESCE($4, operational_status),
                        verified_contact_visibility = COALESCE($5, verified_contact_visibility), revision = revision + 1, updated_at = CURRENT_TIMESTAMP
                  WHERE organization_id = $6 AND store_id = $7`,
                [patch.values.description ?? null, patch.values.shipping_policy ?? null, patch.values.return_policy ?? null, patch.values.operational_status ?? null, patch.values.verified_contact_visibility ?? null, safeContext.organizationId, Number(storeId)]
            );
            const updated = safeStore(await loadScopedStore(client, safeContext, storeId));
            await client.query(
                'INSERT INTO seller_mutation_receipts (organization_id, idempotency_key, request_fingerprint, aggregate_type, aggregate_id, response_redacted) VALUES ($1, $2, $3, $4, $5, $6::jsonb)',
                [safeContext.organizationId, patch.idempotencyKey, requestFingerprint, 'seller_store', String(storeId), JSON.stringify(updated)]
            );
            return Object.freeze({ reused: false, store: updated });
        }
    });
    return completed.mutationResult;
};

module.exports = Object.freeze({ SellerStoreError, readStore, updateStore, safeStore });
