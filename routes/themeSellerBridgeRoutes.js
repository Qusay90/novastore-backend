'use strict';

const express = require('express');
const { createThemeSellerBridge } = require('../services/themeSellerBridgeService');
const { createThemePlatformService } = require('../services/themePlatformService');
const { createThemeExperienceService } = require('../services/themePlatformExperienceService');

// Deliberately finite: new general Seller endpoints do not expand bridge scope.
const sellerRoutes = [
    ['get','/assignments','assignments'], ['get','/assignments/:assignmentId','assignment'],
    ['post','/assignments/:assignmentId/accept','accept'],
    ['get','/services/:serviceId/capabilities','capabilities'], ['get','/services/:serviceId/entitlements','entitlements'],
    ['get','/drafts/:draftId','draft'], ['put','/drafts/:draftId','saveDraft'],
    ['post','/drafts/:draftId/previews','preview'], ['get','/previews/:previewId','preview'],
    ['post','/services/:serviceId/assets','registerAsset'], ['get','/assets/:assetId','asset'],
    ['post','/drafts/:draftId/publications','publication'], ['get','/publications/:publicationId','publication'],
    ['post','/publications/:publicationId/rollback','rollback'], ['get','/operations/:operationId','operation']
];

const experienceRoutes = [
    ['get','/services/:serviceId/experience','experience'],
    ['get','/services/:serviceId/editor-context','context'],
    ['get','/services/:serviceId/drafts/:draftId/history','history'],
    ['post','/services/:serviceId/stored-assets','storeAsset'],
    ['get','/services/:serviceId/assignments/:assignmentId/commerce/products/:productId','commerce'],
    ['post','/services/:serviceId/assignments/:assignmentId/commerce/quote','commerce'],
    ['get','/assets/:assetId/content','bytes'],
    ['get','/services/:serviceId/versions/:versionId/assets/:assetKey','bytes']
];
const supportRoutes = [
    ['get','/services/:serviceId/support/threads','list'],
    ['get','/services/:serviceId/support/threads/:threadId','detail'],
    ['get','/services/:serviceId/support/threads/:threadId/after/:after','detail'],
    ['post','/services/:serviceId/support/threads/:threadId/messages','message'],
    ['post','/services/:serviceId/support/threads/:threadId/read','read'],
    ['patch','/services/:serviceId/support/threads/:threadId/state','state']
];
const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
const routes = [...sellerRoutes.map(row => [...row,'platform']), ...experienceRoutes.map(row => [...row,'experience']), ...supportRoutes.map(row => [...row,'support'])].map(([method,path,action,engine]) => {
    const keys=[];
    const source=path.replace(/:([A-Za-z]+)/gu,(_,key)=>{keys.push(key);return key==='productId'?'([1-9][0-9]{0,14})':key==='after'?'(0|[1-9][0-9]{0,14})':key==='assetKey'?'([A-Za-z0-9_.%-]{1,300})':`(${uuid})`;});
    return {method:method.toUpperCase(),regex:new RegExp(`^${source}$`,'u'),keys,action,engine};
});
function matchThemeSellerRequest(request) {
    if (!request || Array.isArray(request) || typeof request!=='object'
        || Object.keys(request).some(key=>!['method','path','body','idempotencyKey','ifMatch'].includes(key))
        || typeof request.path!=='string' || request.path.includes('..') || /[?#\\]/u.test(request.path)) return null;
    if (request.method==='GET' && (request.body!==undefined || request.idempotencyKey!==undefined || request.ifMatch!==undefined)) return null;
    for(const route of routes) {
        const match=route.method===request.method && route.regex.exec(request.path);
        if(match) {
            let params;try{params=Object.fromEntries(route.keys.map((key,index)=>[key,decodeURIComponent(match[index+1])]));}catch{return null;}
            if(params.assetKey && (/[\\]/u.test(params.assetKey)||params.assetKey.includes('..'))) return null;
            return {...route,params};
        }
    }
    return null;
}
function createThemeSellerBridgeRouter({database,enabled,runtime,transport,inspect,storageRoot,storage}) {
    const router=express.Router();
    router.use((_req,res,next)=>{res.set('Cache-Control','private, no-store');res.set('X-Content-Type-Options','nosniff');next();});
    if(enabled!==true) {router.use((_req,res)=>res.status(404).json({code:'THEME_BRIDGE_DISABLED'}));return router;}
    const bridge=createThemeSellerBridge({database,runtime,transport,inspect});
    const platform=createThemePlatformService(database), experience=createThemeExperienceService(database,{storageRoot,storage});
    const support=require('../services/themeStoreSupportService').createThemeStoreSupportService({database});
    router.post('/dispatch',async(req,res)=>{
        try {
            if(Object.keys(req.query).length || req.get('Authorization')) return res.status(400).json({code:'THEME_BRIDGE_REQUEST_INVALID'});
            const request=req.body?.request, matched=matchThemeSellerRequest(request);
            if(!matched) return res.status(404).json({code:'THEME_BRIDGE_ACTION_FORBIDDEN'});
            const bodyBytes=Math.max(Number(req.themeBridgeBodyBytes)||0,Buffer.byteLength(JSON.stringify(req.body)));
            if(bodyBytes>(matched.action==='storeAsset'?7*1024*1024:1024*1024))return res.status(413).json({code:'THEME_BRIDGE_REQUEST_TOO_LARGE'});
            const principal=await bridge.authenticate(req.body);
            let result;
            if(matched.engine==='support')result=await support.operatorAction(principal,matched.action,matched.params,request.body);
            else if(matched.action==='bytes') {const asset=await experience.bytes(principal,matched.params); result={mime:asset.mime,bytesBase64:asset.buffer.toString('base64')};}
            else if(matched.action==='commerce') result=await experience.commercePreview(principal,matched.params,request.method==='POST'?request.body:undefined);
            else {
                const service=matched.engine==='platform'?platform:experience;
                result=request.method==='GET'?await service.read(principal,matched.action,matched.params)
                    :await service.execute(principal,matched.action,matched.params,request.body,{idempotencyKey:request.idempotencyKey,ifMatch:request.ifMatch});
            }
            res.json(result);
        }catch(error){
            res.status(Number.isInteger(error.statusCode)&&error.statusCode>=400&&error.statusCode<500?error.statusCode:503)
                .json({code:/^(?:THEME_|RESOURCE_NOT_FOUND$|INVALID_|CART_|VARIANT_)/u.test(error.code||'')?error.code:'THEME_BRIDGE_UNAVAILABLE'});
        }
    });
    return router;
}
module.exports={createThemeSellerBridgeRouter,matchThemeSellerRequest};
