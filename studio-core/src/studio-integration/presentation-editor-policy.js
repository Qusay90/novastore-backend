import atelierPolicy from '../../../theme-platform/atelier-edit-policy.json' with {type:'json'};
import classicPolicy from '../../../theme-platform/presentation-edit-policy.json' with {type:'json'};
import {trustedPresentation} from './theme-kit-adapter.js';
import {assertClassicEditorChange,restoreClassicCarousel} from './classic-editor-policy.js';

export const PRESENTATION_UNAVAILABLE_SECTIONS=['workbench','seasons','schedule','pages','menus'];
export const PRESENTATION_EDIT_LIMIT='Bu alan bağlı tema sunumunda desteklenmiyor. Özgün düzen ve mağazadan gelen ürün bilgileri korunur.';
export function editorPresentationPolicy(host,channel='web'){
 const value=host?.presentations?host.presentations[channel]:host?.presentation;
 if(!host?.scope?.tenantId||!host.availableChannels?.includes(channel)||!trustedPresentation(value,channel))return null;
 return value.id==='nova-classic'?classicPolicy:value.id==='nova-atelier'?atelierPolicy:null;
}
export const isPresentationEditorHost=(host,channel='web')=>!!editorPresentationPolicy(host,channel);
export const presentationLabel=document=>document?.blocks?.[0]?.id==='atelier-hero'?'Atelier':'Classic';
const canonical=value=>Array.isArray(value)?`[${value.map(canonical).join(',')}]`:value&&typeof value==='object'?`{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`:JSON.stringify(value);
export function assertPresentationEditorChange(before,after,base,host,channel){
 const policy=editorPresentationPolicy(host,channel);
 const fail=()=>{throw Object.assign(new Error(PRESENTATION_EDIT_LIMIT),{code:'THEME_PRESENTATION_EDIT_UNSUPPORTED'});};
 if(!policy)fail();
 if(policy.presentationId==='nova-classic'){restoreClassicCarousel(before,after,base);return assertClassicEditorChange(before,after,base);}
 for(const document of [before,after])if(!Array.isArray(document.blocks)||document.blocks.length!==policy.blocks.length||policy.blocks.some((block,index)=>document.blocks[index].id!==block.id||document.blocks[index].type!==block.type))fail();
 const target=after.blocks[0].target;
 if(!policy.heroCampaign.targets.includes(target)&&!policy.heroCampaign.canonicalTargetKinds.some(kind=>new RegExp(`^${kind}:[1-9]\\d{0,9}$`).test(target)))fail();
 for(const element of after.design?.elements||[]){
  if(Object.keys(element.content||{}).some(key=>!(policy.visualContent[element.id]||[]).includes(key)))fail();
  if(element.visual&&!policy.visualReplacementIds.includes(element.id)&&!policy.visualReplacementPatterns.some(pattern=>new RegExp(pattern).test(element.id)))fail();
 }
 for(let index=0;index<policy.blocks.length;index++)if(Object.keys(before.blocks[index]).sort().join(',')!==Object.keys(after.blocks[index]).sort().join(','))fail();
 const strip=document=>{const wrapped={studio:structuredClone(document)};for(const value of policy.mutablePaths){const parts=value.split('.'),key=parts.pop();let parent=wrapped;for(const part of parts)parent=parent?.[part];if(parent&&typeof parent==='object')delete parent[key];}policy.blocks.forEach((spec,index)=>spec.mutableFields.forEach(key=>delete wrapped.studio.blocks[index][key]));return wrapped;};
 if(canonical(strip(before))!==canonical(strip(after)))fail();
 return true;
}
