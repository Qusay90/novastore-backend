import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import {authorizeWorkshop} from '../src/workshop/auth.js';
import {relocateWorkshopPaths,relocateWorkshopModule} from '../src/workshop/paths.mjs';
import {createPortableGallerySource} from '../src/workshop/gallery-portable.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const descriptor={url:'/studio-pro/?surface=admin',mode:'AUTHORING_WITH_SCOPED_OFFERS',liveData:false,uiPreserved:true,sellerOffers:'SERVER_SCOPED'};
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
test('full authoring entry requires a fresh successful Admin workshop descriptor',async()=>{
 const calls=[],fetchImpl=()=>{throw Error('Only captured transport is provided');},http={request:async(...args)=>{calls.push(args);return descriptor;}};
 assert.deepEqual(await authorizeWorkshop({fetchImpl,http}),{http,fetchImpl});
 assert.deepEqual(calls,[['/api/admin/theme-platform/workshop-launch',{cache:'no-store'}]]);
});
test('workshop auth rejects denied transport and every mismatched authority descriptor',async()=>{
 const fetchImpl=()=>{};
 await assert.rejects(authorizeWorkshop({fetchImpl,http:{request:async()=>{throw Object.assign(Error('Denied'),{status:403});}}}),{status:403});
 for(const value of [null,{...descriptor,url:'https://foreign.invalid/'},{...descriptor,mode:'LOCAL'},{...descriptor,liveData:true},{...descriptor,uiPreserved:false},{...descriptor,sellerOffers:'LOCAL'}])await assert.rejects(authorizeWorkshop({fetchImpl,http:{request:async()=>value}}),/doğrulanamadı/);
});
test('workshop relocates only original static roots without changing API or shared editor paths',()=>{
 const source=`const x="/media/a.png";const y='/?surface=admin';const z=\`/theme-library/themes/a/index.html\`;url('/calibration-assets/official/fonts/inter_regular.ttf');const q='/android-app.html';const api='/api/admin/theme-platform';const core='/theme-studio/';const external='https://example.invalid/media/a.png';`;
 const moved=relocateWorkshopPaths(source);
 for(const expected of ['/studio-pro/media/a.png','/studio-pro/?surface=admin','/studio-pro/theme-library/themes/a/index.html','/studio-pro/calibration-assets/official/fonts/inter_regular.ttf','/studio-pro/android-app.html'])assert.ok(moved.includes(expected));
 assert.ok(moved.includes("'/api/admin/theme-platform'"));assert.ok(moved.includes("'/theme-studio/'"));assert.ok(moved.includes('https://example.invalid/media/a.png'));assert.equal(relocateWorkshopPaths(moved),moved);
});
test('all 54 original gallery templates round-trip with their decoded byte attestations',()=>{
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'workshop-gallery-provenance.json'))),templates=manifest.entries.filter(e=>e.kind==='original-template-json');assert.equal(templates.length,54);
 for(const entry of templates){const bytes=fs.readFileSync(path.join(root,'workshop-public/theme-library',entry.path)),html=JSON.parse(bytes);assert.equal(sha(bytes),entry.sha256,entry.path);assert.equal(Buffer.byteLength(html),entry.decodedBytes,entry.path);assert.equal(sha(html),entry.decodedSha256,entry.path);}
});
test('workshop media normalization accepts relocated and original backups while rejecting foreign and traversal paths',()=>{
 const source=fs.readFileSync(path.join(root,'src/sandbox/documentModel.js'),'utf8'),transformed=relocateWorkshopModule(source,'/src/sandbox/documentModel.js');
 const imageStart=transformed.indexOf('function image(value, path)'),imageEnd=transformed.indexOf('\nfunction target(',imageStart);
 const helper=transformed.slice(0,transformed.indexOf('\n'));
 const image=Function(`${helper}\nconst text=(v,f)=>v===undefined?f:v;const fail=()=>{throw Error('invalid image');};${transformed.slice(imageStart,imageEnd)};return image;`)();
 assert.equal(image('/media/product-watch.webp','image'),'/studio-pro/media/product-watch.webp');
 assert.equal(image('/studio-pro/media/product-watch.webp','image'),'/studio-pro/media/product-watch.webp');
 for(const invalid of ['https://foreign.invalid/a.png','/studio-pro/media/../a.png','/studio-pro/media//a.png'.replace('//','/../'),'/other/media/a.png'])assert.throws(()=>image(invalid,'image'));
 assert.ok(source.includes(String.raw`/^\/media\/`),'Shared server/module source is unmodified');
});
test('all extracted gallery image bytes and original copied public fonts are intact',()=>{
 const gallery=JSON.parse(fs.readFileSync(path.join(root,'workshop-gallery-provenance.json'))),assets=gallery.entries.filter(e=>e.kind==='decoded-original-asset');assert.equal(assets.length,144);
 for(const entry of assets){const bytes=fs.readFileSync(path.join(root,'workshop-public/theme-library',entry.path));assert.equal(sha(bytes),entry.sha256,entry.path);assert.equal(sha(`data:${entry.mimeType};base64,${bytes.toString('base64')}`),entry.originalDataUriSha256,entry.path);}
 const original=JSON.parse(fs.readFileSync(path.join(root,'workshop-source-provenance.json'))),fonts=original.entries.filter(e=>e.path.includes('/official/fonts/'));assert.equal(fonts.length,5);
 for(const entry of fonts)assert.equal(sha(fs.readFileSync(path.join(root,entry.path))),entry.sha256,entry.path);
 assert.ok(gallery.entries.every(entry=>entry.bytes<95*1024*1024));
});
test('local gallery export reconstructs portable image bytes and refuses partial or foreign manifests',async()=>{
 const id='__NS_ASSET_123456789012345678901234__',source=`<img src="${id}"><img src="${id}">`,bytes=Buffer.from('original raster bytes'),calls=[];
 const options={sources:{web:source},assets:{[id]:'/studio-pro/theme-library/embedded-assets/example.png'},mimeTypes:{[id]:'image/png'},fetchImpl:async(url,init)=>{calls.push([url,init]);return {ok:true,arrayBuffer:async()=>bytes};},encodeBase64:value=>Buffer.from(value).toString('base64')};
 const portable=createPortableGallerySource(options),expected=source.replaceAll(id,`data:image/png;base64,${bytes.toString('base64')}`);
 assert.equal(await portable('web'),expected);assert.equal(await portable('web'),expected);assert.equal(calls.length,1);assert.equal(calls[0][1].credentials,'omit');assert.equal(calls[0][1].redirect,'error');
 await assert.rejects(createPortableGallerySource({...options,fetchImpl:async()=>({ok:false})})('web'),/okunamadı/);
 await assert.rejects(createPortableGallerySource({...options,assets:{}})('web'),/eksik/);
});
test('extracted original gallery inline scripts remain syntactically valid with portable download handlers',()=>{
 const html=fs.readFileSync(path.join(root,'workshop-public/theme-library/index.html'),'utf8');let scripts=0;
 for(const match of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)){if(match[1].includes('application/json'))continue;new vm.Script(match[2]);scripts++;}
 assert.ok(scripts>0);assert.ok(html.includes('await sourceFor.portable'));assert.ok(html.includes('onclick=async()=>{try{'));
});
