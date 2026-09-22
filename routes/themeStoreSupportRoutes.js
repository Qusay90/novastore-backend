'use strict';
const express=require('express');
const {principalFromAdmin,principalFromSeller}=require('../services/themePlatformAuthService');
const {createThemeStoreSupportService}=require('../services/themeStoreSupportService');
const definitions=[['get','/threads','list'],['post','/threads','create'],['get','/threads/:threadId','detail'],
    ['post','/threads/:threadId/messages','message'],['post','/threads/:threadId/read','read'],['patch','/threads/:threadId/state','state']];

// Both routers must be mounted after existing audience/session middleware.
function createThemeStoreSupportRouter({database,runtimeAuthority,kind}){
    const router=express.Router(),service=createThemeStoreSupportService({database,runtimeAuthority});
    const handle=action=>async(req,res)=>{
        res.set('Cache-Control','private, no-store');res.set('X-Content-Type-Options','nosniff');
        try{
            const allowed=action==='detail'?['after']:[];
            if(Object.keys(req.query).some(key=>!allowed.includes(key)))return res.status(400).json({code:'THEME_QUERY_NOT_SUPPORTED'});
            if(req.query.after!==undefined&&!/^(?:0|[1-9]\d{0,14})$/u.test(req.query.after))return res.status(400).json({code:'THEME_INVALID_INTEGER'});
            const params={...req.params,...(req.query.after!==undefined?{after:Number(req.query.after)}:{})};
            const result=kind==='customer'?await service.customerAction(req,action,params,req.body):await service.operatorAction(
                kind==='admin'?principalFromAdmin(req):principalFromSeller(req),action,params,req.body);
            res.json(result);
        }catch(error){res.status(error.statusCode>=400&&error.statusCode<500?error.statusCode:503).json({code:/^THEME_/u.test(error.code||'')?error.code:'THEME_SUPPORT_UNAVAILABLE'});}
    };
    const prefix=kind==='customer'?'/support':'/services/:serviceId/support';
    if(kind==='customer')router.get(prefix+'/context',handle('context'));
    if(kind==='admin'){router.get(prefix+'/policy',handle('policyRead'));router.put(prefix+'/policy',handle('policy'));}
    router.get(prefix+'/threads/:threadId/after/:after',handle('detail'));
    for(const[method,path,action]of definitions){if(action==='create'&&kind!=='customer')continue;router[method](prefix+path,handle(action));}
    return router;
}
module.exports={createThemeStoreSupportRouter};
