import CampaignScene from '../sandbox/CampaignScene.jsx';
import {useAndroidTrialDocument} from './TrialConfig';
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { ArrowRightIcon, PlusIcon, MagnifyingGlassIcon, LayersIcon } from '@radix-ui/react-icons';
import {CheckCircleIcon,ShieldCheckIcon,StarIcon,PackageIcon,TruckIcon,LightningIcon,HeartIcon,SparkleIcon,HeadsetIcon,GiftIcon} from '@phosphor-icons/react/ssr';
import { isBlockActive } from './TrialConfig';

const icons: Record<string, any> = { check:CheckCircleIcon, shield:ShieldCheckIcon, star:StarIcon, package:PackageIcon, truck:TruckIcon, zap:LightningIcon, heart:HeartIcon, sparkles:SparkleIcon, headset:HeadsetIcon, headphones:HeadsetIcon, gift:GiftIcon, search:MagnifyingGlassIcon, layers:LayersIcon };
export function captureStudioBlock(event: any) {
  if (new URLSearchParams(location.search).get('studio') !== '1' || document.documentElement.dataset.visualEditing === 'false') return;
  if ((event.target as HTMLElement)?.closest('[data-studio-preview-control]')) return;
  const block = (event.target as HTMLElement)?.closest<HTMLElement>('[data-module-id]');
  if (!block?.dataset.moduleId) return;
  event.preventDefault(); event.stopPropagation();
  if (parent !== window) parent.postMessage({type:'novastore-studio-select',blockId:block.dataset.moduleId},location.origin);
}

function blockStyle(block:any):CSSProperties {
  const value=block.style||{};
  return {background:value.background||undefined,color:value.textColor||undefined,textAlign:value.align||'left',paddingBlock:value.padding!==undefined?`${Math.max(0,Math.min(160,Number(value.padding)||0))}px`:undefined,'--trial-block-text':value.textColor||'var(--nova-text)'} as CSSProperties;
}

export default function TrialModules({blocks,renderHero,renderCategories,renderProducts,onTarget}:{blocks:any[];renderHero:(blocks:any[])=>ReactNode;renderCategories:(block:any)=>ReactNode;renderProducts:(block:any)=>ReactNode;onTarget:(target:string)=>void}) {
  const campaignDocument=useAndroidTrialDocument();
  const [now,setNow]=useState(Date.now());
  useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),15000);return()=>clearInterval(timer);},[]);
  const active=(blocks||[]).filter(block=>isBlockActive(block,now)&&block.visibility?.mobile!==false);
  const groups:any[][]=[];
  active.forEach(block=>{const last=groups.at(-1);if(block.type==='hero'&&!block.campaignCanvas&&last?.[0]?.type==='hero'&&!last[0].campaignCanvas)last.push(block);else groups.push([block]);});
  return <div className="trial-modules" onClickCapture={captureStudioBlock}>{groups.map(group=>{
    const block=group[0],items=block.items||[],type=block.type;
    const title=<>{block.kicker&&<small className="trial-rich-kicker">{block.kicker}</small>}{block.title&&<h2>{block.title}</h2>}{block.description&&<p>{block.description}</p>}</>;
    let content:ReactNode;
    if(block.campaignCanvas)content=<><CampaignScene canvas={block.campaignCanvas} theme={campaignDocument.theme}/>{block.buttonText&&<button type="button" className="trial-content-action" onClick={()=>onTarget(block.target)}>{block.buttonText}<ArrowRightIcon/></button>}</>;
    else if(type==='hero')content=renderHero(group);
    else if(type==='categories')content=renderCategories(block);
    else if(type==='products')content=renderProducts(block);
    else if(type==='divider')content=<hr className="trial-divider"/>;
    else if(type==='spacer')content=<div style={{height:Math.max(0,Math.min(160,Number(block.style?.padding??32)||0))}} aria-hidden="true"/>;
    else if(type==='faq')content=<div className="trial-rich-copy">{title}<div className="trial-faq">{items.map((item:any)=><details key={item.id}><summary>{item.title}<PlusIcon/></summary><p>{item.body}</p></details>)}</div></div>;
    else if(type==='features')content=<div className="trial-rich-copy">{title}<div className="trial-feature-grid">{items.map((item:any)=>{const Icon=icons[item.icon]||CheckCircleIcon;return <article key={item.id}><Icon/><h3>{item.title}</h3><p>{item.body}</p></article>;})}</div></div>;
    else if(type==='stats')content=<div className="trial-rich-copy">{title}<div className="trial-stat-grid">{items.map((item:any)=><article key={item.id}><strong>{item.value}</strong><h3>{item.title}</h3>{item.body&&<p>{item.body}</p>}</article>)}</div></div>;
    else if(type==='testimonials')content=<div className="trial-rich-copy">{title}<div className="trial-testimonials">{items.map((item:any)=><figure key={item.id}><blockquote>{item.body}</blockquote><figcaption>{item.title}{item.value&&<small>{item.value}</small>}</figcaption></figure>)}</div></div>;
    else content=<section className={`trial-content-module trial-content-${type} trial-image-${block.style?.imagePosition||'right'}`}>{(block.mobileImage||block.image)&&<button type="button" className="trial-module-image" onClick={()=>onTarget(block.target)} aria-label={block.buttonText||block.title}><img src={block.mobileImage||block.image} alt={block.alt||''}/></button>}<div className="trial-content-copy">{title}{block.buttonText&&<button type="button" className="trial-content-action" onClick={()=>onTarget(block.target)}>{block.buttonText}<ArrowRightIcon/></button>}</div></section>;
    return <div key={group.map(item=>item.id).join(':')} data-module-id={block.id} data-custom-background={Boolean(block.style?.background)} data-custom-text={Boolean(block.style?.textColor)} className={`trial-editable-module trial-module-${type}`} style={type==='spacer'?{background:block.style?.background||undefined}:blockStyle(block)}>{content}</div>;
  })}</div>;
}
