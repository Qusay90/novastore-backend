import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {isReadyTheme,canPreviewTheme,readyThemeChannels,resolveThemeIntent} from '../admin-commerce-pro/src/theme-platform/themePresentation.js';

const root=new URL('../',import.meta.url);
const read=path=>JSON.parse(fs.readFileSync(new URL(path,root),'utf8'));
const registry=read('theme-platform/presentations.json').presentations[0];
const original=read('theme-platform/packages/nova-classic-studio-web.json');
const next=read('theme-platform/packages/nova-classic-studio-web-v1_1.json');
const descriptor={id:registry.id,version:registry.version,digest:registry.digest};
const legacy={id:'00000000-0000-4000-8000-000000000001',name:original.theme.name,document:original.document,supportedChannels:original.supportedChannels,presentation:null,sourceThemeId:null};
// Synthetic catalog acceptance tests selection behavior, not actual readiness.
const accepted=channel=>({channel,status:'READY',presentationReady:true,runtimeReady:true,assignmentEligible:true,
  acceptance:{presentation:'PASS',customerRuntime:'PASS',singleStoreRuntime:'PASS',publication:'PASS'}});
const classic={...legacy,id:'00000000-0000-4000-8000-000000000002',document:next.document,presentation:descriptor,sourceThemeId:registry.sourceThemeId,supportedChannels:registry.channels,presentationReadiness:[accepted('web')]};

test('original Classic-named sample and its thumbnail cannot confer design identity',()=>{
  assert.equal(isReadyTheme(legacy),false);
  assert.equal(isReadyTheme({...legacy,name:classic.name,thumbnails:[{stale:false,documentDigest:'current'}]}),false);
});
test('a fully accepted catalog descriptor is selectable for its verified channel only',()=>{
  assert.deepEqual(next.renderer.presentation,descriptor);
  assert.equal(isReadyTheme(classic,'web'),true);assert.equal(isReadyTheme(classic,'app'),false);
  assert.deepEqual(readyThemeChannels(classic),['web']);
});
test('gallery intent chooses exact source identity and actual server version UUID',()=>{
  const choice=resolveThemeIntent([legacy,classic],'15-nova-classic','web');
  assert.equal(choice.status,'ready');assert.equal(choice.themeId,classic.id);assert.equal(choice.themes.length,1);
});
test('matching display name or package slug cannot redirect another original theme',()=>{
  const choice=resolveThemeIntent([legacy,classic],'03-volt','web');
  assert.equal(choice.status,'unavailable');assert.deepEqual(choice.themes,[]);assert.equal(choice.themeId,undefined);
});
test('web-only Classic is not silently offered for Android',()=>{
  const choice=resolveThemeIntent([classic],'15-nova-classic','android');assert.equal(choice.status,'unavailable');
});
test('a synthetic accepted app entry normalizes only the known Android channel',()=>{
  const app={...classic,supportedChannels:['app'],presentationReadiness:[accepted('app')]};
  assert.equal(resolveThemeIntent([app],'15-nova-classic','android').channel,'app');
  assert.equal(resolveThemeIntent([app],'15-nova-classic','tablet').status,'unavailable');
});
test('multiple mapped versions require an explicit choice instead of guessing newest or first',()=>{
  const older={...classic,id:'00000000-0000-4000-8000-000000000003',version:'9.9.9',created_at:'2099-01-01'};
  for(const candidates of [[older,classic],[classic,older]]){const choice=resolveThemeIntent(candidates,'15-nova-classic');assert.equal(choice.status,'choose-version');assert.equal(choice.themeId,undefined);assert.equal(choice.themes.length,2);}
});
test('missing digest, source identity, native schema or supported channels fails closed',()=>{
  for(const item of [{...classic,presentation:{...descriptor,digest:''}},{...classic,sourceThemeId:null},{...classic,document:{schemaVersion:1}},{...classic,supportedChannels:[]},{...classic,supportedChannels:['arbitrary']},{...classic,presentation:{...descriptor,version:'latest'}}])assert.equal(isReadyTheme(item),false);
});
test('unsupported local presets cannot use similarly branded verified packages',()=>{
  for(const id of ['pocket','nova-commerce','15-Nova-Classic',''])assert.notEqual(resolveThemeIntent([classic],id,'web').status,'ready');
});
test('selection is read-only and does not rewrite historical sample or published package metadata',()=>{
  const before=JSON.stringify([legacy,classic]);resolveThemeIntent([legacy,classic],'15-nova-classic','web');readyThemeChannels(classic).push('app');assert.equal(JSON.stringify([legacy,classic]),before);
});

test('preview identity remains available but missing, partial or failed acceptance cannot authorize an assignment',()=>{
  for(const readiness of [undefined,[],[{...accepted('web'),status:'PARTIAL'}],[{...accepted('web'),runtimeReady:false}],
    [{...accepted('web'),assignmentEligible:false}],[{...accepted('web'),acceptance:{...accepted('web').acceptance,publication:'PENDING'}}]]){
    const candidate={...classic,presentationReadiness:readiness};
    assert.equal(canPreviewTheme(candidate,'web'),true);assert.equal(isReadyTheme(candidate,'web'),false);
    assert.equal(resolveThemeIntent([candidate],candidate.sourceThemeId,'web').status,'unavailable');
  }
});
