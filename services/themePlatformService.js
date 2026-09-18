'use strict';

const crypto = require('node:crypto');
const v = require('./themePlatformValidation');
const { authorize } = require('./themePlatformAuthService');

const emptyOverrides = () => ({ tokens: {}, components: [], assetIds: [] });
const spec = Object.freeze({
    createTheme: ['catalog.write', null], createVersion: ['version.create', null], publishVersion: ['version.create', null],
    createService: ['service.manage', null], updateService: ['service.manage', 'service'],
    assign: ['assignment.manage', 'service'], withdraw: ['assignment.manage', 'assignment'],
    entitlement: ['entitlement.manage', 'service'], accept: ['assignment.accept', 'assignment'],
    saveDraft: ['draft.edit', 'draft', 'theme.editor'], preview: ['preview.create', 'draft', 'theme.editor'],
    registerAsset: ['asset.register', 'service', 'theme.editor'], publication: ['publication.request', 'draft', 'theme.publish'],
    rollback: ['rollback.request', 'publication', 'theme.publish']
});
const resourceTables = Object.freeze({ service: 'seller_theme_services', assignment: 'theme_assignments',
    draft: 'theme_drafts', asset: 'theme_assets', preview: 'theme_previews', publication: 'theme_publications', operation: 'theme_operations' });
const readSpec = Object.freeze({
    themes: ['catalog.read'], theme: ['catalog.read'], version: ['catalog.read'], services: ['service.read'],
    service: ['service.read', 'service'], assignments: ['assignment.read'], assignment: ['assignment.read', 'assignment'],
    capabilities: ['assignment.read', 'service'], entitlements: ['entitlement.read', 'service'],
    draft: ['draft.read', 'draft'], asset: ['asset.read', 'asset'], preview: ['preview.read', 'preview'],
    publication: ['publication.read', 'publication'], operation: ['operation.read', 'operation'], audit: ['audit.read', 'service']
});
const one = async (client, sql, args = []) => (await client.query(sql, args)).rows[0];
const rows = async (client, sql, args = []) => (await client.query(sql, args)).rows;
const found = (value) => { if (!value) v.fail('THEME_RESOURCE_NOT_FOUND', 404); return value; };
const scope = (service) => [service.id, service.organization_id, service.store_id];
const checkRevision = (row, expected, column = 'revision') => {
    if (Number(row[column]) !== expected) v.fail('THEME_REVISION_CONFLICT', 409);
};
const serviceFields = ['plan', 'status', 'startsAt', 'expiresAt'];
const validateCommand = (action, body, params, meta) => {
    if (!spec[action]) v.fail('THEME_UNKNOWN_ACTION', 404);
    const fields = {
        createTheme: ['slug', 'name'], createVersion: ['version', 'document', 'status'], publishVersion: ['expectedRevision'],
        createService: ['storeId', ...serviceFields], updateService: ['expectedRevision', ...serviceFields],
        assign: ['themeVersionId', 'channel'], withdraw: ['expectedRevision'], accept: ['expectedRevision'],
        entitlement: ['expectedRevision', 'effect', 'quota', 'startsAt', 'expiresAt'],
        saveDraft: ['expectedRevision', 'overrides'], preview: ['expectedRevision'], registerAsset: ['bytesBase64'],
        publication: ['expectedRevision'], rollback: []
    }[action];
    v.keys(body, [...fields, 'reason'], [...fields, 'reason']); v.text(body.reason, 240);
    if (!/^[A-Za-z0-9._:-]{8,128}$/u.test(meta.idempotencyKey || '')) v.fail('THEME_IDEMPOTENCY_KEY_REQUIRED');
    if (body.expectedRevision !== undefined) {
        v.integer(body.expectedRevision);
        if (meta.ifMatch !== undefined && meta.ifMatch !== `"${body.expectedRevision}"`) v.fail('THEME_REVISION_HEADER_MISMATCH', 409);
    } else if (meta.ifMatch !== undefined) v.fail('THEME_UNEXPECTED_REVISION_HEADER');
    for (const [key, value] of Object.entries(params)) { if (key === 'featureCode') v.text(value, 80); else v.uuid(value); }
    if (action === 'createTheme') { v.identifier(body.slug); if (body.slug.includes('_')) v.fail('THEME_INVALID_IDENTIFIER'); v.text(body.name, 160); }
    if (action === 'createVersion') { v.text(body.version, 40); if (!/^[A-Za-z0-9._-]+$/u.test(body.version)) v.fail('THEME_INVALID_VERSION'); v.document(body.document); v.choice(body.status, ['DRAFT', 'PUBLISHED']); }
    if (action === 'createService') v.integer(body.storeId);
    if (['createService', 'updateService'].includes(action)) { v.choice(body.plan, ['basic', 'pro']); v.choice(body.status, ['ACTIVE', 'SUSPENDED', 'REVOKED']); }
    if (Object.hasOwn(body, 'startsAt')) {
        v.date(body.startsAt); v.date(body.expiresAt, true);
        if (body.expiresAt && Date.parse(body.expiresAt) <= Date.parse(body.startsAt)) v.fail('THEME_INVALID_SERVICE_WINDOW');
    }
    if (action === 'assign') { v.uuid(body.themeVersionId); v.choice(body.channel, ['web', 'app']); }
    if (action === 'entitlement') { v.choice(body.effect, ['ALLOW', 'DENY']); if (body.quota !== null) v.integer(body.quota, 0, Number.MAX_SAFE_INTEGER); }
    if (action === 'registerAsset') v.upload(body.bytesBase64);
    return body;
};

const transaction = async (database, work) => {
    const client = await database.connect();
    try {
        await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');
        await client.query("SET LOCAL lock_timeout='5s'");
        await client.query("SET LOCAL statement_timeout='15s'");
        const result = await work(client);
        await client.query('COMMIT');
        return result;
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        if (['23505', '23503', '23514', '55000'].includes(error.code)) v.fail('THEME_CONSTRAINT_CONFLICT', 409);
        if (['40001', '40P01', '55P03', '57014'].includes(error.code)) v.fail('THEME_RETRYABLE_CONFLICT', 409);
        throw error;
    } finally { client.release(); }
};

const loadResource = async (client, type, id) => {
    const table = resourceTables[type];
    if (!table) throw new TypeError('Unknown theme resource');
    return found(await one(client, `SELECT * FROM ${table} WHERE id=$1`, [v.uuid(id)]));
};
const loadScope = async (client, type, params, principal) => {
    if (!type) return { service: null, resource: null };
    const idSelector = v.uuid(params[`${type}Id`]);
    // Ownership is in the SQL predicate before reading a resource or locking its
    // service. Full live role/session validation still runs under locks below.
    const resource = principal.kind === 'seller'
        ? found(await one(client, `SELECT resource.* FROM ${resourceTables[type]} resource WHERE resource.id=$1
            AND EXISTS(SELECT 1 FROM seller_sessions session
                JOIN seller_memberships member ON member.id=session.membership_id AND member.organization_id=session.organization_id
                JOIN seller_membership_store_scopes assigned ON assigned.membership_id=member.id AND assigned.organization_id=member.organization_id
                WHERE session.id=$2 AND session.user_id=$3 AND session.audience='seller' AND session.status='active'
                AND session.expires_at>clock_timestamp() AND member.status='active'
                AND member.membership_revision=session.membership_revision AND member.security_stamp=session.security_stamp
                AND assigned.revoked_at IS NULL AND assigned.scope_kind='assigned'
                AND resource.organization_id=assigned.organization_id AND resource.store_id=assigned.store_id)`,
        [idSelector, principal.sessionId, principal.userId]))
        : await loadResource(client, type, idSelector);
    if (type === 'operation' && resource.service_id === null) return { service: null, resource };
    const id = type === 'service' ? resource.id : resource.service_id;
    const service = found(await one(client, 'SELECT * FROM seller_theme_services WHERE id=$1 FOR UPDATE', [id]));
    // Reload after acquiring the parent lock: another transaction may have changed the child.
    return { service, resource: type === 'service' ? service : await loadResource(client, type, resource.id) };
};
const activeService = async (client, service) => {
    if (!service || service.status !== 'ACTIVE') v.fail('THEME_SERVICE_INACTIVE', 403);
    const { active } = await one(client, 'SELECT $1::timestamptz<=clock_timestamp() AND ($2::timestamptz IS NULL OR $2::timestamptz>clock_timestamp()) AS active', [service.starts_at, service.expires_at]);
    if (!active) v.fail('THEME_SERVICE_EXPIRED', 403);
};
const effective = async (client, service, code) => {
    const feature = await one(client, 'SELECT * FROM feature_catalog WHERE code=$1 FOR SHARE', [code]);
    if (!feature || !feature.enabled) return { code, allowed: false, quota: null, reason: 'UNKNOWN_OR_DISABLED' };
    const plan = await one(client, 'SELECT * FROM plan_feature_defaults WHERE plan=$1 AND feature_code=$2 FOR SHARE', [service.plan, code]);
    const override = await one(client, `SELECT * FROM seller_feature_entitlements WHERE service_id=$1 AND feature_code=$2
        AND starts_at<=clock_timestamp() AND (expires_at IS NULL OR expires_at>clock_timestamp()) FOR SHARE`, [service.id, code]);
    if (override?.effect === 'DENY' || plan?.effect === 'DENY') {
        // Explicit plan deny is a policy ceiling; an absent or ALLOW default can be overridden.
        return { code, allowed: false, quota: null, reason: 'EXPLICIT_DENY' };
    }
    const source = override || plan;
    const quota = source?.quota === null || source?.quota === undefined ? null : Number(source.quota);
    const allowed = source?.effect === 'ALLOW' && (feature.kind !== 'quota' || (Number.isSafeInteger(quota) && quota >= 0));
    return { code, allowed, quota, reason: allowed ? 'GRANTED' : 'NO_GRANT' };
};
const requireFeature = async (client, service, code) => {
    await activeService(client, service);
    const value = await effective(client, service, code);
    if (!value.allowed) v.fail('THEME_FEATURE_DENIED', 403);
    return value;
};
const assignmentActive = async (client, draftOrAssignment) => {
    const assignment = draftOrAssignment.assignment_id
        ? found(await one(client, 'SELECT * FROM theme_assignments WHERE id=$1', [draftOrAssignment.assignment_id])) : draftOrAssignment;
    if (assignment.status === 'WITHDRAWN') v.fail('THEME_ASSIGNMENT_WITHDRAWN', 409);
    return assignment;
};
const baseForDraft = async (client, draft) => {
    const assignment = await assignmentActive(client, draft);
    const version = found(await one(client, "SELECT * FROM theme_versions WHERE id=$1 AND status='PUBLISHED'", [assignment.theme_version_id]));
    return { assignment, version };
};
const ensureAssets = async (client, service, input) => {
    const ids = v.references(input);
    if (!ids.length) return;
    const owned = await rows(client, `SELECT id FROM theme_assets WHERE service_id=$1 AND organization_id=$2 AND store_id=$3
        AND id=ANY($4::uuid[]) AND status='READY' FOR SHARE`, [...scope(service), ids]);
    if (owned.length !== ids.length) v.fail('THEME_ASSET_UNAVAILABLE', 404);
};
const verifyOverrideFeatures = async (client, service, overrides, base) => {
    for (const item of overrides.components) {
        const type = base.components.find((part) => part.id === item.componentId)?.type;
        if (type === 'header') await requireFeature(client, service, 'theme.custom_header');
        if (type === 'campaign') await requireFeature(client, service, 'theme.advanced_blocks');
    }
};
const verifyPreview = async (client, service, preview) => {
    const { active } = await one(client, 'SELECT $1::timestamptz>clock_timestamp() AS active', [preview.expires_at]);
    if (!active || preview.status !== 'READY' || Number(preview.artifact.policyRevision) !== Number(service.policy_revision)) v.fail('THEME_PREVIEW_EXPIRED', 410);
    const draft = found(await one(client, 'SELECT * FROM theme_drafts WHERE id=$1', [preview.draft_id]));
    const { version, assignment } = await baseForDraft(client, draft);
    await requireFeature(client, service, 'theme.editor');
    if (assignment.channel === 'app') await requireFeature(client, service, 'theme.mobile_customization');
    const snapshot = found(await one(client, 'SELECT overrides FROM theme_draft_revisions WHERE draft_id=$1 AND revision=$2', [draft.id, preview.draft_revision]));
    await verifyOverrideFeatures(client, service, snapshot.overrides, version.document);
    await ensureAssets(client, service, snapshot.overrides);
};
const verifyDraftRead = async (client, service, draft, overrides = draft.overrides) => {
    await requireFeature(client, service, 'theme.editor');
    const { version, assignment } = await baseForDraft(client, draft);
    if (assignment.channel === 'app') await requireFeature(client, service, 'theme.mobile_customization');
    await verifyOverrideFeatures(client, service, overrides, version.document);
    await ensureAssets(client, service, overrides);
};
const verifyPublicationRead = async (client, service, publication) => {
    await requireFeature(client, service, 'theme.publish');
    const draft = await loadResource(client, 'draft', publication.draft_id);
    const snapshot = found(await one(client, 'SELECT overrides FROM theme_draft_revisions WHERE draft_id=$1 AND revision=$2', [draft.id, publication.draft_revision]));
    await verifyDraftRead(client, service, draft, snapshot.overrides);
};
const verifyStoredResult = async (client, service, operation) => {
    if (operation.type === 'preview') {
        await verifyPreview(client, service, await loadResource(client, 'preview', operation.result.id));
    }
    if (operation.type === 'saveDraft') {
        const draft = await loadResource(client, 'draft', operation.result.id);
        await verifyDraftRead(client, service, draft, operation.result.overrides);
    }
    if (operation.type === 'publication') await verifyPublicationRead(client, service, await loadResource(client, 'publication', operation.result.id));
    if (operation.type === 'registerAsset') await requireFeature(client, service, 'theme.asset_bytes');
    if (operation.type === 'accept') await assignmentActive(client, await loadResource(client, 'assignment', operation.result.id));
};
const auditMetadata = (value) => {
    if (!value) return null;
    const permitted = ['id', 'status', 'revision', 'policy_revision', 'theme_version_id', 'channel', 'digest', 'feature_code', 'effect', 'quota', 'plan'];
    return Object.fromEntries(permitted.filter((key) => Object.hasOwn(value, key)).map((key) => [key, value[key]]));
};
const auditReason = (reason) => reason
    .replace(/\bBearer\s+\S+/giu, 'Bearer [REDACTED]')
    .replace(/\b(?:eyJ[A-Za-z0-9_-]+\.)[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/gu, '[REDACTED]')
    .replace(/\b(?:password|passwd|secret|token|api[_-]?key|authorization)\s*[:=]\s*\S+/giu, '[REDACTED]');
const appendAudit = async (client, { service, actor, action, target, before, after, correlationId, reason }) => {
    await client.query(`INSERT INTO theme_audit_events(id,service_id,organization_id,store_id,actor_id,effective_actor,action,
        target_type,target_id,before_state,after_state,correlation_id,reason) VALUES($1,$2,$3,$4,$5,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [crypto.randomUUID(), ...(service ? scope(service) : [null, null, null]), actor.actorId, action, target.type, target.id,
        auditMetadata(before), auditMetadata(after), correlationId, auditReason(reason)]);
};
const addOutbox = async (client, service, operationId, eventType, result) => {
    const payload = { schemaVersion: 1, serviceId: service.id, organizationId: String(service.organization_id),
        storeId: String(service.store_id), operationId, eventType, result: auditMetadata(result) };
    await client.query(`INSERT INTO theme_outbox(id,service_id,organization_id,store_id,operation_id,event_type,payload,payload_hash)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, [crypto.randomUUID(), ...scope(service), operationId, eventType, payload, v.digest(payload)]);
};

const createThemePlatformService = (database) => {
    if (!database || typeof database.connect !== 'function') throw new TypeError('Theme Platform requires a PostgreSQL pool');
    const execute = async (principal, action, params = {}, body = {}, meta = {}) => {
        validateCommand(action, body, params, meta);
        return transaction(database, async (client) => {
            const [permission, resourceType, feature] = spec[action];
            let { service, resource } = await loadScope(client, resourceType, params, principal);
            const actor = await authorize(client, principal, permission, service);
            let serviceCreated = false;
            if (action === 'createService') {
                // Serialize first provisioning on the already-authoritative store.
                // The service must exist before its scoped ledger/outbox FK can be
                // inserted, but all of them still commit or roll back together.
                const store = found(await one(client, `SELECT st.id,st.organization_id FROM seller_stores st JOIN seller_organizations org ON org.id=st.organization_id
                    WHERE st.id=$1 AND st.status='active' AND st.closed_at IS NULL AND org.status='active' AND org.closed_at IS NULL
                    FOR UPDATE OF st FOR SHARE OF org`, [body.storeId]));
                service = await one(client, 'SELECT * FROM seller_theme_services WHERE organization_id=$1 AND store_id=$2', [store.organization_id, store.id]);
                if (!service) {
                    const binding = await one(client, 'SELECT id FROM stocky_connector_connections WHERE organization_id=$1 AND store_id=$2 ORDER BY created_at DESC LIMIT 1', [store.organization_id, store.id]);
                    service = await one(client, `INSERT INTO seller_theme_services(id,organization_id,store_id,external_binding_id,plan,status,starts_at,expires_at)
                        VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`, [crypto.randomUUID(), store.organization_id, store.id, binding?.id || null, body.plan, body.status, body.startsAt, body.expiresAt]);
                    serviceCreated = true;
                }
                // An existing service is only inspected for replay or rejected.
                // Do not take its row lock after the store lock: ordinary scoped
                // operations lock service then membership/store authority.
            }
            if (principal.kind === 'seller') await activeService(client, service);
            if (feature) await requireFeature(client, service, feature);
            if (action === 'publication') await requireFeature(client, service, 'theme.editor');
            if (service && ['saveDraft', 'preview', 'publication'].includes(action)) {
                const { assignment, version } = await baseForDraft(client, resource);
                if (assignment.channel === 'app') await requireFeature(client, service, 'theme.mobile_customization');
                const proposed = action === 'saveDraft' ? body.overrides : resource.overrides;
                v.overrides(proposed, version.document);
                await verifyOverrideFeatures(client, service, proposed, version.document);
            }
            if (action === 'registerAsset') await requireFeature(client, service, 'theme.asset_bytes');
            if (action === 'accept') await assignmentActive(client, resource);
            const scopeKey = service?.id || 'global';
            const requestHash = v.digest({ action, params, body });
            await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`theme:${scopeKey}:${actor.actorId}:${meta.idempotencyKey}`]);
            const previous = await one(client, 'SELECT * FROM theme_operations WHERE scope_key=$1 AND actor_id=$2 AND idempotency_key=$3', [scopeKey, actor.actorId, meta.idempotencyKey]);
            if (previous) {
                if (previous.request_hash !== requestHash) v.fail('THEME_IDEMPOTENCY_PAYLOAD_CONFLICT', 409);
                await verifyStoredResult(client, service, previous);
                return { operationId: previous.id, status: previous.status, result: previous.result };
            }
            if (action === 'createService' && !serviceCreated) v.fail('THEME_SERVICE_ALREADY_EXISTS', 409);
            const operationId = crypto.randomUUID();
            const correlationId = crypto.randomUUID();
            await client.query(`INSERT INTO theme_operations(id,service_id,organization_id,store_id,scope_key,actor_id,type,status,
                idempotency_key,request_hash,correlation_id,result) VALUES($1,$2,$3,$4,$5,$6,$7,'REQUESTED',$8,$9,$10,'{}'::jsonb)`,
            [operationId, ...(service ? scope(service) : [null, null, null]), scopeKey, actor.actorId, action, meta.idempotencyKey, requestHash, correlationId]);
            let result; let target; let status = 'COMPLETED'; let event = `theme.${action}`; let failureReason = null;
            if (action === 'createTheme') {
                result = await one(client, 'INSERT INTO themes(id,slug,name) VALUES($1,$2,$3) RETURNING *', [crypto.randomUUID(), body.slug, body.name]);
                target = { type: 'theme', id: result.id };
            } else if (action === 'createVersion') {
                found(await one(client, "SELECT id FROM themes WHERE id=$1 AND status='ACTIVE' FOR SHARE", [params.themeId]));
                result = await one(client, 'INSERT INTO theme_versions(id,theme_id,version,status,document,digest) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',
                    [crypto.randomUUID(), params.themeId, body.version, body.status, body.document, v.digest(body.document)]);
                target = { type: 'theme_version', id: result.id };
            } else if (action === 'publishVersion') {
                const version = found(await one(client, 'SELECT * FROM theme_versions WHERE id=$1 FOR UPDATE', [params.versionId]));
                checkRevision(version, body.expectedRevision);
                if (version.status !== 'DRAFT') v.fail('THEME_VERSION_IMMUTABLE', 409);
                v.document(version.document);
                result = await one(client, "UPDATE theme_versions SET status='PUBLISHED',digest=$2,revision=revision+1,updated_at=clock_timestamp() WHERE id=$1 RETURNING *", [version.id, v.digest(version.document)]);
                target = { type: 'theme_version', id: result.id }; resource = version;
            } else if (action === 'createService') {
                result = service;
                target = { type: 'seller_theme_service', id: result.id };
            } else if (action === 'updateService') {
                checkRevision(service, body.expectedRevision);
                result = await one(client, `UPDATE seller_theme_services SET plan=$2,status=$3,starts_at=$4,expires_at=$5,
                    revision=revision+1,policy_revision=policy_revision+1,updated_at=clock_timestamp() WHERE id=$1 RETURNING *`,
                [service.id, body.plan, body.status, body.startsAt, body.expiresAt]);
                target = { type: 'seller_theme_service', id: result.id };
            } else if (action === 'assign') {
                await activeService(client, service);
                found(await one(client, `SELECT version.id FROM theme_versions version JOIN themes theme ON theme.id=version.theme_id
                    WHERE version.id=$1 AND version.status='PUBLISHED' AND theme.status='ACTIVE' FOR SHARE`, [body.themeVersionId]));
                const assignment = await one(client, `INSERT INTO theme_assignments(id,service_id,organization_id,store_id,theme_version_id,channel)
                    VALUES($1,$2,$3,$4,$5,$6) RETURNING *`, [crypto.randomUUID(), ...scope(service), body.themeVersionId, body.channel]);
                const overrides = emptyOverrides();
                const draft = await one(client, `INSERT INTO theme_drafts(id,service_id,organization_id,store_id,assignment_id,overrides)
                    VALUES($1,$2,$3,$4,$5,$6) RETURNING *`, [crypto.randomUUID(), ...scope(service), assignment.id, overrides]);
                await client.query(`INSERT INTO theme_draft_revisions(id,service_id,organization_id,store_id,draft_id,revision,overrides,digest)
                    VALUES($1,$2,$3,$4,$5,1,$6,$7)`, [crypto.randomUUID(), ...scope(service), draft.id, overrides, v.digest(overrides)]);
                result = { assignment, draft }; target = { type: 'theme_assignment', id: assignment.id }; event = 'theme.assigned';
            } else if (action === 'withdraw' || action === 'accept') {
                checkRevision(resource, body.expectedRevision); await assignmentActive(client, resource);
                const nextStatus = action === 'accept' ? 'ACCEPTED' : 'WITHDRAWN';
                if (resource.status === nextStatus) v.fail('THEME_ASSIGNMENT_STATE_CONFLICT', 409);
                result = await one(client, `UPDATE theme_assignments SET status=$2,revision=revision+1,updated_at=clock_timestamp(),
                    accepted_at=CASE WHEN $2='ACCEPTED' THEN clock_timestamp() ELSE accepted_at END,
                    withdrawn_at=CASE WHEN $2='WITHDRAWN' THEN clock_timestamp() ELSE withdrawn_at END WHERE id=$1 RETURNING *`, [resource.id, nextStatus]);
                target = { type: 'theme_assignment', id: resource.id };
            } else if (action === 'entitlement') {
                checkRevision(service, body.expectedRevision, 'policy_revision');
                const catalog = found(await one(client, 'SELECT * FROM feature_catalog WHERE code=$1 FOR SHARE', [params.featureCode]));
                if (catalog.kind === 'quota' && body.effect === 'ALLOW' && body.quota === null) v.fail('THEME_QUOTA_REQUIRED');
                if (catalog.kind === 'boolean' && body.quota !== null) v.fail('THEME_BOOLEAN_QUOTA_FORBIDDEN');
                const before = await one(client, 'SELECT * FROM seller_feature_entitlements WHERE service_id=$1 AND feature_code=$2', [service.id, params.featureCode]);
                resource = before || null;
                result = await one(client, `INSERT INTO seller_feature_entitlements(service_id,organization_id,store_id,feature_code,effect,quota,starts_at,expires_at)
                    VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(service_id,organization_id,store_id,feature_code) DO UPDATE SET effect=EXCLUDED.effect,quota=EXCLUDED.quota,
                    starts_at=EXCLUDED.starts_at,expires_at=EXCLUDED.expires_at,revision=seller_feature_entitlements.revision+1,updated_at=clock_timestamp() RETURNING *`,
                [...scope(service), params.featureCode, body.effect, body.quota, body.startsAt, body.expiresAt]);
                await client.query('UPDATE seller_theme_services SET policy_revision=policy_revision+1,revision=revision+1,updated_at=clock_timestamp() WHERE id=$1', [service.id]);
                result = { ...result, policy_revision: Number(service.policy_revision) + 1 };
                target = { type: 'entitlement', id: `${service.id}:${params.featureCode}` }; event = body.effect === 'ALLOW' ? 'theme.feature.enabled' : 'theme.feature.disabled';
            } else if (action === 'saveDraft') {
                checkRevision(resource, body.expectedRevision);
                const { version } = await baseForDraft(client, resource);
                v.overrides(body.overrides, version.document);
                await verifyOverrideFeatures(client, service, body.overrides, version.document);
                await ensureAssets(client, service, body.overrides);
                result = await one(client, `UPDATE theme_drafts SET overrides=$2,revision=revision+1,updated_at=clock_timestamp() WHERE id=$1 AND revision=$3 RETURNING *`, [resource.id, body.overrides, body.expectedRevision]);
                if (!result) v.fail('THEME_REVISION_CONFLICT', 409);
                await client.query(`INSERT INTO theme_draft_revisions(id,service_id,organization_id,store_id,draft_id,revision,overrides,digest)
                    VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, [crypto.randomUUID(), ...scope(service), result.id, result.revision, body.overrides, v.digest(body.overrides)]);
                target = { type: 'theme_draft', id: result.id }; event = 'theme.draft.updated';
            } else if (action === 'preview' || action === 'publication') {
                checkRevision(resource, body.expectedRevision);
                const { version, assignment } = await baseForDraft(client, resource);
                v.overrides(resource.overrides, version.document); await ensureAssets(client, service, resource.overrides);
                await verifyOverrideFeatures(client, service, resource.overrides, version.document);
                const artifact = { themeVersionId: version.id, baseDigest: version.digest, draftRevision: resource.revision,
                    policyRevision: service.policy_revision, channel: assignment.channel, document: v.artifact(version.document, resource.overrides) };
                const digest = v.digest(artifact);
                if (action === 'preview') {
                    result = await one(client, `INSERT INTO theme_previews(id,service_id,organization_id,store_id,draft_id,draft_revision,artifact,digest,status,expires_at)
                        VALUES($1,$2,$3,$4,$5,$6,$7,$8,'READY',clock_timestamp()+INTERVAL '15 minutes') RETURNING *`,
                    [crypto.randomUUID(), ...scope(service), resource.id, resource.revision, artifact, digest]);
                    target = { type: 'theme_preview', id: result.id };
                } else {
                    result = await one(client, `INSERT INTO theme_publications(id,service_id,organization_id,store_id,draft_id,draft_revision,operation_id,artifact,digest,policy_revision,status)
                        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'PUBLICATION_REQUESTED') RETURNING *`,
                    [crypto.randomUUID(), ...scope(service), resource.id, resource.revision, operationId, artifact, digest, service.policy_revision]);
                    target = { type: 'theme_publication', id: result.id }; event = 'theme.publication.requested'; status = 'REQUESTED';
                }
            } else if (action === 'registerAsset') {
                const media = v.upload(body.bytesBase64);
                const capacity = await requireFeature(client, service, 'theme.asset_bytes');
                const used = await one(client, "SELECT COALESCE(SUM(byte_size),0) AS total FROM theme_assets WHERE service_id=$1 AND status<>'REJECTED'", [service.id]);
                if (Number(used.total) + media.byteSize > capacity.quota) v.fail('THEME_ASSET_QUOTA_EXCEEDED', 403);
                const id = crypto.randomUUID();
                result = await one(client, `INSERT INTO theme_assets(id,service_id,organization_id,store_id,detected_mime,byte_size,digest,storage_key,status)
                    VALUES($1,$2,$3,$4,$5,$6,$7,$8,'QUARANTINED') RETURNING *`,
                [id, ...scope(service), media.detectedMime, media.byteSize, media.digest, `theme-quarantine/${service.id}/${id}`]);
                // No storage driver is wired in Wave 1. Metadata registration cannot mark upload READY.
                result = { ...result, storageReady: false }; target = { type: 'theme_asset', id };
            } else if (action === 'rollback') {
                status = 'BLOCKED'; failureReason = 'THEME_VERIFIED_DEPLOYMENT_REQUIRED';
                result = { publicationId: resource.id, state: 'BLOCKED', reason: failureReason, livePointerChanged: false };
                target = { type: 'theme_publication', id: resource.id }; event = 'theme.rollback.requested';
            }
            await appendAudit(client, { service, actor, action: event, target, before: resource,
                after: result.assignment || result, correlationId, reason: body.reason });
            if (service) await addOutbox(client, service, operationId, event, result.assignment || result);
            await client.query('UPDATE theme_operations SET status=$2,result=$3,failure_reason=$4,updated_at=clock_timestamp() WHERE id=$1', [operationId, status, result, failureReason]);
            return { operationId, status, result };
        });
    };

    const read = (principal, action, params = {}) => transaction(database, async (client) => {
        if (!readSpec[action]) v.fail('THEME_RESOURCE_NOT_FOUND', 404);
        const [permission, type] = readSpec[action];
        const { service, resource } = await loadScope(client, type, params, principal);
        const actor = await authorize(client, principal, permission, service);
        if (principal.kind === 'seller' && service) await activeService(client, service);
        if (action === 'themes') return rows(client, "SELECT id,slug,name,status,revision FROM themes ORDER BY slug LIMIT 200");
        if (action === 'theme') {
            const theme = found(await one(client, 'SELECT * FROM themes WHERE id=$1', [v.uuid(params.themeId)]));
            return { ...theme, versions: await rows(client, 'SELECT id,version,status,digest,revision FROM theme_versions WHERE theme_id=$1 ORDER BY created_at DESC LIMIT 100', [theme.id]) };
        }
        if (action === 'version') {
            const version = found(await one(client, 'SELECT * FROM theme_versions WHERE id=$1', [v.uuid(params.versionId)]));
            if (actor.role !== 'support') return version;
            const { document, ...metadata } = version;
            return metadata;
        }
        if (action === 'services') return principal.kind === 'seller'
            ? rows(client, 'SELECT * FROM seller_theme_services WHERE organization_id=$1 AND store_id=ANY($2::bigint[]) ORDER BY created_at DESC,id LIMIT 200', [actor.organizationId, actor.storeIds])
            : rows(client, 'SELECT * FROM seller_theme_services ORDER BY created_at DESC,id LIMIT 200');
        if (action === 'assignments') return rows(client, `SELECT a.*,d.id AS draft_id FROM theme_assignments a JOIN theme_drafts d ON d.assignment_id=a.id
            JOIN seller_theme_services s ON s.id=a.service_id WHERE a.organization_id=$1 AND a.store_id=ANY($2::bigint[])
            AND a.status<>'WITHDRAWN' AND s.status='ACTIVE' AND s.starts_at<=clock_timestamp()
            AND (s.expires_at IS NULL OR s.expires_at>clock_timestamp()) ORDER BY a.created_at DESC,a.id LIMIT 200`, [actor.organizationId, actor.storeIds]);
        if (action === 'entitlements') return { policyRevision: service.policy_revision,
            items: await rows(client, 'SELECT * FROM seller_feature_entitlements WHERE service_id=$1 ORDER BY feature_code', [service.id]) };
        if (action === 'capabilities') {
            const features = await rows(client, 'SELECT code FROM feature_catalog ORDER BY code');
            const decisions = [];
            for (const { code } of features) decisions.push(await effective(client, service, code));
            return { serviceId: service.id, policyRevision: service.policy_revision, role: actor.role, permissions: actor.permissions, features: decisions };
        }
        if (action === 'audit') return rows(client, 'SELECT * FROM theme_audit_events WHERE service_id=$1 ORDER BY created_at DESC,id LIMIT 200', [service.id]);
        if (action === 'operation') {
            if (principal.kind === 'seller' && resource.actor_id !== actor.actorId) v.fail('THEME_RESOURCE_NOT_FOUND', 404);
            // Avoid exposing stored draft/asset/entitlement mutation payloads through a lower permission.
            const required = spec[resource.type];
            if (!required) v.fail('THEME_RESOURCE_NOT_FOUND', 404);
            await authorize(client, principal, required[0], service);
            if (principal.kind === 'seller' && required[2]) await requireFeature(client, service, required[2]);
            await verifyStoredResult(client, service, resource);
            return { id: resource.id, status: resource.status, type: resource.type, attempts: resource.attempts,
                failureReason: resource.failure_reason, correlationId: resource.correlation_id, result: resource.result };
        }
        if (action === 'preview') {
            await verifyPreview(client, service, resource);
        }
        if (action === 'draft') await verifyDraftRead(client, service, resource);
        if (action === 'publication') await verifyPublicationRead(client, service, resource);
        if (action === 'asset') await requireFeature(client, service, 'theme.asset_bytes');
        if (action === 'assignment') await assignmentActive(client, resource);
        return resource;
    });

    // Internal persistence primitive. A future signed receiver must supply a server-resolved
    // service mapping; this function is deliberately not exposed through HTTP in Wave 1.
    const receiveInbox = ({ serviceId, source, eventId, payload }) => transaction(database, async (client) => {
        v.uuid(serviceId); v.uuid(eventId); v.identifier(source);
        v.keys(payload, ['operationId', 'status', 'digest'], ['operationId', 'status', 'digest']);
        v.uuid(payload.operationId); v.choice(payload.status, ['RECEIVED', 'PROCESSED']);
        if (!/^[0-9a-f]{64}$/u.test(payload.digest || '')) v.fail('THEME_INVALID_DIGEST');
        const service = found(await one(client, 'SELECT * FROM seller_theme_services WHERE id=$1 FOR UPDATE', [serviceId]));
        const operation = found(await one(client, 'SELECT id FROM theme_operations WHERE id=$1 AND service_id=$2', [payload.operationId, serviceId]));
        await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`theme-inbox:${source}:${eventId}`]);
        const hash = v.digest({ serviceId, payload });
        const existing = await one(client, 'SELECT * FROM theme_inbox WHERE source=$1 AND event_id=$2', [source, eventId]);
        if (existing) {
            if (existing.payload_hash !== hash || existing.service_id !== serviceId) v.fail('THEME_INBOX_PAYLOAD_CONFLICT', 409);
            return existing;
        }
        return one(client, `INSERT INTO theme_inbox(id,service_id,organization_id,store_id,source,event_id,payload_hash,status,receipt)
            VALUES($1,$2,$3,$4,$5,$6,$7,'RECEIVED',$8) RETURNING *`,
        [crypto.randomUUID(), ...scope(service), source, eventId, hash, { operationId: operation.id, state: 'RECEIVED', deliveryVerified: false }]);
    });
    return Object.freeze({ execute, read, receiveInbox });
};

module.exports = Object.freeze({ createThemePlatformService, effective, requireFeature, transaction, validateCommand, spec, readSpec });
