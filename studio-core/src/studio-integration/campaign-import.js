import {normalizeCampaignSection} from '../sandbox/documentModel.js';
const ownedReference=/^asset:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const reference=/^(?:asset:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|package:theme-assets\/[a-z0-9_-]+\/[a-z0-9_-]+\.(?:webp|png|jpg))$/i;
const dataImage=/^data:image\/(?:png|jpeg|webp);base64,([a-z0-9+/]+={0,2})$/i;
const imageKeys=new Set(['image','mobileImage','imageUrl','src','imageSrc']);
const reject=message=>{throw Error(message);};

/** Prepare an authored local package. Nothing is committed until every upload succeeds. */
export async function prepareCampaignSection(input,{channel,catalog,targets,resolveBundled,readBytes,uploadAsset,isCurrent=()=>true}){
  const section=normalizeCampaignSection(structuredClone(input),channel,true);
  if(section.campaign&&section.campaign.scheduleMode!=='none')reject('Zamanlanmış kampanya bu bağlantıda kullanılamaz.');
  const products=new Set((catalog.products||[]).map(item=>String(item.id))),categories=new Set((catalog.categories||[]).map(item=>String(item.id))),allowedTargets=new Set(targets);
  for(const block of section.blocks){
    if(block.startsAt||block.endsAt)reject('Bölüm tarih sınırları bu bağlantıda kullanılamaz.');
    if(block.productSource.productIds.some(id=>!products.has(id))||block.productSource.categoryId&&!categories.has(block.productSource.categoryId))reject('Paket bu mağazada doğrulanmayan ürün veya kategori içeriyor.');
    if(!allowedTargets.has(block.target)||!allowedTargets.has(block.secondaryTarget))reject('Paket bağlantısı bu mağazada doğrulanmadı.');
  }
  const sources=new Map();
  const walk=(value,visit)=>{if(value&&typeof value==='object')for(const [key,item] of Object.entries(value)){if(imageKeys.has(key)&&typeof item==='string'&&item)visit(value,key,item);else if(item&&typeof item==='object')walk(item,visit);}};
  // Validate every path before doing any fetch or upload, including late fields.
  walk(section,(parent,key,ref)=>{if(reference.test(ref))return;const data=ref.match(dataImage),url=resolveBundled(ref);if(!data&&!url)reject('Görsel özgün paket listesinde bulunamadı.');if(data&&data[1].length>8_000_000)reject('Görsel boyutu sınırı aşıldı.');sources.set(ref,{data:data?.[1],url});});
  const imported=new Map();
  for(const [ref,source] of sources){
    if(!isCurrent())reject('Paket işlemi iptal edildi.');
    const bytes=source.data||await readBytes(source.url);
    if(!isCurrent())reject('Paket işlemi iptal edildi.');
    const owned=await uploadAsset(bytes);
    if(!ownedReference.test(owned))reject('Sunucu görsel kimliği doğrulanmadı.');
    if(!isCurrent())reject('Paket işlemi iptal edildi.');
    imported.set(ref,owned);
  }
  walk(section,(parent,key,ref)=>{if(imported.has(ref))parent[key]=imported.get(ref);});
  return section;
}
