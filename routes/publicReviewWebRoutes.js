'use strict';
const express = require('express');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const {isPublicReviewRelease} = require('../config/publicReviewConfig');
const webPath = path.join(__dirname, '../frontend/public-review/index.html');
function createPublicReviewWebRouter({env=process.env}={}) {
    const router = express.Router();
    router.use((req,res,next)=> isPublicReviewRelease(env) ? next() : next('router'));
    router.use((req,res,next)=>{
        // Generated development previews are never public review destinations.
        if (/^\/(?:commerce-pro-(?:preview|integration-preview|fixture)|public-review\/)/i.test(req.path)) {
            return res.status(404).type('text/plain').send('Sayfa bulunamadı.');
        }
        return next();
    });
    router.get(['/','/index.html','/commerce-pro','/commerce-pro/','/checkout.html','/paytr-checkout.html','/payment-result.html','/product.html','/categories.html',
        /^\/(?:kategori|urun|koleksiyon|magaza)(?:\/.*)?$/, /^\/(?:arama|sepet|odeme|giris|uye-ol|kayit|favoriler|hesabim|siparis|yardim|siparis-takibi|destek)(?:\/.*)?$/],(req,res)=>{
        if (!fs.existsSync(webPath)) return res.status(503).type('text/plain').send('NovaStore yayına hazırlanıyor. Lütfen daha sonra tekrar ziyaret edin.');
        const html = fs.readFileSync(webPath, 'utf8');
        const scriptHashes = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)]
            .filter(match=>match[1].trim()).map(match=>`'sha256-${crypto.createHash('sha256').update(match[1]).digest('base64')}'`);
        res.set({'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY',
            'Referrer-Policy':'strict-origin-when-cross-origin',
            'Content-Security-Policy':`default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; script-src 'self' ${scriptHashes.join(' ')}; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; media-src 'self' https:; font-src 'self' data:; connect-src 'self'; form-action 'self'`});
        return res.type('html').send(html);
    });
    return router;
}
module.exports={createPublicReviewWebRouter};
