'use strict';
const express=require('express'),v=require('../services/themePlatformValidation'),f=require('../services/themePlatformService');
const {authorize,principalFromAdmin,principalFromSeller}=require('../services/themePlatformAuthService');
function createThemePublicationRouter({database,kind,composition}){
    const router=express.Router(),assets=require('../services/themePlatformAssetLifecycleService').createThemeAssetLifecycleService({database});
    const principal=req=>kind==='admin'?principalFromAdmin(req):principalFromSeller(req);
    const endpoint=action=>async(req,res)=>{
        try{if(Object.keys(req.query).length)v.fail('THEME_QUERY_NOT_SUPPORTED');res.json(await action(req,principal(req)));}
        catch(error){res.status(error.statusCode>=400&&error.statusCode<=503?error.statusCode:503).json({code:/^THEME_/u.test(error.code||'')?error.code:'THEME_SERVICE_UNAVAILABLE'});}
    };
    router.get('/services/:serviceId/asset-retention',endpoint((req,p)=>assets.retention(p,req.params)));
    router.post('/assets/:assetId/remove',endpoint((req,p)=>{v.keys(req.body,['expectedRevision','reason'],['expectedRevision','reason']);return assets.remove(p,{...req.params,...req.body});}));
    router.get('/publications/:publicationId/local-status',endpoint((req,p)=>f.transaction(database,async client=>{
        const {service,resource}=await f.loadScope(client,'publication',req.params,p);
        await authorize(client,p,'publication.read',service);await f.activeService(client,service);
        const artifact=await f.one(client,'SELECT id,channel,digest,source_digest,created_at FROM theme_publication_artifacts WHERE publication_id=$1',[resource.id]);
        const pointer=artifact?await f.one(client,"SELECT artifact_id,previous_artifact_id,generation,updated_at FROM theme_active_artifacts WHERE service_id=$1 AND channel=$2 AND environment='LOCAL'",[service.id,artifact.channel]):null;
        return {publicationId:resource.id,status:resource.status,environment:'LOCAL',artifact:artifact||null,pointer:pointer||null,
            stages:await f.rows(client,'SELECT id,state,reason,created_at FROM theme_publication_stage_events WHERE publication_id=$1 ORDER BY id',[resource.id])};
    })));
    if(kind==='admin'){
        router.get('/services/:serviceId/asset-purge-plan',endpoint((req,p)=>assets.planPurge(p,req.params)));
        router.post('/publications/:publicationId/build-local',endpoint(async(req,p)=>{
            v.keys(req.body,[]);
            await f.transaction(database,async client=>{const {service}=await f.loadScope(client,'publication',req.params,p);await authorize(client,p,'publication.request',service);await f.activeService(client,service);});
            return composition.get().publication.build(req.params.publicationId);
        }));
        for(const action of ['activate','rollback'])router.post(`/publications/:publicationId/${action}-local`,endpoint((req,p)=>{
            v.keys(req.body,['expectedGeneration'],['expectedGeneration']);return composition.get().publication[action](p,{...req.params,expectedGeneration:req.body.expectedGeneration});
        }));
    }
    return router;
}
module.exports={createThemePublicationRouter};
