import {normalizeCampaignCanvas,MAX_CANVAS_LAYERS} from '../campaignCanvas.js';
import {normalizeCampaign} from '../campaignModel.js';

// Apply a completed upload to the current document, never the snapshot from
// when FileReader started. A deleted replacement target must not be recreated.
export function applyCampaignImage(current,{targetId='',id,src,alt=''}){
 const next=JSON.parse(JSON.stringify(current));
 if(targetId){
  const layer=next.layers.find(item=>item.id===targetId);
  if(!layer||layer.kind!=='image')throw Error('Değiştirilecek görsel artık tuvalde yok. Yükleme uygulanmadı.');
  layer.src=src;layer.alt=alt;
 }else{
  if(next.layers.length>=MAX_CANVAS_LAYERS)throw Error(`Tuvalde en fazla ${MAX_CANVAS_LAYERS} öğe bulunabilir. Önce bir öğeyi kaldır veya mevcut görseli değiştir.`);
  next.layers.push({id,kind:'image',x:30,y:35,width:20,height:30,color:'@accent',src,alt,imageKind:'object',fit:'contain'});
 }
 return normalizeCampaignCanvas(next);
}

export function campaignPlacementIssue({plan,channel,pages=[],destinationBlocks=[],blockCount=0,capacity=0}){
 let value;try{value=normalizeCampaign(plan);}catch(error){return error.message;}
 if(!value||!pages.some(page=>page.id===value.targetPage))return 'Paketin hedef sayfası bulunamadı. Kampanya planından mevcut bir sayfa seç.';
 if(!blockCount)return 'Pakette henüz bölüm yok. Önce bir bölüm ekle.';
 if(!value.channels.includes(channel))return 'Paket bu kanal için kapalı. Kampanya planında çalıştığın kanalı aç.';
 if(destinationBlocks.length+blockCount>capacity)return 'Hedef sayfanın bölüm kapasitesi aşılıyor. Daha az bölüm veya başka bir sayfa seç.';
 if(value.placement==='after'&&!destinationBlocks.some(block=>block.id===value.afterBlockId))return 'Arkasına eklenecek bölüm bulunamadı. Mevcut bir bölüm seç veya sayfanın başına/sonuna ekle.';
 return '';
}
