'use strict';

const { PLATFORM_STORE } = require('./categoryV2BackfillService');

// One source for marketplace, reputation and public store projection. R10's
// unbound first-party platform exception remains explicit; arbitrary unbound
// stores never qualify. Only a single eligible Seller binding can own identity.
const publicStoreSourceSql = () => {
    if (!/^[a-z0-9-]+$/u.test(PLATFORM_STORE.slug)) throw new Error('Invalid platform store slug');
    return `SELECT platform_store.id AS platform_store_id, LOWER(platform_store.slug) AS slug,
        COALESCE(binding.display_name, platform_store.name) AS display_name,
        COALESCE(binding.description, '') AS description,
        COALESCE(binding.shipping_policy, '') AS shipping_policy,
        COALESCE(binding.return_policy, '') AS return_policy
      FROM stores platform_store
      CROSS JOIN LATERAL (
        SELECT COUNT(*) AS binding_count,
            COUNT(*) FILTER (WHERE eligible.is_public) AS public_binding_count,
            MAX(eligible.display_name) FILTER (WHERE eligible.is_public) AS display_name,
            MAX(eligible.description) FILTER (WHERE eligible.is_public) AS description,
            MAX(eligible.shipping_policy) FILTER (WHERE eligible.is_public) AS shipping_policy,
            MAX(eligible.return_policy) FILTER (WHERE eligible.is_public) AS return_policy
        FROM (
            SELECT seller_store.display_name, profile.description, profile.shipping_policy, profile.return_policy,
                (seller_store.status = 'active' AND seller_store.closed_at IS NULL
                    AND organization.status = 'active' AND organization.closed_at IS NULL
                    AND COALESCE(profile.operational_status, 'open') = 'open') AS is_public
            FROM seller_stores seller_store
            JOIN seller_organizations organization ON organization.id = seller_store.organization_id
            LEFT JOIN seller_store_profiles profile
              ON profile.organization_id = seller_store.organization_id AND profile.store_id = seller_store.id
            WHERE seller_store.legacy_store_id = platform_store.id
        ) eligible
      ) binding
      WHERE platform_store.is_active = TRUE AND platform_store.deleted_at IS NULL
        AND LENGTH(platform_store.slug) BETWEEN 1 AND 160
        AND LOWER(platform_store.slug) ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
        AND NULLIF(BTRIM(COALESCE(binding.display_name, platform_store.name)), '') IS NOT NULL
        AND (binding.public_binding_count = 1 OR (binding.binding_count = 0
            AND LOWER(platform_store.slug) = '${PLATFORM_STORE.slug}'))`;
};
const buildPublicStoreEligibilitySql = (storeIdColumn) => {
    if (!/^[a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*$/iu.test(storeIdColumn)) throw new Error('Invalid store column');
    return `EXISTS (SELECT 1 FROM (${publicStoreSourceSql()}) public_store
        WHERE public_store.platform_store_id = ${storeIdColumn})`;
};

module.exports = { publicStoreSourceSql, buildPublicStoreEligibilitySql };
