'use strict';

const {
    PublicStoreError,
    loadPublicStoreRowBySlug,
    normalizeStoreSlug
} = require('./publicStoreProjectionService');

const positiveInteger = (value, code = 'RESOURCE_NOT_FOUND') => {
    const parsed = typeof value === 'string' && /^\d+$/u.test(value) ? Number(value) : value;
    if (!Number.isSafeInteger(parsed) || parsed < 1) {
        throw new PublicStoreError(code, 404);
    }
    return parsed;
};

const nonNegativeInteger = (value) => {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
};

const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/gu;

const safePublicText = (value, maxLength) => String(value ?? '')
    .replace(CONTROL_CHARACTER_PATTERN, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
    .slice(0, maxLength);

const isoTimestamp = (value) => {
    const parsed = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(parsed.getTime())) throw new TypeError('Store follow timestamp is invalid.');
    return parsed.toISOString();
};

const requireQueryable = (queryable) => {
    if (!queryable || typeof queryable.query !== 'function') {
        throw new TypeError('Store follow database is required.');
    }
    return queryable;
};

const readState = async (database, userId, identity) => {
    const result = await database.query(
        `SELECT
            EXISTS (
                SELECT 1
                  FROM store_follows customer_follow
                 WHERE customer_follow.user_id = $1
                   AND customer_follow.store_id = $2
            ) AS following,
            (
                SELECT COUNT(*)::INTEGER
                  FROM store_follows store_follow
                 WHERE store_follow.store_id = $2
            ) AS follower_count`,
        [userId, identity.platformStoreId]
    );
    const row = result.rows?.[0] || {};
    return Object.freeze({
        store_slug: identity.slug,
        following: row.following === true,
        follower_count: nonNegativeInteger(row.follower_count)
    });
};

const getStoreFollowState = async (storeSlug, customerUserId, { queryable = null } = {}) => {
    const database = requireQueryable(queryable || require('../config/db'));
    const userId = positiveInteger(customerUserId);
    const identity = await loadPublicStoreRowBySlug(normalizeStoreSlug(storeSlug), { queryable: database });
    return readState(database, userId, Object.freeze({
        platformStoreId: positiveInteger(identity.platform_store_id),
        slug: normalizeStoreSlug(identity.slug)
    }));
};

const listFollowedStores = async (customerUserId, { queryable = null } = {}) => {
    const database = requireQueryable(queryable || require('../config/db'));
    const userId = positiveInteger(customerUserId);
    const result = await database.query(
        `SELECT platform_store.slug AS store_slug,
                seller_store.display_name AS store_name,
                customer_follow.created_at AS followed_at,
                (
                    SELECT COUNT(*)::INTEGER
                      FROM store_follows store_follow
                     WHERE store_follow.store_id = platform_store.id
                ) AS follower_count
           FROM store_follows customer_follow
     INNER JOIN stores platform_store
             ON platform_store.id = customer_follow.store_id
            AND platform_store.is_active = TRUE
            AND platform_store.deleted_at IS NULL
     INNER JOIN seller_stores seller_store
             ON seller_store.legacy_store_id = platform_store.id
            AND seller_store.status = 'active'
            AND seller_store.closed_at IS NULL
      LEFT JOIN seller_store_profiles profile
             ON profile.organization_id = seller_store.organization_id
            AND profile.store_id = seller_store.id
          WHERE customer_follow.user_id = $1
            AND COALESCE(profile.operational_status, 'open') = 'open'
       ORDER BY customer_follow.created_at DESC, platform_store.id DESC`,
        [userId]
    );
    return Object.freeze((result.rows || []).map((row) => Object.freeze({
        store_slug: normalizeStoreSlug(row.store_slug),
        store_name: safePublicText(row.store_name, 160),
        following: true,
        follower_count: nonNegativeInteger(row.follower_count),
        followed_at: isoTimestamp(row.followed_at)
    })));
};

const setStoreFollow = async (storeSlug, customerUserId, shouldFollow, { queryable = null } = {}) => {
    const database = requireQueryable(queryable || require('../config/db'));
    const userId = positiveInteger(customerUserId);
    const identityRow = await loadPublicStoreRowBySlug(normalizeStoreSlug(storeSlug), { queryable: database });
    const identity = Object.freeze({
        platformStoreId: positiveInteger(identityRow.platform_store_id),
        slug: normalizeStoreSlug(identityRow.slug)
    });
    if (shouldFollow === true) {
        await database.query(
            `INSERT INTO store_follows (user_id, store_id)
             VALUES ($1, $2)
             ON CONFLICT (user_id, store_id) DO NOTHING`,
            [userId, identity.platformStoreId]
        );
    } else {
        await database.query(
            `DELETE FROM store_follows
              WHERE user_id = $1
                AND store_id = $2`,
            [userId, identity.platformStoreId]
        );
    }
    return readState(database, userId, identity);
};

module.exports = Object.freeze({
    getStoreFollowState,
    listFollowedStores,
    setStoreFollow
});
