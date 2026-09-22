'use strict';

// Only for an already-owned disposable database. No connection/startup behavior.
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const LOCAL_QA_PASSWORD = 'Nova-Wave2-Local-QA!2026';
async function seedWave2(pool, sensitive = new Set()) {
    const database = (await pool.query('SELECT current_database() AS name')).rows[0].name;
    assert(/^novastore_theme_wave1_[a-f0-9]{16}_test$/u.test(database), 'Owned disposable Theme Platform database required');
    const passwordHash = await require('bcrypt').hash(LOCAL_QA_PASSWORD, 10);
    sensitive.add(LOCAL_QA_PASSWORD); sensitive.add(passwordHash);
    const tokenService = require('../../services/sellerAccessTokenService').createSellerAccessTokenService({ secret: process.env.SELLER_ACCESS_TOKEN_SECRET });
    const issueAdmin = async (label, role) => {
        const email = `${label}@example.test`;
        const userId = Number((await pool.query("INSERT INTO users(full_name,email,password,role,auth_enabled) VALUES($1,$2,$3,'admin',TRUE) RETURNING id", [label, email, passwordHash])).rows[0].id);
        const session = await require('../../services/authSessionService').issueAccessSession({ queryable: pool, userId, role: 'admin', principal: 'admin' });
        sensitive.add(session.token);
        if (role) await pool.query('INSERT INTO theme_admin_roles(user_id,role) VALUES($1,$2)', [userId, role]);
        return { ...session, userId, email, password: LOCAL_QA_PASSWORD };
    };
    const makeStore = async (slug) => {
        const org = Number((await pool.query('INSERT INTO seller_organizations(external_key,display_name) VALUES($1,$2) RETURNING id', [crypto.randomUUID(), slug])).rows[0].id);
        const legacyId = Number((await pool.query('INSERT INTO stores(name,slug) VALUES($1,$1) RETURNING id', [slug])).rows[0].id);
        const id = Number((await pool.query('INSERT INTO seller_stores(organization_id,legacy_store_id,display_name) VALUES($1,$2,$3) RETURNING id', [org, legacyId, slug])).rows[0].id);
        return { id, org, legacyId };
    };
    const issueSeller = async (label, store, role) => {
        const email = `${label}@example.test`;
        const userId = Number((await pool.query("INSERT INTO users(full_name,email,password,role,auth_enabled) VALUES($1,$2,$3,'customer',TRUE) RETURNING id", [label, email, passwordHash])).rows[0].id);
        const roleId = Number((await pool.query("SELECT id FROM seller_roles WHERE code='owner' AND organization_id IS NULL")).rows[0].id);
        const stamp = crypto.randomUUID();
        const membershipId = Number((await pool.query('INSERT INTO seller_memberships(organization_id,user_id,role_id,security_stamp) VALUES($1,$2,$3,$4) RETURNING id', [store.org, userId, roleId, stamp])).rows[0].id);
        await pool.query('INSERT INTO seller_membership_store_scopes(membership_id,organization_id,store_id) VALUES($1,$2,$3)', [membershipId, store.org, store.id]);
        const sessionId = crypto.randomUUID();
        await pool.query("INSERT INTO seller_sessions(id,user_id,organization_id,membership_id,membership_revision,security_stamp,expires_at) VALUES($1,$2,$3,$4,1,$5,NOW()+INTERVAL '1 day')", [sessionId, userId, store.org, membershipId, stamp]);
        if (role) await pool.query('INSERT INTO theme_seller_roles(organization_id,membership_id,role) VALUES($1,$2,$3)', [store.org, membershipId, role]);
        const token = tokenService.issue({ sessionId, userId }); sensitive.add(token);
        return { userId, membershipId, sessionId, token, store, email, password: LOCAL_QA_PASSWORD };
    };
    const admin = await issueAdmin('wave2-admin', 'super_admin');
    const themeAdmin = await issueAdmin('wave2-catalog', 'theme_admin');
    const support = await issueAdmin('wave2-support', 'support');
    const unbound = await issueAdmin('wave2-unbound', null);
    const storeA = await makeStore('wave2-store-a'), storeB = await makeStore('wave2-store-b');
    const viewer = await issueSeller('wave2-viewer-a', storeA, 'seller_viewer');
    const a = await issueSeller('wave2-owner-a', storeA), b = await issueSeller('wave2-owner-b', storeB);
    return { admin, themeAdmin, support, unbound, a, b, viewer, storeA, storeB, tokenService, issueSeller, makeStore };
}
module.exports = { seedWave2, LOCAL_QA_PASSWORD };
