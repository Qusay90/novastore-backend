'use strict';
const express=require('express');
const {authenticateCustomer}=require('../middlewares/authMiddleware');
const {createThemeStorefrontCustomerService}=require('../services/themeStorefrontCustomerService');

function createThemeStorefrontCustomerRouter(options){
    const router=express.Router(),service=createThemeStorefrontCustomerService(options);
    const error=(res,e)=>res.status(e.statusCode||503).json({code:e.statusCode?e.code:'STOREFRONT_UNAVAILABLE',...(Number.isSafeInteger(e.revision)?{revision:e.revision}:{})});
    router.use(async(req,res,next)=>{
        res.set('Cache-Control','private, no-store');res.set('X-Content-Type-Options','nosniff');
        try{await service.transaction(req,()=>null);next();}catch(e){error(res,e);}
    });
    // Existing customer login/session/address controllers retain their contracts.
    // Their mounts are finite; no generic /api proxy or Admin/Seller mount exists.
    router.use('/users',require('./userRoutes'));
    router.use('/addresses',require('./addressRoutes'));
    // Public capability metadata contains no customer state. Keep it after the
    // verified host/publication guard, but available before ordinary login.
    router.get('/payments/capability',(req,res)=>{
        if(Object.keys(req.query).length)return res.status(400).json({code:'INVALID_REQUEST'});
        return res.json({ready:false,state:'theme_payment_activation_required',message:'Bu mağazada ödeme bağlantısı henüz etkinleştirilmedi.'});
    });
    router.use(authenticateCustomer);
    const endpoint=(action,allowQuery=false)=>async(req,res)=>{
        try{if(!allowQuery&&Object.keys(req.query).length)return res.status(400).json({code:'INVALID_REQUEST'});res.json(await action(req));}catch(e){error(res,e);}
    };
    for(const key of ['cart','checkout'])for(const method of ['GET','PUT','DELETE'])router[method.toLowerCase()]('/'+key,endpoint(req=>service.cart(req,key,method)));
    router.post('/cart/finalize',endpoint(req=>service.cart(req,'cart','FINALIZE')));
    router.get('/favorites',endpoint(req=>service.favorites(req)));
    for(const method of ['POST','DELETE'])router[method.toLowerCase()]('/favorites/:productId',endpoint(req=>service.favorites(req,method)));
    router.get('/orders',endpoint(req=>service.orders(req)));
    router.get('/orders/:orderId',endpoint(req=>service.assertOrder(req,req.params.orderId)));
    const guarded=(check,handler)=>async(req,res)=>{try{await check(req);return handler(req,res);}catch(e){error(res,e);}};
    const payments=require('../controllers/paymentController');
    router.post('/agreements/preview',guarded(req=>service.assertCheckout(req),payments.getCheckoutAgreementPreview));
    router.get('/payments/status',guarded(req=>service.assertPayment(req),payments.getPaymentStatus));
    const productBody=req=>service.assertProduct(req,req.body?.productId??req.body?.product_id);
    const reviews=require('../controllers/reviewController');
    router.get('/products/:productId/reviews',guarded(async req=>{
        if(Object.keys(req.query).some(key=>!['limit','cursor','pagination'].includes(key)))throw Object.assign(new Error('INVALID_REQUEST'),{code:'INVALID_REQUEST',statusCode:400});
        await service.assertProduct(req,req.params.productId);
    },reviews.getProductReviews));
    router.post('/reviews',guarded(productBody,reviews.addReview));
    router.post('/questions',guarded(productBody,require('../controllers/questionController').askQuestion));
    router.use(require('./themeStoreSupportRoutes').createThemeStoreSupportRouter({...options,kind:'customer'}));
    router.use((_req,res)=>res.status(404).json({code:'RESOURCE_NOT_FOUND'}));
    return router;
}
module.exports={createThemeStorefrontCustomerRouter};
