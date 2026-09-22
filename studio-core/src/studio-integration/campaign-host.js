import {prepareCampaignSection} from './campaign-import.js';
import {getStudioHost,isStudioHost,bundledAssetURL,capabilityWritable} from './context.js';
import {getDocumentCatalog,getTargetOptions} from '../sandbox/store.js';

export async function prepareHostCampaign(input,doc,channel,isCurrent=()=>true){
  if(!isStudioHost())return input;
  const host=getStudioHost();
  if(host.mode!=='admin'||host.readOnly||!capabilityWritable('theme.advanced_blocks')||!capabilityWritable('theme.save_draft'))throw Error('Kampanya düzenleme yetkisi yok.');
  const active=()=>isCurrent()&&getStudioHost()?.ports===host.ports&&capabilityWritable('theme.advanced_blocks')&&capabilityWritable('theme.save_draft');
  return prepareCampaignSection(input,{channel,catalog:getDocumentCatalog(doc,channel),targets:getTargetOptions(doc,channel).map(item=>item.value),resolveBundled:bundledAssetURL,isCurrent:active,uploadAsset:bytes=>host.ports.uploadAsset(bytes),readBytes:async url=>{
    if(!url.startsWith('/theme-studio/assets/')||url.includes('..'))throw Error('Paket görsel yolu doğrulanmadı.');
    const response=await fetch(url,{credentials:'same-origin',cache:'force-cache'});if(!response.ok)throw Error('Özgün paket görseli yüklenemedi.');
    const blob=await response.blob();if(!['image/webp','image/png','image/jpeg'].includes(blob.type)||blob.size>6_000_000)throw Error('Paket görseli geçersiz.');
    const bytes=new Uint8Array(await blob.arrayBuffer());let binary='';for(let start=0;start<bytes.length;start+=8192)binary+=String.fromCharCode(...bytes.subarray(start,start+8192));return btoa(binary);
  }});
}
