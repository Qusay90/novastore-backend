const {
    CouponAdminError,
    assertCouponRevisionMatches,
    mergeAndValidateCoupon,
    normalizeCouponAdminActor,
    normalizeCouponId,
    normalizeCouponStatusPayload,
    normalizeCreateCouponPayload,
    normalizeRequestId,
    normalizeUpdateCouponPayload,
    resolveCouponOperationalStatus
} = require('./couponAdminPolicy');

const COUPON_COLUMNS = `
    id, code, discount_type, discount_value, min_order_amount,
    max_discount_amount, usage_limit, used_count, is_active,
    starts_at, ends_at, revision, created_at, updated_at`;

const numberOrNull = (value) => value === null || value === undefined ? null : Number(value);
const dateOrNull = (value) => value === null || value === undefined
    ? null
    : (value instanceof Date ? value.toISOString() : String(value));

const toCouponAdminRecord = (row, now = new Date()) => {
    if (!row) return null;
    const record = {
        id: Number(row.id),
        code: String(row.code),
        discount_type: String(row.discount_type).toUpperCase(),
        discount_value: Number(row.discount_value),
        min_order_amount: Number(row.min_order_amount || 0),
        max_discount_amount: numberOrNull(row.max_discount_amount),
        usage_limit: numberOrNull(row.usage_limit),
        used_count: Number(row.used_count || 0),
        is_active: row.is_active === true,
        starts_at: dateOrNull(row.starts_at),
        ends_at: dateOrNull(row.ends_at),
        revision: Number(row.revision),
        created_at: dateOrNull(row.created_at),
        updated_at: dateOrNull(row.updated_at)
    };
    return Object.freeze({
        ...record,
        operational_status: resolveCouponOperationalStatus(record, now)
    });
};

const translateCouponDbError = (error) => {
    if (error instanceof CouponAdminError) throw error;
    if (error?.code === '23505') {
        throw new CouponAdminError('Bu kupon kodu zaten kullanılıyor.', {
            code: 'COUPON_CODE_CONFLICT',
            statusCode: 409,
            details: Object.freeze({ refetchRequired: true })
        });
    }
    if (error?.code === '23514') {
        throw new CouponAdminError('Kupon verisi veritabanı kurallarıyla uyumsuz.', {
            code: 'COUPON_CONSTRAINT_VIOLATION'
        });
    }
    throw error;
};

const readCouponAdminList = async (database) => {
    if (!database || typeof database.query !== 'function') {
        throw new TypeError('Coupon list reader requires a PostgreSQL queryable.');
    }
    const result = await database.query(
        `SELECT ${COUPON_COLUMNS}
         FROM coupons
         ORDER BY created_at DESC, id DESC`
    );
    return Object.freeze({
        items: Object.freeze((result.rows || []).map((row) => toCouponAdminRecord(row)))
    });
};

const insertCouponAudit = async (client, {
    actor,
    couponId,
    action,
    expectedRevision,
    resultRevision,
    changedFields,
    requestId
}) => {
    const result = await client.query(
        `INSERT INTO admin_coupon_audit_events (
            actor_user_id, actor_role, coupon_id, action, expected_revision,
            result_revision, changed_fields, request_id, metadata
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)
         RETURNING id, created_at`,
        [
            actor.id,
            actor.role,
            couponId,
            action,
            expectedRevision,
            resultRevision,
            changedFields,
            requestId,
            JSON.stringify({ source: 'admin-coupon-operations' })
        ]
    );
    if (!result.rows?.length) {
        throw new CouponAdminError('Kupon audit kaydı oluşturulamadı.', {
            code: 'COUPON_AUDIT_WRITE_FAILED',
            statusCode: 500
        });
    }
    return Object.freeze({
        id: Number(result.rows[0].id),
        created_at: dateOrNull(result.rows[0].created_at)
    });
};

const createCouponAdmin = async (database, { actor: rawActor, body, requestId = null }) => {
    if (!database || typeof database.connect !== 'function') {
        throw new TypeError('Coupon writer requires a PostgreSQL pool.');
    }
    const actor = normalizeCouponAdminActor(rawActor);
    const payload = normalizeCreateCouponPayload(body);
    const normalizedRequestId = normalizeRequestId(requestId);
    const client = await database.connect();
    try {
        await client.query('BEGIN');
        const insert = await client.query(
            `INSERT INTO coupons (
                code, discount_type, discount_value, min_order_amount,
                max_discount_amount, usage_limit, starts_at, ends_at, is_active, revision
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,1)
             RETURNING ${COUPON_COLUMNS}`,
            [
                payload.code,
                payload.discount_type,
                payload.discount_value,
                payload.min_order_amount,
                payload.max_discount_amount,
                payload.usage_limit,
                payload.starts_at,
                payload.ends_at,
                payload.is_active
            ]
        );
        if (!insert.rows?.length) {
            throw new CouponAdminError('Kupon oluşturulamadı.', {
                code: 'COUPON_CREATE_FAILED',
                statusCode: 500
            });
        }
        const coupon = toCouponAdminRecord(insert.rows[0]);
        const audit = await insertCouponAudit(client, {
            actor,
            couponId: coupon.id,
            action: 'create',
            expectedRevision: null,
            resultRevision: coupon.revision,
            changedFields: Object.keys(payload).sort(),
            requestId: normalizedRequestId
        });
        await client.query('COMMIT');
        return Object.freeze({ coupon, audit });
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        translateCouponDbError(error);
    } finally {
        client.release();
    }
};

const valuesEquivalent = (field, current, next) => {
    if (current === null || current === undefined || next === null || next === undefined) {
        return (current === null || current === undefined) && (next === null || next === undefined);
    }
    if (['discount_value', 'min_order_amount', 'max_discount_amount', 'usage_limit'].includes(field)) {
        return Number(current) === Number(next);
    }
    if (['starts_at', 'ends_at'].includes(field)) {
        return new Date(current).getTime() === new Date(next).getTime();
    }
    return current === next;
};

const updateCouponAdminInternal = async (database, couponId, {
    actor: rawActor,
    expectedRevision,
    changes,
    requestId = null,
    action = 'update'
}) => {
    const id = normalizeCouponId(couponId);
    const actor = normalizeCouponAdminActor(rawActor);
    const normalizedRequestId = normalizeRequestId(requestId);
    const client = await database.connect();
    try {
        await client.query('BEGIN');
        const locked = await client.query(
            `SELECT ${COUPON_COLUMNS}
             FROM coupons
             WHERE id = $1
             FOR UPDATE`,
            [id]
        );
        if (!locked.rows?.length) {
            throw new CouponAdminError('Kupon bulunamadı.', {
                code: 'COUPON_NOT_FOUND',
                statusCode: 404
            });
        }
        const current = locked.rows[0];
        const currentRevision = assertCouponRevisionMatches(current.revision, expectedRevision);
        const materialChanges = Object.fromEntries(
            Object.entries(changes).filter(([field, value]) => !valuesEquivalent(field, current[field], value))
        );
        if (Object.keys(materialChanges).length === 0) {
            throw new CouponAdminError('Kupon güncellemesi gerçek bir değişiklik içermiyor.', {
                code: action === 'update' ? 'COUPON_UPDATE_NOOP' : 'COUPON_STATUS_NOOP'
            });
        }
        mergeAndValidateCoupon(current, materialChanges);

        const params = [];
        const assignments = Object.entries(materialChanges).map(([field, value]) => {
            params.push(value);
            return `${field} = $${params.length}`;
        });
        params.push(id, currentRevision);
        const update = await client.query(
            `UPDATE coupons
             SET ${assignments.join(', ')},
                 revision = revision + 1,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $${params.length - 1} AND revision = $${params.length}
             RETURNING ${COUPON_COLUMNS}`,
            params
        );
        if (!update.rows?.length) {
            throw new CouponAdminError('Kupon revision artışı uygulanamadı.', {
                code: 'COUPON_REVISION_WRITE_CONFLICT',
                statusCode: 409,
                details: Object.freeze({ refetchRequired: true })
            });
        }
        const coupon = toCouponAdminRecord(update.rows[0]);
        if (coupon.revision !== currentRevision + 1) {
            throw new CouponAdminError('Kupon revision sözleşmesi ihlal edildi.', {
                code: 'COUPON_REVISION_RESULT_INVALID',
                statusCode: 500
            });
        }
        const audit = await insertCouponAudit(client, {
            actor,
            couponId: id,
            action,
            expectedRevision: currentRevision,
            resultRevision: coupon.revision,
            changedFields: Object.keys(materialChanges).sort(),
            requestId: normalizedRequestId
        });
        await client.query('COMMIT');
        return Object.freeze({ coupon, audit });
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        translateCouponDbError(error);
    } finally {
        client.release();
    }
};

const updateCouponAdmin = async (database, couponId, options) => {
    if (!database || typeof database.connect !== 'function') {
        throw new TypeError('Coupon writer requires a PostgreSQL pool.');
    }
    const payload = normalizeUpdateCouponPayload(options?.body);
    return updateCouponAdminInternal(database, couponId, {
        actor: options?.actor,
        expectedRevision: payload.expectedRevision,
        changes: payload.changes,
        requestId: options?.requestId,
        action: 'update'
    });
};

const setCouponAdminStatus = async (database, couponId, options) => {
    if (!database || typeof database.connect !== 'function') {
        throw new TypeError('Coupon writer requires a PostgreSQL pool.');
    }
    const payload = normalizeCouponStatusPayload(options?.body);
    return updateCouponAdminInternal(database, couponId, {
        actor: options?.actor,
        expectedRevision: payload.expectedRevision,
        changes: { is_active: payload.isActive },
        requestId: options?.requestId,
        action: payload.isActive ? 'activate' : 'deactivate'
    });
};

module.exports = {
    COUPON_COLUMNS,
    createCouponAdmin,
    insertCouponAudit,
    readCouponAdminList,
    setCouponAdminStatus,
    toCouponAdminRecord,
    translateCouponDbError,
    updateCouponAdmin,
    updateCouponAdminInternal
};
