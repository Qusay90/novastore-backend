'use strict';

const crypto = require('node:crypto');
const connector = require('./stockySystemConnectorService');
const branded = new WeakMap();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const HASH = /^[0-9a-f]{64}$/u;
const INTROSPECT_PATH = '/api/integrations/novastore/v1/theme-seller-session/introspect';
const fail = (code = 'THEME_BRIDGE_AUTH_REQUIRED', statusCode = 401) => { const e = new Error(code); e.code = code; e.statusCode = statusCode; throw e; };
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const integer = value => Number.isSafeInteger(value) && value > 0;
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const canonical = connector.stableStringify;
const equal = (a, b) => typeof a === 'string' && typeof b === 'string'
    && a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
const isThemeSellerBridgePrincipal = principal => branded.has(principal);
const permitsThemeSellerBridgeAction = (principal, permission) => !branded.get(principal)?.readOnlyProjection || permission === 'draft.read';

function validateAssertion(assertion, request, now = Math.floor(Date.now() / 1000)) {
    if (!exact(assertion, ['version', 'audience', 'purpose', 'connectionId', 'keyId', 'tenantId', 'humanUserId', 'sessionHash', 'issuedAt', 'expiresAt', 'nonce', 'requestHash'])
        || assertion.version !== 1 || assertion.audience !== 'novastore-theme-seller'
        || assertion.purpose !== 'theme-action' || !UUID.test(assertion.connectionId)
        || !UUID.test(assertion.tenantId) || !integer(assertion.humanUserId)
        || !/^[A-Za-z0-9._-]{1,64}$/u.test(assertion.keyId) || !HASH.test(assertion.sessionHash)
        || !/^[A-Za-z0-9_-]{24,64}$/u.test(assertion.nonce) || !HASH.test(assertion.requestHash)
        || !integer(assertion.issuedAt) || !integer(assertion.expiresAt)
        || assertion.issuedAt > now + 2 || assertion.expiresAt <= now
        || assertion.expiresAt - assertion.issuedAt > 15 || assertion.expiresAt <= assertion.issuedAt
        || assertion.requestHash !== digest(canonical(request))) fail();
    return assertion;
}

async function liveIntrospection(connection, assertion, runtime, transport) {
    const body = canonical({ tenantId: assertion.tenantId, humanUserId: assertion.humanUserId, sessionHash: assertion.sessionHash });
    const signed = connector.signStockyThemeSellerRequest({ connection, runtime, method: 'POST', path: INTROSPECT_PATH, body });
    const response = await transport({ url: `${connection.endpoint_origin}${INTROSPECT_PATH}`, method: 'POST', headers: signed.headers, body, runtime });
    connector.verifyStockyResponse({ ...response, path: INTROSPECT_PATH, connection, runtime,
        expectedNonce: signed.nonce, expectedTimestamp: signed.timestamp });
    let value; try { value = JSON.parse(response.rawBody); } catch { fail('THEME_BRIDGE_UPSTREAM_INVALID', 502); }
    if (response.statusCode !== 200 || !exact(value, ['active', 'tenantId', 'humanUserId', 'sessionHash'])
        || value.active !== true || value.tenantId !== assertion.tenantId
        || value.humanUserId !== assertion.humanUserId || value.sessionHash !== assertion.sessionHash) fail('THEME_BRIDGE_SESSION_REVOKED');
}

// This brand is never reconstructed from serialized data or a browser principal.
// An assertion authenticates only one finite Theme action, never general Seller APIs.
function createThemeSellerBridge({ database, runtime, transport, inspect = liveIntrospection }) {
    if (!database?.connect || !runtime) throw new TypeError('Theme bridge database and connector runtime required');
    return {
        async authenticate(envelope) {
            if (runtime.enabled !== true) fail('THEME_BRIDGE_DISABLED', 404);
            if (!exact(envelope, ['assertion', 'signature', 'request'])) fail();
            const assertion = validateAssertion(envelope.assertion, envelope.request);
            const client = await database.connect();
            let mapping, session, connection;
            try {
                await client.query('BEGIN');
                connection = (await client.query(`/* theme-bridge:connection */ SELECT * FROM stocky_connector_connections WHERE id=$1 AND status='active' FOR SHARE`, [assertion.connectionId])).rows[0];
                if (!connection || connection.key_id !== assertion.keyId) fail();
                connector.validateEndpointOrigin(connection.endpoint_origin, runtime);
                const secret = runtime.secretsByRef?.[connection.secret_ref];
                if (typeof secret !== 'string' || secret.length < 32
                    || !equal(envelope.signature, crypto.createHmac('sha256', secret).update(`theme-seller-assertion-v1\n${canonical(assertion)}`).digest('hex'))) fail();
                mapping = (await client.query(`/* theme-bridge:mapping */ SELECT * FROM theme_seller_bridge_mappings
                    WHERE connection_id=$1 AND tenant_id=$2 AND stocky_user_id=$3 AND active=TRUE FOR UPDATE`,
                [connection.id, assertion.tenantId, assertion.humanUserId])).rows[0];
                if (!mapping || Number(mapping.organization_id) !== Number(connection.organization_id)
                    || Number(mapping.store_id) !== Number(connection.store_id)) fail('THEME_BRIDGE_MAPPING_REQUIRED', 403);
                const inserted = await client.query(`/* theme-bridge:nonce */ INSERT INTO theme_seller_bridge_requests(connection_id,nonce,request_hash,expires_at)
                    VALUES($1,$2,$3,to_timestamp($4)) ON CONFLICT DO NOTHING RETURNING nonce`,
                [connection.id, assertion.nonce, assertion.requestHash, assertion.expiresAt]);
                if (inserted.rows.length !== 1) fail('THEME_BRIDGE_ASSERTION_REPLAY', 409);
                // No bearer relay: this backchannel re-reads the actual Stocky session.
                await inspect(connection, assertion, runtime, transport || connector.createSafeStockyThemeSellerTransport());
                const member = (await client.query(`/* theme-bridge:member */ SELECT membership_revision,security_stamp FROM seller_memberships
                    WHERE id=$1 AND user_id=$2 AND organization_id=$3 AND status='active' AND effective_at<=clock_timestamp() FOR SHARE`,
                [mapping.membership_id, mapping.user_id, mapping.organization_id])).rows[0];
                if (!member) fail('THEME_BRIDGE_MEMBERSHIP_REVOKED', 403);
                const sid = crypto.randomUUID();
                const created = await client.query(`/* theme-bridge:open */ INSERT INTO theme_seller_bridge_sessions
                    (id,mapping_id,session_hash,mapping_revision,membership_revision,security_stamp,expires_at)
                    VALUES($1,$2,$3,$4,$5,$6,clock_timestamp()+interval '2 hours') ON CONFLICT DO NOTHING RETURNING id`,
                [sid, mapping.id, assertion.sessionHash, mapping.revision, member.membership_revision, member.security_stamp]);
                session = (await client.query(`/* theme-bridge:session */ SELECT *,(expires_at>clock_timestamp()) AS unexpired
                    FROM theme_seller_bridge_sessions WHERE mapping_id=$1 AND session_hash=$2 FOR SHARE`, [mapping.id, assertion.sessionHash])).rows[0];
                if (!session || session.revoked_at !== null || Number(session.mapping_revision) !== Number(mapping.revision)
                    || Number(session.membership_revision) !== Number(member.membership_revision) || session.security_stamp !== member.security_stamp) fail('THEME_BRIDGE_SESSION_REVOKED');
                // Renewal needs a new signed action and a currently live Stocky session.
                // It cannot un-revoke a lease or survive a mapping/security revision.
                await client.query(`/* theme-bridge:renew */ UPDATE theme_seller_bridge_sessions
                    SET expires_at=clock_timestamp()+interval '2 hours' WHERE id=$1 AND revoked_at IS NULL`, [session.id]);
                if (created.rows.length) await client.query(`INSERT INTO theme_seller_bridge_audit(mapping_id,session_id,event) VALUES($1,$2,'SESSION_OPENED')`, [mapping.id, session.id]);
                await client.query('COMMIT');
            } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; }
            finally { client.release(); }
            const principal = Object.freeze({ kind: 'seller', authentication: 'stocky-theme-bridge', userId: Number(mapping.user_id), bridgeSessionId: session.id });
            branded.set(principal, { assertion, connection, inspect: () => inspect(connection, assertion, runtime, transport || connector.createSafeStockyThemeSellerTransport()) });
            return principal;
        }
    };
}

async function loadThemeSellerBridgeScope(client, principal) {
    const context = branded.get(principal);
    if (!context) fail();
    // Every authorization (including replay lookup and a later write) is live.
    if (context.assertion.expiresAt <= Math.floor(Date.now() / 1000)) fail('THEME_BRIDGE_ASSERTION_EXPIRED');
    const row = (await client.query(`/* theme-bridge:live-scope */ SELECT m.*,s.id AS bridge_session_id,s.membership_revision,s.security_stamp
        FROM theme_seller_bridge_sessions s JOIN theme_seller_bridge_mappings m ON m.id=s.mapping_id
        JOIN stocky_connector_connections c ON c.id=m.connection_id AND c.organization_id=m.organization_id AND c.store_id=m.store_id
        WHERE s.id=$1 AND m.user_id=$2 AND m.active=TRUE AND c.status='active' AND s.revoked_at IS NULL
        AND s.expires_at>clock_timestamp() AND s.mapping_revision=m.revision FOR SHARE OF m,s,c`, [principal.bridgeSessionId, principal.userId])).rows[0];
    if (!row) fail('THEME_BRIDGE_SESSION_REVOKED');
    await context.inspect();
    return row;
}

async function loadThemeSellerBridgeResource(client, principal, table, id) {
    const allowed = ['seller_theme_services','theme_assignments','theme_drafts','theme_assets','theme_previews','theme_publications','theme_operations'];
    if (!allowed.includes(table)) throw new TypeError('Unsupported theme resource');
    const scope = await loadThemeSellerBridgeScope(client, principal);
    const result = await client.query(`SELECT resource.* FROM ${table} resource WHERE resource.id=$1
        AND resource.organization_id=$2 AND resource.store_id=$3
        AND EXISTS(SELECT 1 FROM seller_membership_store_scopes s WHERE s.organization_id=$2 AND s.store_id=$3
            AND s.membership_id=$4 AND s.scope_kind='assigned' AND s.revoked_at IS NULL)`,
    [id, scope.organization_id, scope.store_id, scope.membership_id]);
    return result.rows[0];
}

// Admin metadata/preview can inspect an already authenticated human lease. It
// never opens or renews a lease and the in-process brand cannot permit writes.
async function resolveAdminThemeSellerProjection(client, adminPrincipal, service, options = {}) {
    await require('./themePlatformAuthService').authorize(client, adminPrincipal, 'draft.read', service);
    if (adminPrincipal.kind !== 'admin') fail();
    const row = (await client.query(`SELECT s.id AS bridge_session_id,s.session_hash,m.user_id,m.tenant_id,m.stocky_user_id,c.*
        FROM theme_seller_bridge_sessions s JOIN theme_seller_bridge_mappings m ON m.id=s.mapping_id
        JOIN stocky_connector_connections c ON c.id=m.connection_id AND c.organization_id=m.organization_id AND c.store_id=m.store_id
        WHERE m.organization_id=$1 AND m.store_id=$2 AND m.active=TRUE AND c.status='active'
        AND s.revoked_at IS NULL AND s.expires_at>clock_timestamp() AND s.mapping_revision=m.revision
        ORDER BY s.created_at DESC,s.id LIMIT 1`, [service.organization_id, service.store_id])).rows[0];
    if (!row) return null;
    const runtime = options.runtime || require('./themeStockyDeliveryService').resolveThemeDeliveryRuntime({
        environment: process.env, startupSafety: require('../config/startupSafety').resolveStartupSafety(process.env)
    });
    if (runtime.enabled !== true) fail('THEME_BRIDGE_DISABLED', 404);
    connector.validateEndpointOrigin(row.endpoint_origin, runtime);
    const assertion = {tenantId:row.tenant_id,humanUserId:Number(row.stocky_user_id),sessionHash:row.session_hash,
        expiresAt:Math.floor(Date.now()/1000)+15};
    const inspect=async()=> {
        try { await (options.inspect || liveIntrospection)(row, assertion, runtime,
            options.transport || connector.createSafeStockyThemeSellerTransport()); }
        catch(error) {
            if (['ECONNREFUSED','ECONNRESET','ETIMEDOUT','ENOTFOUND','EAI_AGAIN','EHOSTUNREACH','ENETUNREACH'].includes(error.code)) fail('THEME_BRIDGE_UPSTREAM_UNAVAILABLE',503);
            throw error;
        }
    };
    await inspect();
    const principal=Object.freeze({kind:'seller',authentication:'stocky-theme-bridge',userId:Number(row.user_id),bridgeSessionId:row.bridge_session_id});
    branded.set(principal,{assertion,connection:row,inspect,readOnlyProjection:true});
    return principal;
}
module.exports = { createThemeSellerBridge, isThemeSellerBridgePrincipal, loadThemeSellerBridgeScope,
    loadThemeSellerBridgeResource, resolveAdminThemeSellerProjection, permitsThemeSellerBridgeAction,
    validateAssertion, liveIntrospection, canonical, digest, INTROSPECT_PATH };
