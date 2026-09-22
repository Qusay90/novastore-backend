'use strict';
const assert=require('node:assert/strict');
const express=require('express');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {createPublicReviewRouter,renderPage}=require('../routes/publicReviewRoutes');
const {createPublicReviewWebRouter}=require('../routes/publicReviewWebRoutes');
const {listLegalDocuments}=require('../services/publicReviewLegalService');
const {PUBLIC_REVIEW_CONTACT:contact,getPublicReviewProjection}=require('../config/publicReviewConfig');
const collapse=value=>value.replace(/\s+/g,' ').trim();
const plain=value=>value.replace(/<[^>]+>/g,' ').replace(/&(?:amp|lt|gt|quot|#39);/g,entity=>({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&#39;':"'"})[entity]);
(async()=>{
 let dangerousHandlerCalls=0;
 const app=express();app.use(createPublicReviewRouter({env:{NOVASTORE_PUBLIC_REVIEW_RELEASE:'true'}}));app.use(createPublicReviewWebRouter({env:{NOVASTORE_PUBLIC_REVIEW_RELEASE:'true'}}));
 app.use((req,res)=>{dangerousHandlerCalls++;res.sendStatus(418);});
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 const origin='http://127.0.0.1:'+server.address().port;
 const checks=[];
 try {
  const docs=listLegalDocuments();assert.equal(docs.length,12);
  for(const doc of docs){
   assert.equal(doc.status,'review_template');assert.equal(doc.consentEligible,false);assert.equal(doc.lawyerApproved,false);assert.equal(doc.requiredForCheckout,false);
   assert.equal(doc.contentHash,crypto.createHash('sha256').update(doc.text).digest('hex'));
   assert.match(doc.path,/^\/[a-z0-9]+(?:-[a-z0-9]+)*$/);
   const response=await fetch(origin+doc.path),html=await response.text();assert.equal(response.status,200);
   assert.match(response.headers.get('content-security-policy'),/default-src 'none'/);assert(!/<script\b|onerror\s*=|javascript:/i.test(html));
   const visible=collapse(plain(html));for(const block of doc.text.split(/\n+/).filter(Boolean))assert(visible.includes(collapse(block)),doc.slug+' no-JS text');
   for(const href of [...html.matchAll(/href="([^"]+)"/g)].map(match=>match[1]).filter(value=>value.startsWith('/')&&!value.endsWith('.css')))assert.equal((await fetch(origin+href)).status,200,'Public legal link '+href);
   const json=await (await fetch(origin+'/api/public/legal/'+doc.slug)).json();assert.deepEqual(json,doc);
   checks.push('legal:'+doc.slug);
  }
  const html=await (await fetch(origin+'/iletisim')).text();
  assert(collapse(plain(html)).includes(collapse(contact.address)));assert(html.includes('tel:+905551772430'));assert(html.includes('0555 177 24 30'));assert(html.includes('mailto:destek@novastore.tr'));
  const identity=await (await fetch(origin+'/api/business-identity')).json();assert.deepEqual(identity,getPublicReviewProjection());assert.equal(identity.identity,null);assert.equal(identity.legalIdentityComplete,false);
  for(const field of ['legalCompanyName','taxNumber','mersisNumber','kepAddress','taxOffice','tradeRegistry','chamberRegistration'])assert.equal(identity.publicContact[field],null,field);
  assert.equal(identity.publicContact.etbisStatus,'pending');checks.push('contact-and-pending-identity');
  assert.match(docs.find(d=>d.slug==='marketplace-disclosure').text,/satıcı/i);assert.match(docs.find(d=>d.slug==='marketplace-disclosure').text,/aracı/i);assert.match(docs.find(d=>d.slug==='seller-agreement').text,/satıcı yetkisi veya ödeme aktarımı sağlamaz/);checks.push('marketplace-seller-roles');
  assert(renderPage('<img src=x onerror=alert(1)>','<p>trusted body</p>').includes('&lt;img src=x onerror=alert(1)&gt;'));checks.push('escaped-untrusted-title');
  for(const route of ['/api/payments/initialize','/API/PAYMENTS/INITIALIZE/','/api/users/register','/api/orders','/api/assistant/chat','/api/analytics/page-enter']){
   const response=await fetch(origin+route,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});assert.equal(response.status,503);const json=await response.json();assert.equal(json.code,'PUBLIC_REVIEW_ACTION_DISABLED');assert(!/table|schema|stack|consent_version/i.test(json.error));
  }
  checks.push('registration-order-provider-and-analytics-denial');
  const capability=await(await fetch(origin+'/api/payments/capability')).json();assert.equal(capability.realPaymentReady,false);assert.equal(capability.provider,null);
  const loginHtml=await(await fetch(origin+'/login.html')).text();assert.match(loginHtml,/Mevcut müşteri hesabınıza giriş yapın/);assert(!/register-form|autocomplete="new-password"/.test(loginHtml));checks.push('existing-login-registration-presentation');
  const bytes=fs.readFileSync(path.join(__dirname,'../frontend/public-review/index.html'));
  for(const route of ['/','/arama','/kategori/elektronik','/urun/38','/sepet','/odeme','/uye-ol','/checkout.html','/paytr-checkout.html','/payment-result.html']){const response=await fetch(origin+route);assert.equal(response.status,200);assert.deepEqual(Buffer.from(await response.arrayBuffer()),bytes);}
  for(const route of ['/commerce-pro-preview/','/commerce-pro-integration-preview/','/commerce-pro-fixture/','/public-review/index.html'])assert.equal((await fetch(origin+route)).status,404);
  assert.equal(dangerousHandlerCalls,0);checks.push('exact-built-route-delivery-and-preview-isolation');
  const result={status:'PASS',legalPages:13,checks,dangerousHandlerCalls,providerCalls:0,orderCreation:0,registrationCreation:0};
  fs.writeFileSync(path.join(__dirname,'../artifacts/r38-r1/legal-tests.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
 } finally {await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error.message);process.exitCode=1;});
