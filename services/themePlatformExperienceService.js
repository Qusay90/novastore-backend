'use strict';

const crypto = require('node:crypto');
const v = require('./themePlatformValidation');
const f = require('./themePlatformService');
const policy = require('./themePlatformExperiencePolicy');
const { authorize } = require('./themePlatformAuthService');
const { prepareThemePackage } = require('./themePlatformPackageService');
const { loadPresentation, presentationMetadata, requireAssignablePresentation } = require('./themePlatformPresentationService');
const { createThemeAssetStorage, decodeBase64 } = require('./themePlatformAssetStorage');
const { one, rows, found, scope, checkRevision } = f;
const spec = Object.freeze({
    configureExperience: ['entitlement.manage', 'service'], createOffer: ['assignment.manage', 'service'],
    prepareOffer: ['assignment.manage', 'offer'], importPackage: ['version.create', null],
    storeAsset: ['asset.register', 'service'], saveProfile: ['entitlement.manage', null]
});
const fields = {
    configureExperience: ['expectedRevision', 'profileCode', 'overrides'],
    createOffer: ['themeVersionId', 'channel', 'commerceMode', 'profileCode', 'overrides', 'expectedRevision'],
    prepareOffer: ['expectedRevision'], importPackage: ['package'], storeAsset: ['bytesBase64'],
    saveProfile: ['expectedRevision', 'code', 'name', 'capabilities']
};
const profileCode = (code) => { if (typeof code !== 'string' || !/^[A-Z][A-Z0-9_]{1,63}$/u.test(code)) v.fail('THEME_INVALID_PROFILE'); return code; };
const candidateFields = row => ({theme_version_id:row.theme_version_id,channel:row.channel,commerce_mode:row.commerce_mode});
const loadOffer = async (client, principal, offerId) => {
    const candidate = found(await one(client, 'SELECT service_id FROM theme_offers WHERE id=$1', [v.uuid(offerId)]));
    const { service } = await f.loadScope(client, 'service', { serviceId: candidate.service_id }, principal);
    return { service, offer: found(await one(client, 'SELECT * FROM theme_offers WHERE id=$1 AND service_id=$2', [offerId, service.id])) };
};
const configure = async (client, service, code, overrides) => {
    found(await one(client, 'SELECT code FROM theme_experience_profiles WHERE code=$1 FOR SHARE', [code]));
    await client.query(`INSERT INTO theme_service_experiences(service_id,organization_id,store_id,profile_code,overrides)
        VALUES($1,$2,$3,$4,$5) ON CONFLICT(service_id) DO UPDATE SET profile_code=EXCLUDED.profile_code,overrides=EXCLUDED.overrides,
        revision=theme_service_experiences.revision+1,updated_at=clock_timestamp()`, [...scope(service), code, overrides]);
    return one(client, 'UPDATE seller_theme_services SET policy_revision=policy_revision+1,revision=revision+1,updated_at=clock_timestamp() WHERE id=$1 RETURNING *', [service.id]);
};
const profileAuditSnapshot = row => row ? { profile_code: row.code, revision: row.revision,
    editor_policy: { capabilities: row.capabilities } } : null;
const experienceAuditSnapshot = async (client, service) => {
    const row = await one(client, `SELECT e.profile_code,e.overrides,p.capabilities,p.revision AS profile_revision
        FROM theme_service_experiences e JOIN theme_experience_profiles p ON p.code=e.profile_code
        WHERE e.service_id=$1 FOR SHARE OF e,p`, [service.id]);
    // No stored configuration is genuinely no prior snapshot; do not invent a
    // persisted BASIC configuration from an effective default.
    return row ? { profile_code: row.profile_code, policy_revision: service.policy_revision,
        editor_policy: { profile_revision: row.profile_revision, capabilities: row.capabilities, overrides: row.overrides } } : null;
};
const sellerActor = async (client, service, principal, {allowUnavailable=false,bridgeOptions}={}) => {
    // This is an Admin-authorized projection of a real live Seller principal.
    // It does not issue a delegated token or give Admin an impersonation mutation route.
    const session = await one(client, `SELECT session.id,session.user_id FROM seller_sessions session
        JOIN seller_memberships member ON member.id=session.membership_id AND member.organization_id=session.organization_id
        JOIN seller_membership_store_scopes assigned ON assigned.membership_id=member.id AND assigned.organization_id=member.organization_id
        WHERE assigned.store_id=$1 AND assigned.organization_id=$2 AND assigned.revoked_at IS NULL AND assigned.scope_kind='assigned'
        AND session.audience='seller' AND session.status='active' AND session.expires_at>clock_timestamp() AND member.status='active'
        AND session.membership_revision=member.membership_revision AND session.security_stamp=member.security_stamp
        ORDER BY session.created_at DESC,session.id LIMIT 1`, [service.store_id, service.organization_id]);
    try {
        if (session) return await authorize(client, { kind: 'seller', userId: Number(session.user_id), sessionId: session.id }, 'draft.read', service);
        const projected=await require('./themeSellerBridgeService').resolveAdminThemeSellerProjection(client,principal,service,bridgeOptions);
        if (projected) return await authorize(client,projected,'draft.read',service);
    } catch(error) {
        // Metadata reports configuration, never guessed effective Seller grants.
        if (!allowUnavailable || !/^(?:THEME_AUTH_REQUIRED|THEME_PERMISSION_DENIED|THEME_RESOURCE_NOT_FOUND|THEME_BRIDGE_|STOCKY_CONNECTOR_)/u.test(error.code||'')) throw error;
    }
    if (allowUnavailable) return null;
    v.fail('THEME_SELLER_CONTEXT_UNAVAILABLE',409);
};
const validateCommerce = async (client, service, assignment, document) => {
    await require('./themePlatformPresentationEditGuard').validateStoredPresentationDocument(client, assignment.theme_version_id, assignment.channel, document);
    const { validateDocumentReferences, validateCandidateDocumentReferences } = require('./themePlatformCommerceService');
    const referenceAdapter = document.schemaVersion === 2 ? require('./themePlatformStudioDocument').commerceReferences : undefined;
    return assignment.id ? validateDocumentReferences(client, { service, assignment, document, referenceAdapter })
        : validateCandidateDocumentReferences(client, { service, candidate: candidateFields(assignment), document, referenceAdapter });
};
const catalog = (client) => rows(client, `SELECT t.id AS theme_id,t.name,t.slug,t.status,v.id AS id,v.id AS theme_version_id,
    v.version,v.digest,v.document,p.manifest,p.package_digest,p.renderer_id,p.renderer_version,p.supported_channels,p.required_capabilities
    FROM themes t JOIN theme_versions v ON v.theme_id=t.id JOIN theme_version_packages p ON p.theme_version_id=v.id
    WHERE t.status='ACTIVE' AND v.status='PUBLISHED' ORDER BY t.name,v.created_at DESC LIMIT 200`);
const catalogItem = (row) => ({ ...row, ...presentationMetadata(row.manifest,row.document.schemaVersion), thumbnails: row.manifest.thumbnails || [], industry: row.manifest.theme.industry,
    supportedChannels: row.supported_channels, requiredCapabilities: row.required_capabilities, rendererVersion: row.renderer_version });
const createThemeExperienceService = (database, { storageRoot = process.env.NOVASTORE_THEME_ASSET_ROOT, storage: suppliedStorage, bridgeProjectionOptions } = {}) => {
    // Construct only when bytes are needed; missing configuration must not disable metadata reads.
    const storage = () => suppliedStorage || createThemeAssetStorage({ rootDir: storageRoot });
    const execute = async (principal, action, params, body, meta) => {
        if (!spec[action]) v.fail('THEME_UNKNOWN_ACTION', 404);
        v.keys(body, [...fields[action], 'reason'], [...fields[action], 'reason']); v.text(body.reason, 240);
        if (!/^[A-Za-z0-9._:-]{8,128}$/u.test(meta.idempotencyKey || '')) v.fail('THEME_IDEMPOTENCY_KEY_REQUIRED');
        if (body.expectedRevision !== undefined) { v.integer(body.expectedRevision, action === 'saveProfile' ? 0 : 1); if (meta.ifMatch !== undefined && meta.ifMatch !== `"${body.expectedRevision}"`) v.fail('THEME_REVISION_HEADER_MISMATCH', 409); }
        if (body.profileCode) profileCode(body.profileCode);
        if (body.overrides) policy.validateOverrides(body.overrides);
        let cleanup;
        try {
            const result = await f.transaction(database, async (client) => {
                const [permission, resourceType] = spec[action];
                let service, resource;
                if (resourceType === 'offer') ({ service, offer: resource } = await loadOffer(client, principal, params.offerId));
                else if (resourceType === 'service') ({ service, resource } = await f.loadScope(client, 'service', params, principal));
                const actor = await authorize(client, principal, permission, service);
                // Assigning a version does not grant authority to change the
                // seller's profile. Offers carry both operations, so require both.
                if (action==='createOffer'||action==='prepareOffer') await authorize(client,principal,'entitlement.manage',service);
                if (service) await f.activeService(client, service);
                if (action === 'storeAsset') {
                    const currentPolicy = await policy.effectivePolicy(client, service, actor);
                    policy.requireCapability(currentPolicy, 'theme.assets');
                    await f.requireFeature(client, service, 'theme.asset_bytes');
                }
                const scopeKey = service?.id || 'global', requestHash = v.digest({ action, params, body });
                await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`theme:${scopeKey}:${actor.actorId}:${meta.idempotencyKey}`]);
                const previous = await one(client, 'SELECT * FROM theme_operations WHERE scope_key=$1 AND actor_id=$2 AND idempotency_key=$3', [scopeKey, actor.actorId, meta.idempotencyKey]);
                if (previous) {
                    if (previous.request_hash !== requestHash) v.fail('THEME_IDEMPOTENCY_PAYLOAD_CONFLICT', 409);
                    if (action === 'prepareOffer') await f.assignmentActive(client, found(await one(client, 'SELECT * FROM theme_assignments WHERE id=$1', [previous.result.assignment.id])));
                    return { operationId: previous.id, status: previous.status, result: previous.result };
                }
                const operationId = crypto.randomUUID(), correlationId = crypto.randomUUID();
                await client.query(`INSERT INTO theme_operations(id,service_id,organization_id,store_id,scope_key,actor_id,type,status,idempotency_key,request_hash,correlation_id)
                    VALUES($1,$2,$3,$4,$5,$6,$7,'REQUESTED',$8,$9,$10)`, [operationId, ...(service ? scope(service) : [null,null,null]), scopeKey, actor.actorId, action, meta.idempotencyKey, requestHash, correlationId]);
                let output, target, auditBefore = resource, auditAfter;
                if (action === 'configureExperience') {
                    checkRevision(service, body.expectedRevision, 'policy_revision');
                    auditBefore = await experienceAuditSnapshot(client, service);
                    service = await configure(client, service, body.profileCode, body.overrides);
                    output = { serviceId: service.id, policyRevision: Number(service.policy_revision), policy_revision: service.policy_revision, profile_code: body.profileCode, overrides: body.overrides };
                    auditAfter = await experienceAuditSnapshot(client, service);
                    target = { type: 'theme_experience', id: service.id };
                } else if (action === 'saveProfile') {
                    profileCode(body.code); v.text(body.name, 160); policy.validateStates(body.capabilities);
                    // Consistent lock order: dependent services, then shared profile.
                    await client.query('SELECT s.id FROM seller_theme_services s JOIN theme_service_experiences e ON e.service_id=s.id WHERE e.profile_code=$1 ORDER BY s.id FOR UPDATE OF s', [body.code]);
                    const existing = await one(client, 'SELECT * FROM theme_experience_profiles WHERE code=$1 FOR UPDATE', [body.code]);
                    if (existing) checkRevision(existing, body.expectedRevision); else if (body.expectedRevision !== 0) v.fail('THEME_REVISION_CONFLICT', 409);
                    auditBefore = profileAuditSnapshot(existing);
                    output = await one(client, `INSERT INTO theme_experience_profiles(code,name,capabilities) VALUES($1,$2,$3)
                        ON CONFLICT(code) DO UPDATE SET name=EXCLUDED.name,capabilities=EXCLUDED.capabilities,revision=theme_experience_profiles.revision+1,updated_at=clock_timestamp() RETURNING *`, [body.code,body.name,body.capabilities]);
                    await client.query('UPDATE seller_theme_services SET policy_revision=policy_revision+1,revision=revision+1,updated_at=clock_timestamp() WHERE id IN (SELECT service_id FROM theme_service_experiences WHERE profile_code=$1)', [body.code]);
                    auditAfter = profileAuditSnapshot(output);
                    target = { type: 'theme_profile', id: body.code };
                } else if (action === 'createOffer') {
                    checkRevision(service, body.expectedRevision, 'policy_revision'); v.uuid(body.themeVersionId);
                    v.choice(body.channel, ['web','app']); v.choice(body.commerceMode,['SINGLE_STORE','MARKETPLACE']);
                    const version = found(await one(client, `SELECT v.*,p.supported_channels,p.required_capabilities FROM theme_versions v JOIN themes t ON t.id=v.theme_id
                        JOIN theme_version_packages p ON p.theme_version_id=v.id WHERE v.id=$1 AND v.status='PUBLISHED' AND t.status='ACTIVE' FOR SHARE`, [body.themeVersionId]));
                    if (!version.supported_channels.includes(body.channel)) v.fail('THEME_CHANNEL_UNSUPPORTED');
                    for (const code of version.required_capabilities) await f.requireFeature(client, service, policy.CATALOG[code]?.[1] || code);
                    if (body.channel === 'app') await f.requireFeature(client, service, 'theme.mobile_customization');
                    const profile = found(await one(client, 'SELECT * FROM theme_experience_profiles WHERE code=$1 FOR SHARE', [body.profileCode]));
                    await validateCommerce(client, service, { theme_version_id: version.id, channel: body.channel, commerce_mode: body.commerceMode }, version.document);
                    output = await one(client, `INSERT INTO theme_offers(id,service_id,organization_id,store_id,theme_version_id,channel,commerce_mode,profile_code,overrides,profile_revision,policy_revision)
                        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`, [crypto.randomUUID(),...scope(service),version.id,body.channel,body.commerceMode,body.profileCode,body.overrides,profile.revision,service.policy_revision]);
                    target = { type: 'theme_offer', id: output.id };
                } else if (action === 'prepareOffer') {
                    checkRevision(resource, body.expectedRevision);
                    if (resource.status !== 'CONFIGURED') v.fail('THEME_OFFER_STATE_CONFLICT',409);
                    requireAssignablePresentation(await loadPresentation(client,resource.theme_version_id,resource.channel),resource.channel);
                    checkRevision(service, Number(resource.policy_revision), 'policy_revision');
                    const profile = found(await one(client, 'SELECT * FROM theme_experience_profiles WHERE code=$1 FOR SHARE',[resource.profile_code]));
                    if (profile.revision !== resource.profile_revision) v.fail('THEME_PROFILE_REVISION_CONFLICT',409);
                    const version = found(await one(client, `SELECT v.*,p.supported_channels,p.required_capabilities FROM theme_versions v JOIN themes t ON t.id=v.theme_id
                        JOIN theme_version_packages p ON p.theme_version_id=v.id WHERE v.id=$1 AND v.status='PUBLISHED' AND t.status='ACTIVE' FOR SHARE`,[resource.theme_version_id]));
                    // An offer's revision does not freeze entitlement expiry or
                    // a global capability switch. Revalidate before assignment.
                    if (!version.supported_channels.includes(resource.channel)) v.fail('THEME_CHANNEL_UNSUPPORTED');
                    for (const code of version.required_capabilities) await f.requireFeature(client,service,policy.CATALOG[code]?.[1] || code);
                    if (resource.channel === 'app') await f.requireFeature(client,service,'theme.mobile_customization');
                    await validateCommerce(client, service, candidateFields(resource), version.document);
                    auditBefore = await experienceAuditSnapshot(client, service);
                    service = await configure(client,service,resource.profile_code,resource.overrides);
                    const assignment = await one(client, `INSERT INTO theme_assignments(id,service_id,organization_id,store_id,theme_version_id,channel,commerce_mode)
                        VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,[crypto.randomUUID(),...scope(service),version.id,resource.channel,resource.commerce_mode]);
                    const overrides = version.document.schemaVersion === 2 ? { studio: {} } : { tokens:{},components:[],assetIds:[] };
                    const draft = await one(client, `INSERT INTO theme_drafts(id,service_id,organization_id,store_id,assignment_id,overrides) VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,[crypto.randomUUID(),...scope(service),assignment.id,overrides]);
                    await client.query(`INSERT INTO theme_draft_revisions(id,service_id,organization_id,store_id,draft_id,revision,overrides,digest)
                        VALUES($1,$2,$3,$4,$5,1,$6,$7)`,[crypto.randomUUID(),...scope(service),draft.id,overrides,v.digest(overrides)]);
                    const offer = await one(client,"UPDATE theme_offers SET assignment_id=$2,status='PREPARED_FOR_DELIVERY',revision=revision+1,updated_at=clock_timestamp() WHERE id=$1 RETURNING *",[resource.id,assignment.id]);
                    output = { ...offer,assignment,draft,deliveryVerified:false,stockyReceipt:null };
                    output.delivery = await require('./themeStockyDeliveryService').enqueueAssignment(client,{service,assignment,operationId});
                    auditAfter = { ...offer, ...await experienceAuditSnapshot(client, service) };
                    target = { type:'theme_offer',id:offer.id };
                } else if (action === 'importPackage') {
                    const versionId = crypto.randomUUID();
                    const prepared = await prepareThemePackage(body.package,{themeVersionId:versionId,storage:storage(),capabilityCodes:Object.keys(policy.CATALOG).filter(code=>policy.CATALOG[code][1])});
                    cleanup = prepared.cleanup;
                    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`theme-package:${prepared.manifest.theme.slug}`]);
                    let theme = await one(client,'SELECT * FROM themes WHERE slug=$1 FOR UPDATE',[prepared.manifest.theme.slug]);
                    if (theme?.status === 'ARCHIVED') v.fail('THEME_THEME_ARCHIVED',409);
                    if (!theme) theme = await one(client,'INSERT INTO themes(id,slug,name) VALUES($1,$2,$3) RETURNING *',[crypto.randomUUID(),prepared.manifest.theme.slug,prepared.manifest.theme.name]);
                    const version = await one(client,"INSERT INTO theme_versions(id,theme_id,version,status,document,digest) VALUES($1,$2,$3,'PUBLISHED',$4,$5) RETURNING *",[versionId,theme.id,prepared.manifest.theme.version,prepared.document,prepared.documentDigest]);
                    await client.query(`INSERT INTO theme_version_packages(theme_version_id,manifest,package_digest,renderer_id,renderer_version,supported_channels,required_capabilities)
                        VALUES($1,$2,$3,$4,$5,$6,$7)`,[versionId,prepared.manifest,prepared.packageDigest,prepared.manifest.renderer.id,prepared.manifest.renderer.version,prepared.manifest.supportedChannels,prepared.manifest.requiredCapabilities]);
                    for (const asset of prepared.assets) await client.query(`INSERT INTO theme_package_assets(theme_version_id,asset_key,mime_type,byte_size,digest,original_digest,width,height,storage_key)
                        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[versionId,asset.assetKey,asset.detectedMime,asset.byteSize,asset.digest,asset.originalDigest,asset.width,asset.height,asset.storageKey]);
                    output = { id:version.id,theme_id:theme.id,version:version.version,digest:version.digest,package_digest:prepared.packageDigest,status:'PUBLISHED',assetCount:prepared.assets.length };
                    target = { type:'theme_version',id:version.id };
                } else if (action === 'storeAsset') {
                    const bytes = decodeBase64(body.bytesBase64);
                    const id = crypto.randomUUID(), adapter = storage();
                    const staged = await adapter.stageOwned({serviceId:service.id,assetId:id,bytes});
                    cleanup = () => adapter.discard(staged);
                    const media = await adapter.promote(staged);
                    const capacity = await f.requireFeature(client,service,'theme.asset_bytes');
                    // Tombstones still occupy the private local store. Their
                    // bytes cannot leave quota until an actual verified purge.
                    const used = await one(client,"SELECT COALESCE(SUM(byte_size),0) AS total FROM theme_assets WHERE service_id=$1 AND (status<>'REJECTED' OR storage_backend='local-v1')",[service.id]);
                    if (Number(used.total)+media.byteSize>capacity.quota) v.fail('THEME_ASSET_QUOTA_EXCEEDED',403);
                    output = await one(client,`INSERT INTO theme_assets(id,service_id,organization_id,store_id,detected_mime,byte_size,digest,storage_key,status,width,height,original_digest,storage_backend)
                        VALUES($1,$2,$3,$4,$5,$6,$7,$8,'READY',$9,$10,$11,$12) RETURNING *`,[id,...scope(service),media.detectedMime,media.byteSize,media.digest,media.storageKey,media.width,media.height,media.originalDigest,media.storageBackend]);
                    target = {type:'theme_asset',id};
                }
                await f.appendAudit(client,{service,actor,action:`theme.${action}`,target,before:auditBefore,after:auditAfter===undefined?output:auditAfter,correlationId,reason:body.reason});
                if (service) await f.addOutbox(client,service,operationId,`theme.${action}`,output);
                await client.query("UPDATE theme_operations SET status='COMPLETED',result=$2,updated_at=clock_timestamp() WHERE id=$1",[operationId,output]);
                return {operationId,status:'COMPLETED',result:output};
            });
            cleanup = undefined; // Commit owns the immutable stored bytes now.
            return result;
        } catch (error) { if (cleanup) await cleanup(); throw error; }
    };
    const read = (principal,action,params={}) => f.transaction(database,async client=>{
        let service, offer;
        if (params.offerId) ({service,offer}=await loadOffer(client,principal,params.offerId));
        else if (params.serviceId) ({service}=await f.loadScope(client,'service',params,principal));
        const permission = ['catalog','packageAsset'].includes(action)?'catalog.read':['profiles','stores'].includes(action)?'service.read':action==='sellerPreview'||action==='offerPreview'?'assignment.manage':'draft.read';
        let actor = await authorize(client,principal,permission,service);
        if (service) await f.activeService(client,service);
        if (action==='profiles') return {items:await rows(client,'SELECT * FROM theme_experience_profiles ORDER BY code'),catalog:Object.entries(policy.CATALOG).map(([code,[label,feature,maxState]])=>({code,label,feature,maxState,supported:!!feature,states:policy.STATES}))};
        if (action==='catalog') return (await catalog(client)).map(row=>{
            const item=catalogItem(row);
            if (actor.role==='support') { const {document,...metadata}=item; return metadata; }
            return item;
        });
        if (action==='stores') return rows(client,`SELECT st.id,st.organization_id,st.display_name AS name,o.display_name AS seller,st.legacy_store_id,
            s.id AS service_id,s.status AS service_status FROM seller_stores st JOIN seller_organizations o ON o.id=st.organization_id
            LEFT JOIN seller_theme_services s ON s.store_id=st.id AND s.organization_id=st.organization_id
            WHERE st.status='active' AND st.closed_at IS NULL AND o.status='active' AND o.closed_at IS NULL ORDER BY st.display_name,st.id LIMIT 200`);
        const deliveryFor = assignmentId => rows(client,`SELECT d.outbox_id AS "eventId",d.status,d.result_id AS "resultId",
            d.delivered_at AS "deliveredAt",d.acknowledged_at AS "acknowledgedAt",d.last_error_code AS "errorCode"
            FROM theme_stocky_deliveries d WHERE d.assignment_id=$1 AND d.service_id=$2
            ORDER BY d.created_at DESC,d.outbox_id DESC`,[assignmentId,service.id]);
        if (action==='offer') return {...offer,themeDelivery:offer.assignment_id?await deliveryFor(offer.assignment_id):[]};
        if (['sellerPreview','offerPreview'].includes(action) || (principal.kind==='admin' && ['experience','details'].includes(action))) actor = await sellerActor(client,service,principal,{allowUnavailable:['experience','details'].includes(action),bridgeOptions:bridgeProjectionOptions});
        if (['context','sellerPreview','offerPreview','history'].includes(action)) await f.requireFeature(client,service,'theme.editor');
        const effective = await policy.effectivePolicy(client,service,actor,offer?{profile_code:offer.profile_code,overrides:offer.overrides}:null);
        if (action==='experience') return effective;
        if (['context','sellerPreview','offerPreview'].includes(action)) {
            const assignments = offer ? [{id:null,channel:offer.channel,commerce_mode:offer.commerce_mode,theme_version_id:offer.theme_version_id,status:'CONFIGURED'}]
                : await rows(client,`SELECT a.*,d.id AS draft_id,d.overrides,d.revision AS draft_revision FROM theme_assignments a JOIN theme_drafts d ON d.assignment_id=a.id WHERE a.service_id=$1 AND a.status<>'WITHDRAWN' ORDER BY a.channel`,[service.id]);
            const channels={};
            let conservativePolicy=effective;
            for (const assignment of assignments) {
                const version=found(await one(client,"SELECT * FROM theme_versions WHERE id=$1 AND status='PUBLISHED'",[assignment.theme_version_id]));
                const overrides=assignment.overrides || (version.document.schemaVersion===2?{studio:{}}:{tokens:{},components:[],assetIds:[]});
                if (assignment.draft_id) await f.ensureAssets(client,service,overrides);
                const document=v.artifact(version.document,overrides);
                await validateCommerce(client,service,assignment,document);
                const commerce = require('./themePlatformCommerceService');
                const projection = assignment.id ? await commerce.preview(client,{service,assignment})
                    : await commerce.previewCandidate(client,{service,candidate:candidateFields(assignment)});
                const presentation=await loadPresentation(client,version.id,assignment.channel);
                const {intersectPresentationCapabilities}=require('./themePlatformPresentationService');
                const channelPolicy=version.document.schemaVersion===2?intersectPresentationCapabilities(effective,presentation,assignment.channel):effective;
                if (version.document.schemaVersion===2) conservativePolicy=intersectPresentationCapabilities(conservativePolicy,presentation,assignment.channel);
                channels[assignment.channel]={assignmentId:assignment.id,draftId:assignment.draft_id||null,revision:Number(assignment.draft_revision||1),
                    themeVersionId:version.id,version:version.version,presentation,effectivePolicy:channelPolicy,base:version.document,document,overrides,commerceMode:assignment.commerce_mode,status:assignment.status,
                    catalog:{products:projection.products,categories:projection.categories,collections:projection.collections},commerce:projection.context};
            }
            return {...conservativePolicy,scope:{tenantId:String(service.organization_id),storeId:String(service.store_id)},actor:{id:actor.actorId},
                mode:['sellerPreview','offerPreview'].includes(action)?'seller-preview':actor.kind,readOnly:['sellerPreview','offerPreview'].includes(action),channels,availableChannels:Object.keys(channels)};
        }
        if (action==='details') return {service,experience:effective,
            offers:await rows(client,'SELECT * FROM theme_offers WHERE service_id=$1 ORDER BY created_at DESC LIMIT 100',[service.id]),
            assignments:await rows(client,'SELECT a.*,v.version,t.name FROM theme_assignments a JOIN theme_versions v ON v.id=a.theme_version_id JOIN themes t ON t.id=v.theme_id WHERE a.service_id=$1 ORDER BY a.created_at DESC',[service.id]),
            domains:await rows(client,'SELECT hostname,status,commerce_mode FROM theme_domain_bindings WHERE service_id=$1',[service.id]),
            versions:await rows(client,'SELECT r.id,r.draft_id,r.revision,r.digest,r.created_at FROM theme_draft_revisions r WHERE service_id=$1 ORDER BY created_at DESC LIMIT 100',[service.id]),
            deployments:await rows(client,'SELECT * FROM theme_deployments WHERE service_id=$1 ORDER BY created_at DESC LIMIT 100',[service.id]),
            activity:await rows(client,'SELECT id,type,status,failure_reason,created_at FROM theme_operations WHERE service_id=$1 ORDER BY created_at DESC LIMIT 100',[service.id]),
            previews:await rows(client,'SELECT id,status,created_at,expires_at FROM theme_previews WHERE service_id=$1 ORDER BY created_at DESC LIMIT 20',[service.id]),
            publications:await rows(client,'SELECT id,status,created_at FROM theme_publications WHERE service_id=$1 ORDER BY created_at DESC LIMIT 20',[service.id])};
        if (action==='history') {
            policy.requireCapability(effective,'theme.version_history',{read:true});
            const draft=found(await one(client,'SELECT * FROM theme_drafts WHERE id=$1 AND service_id=$2',[v.uuid(params.draftId),service.id]));
            return rows(client,'SELECT revision,digest,created_at FROM theme_draft_revisions WHERE draft_id=$1 ORDER BY revision DESC LIMIT 100',[draft.id]);
        }
        v.fail('THEME_RESOURCE_NOT_FOUND',404);
    });
    const bytes = (principal,params) => f.transaction(database,async client=>{
        if (params.assetId) {
            const {service,resource}=await f.loadScope(client,'asset',params,principal);
            await authorize(client,principal,'asset.read',service); await f.activeService(client,service);
            if (resource.status!=='READY'||resource.storage_backend!=='local-v1') v.fail('THEME_ASSET_UNAVAILABLE',404);
            const buffer=await storage().readOwned({serviceId:service.id,storageKey:resource.storage_key,digest:resource.digest});
            return {buffer,mime:resource.detected_mime};
        }
        if (principal.kind==='seller') {
            const {service}=await f.loadScope(client,'service',params,principal); await authorize(client,principal,'asset.read',service); await f.activeService(client,service);
            found(await one(client,"SELECT id FROM theme_assignments WHERE service_id=$1 AND theme_version_id=$2 AND status<>'WITHDRAWN'",[service.id,v.uuid(params.versionId)]));
        } else await authorize(client,principal,'catalog.read');
        const asset=found(await one(client,'SELECT * FROM theme_package_assets WHERE theme_version_id=$1 AND asset_key=$2',[v.uuid(params.versionId),params.assetKey]));
        return {buffer:await storage().readPackage({themeVersionId:params.versionId,storageKey:asset.storage_key,digest:asset.digest}),mime:asset.mime_type};
    });
    const commercePreview = (principal,params,body) => f.transaction(database,async client=>{
        let service, assignment, candidate;
        if (params.offerId) {
            if (principal.kind!=='admin') v.fail('THEME_RESOURCE_NOT_FOUND',404);
            const loaded=await loadOffer(client,principal,params.offerId);service=loaded.service;candidate=candidateFields(loaded.offer);
        } else {
            const loaded=await f.loadScope(client,'assignment',params,principal);service=loaded.service;assignment=loaded.resource;
            if (service.id!==params.serviceId) v.fail('THEME_RESOURCE_NOT_FOUND',404);
            await f.assignmentActive(client,assignment);
        }
        const actor=await authorize(client,principal,'preview.read',service);
        const effective=await policy.effectivePolicy(client,service,actor);
        policy.requireCapability(effective,'theme.preview',{read:true});
        const commerce=require('./themePlatformCommerceService');
        const input={service,...(assignment?{assignment}:{candidate})};
        return body===undefined ? commerce.authenticatedProductPreview(client,{...input,productId:params.productId})
            : commerce.authenticatedQuotePreview(client,{...input,body});
    });
    return {execute,read,bytes,commercePreview};
};
module.exports={createThemeExperienceService,spec,validateCommerce};
