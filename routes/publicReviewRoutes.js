'use strict';
const express = require('express');
const path = require('path');
const { isPublicReviewRelease, PUBLIC_REVIEW_CONTACT: contact, PENDING_LEGAL_FIELDS } = require('../config/publicReviewConfig');
const { listLegalDocuments, getLegalDocument } = require('../services/publicReviewLegalService');
const { getPublicReviewProjection } = require('../config/publicReviewConfig');
const getPool = () => require('../config/db');
const { buildPublicProductSqlPredicate } = require('../constants/productVisibility');
const { maskFullName } = require('../services/privacyService');
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
    router.get('/api/public/review/products/:id/store', async (req,res) => {
        if (!/^[1-9]\d*$/.test(req.params.id)) return res.status(400).json({error:'Geçersiz ürün.'});
        try {
            const result = await getPool().query(`SELECT s.slug, s.name FROM products p JOIN stores s ON s.id=p.store_id WHERE p.id=$1 AND ${buildPublicProductSqlPredicate('p')} AND s.is_active=TRUE AND s.deleted_at IS NULL`, [req.params.id]);
            return res.json({store: result.rows[0] || null});
        } catch { return res.status(503).json({error:'Mağaza bilgisi alınamadı.'}); }
    });
    router.get(['/api/public/review/questions/:id','/api/questions/product/:id'], async (req,res) => {
        if (!/^[1-9]\d*$/.test(req.params.id)) return res.status(400).json({error:'Geçersiz ürün.'});
        const cursor=req.query.cursor ? Number(req.query.cursor) : Number.MAX_SAFE_INTEGER;
        if (!Number.isSafeInteger(cursor) || cursor<1) return res.status(400).json({error:'Geçersiz devam bilgisi.'});
        try {
            const result = await getPool().query(`SELECT q.id,q.question,q.answer,q.created_at,q.answered_at,COALESCE(u.full_name,u.name) AS user_name FROM product_questions q JOIN products p ON p.id=q.product_id LEFT JOIN users u ON u.id=q.user_id WHERE p.id=$1 AND q.id<$2::bigint AND ${buildPublicProductSqlPredicate('p')} AND q.answer IS NOT NULL AND btrim(q.answer) <> '' ORDER BY q.id DESC LIMIT 101`, [req.params.id,cursor]);
            const more=result.rows.length>100, rows=result.rows.slice(0,100).map(row=>({...row,user_name:maskFullName(row.user_name),is_answered:true}));
            return res.json(req.path.startsWith('/api/public/') ? {items:rows,pagination:{limit:100,hasMore:more,nextCursor:more?String(rows[rows.length-1].id):null}} : rows);
        } catch { return res.status(503).json({error:'Sorular alınamadı.'}); }
    });
    router.get('/api/public/stores/:slug', async (req,res) => {
        const slug=String(req.params.slug);
        const limit=Number(req.query.limit || 20);
        const cursor=req.query.cursor ? Number(req.query.cursor) : 0;
        if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || !Number.isInteger(limit) || limit<1 || limit>100 || !Number.isSafeInteger(cursor) || cursor<0) return res.status(400).json({error:'Geçersiz mağaza isteği.'});
        try {
            const found=await getPool().query('SELECT id,slug,name FROM stores WHERE slug=$1 AND is_active=TRUE AND deleted_at IS NULL', [slug]);
            if (!found.rowCount) return res.status(404).json({error:'Mağaza bulunamadı.'});
            if (found.rowCount !== 1) return res.status(409).json({error:'Mağaza kimliği doğrulanamadı.'});
            const store=found.rows[0];
            const rows=await getPool().query(`SELECT p.id,p.name,p.description,p.price,p.old_price,p.stock,p.image_url,p.category,p.categories,p.brand FROM products p WHERE p.store_id=$1 AND p.id>$2 AND ${buildPublicProductSqlPredicate('p')} ORDER BY p.id LIMIT $3`,[store.id,cursor,limit+1]);
            const count=await getPool().query(`SELECT COUNT(*)::integer AS count FROM products p WHERE p.store_id=$1 AND ${buildPublicProductSqlPredicate('p')}`,[store.id]);
            const more=rows.rows.length>limit, products=rows.rows.slice(0,limit);
            return res.json({store:{slug:store.slug,name:store.name,product_count:count.rows[0].count},products,pagination:{limit,hasMore:more,nextCursor:more?String(products[products.length-1].id):null}});
        } catch { return res.status(503).json({error:'Mağaza şu anda yüklenemedi.'}); }
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
