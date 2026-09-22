import policy from '../../../theme-platform/presentation-edit-policy.json' with {type:'json'};

export const CLASSIC_UNAVAILABLE_SECTIONS=['workbench','seasons','schedule','pages','menus'];
export const CLASSIC_EDIT_LIMIT='Bu alan bağlı Classic çiziminde henüz desteklenmiyor. Değişiklik taslağa alınmadı; özgün yerel atölyedeki araçlar ayrı çalışır.';
export function isClassicEditorHost(host,channel='web'){
  const presentation=host?.presentations?host.presentations[channel]:host?.presentation;
  return !!host?.scope?.tenantId&&host.availableChannels?.includes(channel)&&presentation?.id===policy.presentationId&&presentation.version===policy.presentationVersion&&/^[a-f0-9]{64}$/.test(presentation.digest||'');
}
export function classicHeroTargetAllowed(target){
  return policy.heroCampaign.targets.includes(target)||policy.heroCampaign.canonicalTargetKinds.some(kind=>new RegExp(`^${kind}:[1-9]\\d{0,9}$`).test(target));
}
export const classicVisualContentKeys=id=>policy.visualContent[id]||[];
export const classicVisualReplacementAllowed=id=>policy.visualReplacementIds.includes(id)||policy.visualReplacementPatterns.some(pattern=>new RegExp(pattern).test(id));
const customHero=block=>policy.heroCampaign.customWhenNonempty.some(key=>block?.[key]);
export function restoreClassicCarousel(before,after,base){
  const previous=before.blocks?.find(block=>block.id==='classic-hero'),next=after.blocks?.find(block=>block.id==='classic-hero');
  if(!previous||!next||!customHero(previous)||customHero(next))return;
  const reference=base?.blocks?.find(block=>block.id==='classic-hero');
  if(!reference||policy.heroCampaign.ctaFields.some(key=>typeof reference[key]!=='string'))throw new Error('Kanonik slayta dönmek için doğrulanmış tema temeli gerekli. Çalışma alanını yeniden aç.');
  for(const key of policy.heroCampaign.ctaFields)next[key]=reference[key];
}
const canonical=value=>Array.isArray(value)?`[${value.map(canonical).join(',')}]`:value&&typeof value==='object'?`{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`:JSON.stringify(value);
// This client guard gives immediate feedback. The server separately enforces
// the same immutable policy and remains the write authority.
export function assertClassicEditorChange(before,after,base=before){
  const fail=()=>{throw Object.assign(new Error(CLASSIC_EDIT_LIMIT),{code:policy.errorCode});};
  for(const document of [before,after])if(!Array.isArray(document.blocks)||document.blocks.length!==policy.blocks.length||policy.blocks.some((block,index)=>document.blocks[index].id!==block.id||document.blocks[index].type!==block.type))fail();
  if(!classicHeroTargetAllowed(after.blocks[0].target))fail();
  for(const element of after.design?.elements||[]){
    if(Object.keys(element.content||{}).some(key=>!classicVisualContentKeys(element.id).includes(key)))fail();
    if(element.visual&&!classicVisualReplacementAllowed(element.id))fail();
  }
  for(let index=0;index<policy.blocks.length;index++)if(Object.keys(before.blocks[index]).sort().join(',')!==Object.keys(after.blocks[index]).sort().join(','))fail();
  if(!customHero(after.blocks[0])&&policy.heroCampaign.ctaFields.some(key=>canonical(after.blocks[0][key])!==canonical(base?.blocks?.[0]?.[key])))fail();
  const strip=document=>{
    const wrapped={studio:structuredClone(document)};
    for(const value of policy.mutablePaths){const parts=value.split('.'),key=parts.pop();let parent=wrapped;for(const part of parts)parent=parent?.[part];if(parent&&typeof parent==='object')delete parent[key];}
    policy.blocks.forEach((spec,index)=>spec.mutableFields.forEach(key=>delete wrapped.studio.blocks[index][key]));
    return wrapped;
  };
  if(canonical(strip(before))!==canonical(strip(after)))fail();
  return true;
}
