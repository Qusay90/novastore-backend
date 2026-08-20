'use strict';

class SellerPersistenceError extends Error {
    constructor(code, statusCode = 409) {
        super(code);
        this.name = 'SellerPersistenceError';
        this.code = code;
        this.statusCode = statusCode;
    }
}

const positiveInteger = (value, code = 'SELLER_PERSISTENCE_INPUT_INVALID') => {
    const parsed = typeof value === 'string' && /^\d+$/u.test(value) ? Number(value) : value;
    if (!Number.isSafeInteger(parsed) || parsed < 1) throw new SellerPersistenceError(code, 400);
    return parsed;
};
const uuid = (value, code = 'SELLER_PERSISTENCE_INPUT_INVALID') => {
    if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)) {
        throw new SellerPersistenceError(code, 400);
    }
    return value.toLowerCase();
};
const securityStamp = () => require('node:crypto').randomUUID();
const mapDatabaseError = (error) => {
    if (error instanceof SellerPersistenceError) return error;
    if (error?.code === '23505') return new SellerPersistenceError('SELLER_PERSISTENCE_CONFLICT');
    if (error?.code === '40001' || error?.code === '40P01') return new SellerPersistenceError('SELLER_PERSISTENCE_RETRYABLE', 503);
    if (error?.code === '23503' || error?.code === '23514') {
        return new SellerPersistenceError(error.message === 'LAST_OWNER_REQUIRED' ? 'LAST_OWNER_REQUIRED' : 'RESOURCE_NOT_FOUND', error.message === 'LAST_OWNER_REQUIRED' ? 409 : 404);
    }
    return new SellerPersistenceError('SELLER_PERSISTENCE_UNAVAILABLE', 503);
};
const inTransaction = async (database, work) => {
    if (!database || typeof database.connect !== 'function') throw new TypeError('Seller persistence requires a database pool.');
    const client = await database.connect();
    let began = false;
    try {
        await client.query('BEGIN');
        began = true;
        const result = await work(client);
        await client.query('COMMIT');
        return result;
    } catch (error) {
        if (began) await client.query('ROLLBACK').catch(() => {});
        throw mapDatabaseError(error);
    } finally {
        client.release();
    }
};
const requireOrganization = async (client, organizationId, lock = 'FOR UPDATE') => {
    const result = await client.query(`SELECT id, status, revision FROM seller_organizations WHERE id = $1 ${lock}`, [organizationId]);
    if (!result.rows?.length || result.rows[0].status === 'closed') throw new SellerPersistenceError('RESOURCE_NOT_FOUND', 404);
    return result.rows[0];
};
const createOrganization = async (database, input) => {
    const externalKey = uuid(input.externalKey);
    const displayName = String(input.displayName || '').trim();
    if (!displayName) throw new SellerPersistenceError('SELLER_PERSISTENCE_INPUT_INVALID', 400);
    return inTransaction(database, async (client) => {
        const result = await client.query(
            'INSERT INTO seller_organizations (external_key, display_name) VALUES ($1, $2) RETURNING id, external_key, display_name, status, revision',
            [externalKey, displayName]
        );
        return Object.freeze({ ...result.rows[0], id: positiveInteger(Number(result.rows[0].id)) });
    });
};
const changeOrganizationStatus = async (database, input) => {
    const organizationId = positiveInteger(input.organizationId);
    const expectedRevision = positiveInteger(input.expectedRevision);
    const status = input.status;
    if (!['suspended', 'closed'].includes(status)) throw new SellerPersistenceError('SELLER_LIFECYCLE_TRANSITION_REJECTED', 400);
    return inTransaction(database, async (client) => {
        const organization = await requireOrganization(client, organizationId);
        const allowedTransitions = Object.freeze({ active: ['suspended'], suspended: ['closed'] });
        if (!allowedTransitions[organization.status]?.includes(status)) {
            throw new SellerPersistenceError('SELLER_LIFECYCLE_TRANSITION_REJECTED', 400);
        }
        const result = await client.query(
            "UPDATE seller_organizations SET status = $1::varchar, suspended_at = CASE WHEN $1::varchar = 'suspended' THEN CURRENT_TIMESTAMP ELSE suspended_at END, closed_at = CASE WHEN $1::varchar = 'closed' THEN CURRENT_TIMESTAMP ELSE closed_at END, revision = revision + 1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND revision = $3 RETURNING id, status, revision, suspended_at, closed_at",
            [status, organizationId, expectedRevision]
        );
        if (!result.rows?.length) throw new SellerPersistenceError('SELLER_REVISION_CONFLICT');
        return Object.freeze(result.rows[0]);
    });
};
const createMembership = async (database, input) => {
    const organizationId = positiveInteger(input.organizationId);
    const userId = positiveInteger(input.userId);
    const roleId = positiveInteger(input.roleId);
    return inTransaction(database, async (client) => {
        const organization = await requireOrganization(client, organizationId);
        if (organization.status !== 'active') throw new SellerPersistenceError('RESOURCE_NOT_FOUND', 404);
        const role = await client.query('SELECT id FROM seller_roles WHERE id = $1 AND (organization_id = $2 OR organization_id IS NULL) AND is_active = TRUE FOR UPDATE', [roleId, organizationId]);
        if (!role.rows?.length) throw new SellerPersistenceError('RESOURCE_NOT_FOUND', 404);
        const result = await client.query(
            'INSERT INTO seller_memberships (organization_id, user_id, role_id, security_stamp) VALUES ($1, $2, $3, $4) RETURNING id, organization_id, user_id, role_id, status, membership_revision, security_stamp',
            [organizationId, userId, roleId, securityStamp()]
        );
        return Object.freeze(result.rows[0]);
    });
};
const updateMembership = async (database, input) => {
    const organizationId = positiveInteger(input.organizationId);
    const membershipId = positiveInteger(input.membershipId);
    const expectedRevision = positiveInteger(input.expectedRevision);
    const status = input.status;
    const roleId = input.roleId === undefined ? null : positiveInteger(input.roleId);
    if (status !== undefined && !['active', 'suspended', 'revoked', 'expired'].includes(status)) throw new SellerPersistenceError('SELLER_LIFECYCLE_TRANSITION_REJECTED', 400);
    return inTransaction(database, async (client) => {
        const organization = await requireOrganization(client, organizationId);
        if (roleId !== null) {
            const role = await client.query('SELECT id FROM seller_roles WHERE id = $1 AND (organization_id = $2 OR organization_id IS NULL) AND is_active = TRUE FOR UPDATE', [roleId, organizationId]);
            if (!role.rows?.length) throw new SellerPersistenceError('RESOURCE_NOT_FOUND', 404);
        }
        const membership = await client.query('SELECT id, status, role_id FROM seller_memberships WHERE organization_id = $1 AND id = $2 FOR UPDATE', [organizationId, membershipId]);
        if (!membership.rows?.length) throw new SellerPersistenceError('RESOURCE_NOT_FOUND', 404);
        const current = membership.rows[0];
        const allowedTransitions = Object.freeze({
            active: ['suspended', 'revoked', 'expired'],
            suspended: ['revoked', 'expired'],
            revoked: [],
            expired: []
        });
        if (status !== undefined && status !== current.status && !allowedTransitions[current.status]?.includes(status)) {
            throw new SellerPersistenceError('SELLER_LIFECYCLE_TRANSITION_REJECTED', 400);
        }
        if (['revoked', 'expired'].includes(current.status) && (status !== undefined || roleId !== null)) {
            throw new SellerPersistenceError('SELLER_LIFECYCLE_TRANSITION_REJECTED', 400);
        }
        if (organization.status !== 'active' && (status === 'active' || roleId !== null)) {
            throw new SellerPersistenceError('SELLER_LIFECYCLE_TRANSITION_REJECTED', 400);
        }
        const result = await client.query(
            "UPDATE seller_memberships SET role_id = COALESCE($1, role_id), status = COALESCE($2, status), suspended_at = CASE WHEN $2 = 'suspended' THEN CURRENT_TIMESTAMP ELSE suspended_at END, revoked_at = CASE WHEN $2 IN ('revoked', 'expired') THEN CURRENT_TIMESTAMP ELSE revoked_at END, membership_revision = membership_revision + 1, security_stamp = $3, updated_at = CURRENT_TIMESTAMP WHERE organization_id = $4 AND id = $5 AND membership_revision = $6 RETURNING id, organization_id, role_id, status, membership_revision, security_stamp",
            [roleId, status ?? null, securityStamp(), organizationId, membershipId, expectedRevision]
        );
        if (!result.rows?.length) throw new SellerPersistenceError('SELLER_REVISION_CONFLICT');
        return Object.freeze(result.rows[0]);
    });
};

module.exports = Object.freeze({ SellerPersistenceError, positiveInteger, uuid, mapDatabaseError, inTransaction, requireOrganization, createOrganization, changeOrganizationStatus, createMembership, updateMembership });
