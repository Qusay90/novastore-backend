'use strict';

const crypto = require('node:crypto');
const v = require('./themePlatformValidation');
const f = require('./themePlatformService');
const native = require('./themePlatformStudioDocument');
const presentations = require('./themePlatformPresentationService');
const REQUIRED_COMMERCE = Object.freeze(['customerAuth','persistentCart','favorites','variantSelection','stockCheck',
    'checkoutPreparation','orderHistory','reviews','questions','supportRouting','singleStore']);
const REQUIRED_LEGAL = Object.freeze(['privacy','terms','distance-sales','returns','shipping','kvkk','cookie','contact','business-information']);
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const validDigest = value => typeof value === 'string' && /^[0-9a-f]{64}$/u.test(value);

// Providers are installed once by the server, never accepted from HTTP input.
function createThemePublicationValidator({ assetStorage, rendererBundle, legalAuthority } = {}) {
    const validate = async (client, { service, publication }, {readOnly=false,deployedArtifact=null}={}) => {
        await f.activeService(client, service);
        // Authoring and new activation require today's edit/publication policy.
        // Existing verified deployments are governed by the live service/store,
        // presentation revocation, asset/legal and runtime scope authorities.
        if(!deployedArtifact)await f.requireFeature(client, service, 'theme.publish', {readOnly});
        if (String(publication.service_id) !== String(service.id) || String(publication.store_id) !== String(service.store_id)
            || String(publication.organization_id) !== String(service.organization_id)) v.fail('THEME_RESOURCE_NOT_FOUND',404);
        if (!deployedArtifact&&Number(publication.policy_revision) !== Number(service.policy_revision)) v.fail('THEME_PUBLICATION_POLICY_STALE',409);
        const draft = f.found(await f.one(client,'SELECT * FROM theme_drafts WHERE id=$1 AND service_id=$2',[publication.draft_id,service.id]));
        const { assignment, version } = await f.baseForDraft(client,draft);
        if (assignment.commerce_mode !== 'SINGLE_STORE') v.fail('THEME_PUBLICATION_SINGLE_STORE_REQUIRED',409);
        const artifact = publication.artifact;
        if (v.digest(artifact) !== publication.digest || artifact.themeVersionId !== version.id || artifact.baseDigest !== version.digest
            || artifact.channel !== assignment.channel || Number(artifact.draftRevision) !== Number(publication.draft_revision)
            || Number(artifact.policyRevision) !== Number(publication.policy_revision)) v.fail('THEME_PUBLICATION_SNAPSHOT_INVALID',409);
        const document = artifact.document;
        if (document?.schemaVersion !== 2) v.fail('THEME_PUBLICATION_SCHEMA_UNSUPPORTED',409);
        native.validateBase(version.document);
        const snapshot = f.found(await f.one(client,'SELECT overrides FROM theme_draft_revisions WHERE draft_id=$1 AND revision=$2',[draft.id,publication.draft_revision]));
        if (v.digest(v.artifact(version.document,snapshot.overrides)) !== v.digest(document)) v.fail('THEME_PUBLICATION_SNAPSHOT_INVALID',409);
        const pkg = f.found(await f.one(client,'SELECT * FROM theme_version_packages WHERE theme_version_id=$1',[version.id]));
        if (v.digest(pkg.manifest) !== pkg.package_digest) v.fail('THEME_PACKAGE_INTEGRITY_FAILURE',409);
        if (!pkg.supported_channels.includes(assignment.channel)) v.fail('THEME_CHANNEL_UNSUPPORTED',409);
        const presentation = await presentations.loadPresentation(client,version.id,assignment.channel);
        if (!presentation) v.fail('UNKNOWN_PRESENTATION',409);
        await require('./themePlatformPresentationEditGuard').validateStoredPresentationDocument(client,version.id,assignment.channel,document);
        const commerce = await require('./themePlatformCommerceService').validateDocumentReferences(client,
            {service,assignment,document,referenceAdapter:native.commerceReferences});
        for (const code of pkg.required_capabilities) {
            const billing = require('./themePlatformExperiencePolicy').CATALOG[code]?.[1];
            if (!billing) v.fail('THEME_PACKAGE_CAPABILITY_UNSUPPORTED',409);
            if(!deployedArtifact)await f.requireFeature(client,service,billing,{readOnly});
        }
        let renderer;
        if(deployedArtifact){
            // The publication service verifies every immutable artifact byte and
            // manifest digest before entering this branch. Never consult the
            // newest authoring dist when serving or rolling back a sealed build.
            const sealed=deployedArtifact.validation,manifest=deployedArtifact.manifest;
            if(!sealed||v.digest(manifest.metadata)!==v.digest(sealed)||sealed.sourceDigest!==deployedArtifact.source_digest
                ||!Array.isArray(sealed.rendererFiles)||!sealed.rendererFiles.length||sealed.rendererFiles.length>256)v.fail('THEME_ARTIFACT_INTEGRITY_FAILURE',409);
            renderer={presentation:sealed.presentation,sourceDigest:sealed.sourceDigest,entryPoint:sealed.rendererEntryPoint,
                commerceCapabilities:sealed.commerceCapabilities,requiredAssetKeys:sealed.assets?.filter(asset=>asset.kind==='package').map(asset=>asset.key)||[],
                files:sealed.rendererFiles.map(file=>{
                    const descriptor=manifest.files.find(item=>item.path===file.path);
                    if(!descriptor||descriptor.sha256!==file.sha256||descriptor.byteSize!==file.byteSize)v.fail('THEME_ARTIFACT_INTEGRITY_FAILURE',409);
                    return {...descriptor};
                })};
            if(renderer.entryPoint!==manifest.entryPoint)v.fail('THEME_ARTIFACT_INTEGRITY_FAILURE',409);
        }else{
            if (typeof rendererBundle !== 'function') v.fail('THEME_RENDERER_BUILD_AUTHORITY_REQUIRED',503);
            renderer=await rendererBundle({presentation,channel:assignment.channel});
        }
        if (!renderer || v.digest(renderer.presentation) !== v.digest(presentation) || !validDigest(renderer.sourceDigest)
            || !Array.isArray(renderer.files) || !renderer.files.length || typeof renderer.entryPoint !== 'string') v.fail('THEME_RENDERER_BUILD_INVALID',409);
        for (const file of renderer.files) {
            if (!validDigest(file.sha256)||(!deployedArtifact&&(!Buffer.isBuffer(file.bytes)||hash(file.bytes)!==file.sha256))) v.fail('THEME_RENDERER_SOURCE_CHANGED',409);
        }
        if (REQUIRED_COMMERCE.some(code => renderer.commerceCapabilities?.[code] !== true)) v.fail('THEME_COMMERCE_RUNTIME_REQUIRED',409);
        if (!assetStorage || typeof assetStorage.readOwned !== 'function' || typeof assetStorage.readPackage !== 'function') v.fail('THEME_ASSET_STORAGE_UNAVAILABLE',503);
        const references = native.commerceReferences(document), files = [...renderer.files], assets = [];
        const owned = [...new Set(references.assetIds || [])];
        for (const id of owned) {
            const asset = f.found(await f.one(client,`SELECT * FROM theme_assets WHERE id=$1 AND service_id=$2 AND organization_id=$3 AND store_id=$4
                AND status='READY' AND storage_backend='local-v1'${readOnly?'':' FOR SHARE'}`,[v.uuid(id),...f.scope(service)]));
            const bytes = await assetStorage.readOwned({serviceId:service.id,storageKey:asset.storage_key,digest:asset.digest});
            const extension = {'image/png':'png','image/jpeg':'jpg','image/webp':'webp'}[asset.detected_mime];
            if (!extension || bytes.length !== Number(asset.byte_size)) v.fail('THEME_ASSET_INTEGRITY_FAILURE',409);
            files.push({path:`assets/owned/${asset.id}.${extension}`,bytes,sha256:asset.digest,mimeType:asset.detected_mime});
            assets.push({id:asset.id,kind:'owned',digest:asset.digest,byteSize:Number(asset.byte_size)});
        }
        const packageKeys = [...new Set([...native.packagedAssetKeys(document),...(renderer.requiredAssetKeys || [])])];
        for (const key of packageKeys) {
            const asset = f.found(await f.one(client,'SELECT * FROM theme_package_assets WHERE theme_version_id=$1 AND asset_key=$2',[version.id,key]));
            const bytes = await assetStorage.readPackage({themeVersionId:version.id,storageKey:asset.storage_key,digest:asset.digest});
            if (bytes.length !== Number(asset.byte_size)) v.fail('THEME_ASSET_INTEGRITY_FAILURE',409);
            files.push({path:`assets/package/${key}`,bytes,sha256:asset.digest,mimeType:asset.mime_type});
            assets.push({key,kind:'package',digest:asset.digest,byteSize:Number(asset.byte_size)});
        }
        let legal = legalAuthority;
        if (!legal) {
            try { legal = require('./themePlatformStoreContentService').publicationLegalAuthority; }
            catch (error) { if (error.code !== 'MODULE_NOT_FOUND') throw error; }
        }
        if (typeof legal !== 'function') v.fail('THEME_LEGAL_AUTHORITY_REQUIRED',503);
        const content = await legal(client,{service,assignment,document,locale:'tr-TR'});
        if (!content?.storeIdentity || !Array.isArray(content.legalReferences)
            || REQUIRED_LEGAL.some(type => !content.legalReferences.some(ref => ref.type === type))) v.fail('THEME_LEGAL_REQUIRED',409);
        if (String(content.storeIdentity.storeId) !== String(service.store_id)
            || String(content.storeIdentity.organizationId) !== String(service.organization_id)) v.fail('THEME_STORE_IDENTITY_INVALID',409);
        for (const ref of content.legalReferences) if (!validDigest(ref.contentHash) || !ref.version || ref.locale !== 'tr-TR') v.fail('THEME_LEGAL_REQUIRED',409);
        const logoId=content.storeIdentity.logoAssetId;
        if(logoId&&!owned.includes(logoId)) {
            const asset=f.found(await f.one(client,`SELECT * FROM theme_assets WHERE id=$1 AND service_id=$2 AND organization_id=$3 AND store_id=$4
                AND status='READY' AND storage_backend='local-v1'${readOnly?'':' FOR SHARE'}`,[v.uuid(logoId),...f.scope(service)]));
            const bytes=await assetStorage.readOwned({serviceId:service.id,storageKey:asset.storage_key,digest:asset.digest});
            const extension={'image/png':'png','image/jpeg':'jpg','image/webp':'webp'}[asset.detected_mime];
            if(!extension||bytes.length!==Number(asset.byte_size))v.fail('THEME_ASSET_INTEGRITY_FAILURE',409);
            files.push({path:`assets/owned/${asset.id}.${extension}`,bytes,sha256:asset.digest,mimeType:asset.detected_mime});
            assets.push({id:asset.id,kind:'owned',digest:asset.digest,byteSize:Number(asset.byte_size)});
        }
        const validation = {format:'novastore-publication-validation-v1',publicationId:publication.id,draftId:publication.draft_id,draftRevision:Number(publication.draft_revision),serviceId:service.id,organizationId:String(service.organization_id),
            storeId:String(service.store_id),assignmentId:assignment.id,themeVersionId:version.id,channel:assignment.channel,
            commerceMode:'SINGLE_STORE',presentation,sourceDigest:renderer.sourceDigest,packageDigest:pkg.package_digest,
            rendererEntryPoint:renderer.entryPoint,rendererFiles:renderer.files.map(file=>({path:file.path,sha256:file.sha256,byteSize:deployedArtifact?file.byteSize:file.bytes.length})).sort((a,b)=>a.path.localeCompare(b.path,'en')),
            commerceCapabilities:Object.fromEntries(REQUIRED_COMMERCE.map(code=>[code,renderer.commerceCapabilities[code]])),
            documentDigest:v.digest(document),policyRevision:Number(deployedArtifact?publication.policy_revision:service.policy_revision),legalDigest:v.digest(content),
            legalReferences:content.legalReferences,assets,commerce};
        files.push({path:'novastore-document.json',bytes:Buffer.from(v.canonical(document)),mimeType:'application/json'});
        files.push({path:'novastore-content.json',bytes:Buffer.from(v.canonical(content)),mimeType:'application/json'});
        return {validation,files,entryPoint:renderer.entryPoint,assignment,version,document};
    };
    return Object.freeze({validate});
}
module.exports = {createThemePublicationValidator,REQUIRED_COMMERCE,REQUIRED_LEGAL};
