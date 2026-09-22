'use strict';

const v = require('./themePlatformValidation');
const f = require('./themePlatformService');
const {authorize} = require('./themePlatformAuthService');

// Conservative retention: no historical package or referenced draft/preview/
// publication asset is removed. The sweep is deliberately a dry-run inventory.
async function assetReferences(client, asset) {
    const pattern = `%${v.uuid(asset.id)}%`, result = [];
    for (const [table,column] of [['theme_drafts','overrides'],['theme_draft_revisions','overrides'],
        ['theme_previews','artifact'],['theme_publications','artifact'],['theme_publication_artifacts','manifest']]) {
        const rows = await f.rows(client,`SELECT id FROM ${table} WHERE service_id=$1 AND ${column}::text LIKE $2 LIMIT 100`,[asset.service_id,pattern]);
        result.push(...rows.map(row=>({type:table,id:String(row.id)})));
    }
    // Legacy global bases must also retain references; current package importer
    // rejects tenant-specific IDs but this guards older accepted documents.
    const versions = await f.rows(client,'SELECT id FROM theme_versions WHERE document::text LIKE $1 LIMIT 100',[pattern]);
    result.push(...versions.map(row=>({type:'theme_versions',id:String(row.id)})));
    const profiles = await f.rows(client,'SELECT store_id FROM theme_store_profiles WHERE organization_id=$1 AND store_id=$2 AND profile::text LIKE $3',
        [asset.organization_id,asset.store_id,pattern]);
    result.push(...profiles.map(row=>({type:'theme_store_profiles',id:String(row.store_id)})));
    return result;
}
function createThemeAssetLifecycleService({database,retentionDays=30}={}) {
    v.integer(retentionDays,1,3650);
    const remove = (principal,{assetId,expectedRevision,reason}) => f.transaction(database,async client=>{
        v.integer(expectedRevision);v.text(reason,240);
        const {service,resource:asset} = await f.loadScope(client,'asset',{assetId},principal);
        const actor = await authorize(client,principal,'asset.register',service);
        await f.requireFeature(client,service,'theme.editor');
        const policy=require('./themePlatformExperiencePolicy');
        policy.requireCapability(await policy.effectivePolicy(client,service,actor),'theme.assets');
        await f.requireFeature(client,service,'theme.asset_bytes');
        const existing = await f.one(client,'SELECT * FROM theme_asset_retention WHERE asset_id=$1',[asset.id]);
        if (existing) return {...existing,reused:true,bytesDeleted:false};
        f.checkRevision(asset,expectedRevision);
        const refs = await assetReferences(client,asset);
        if (refs.length) v.fail('THEME_ASSET_REFERENCED',409);
        const row = await f.one(client,`INSERT INTO theme_asset_retention(asset_id,service_id,organization_id,store_id,state,reason,retain_until)
            VALUES($1,$2,$3,$4,'TOMBSTONED',$5,clock_timestamp()+($6::integer*INTERVAL '1 day')) RETURNING *`,[asset.id,...f.scope(service),reason,retentionDays]);
        await client.query("UPDATE theme_assets SET status='REJECTED',revision=revision+1,updated_at=clock_timestamp() WHERE id=$1",[asset.id]);
        await f.appendAudit(client,{service,actor,action:'theme.asset.tombstoned',target:{type:'theme_asset',id:asset.id},before:asset,
            after:{id:asset.id,status:'REJECTED'},correlationId:require('node:crypto').randomUUID(),reason});
        return {...row,reused:false,bytesDeleted:false};
    });
    const retention = (principal,{serviceId}) => f.transaction(database,async client=>{
        const {service} = await f.loadScope(client,'service',{serviceId},principal);
        await authorize(client,principal,'asset.read',service);
        return f.rows(client,'SELECT * FROM theme_asset_retention WHERE service_id=$1 ORDER BY created_at DESC LIMIT 200',[service.id]);
    });
    const planPurge = (principal,{serviceId}) => f.transaction(database,async client=>{
        const {service} = await f.loadScope(client,'service',{serviceId},principal);
        await authorize(client,principal,'asset.register',service);
        const assets = await f.rows(client,`SELECT a.* FROM theme_assets a JOIN theme_asset_retention r ON r.asset_id=a.id
            WHERE a.service_id=$1 AND r.retain_until<=clock_timestamp() ORDER BY r.retain_until LIMIT 200`,[service.id]);
        const candidates=[];
        for (const asset of assets) candidates.push({assetId:asset.id,referenced:(await assetReferences(client,asset)).length>0,
            bytesDeleted:false,action:'RETAIN_PENDING_EXPLICIT_PURGE_IMPLEMENTATION'});
        return {dryRun:true,candidates,bytesDeleted:0,packagePolicy:'RETAIN_IMMUTABLE_PACKAGE_AND_HISTORICAL_REFERENCES'};
    });
    return Object.freeze({remove,retention,planPurge});
}
module.exports = {createThemeAssetLifecycleService,assetReferences};
