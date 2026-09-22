'use strict';
const express=require('express');
const {principalFromAdmin,principalFromSeller}=require('../services/themePlatformAuthService');
const {createThemeExperienceService}=require('../services/themePlatformExperienceService');
// Mounted AFTER the existing principal and tenant middleware, never independently.
const createThemeExperienceRouter=({database,kind,storageRoot,storage})=>{
    const router=express.Router(), service=createThemeExperienceService(database,{storageRoot,storage});
    const principal=req=>kind==='admin'?principalFromAdmin(req):principalFromSeller(req);
    const handle=(action,write=false)=>async(req,res)=>{
        try {
            if(Object.keys(req.query).length) return res.status(400).json({code:'THEME_QUERY_NOT_SUPPORTED'});
            const result=write?await service.execute(principal(req),action,req.params,req.body,{idempotencyKey:req.get('Idempotency-Key'),ifMatch:req.get('If-Match')})
                :await service.read(principal(req),action,req.params);
            res.json(result);
        }catch(error){
            const status=Number.isInteger(error.statusCode)&&error.statusCode>=400&&error.statusCode<500?error.statusCode:503;
            const code=/^(?:THEME_|RESOURCE_NOT_FOUND$|INVALID_REFERENCE$|INVALID_NAVIGATION$)/u.test(error.code||'')?error.code:'THEME_SERVICE_UNAVAILABLE';
            res.status(status).json({code});
        }
    };
    if(kind==='admin') {
        router.get('/workshop-launch',async(req,res)=>{
            try {
                if(Object.keys(req.query).length) return res.status(400).json({code:'THEME_QUERY_NOT_SUPPORTED'});
                // Reuse live Admin role/session authorization. Catalog contents
                // are intentionally not returned by this launch descriptor.
                await service.read(principal(req),'catalog',{});
                res.json({url:'/studio-pro/?surface=admin',mode:'AUTHORING_WITH_SCOPED_OFFERS',liveData:false,uiPreserved:true,sellerOffers:'SERVER_SCOPED'});
            } catch(error) {
                const status=Number.isInteger(error.statusCode)&&error.statusCode>=400&&error.statusCode<500?error.statusCode:503;
                res.status(status).json({code:/^THEME_/u.test(error.code||'')?error.code:'THEME_SERVICE_UNAVAILABLE'});
            }
        });
        router.get('/experience/catalog',handle('catalog'));
        router.get('/experience/profiles',handle('profiles'));
        router.put('/experience/profiles',handle('saveProfile',true));
        router.get('/experience/stores',handle('stores'));
        router.post('/experience/packages',handle('importPackage',true));
        router.put('/services/:serviceId/experience',handle('configureExperience',true));
        router.post('/services/:serviceId/offers',handle('createOffer',true));
        router.get('/offers/:offerId',handle('offer'));
        router.get('/offers/:offerId/seller-preview',handle('offerPreview'));
        router.post('/offers/:offerId/prepare',handle('prepareOffer',true));
        router.get('/services/:serviceId/seller-preview',handle('sellerPreview'));
        router.get('/services/:serviceId/experience-details',handle('details'));
    }
    router.get('/services/:serviceId/experience',handle('experience'));
    router.get('/services/:serviceId/editor-context',handle('context'));
    router.get('/services/:serviceId/drafts/:draftId/history',handle('history'));
    router.post('/services/:serviceId/stored-assets',handle('storeAsset',true));
    const commerce=(quote=false)=>async(req,res)=>{
        try {
            if(Object.keys(req.query).length) return res.status(400).json({code:'THEME_QUERY_NOT_SUPPORTED'});
            res.json(await service.commercePreview(principal(req),req.params,quote?req.body:undefined));
        } catch(error) { res.status(error.statusCode>=400&&error.statusCode<500?error.statusCode:503).json({code:/^(THEME_|RESOURCE_NOT_FOUND|INVALID_|CART_|VARIANT_)/u.test(error.code||'')?error.code:'THEME_SERVICE_UNAVAILABLE'}); }
    };
    router.get('/services/:serviceId/assignments/:assignmentId/commerce/products/:productId',commerce());
    router.post('/services/:serviceId/assignments/:assignmentId/commerce/quote',commerce(true));
    if(kind==='admin') {
        router.get('/offers/:offerId/commerce/products/:productId',commerce());
        router.post('/offers/:offerId/commerce/quote',commerce(true));
    }
    const asset=async(req,res)=>{
        try{
            if(Object.keys(req.query).length) return res.status(400).json({code:'THEME_QUERY_NOT_SUPPORTED'});
            const result=await service.bytes(principal(req),req.params);
            res.set('Content-Security-Policy',"default-src 'none'; sandbox");
            res.set('Cross-Origin-Resource-Policy','same-origin');
            res.type(result.mime).send(result.buffer);
        }catch(error){res.status(error.statusCode>=400&&error.statusCode<500?error.statusCode:503).json({code:/^THEME_/u.test(error.code||'')?error.code:'THEME_ASSET_UNAVAILABLE'});}
    };
    router.get('/assets/:assetId/content',asset);
    // Encode an asset key as one path parameter; never resolve it as a filesystem path.
    if(kind==='admin') router.get('/versions/:versionId/assets/:assetKey',asset);
    else router.get('/services/:serviceId/versions/:versionId/assets/:assetKey',asset);
    return router;
};
module.exports={createThemeExperienceRouter};
