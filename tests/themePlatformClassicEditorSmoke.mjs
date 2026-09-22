import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {assertClassicEditorChange,classicHeroTargetAllowed,classicVisualContentKeys,classicVisualReplacementAllowed,isClassicEditorHost,restoreClassicCarousel} from '../studio-core/src/studio-integration/classic-editor-policy.js';

const require=createRequire(import.meta.url);
const pkg=require('../theme-platform/packages/nova-classic-studio-web-v1_1.json');
const {validatePresentationDocument}=require('../services/themePlatformPresentationEditGuard');
const base=pkg.document.studio,descriptor=pkg.renderer.presentation;
const copy=()=>structuredClone(base);
const rejected=error=>error.code==='THEME_PRESENTATION_EDIT_UNSUPPORTED';
function agree(document){
  assert.equal(assertClassicEditorChange(base,document,base),true);
  assert.doesNotThrow(()=>validatePresentationDocument(descriptor,pkg.document,{schemaVersion:2,studio:document}));
}

test('only authenticated host Classic channel enables restrictions; the original local workshop stays unrestricted',()=>{
  assert.equal(isClassicEditorHost(null),false);
  assert.equal(isClassicEditorHost({presentation:descriptor}),false);
  const host={scope:{tenantId:'12'},availableChannels:['web','android'],presentations:{web:descriptor,android:null},presentation:descriptor};
  assert.equal(isClassicEditorHost(host,'web'),true);
  assert.equal(isClassicEditorHost(host,'android'),false);
  assert.equal(isClassicEditorHost({...host,presentations:{web:{...descriptor,digest:'bad'}}},'web'),false);
});
test('color, typography, radius, logo and chrome supported changes agree with authoritative server validation',()=>{
  const document=copy();Object.assign(document.theme,{accent:'#246824',background:'#fafafa',surface:'#ffffff',text:'#172817',muted:'#555555',border:'#cccccc',fontFamily:'Arial',radius:12});
  Object.assign(document.chrome.header,{logoText:'Nova Store',background:'#ffffff',textColor:'#243224',showSearch:false});
  Object.assign(document.chrome.footer,{background:'#172817',textColor:'#ffffff'});
  Object.assign(document.design,{name:'Mağaza çalışması',header:true,footer:false,navigation:false});
  agree(document);
});
test('four fixed slots accept copy and visibility; empty nonhero copy is an intentional supported edit',()=>{
  const document=copy();document.blocks.forEach((block,index)=>Object.assign(block,{title:index?'':'Özel koleksiyon',description:index?'':'Yeni sezon',enabled:index!==1}));agree(document);
});
test('supported visual metadata changes are retained without replacing the fixed block layout',()=>{
  const document=copy();document.design.elements.push({id:'header',desktop:{borderRadius:12,paddingX:24},tablet:{},mobile:{}});agree(document);
});
test('authored hero accepts explicit canonical campaign CTA',()=>{
  const document=copy();Object.assign(document.blocks[0],{title:'Yeni koleksiyon',buttonText:'Ürünleri gör',target:'category:12'});agree(document);
});
test('CTA alone on canonical carousel is rejected instead of apparently saving invisible content',()=>{
  const document=copy();document.blocks[0].buttonText='Görünmeyen değişiklik';
  assert.throws(()=>assertClassicEditorChange(base,document,base),rejected);
  assert.throws(()=>validatePresentationDocument(descriptor,pkg.document,{schemaVersion:2,studio:document}),rejected);
});
test('clearing the last authored hero field atomically restores verified base CTA and passes the server',()=>{
  const before=copy();Object.assign(before.blocks[0],{title:'Kampanya',buttonText:'Özel hedef',target:'product:19'});
  const after=structuredClone(before);after.blocks[0].title='';restoreClassicCarousel(before,after,base);
  assert.equal(after.blocks[0].target,base.blocks[0].target);assert.equal(after.blocks[0].buttonText,base.blocks[0].buttonText);
  assert.equal(assertClassicEditorChange(before,after,base),true);
  assert.doesNotThrow(()=>validatePresentationDocument(descriptor,pkg.document,{schemaVersion:2,studio:after}));
  assert.equal(before.blocks[0].target,'product:19');
});
test('carousel restore never invents default CTA when the authoritative base is missing',()=>{
  const before=copy();before.blocks[0].title='Kampanya';const after=structuredClone(before);after.blocks[0].title='';
  assert.throws(()=>restoreClassicCarousel(before,after,undefined),/doğrulanmış tema temeli/);
});
test('hero targets reject foreign URLs, custom pages, malformed identifiers and oversized IDs',()=>{
  for(const target of ['https://foreign.test','page:private','collection:5','category:0','product:01','product:12345678901'])assert.equal(classicHeroTargetAllowed(target),false,target);
  for(const target of ['home','categories','search','cart','account','support','favorites','category:12','product:9'])assert.equal(classicHeroTargetAllowed(target),true,target);
});
test('logo alternative text remains editable while canonical content controls are excluded',()=>{
  const document=copy();document.design.elements.push({id:'logoImage',desktop:{},tablet:{},mobile:{},content:{alt:'Nova Store mağaza logosu'}});agree(document);
  assert.deepEqual(classicVisualContentKeys('logoImage'),['imageUrl','alt']);
  for(const id of ['productCard','item:canonical-price:text','category:12:image'])assert.deepEqual(classicVisualContentKeys(id),[]);
});
test('only logo or icon targets expose visual replacement; canonical media keeps original authority',()=>{
  for(const id of ['logo','logoImage','item:search-button:icon'])assert.equal(classicVisualReplacementAllowed(id),true,id);
  for(const id of ['productImage','productCard','item:canonical-image:image','category:12:image','item:bad:shape:icon'])assert.equal(classicVisualReplacementAllowed(id),false,id);
});
for(const [id,content] of [['item:product-price:text',{text:'0 TL'}],['category:12:text',{text:'Başka kategori'}],['item:review-copy:text',{text:'Sahte yorum'}],['category:12:image',{imageUrl:'package:theme-assets/nova-classic/hero.png'}]]){
  test(`canonical content cannot be replaced through visual metadata: ${id}`,()=>{
    const document=copy();document.design.elements.push({id,desktop:{},tablet:{},mobile:{},content});assert.throws(()=>assertClassicEditorChange(base,document,base),rejected);
  });
}
test('canonical product image cannot be replaced through visual asset metadata',()=>{
  const document=copy();document.design.elements.push({id:'productImage',desktop:{},tablet:{},mobile:{},visual:{size:24,asset:{}}});assert.throws(()=>assertClassicEditorChange(base,document,base),rejected);
});
for(const [name,mutate] of Object.entries({
  'added block':document=>document.blocks.push({...structuredClone(document.blocks[0]),id:'extra'}),
  'deleted block':document=>document.blocks.pop(),
  'reordered blocks':document=>document.blocks.reverse(),
  'changed block type':document=>document.blocks[1].type='hero',
  'product source':document=>document.blocks[2].productSource.productIds=['12'],
  'product count':document=>document.blocks[2].productLimit=3,
  'block timing':document=>document.blocks[0].startsAt='2026-09-20T12:00:00',
  'nonhero CTA':document=>document.blocks[3].buttonText='Yeni düğme',
  'header tagline':document=>document.chrome.header.tagline='Görünmeyen slogan',
  'navigation menu':document=>document.menus[0].label='Yeni menü',
  'new page':document=>document.pages.push({id:'new-page',title:'Yeni sayfa'}),
  'template structure':document=>document.templates.product.showIntro=!document.templates.product.showIntro,
  'saved section':document=>document.savedSections.push({id:'unsupported'}),
})){test(`unsupported ${name} is rejected before the client draft is persisted`,()=>{const document=copy();mutate(document);assert.throws(()=>assertClassicEditorChange(base,document,base),rejected);});}
