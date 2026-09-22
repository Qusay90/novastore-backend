'use strict';
const express = require('express');
const path = require('path');
const { isPublicReviewRelease, PUBLIC_REVIEW_CONTACT: contact, PENDING_LEGAL_FIELDS } = require('../config/publicReviewConfig');
const { listLegalDocuments, getLegalDocument } = require('../services/publicReviewLegalService');
const { getPublicReviewProjection } = require('../config/publicReviewConfig');
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const contactHtml = () => `<address><strong>${escape(contact.brandName)}</strong><p>${escape(contact.address).replaceAll('\n','<br>')}</p><a href="${escape(contact.telephoneUri)}">${escape(contact.phone)}</a><a href="mailto:${escape(contact.email)}">${escape(contact.email)}</a></address><section aria-label="Kuruluş bilgileri">${PENDING_LEGAL_FIELDS.map(s=>`<p>${escape(s)}</p>`).join('')}</section>`;
const renderPage = (title, body, env) => `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,follow"><title>${escape(title)} | NovaStore</title><link rel="stylesheet" href="/public-review-legal.css"></head><body><a class="skip" href="#main-content">İçeriğe geç</a><header><a href="/">NovaStore</a><p>Yayına hazırlık / inceleme sürümü · Gerçek ödeme kapalı</p></header><main id="main-content"><h1>${escape(title)}</h1>${body}</main><footer><nav aria-label="Kurumsal ve yasal sayfalar"><a href="/iletisim">İletişim</a>${listLegalDocuments(env).filter(d=>d.slug!=='seller-agreement').map(d=>`<a href="${escape(d.path)}">${escape(d.title)}</a>`).join('')}</nav></footer></body></html>`;
function createPublicReviewRouter({ env = process.env } = {}) {
    const router = express.Router();
    router.use((req,res,next)=>{
        if (!isPublicReviewRelease(env)) return next('router');
        res.set('X-Robots-Tag','noindex, follow');
        if (req.path.startsWith('/api/')) res.set('Cache-Control','no-store');
        const normalizedPath = req.path.toLowerCase().replace(/\/+$/,'');
        if (!['GET','HEAD','OPTIONS'].includes(req.method) && (
            ['/api/payments/initialize','/api/users/register','/api/orders'].includes(normalizedPath)
            || normalizedPath.startsWith('/api/analytics/')
            || normalizedPath.startsWith('/api/assistant/')
        )) {
            return res.status(503).json({code:'PUBLIC_REVIEW_ACTION_DISABLED',error:'Bu inceleme yayınında yeni üyelik ve gerçek ödeme kapalıdır.'});
        }
        return next();
    });
    router.get('/api/business-identity', (_req,res)=>res.json(getPublicReviewProjection()));
    router.get('/api/payments/capability', (_req,res)=>res.json({available:false,enabled:false,ready:false,realPaymentReady:false,provider:null,reason:'Yayına hazırlık süresince gerçek ödeme kapalıdır.'}));
    router.get('/login.html',(_req,res)=>{
        res.set({'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY',
            'Content-Security-Policy':"default-src 'none'; style-src 'self'; script-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"});
        return res.sendFile(path.join(__dirname,'../frontend/public-review-login.html'));
    });
    router.get('/api/public/legal', (_req,res)=>res.json({documents:listLegalDocuments()}));
    router.get('/api/public/legal/:slug', (req,res)=>{
        const document = getLegalDocument(req.params.slug);
        return document ? res.json(document) : res.status(404).json({error:'Sayfa bulunamadı.'});
    });
    router.get('/public-review-legal.css',(_req,res)=>res.sendFile(path.join(__dirname,'../frontend/public-review-legal.css')));
    router.get('/robots.txt',(_req,res)=>res.type('text/plain').send('User-agent: *\nAllow: /\n'));
    router.use((req,res,next)=>{
        if (!['GET','HEAD'].includes(req.method)) return next();
        const route = req.path.replace(/\/+$/,'');
        const definition = listLegalDocuments(env).find(d=>d.path===route);
        if (route!=='/iletisim' && !definition) return next();
        res.set({ 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff', 'Referrer-Policy':'strict-origin-when-cross-origin',
            'X-Frame-Options':'DENY', 'Content-Security-Policy':"default-src 'none'; style-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'" });
        const doc=definition && getLegalDocument(definition.slug,env);
        const body=doc ? `<p>İnceleme şablonu · Sürüm: ${escape(doc.version)} · İşlem onayı için kullanılamaz.</p>${doc.text.split(/\n{2,}/).map(block=>{const [heading,...rest]=block.split('\n');return `<section><h2>${escape(heading)}</h2><p>${escape(rest.join('\n')).replaceAll('\n','<br>')}</p></section>`;}).join('')}` : contactHtml();
        return res.type('html').send(renderPage(doc?.title || 'İletişim',body,env));
    });
    return router;
}
module.exports = { createPublicReviewRouter, renderPage };
