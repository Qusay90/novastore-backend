'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const Module=require('node:module');
const adminRoot=path.join(__dirname,'../admin-commerce-pro');
const requireAdmin=Module.createRequire(path.join(adminRoot,'package.json'));
const React=requireAdmin('react'),{renderToStaticMarkup}=requireAdmin('react-dom/server');
const built=requireAdmin('esbuild').buildSync({entryPoints:[path.join(adminRoot,'src/theme-platform/StoreSupportInbox.jsx')],
    bundle:true,write:false,platform:'node',format:'cjs',external:['react'],loader:{'.css':'empty'},logLevel:'silent'});
const compiled=new Module(path.join(adminRoot,'support-inbox-qa.cjs'),module);compiled.filename=path.join(adminRoot,'support-inbox-qa.cjs');compiled.paths=Module._nodeModulePaths(adminRoot);compiled._compile(built.outputFiles[0].text,compiled.filename);
const {default:Inbox,StoreSupportMessage}=compiled.exports;
test('actual compiled Inbox gracefully renders absent store without transport or policy controls',()=>{
    const result=renderToStaticMarkup(React.createElement(Inbox,{client:{get(){throw Error('No scope');}},kind:'admin'}));
    assert.match(result,/bir mağaza seçin/u);assert(!result.includes('<select'));assert(!result.includes('<form'));
});
test('Seller initial view exposes scoped inbox only and no unconfirmed policy editor',()=>{
    const result=renderToStaticMarkup(React.createElement(Inbox,{client:{kind:'seller'},serviceId:'11111111-1111-4111-8111-111111111111'}));
    assert.match(result,/Yalnız bu mağazanın destek görüşmeleri/u);assert(!result.includes('Yönlendirmeyi kaydet'));assert(!result.includes('<textarea'));
});
test('persisted customer HTML and script text are escaped by real React rendering',()=>{
    const body='<img src=x onerror=alert(1)><script>steal()</script>& " quote';
    const result=renderToStaticMarkup(React.createElement(StoreSupportMessage,{message:{senderKind:'CUSTOMER',body,createdAt:'2026-09-19T10:00:00Z'}}));
    assert(!result.includes('<img'));assert(!result.includes('<script'));assert(result.includes('&lt;img'));assert(result.includes('&lt;script&gt;steal()'));assert.match(result,/Müşteri/u);
});
test('operator sender labels remain distinct and retain plain multiline message body',()=>{
    for(const [senderKind,label]of [['SELLER','Mağaza desteği'],['ADMIN','Nova Store desteği']]){
        const result=renderToStaticMarkup(React.createElement(StoreSupportMessage,{message:{senderKind,body:'Birinci satır\nİkinci satır',createdAt:'2026-09-19T10:00:00Z'}}));
        assert(result.includes(label));assert(result.includes('Birinci satır\nİkinci satır'));assert(!result.includes('sender_user_id'));
    }
});
