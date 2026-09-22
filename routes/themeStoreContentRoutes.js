'use strict';
const express=require('express');
const {principalFromAdmin,principalFromSeller}=require('../services/themePlatformAuthService');
const {createStoreContentService}=require('../services/themePlatformStoreContentService');

// Mounted only behind the existing live principal middleware.
function createThemeStoreContentRouter({database,kind}) {
    const router=express.Router(),service=createStoreContentService(database);
    const handle=action=>async(req,res)=>{
        res.set('Cache-Control','private, no-store');
        try {
            if(Object.keys(req.query).length)return res.status(400).json({code:'THEME_QUERY_NOT_SUPPORTED'});
            const principal=kind==='admin'?principalFromAdmin(req):principalFromSeller(req);
            const result=action?await service.execute(principal,action,req.params,req.body,{idempotencyKey:req.get('Idempotency-Key')}):await service.read(principal,req.params);
            res.json(result);
        }catch(error){
            const status=error.statusCode>=400&&error.statusCode<500?error.statusCode:503;
            res.status(status).json({code:/^(THEME_|RESOURCE_NOT_FOUND$)/u.test(error.code||'')?error.code:'THEME_SERVICE_UNAVAILABLE'});
        }
    };
    router.get('/services/:serviceId/store-content',handle());
    if(kind==='admin') {
        router.put('/services/:serviceId/contact',handle('saveContact'));
        router.post('/services/:serviceId/legal-documents',handle('createLegal'));
        router.post('/services/:serviceId/legal-documents/:documentId/approve',handle('approveLegal'));
        router.post('/services/:serviceId/legal-documents/:documentId/revoke',handle('revokeLegal'));
    }
    return router;
}
module.exports={createThemeStoreContentRouter};
