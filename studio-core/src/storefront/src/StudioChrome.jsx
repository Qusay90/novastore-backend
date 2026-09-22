import { useEffect, useLayoutEffect } from "react";
import useSandbox from "../../sandbox/useSandbox.js";
import { targetHref } from "../../sandbox/store.js";
import { getVisibleProducts, getVisibleRoots, getVisibleChildren, resolveCategoryPath } from "./integration/runtimeCatalog.js";
import { CaretRight } from "./CustomerIcon.jsx";
import { StudioBlocks, StudioCategoryCollection, isStudioMode } from "./StudioBlocks.jsx";
import { resolveStudioFamily } from "./StudioFamily.jsx";
import { ArrowUpRight, Plus, Headphones, ArrowRight, ShoppingBag, Grid2X2 } from "lucide-react";
import VisualEditingLayer from '../../sandbox/visual/VisualEditingLayer.jsx';

export const isDraftPreview = () => new URLSearchParams(window.location.search).get("preview") === "draft";
const bounded = (value,min,max,fallback) => Number.isFinite(Number(value)) ? Math.max(min,Math.min(max,Number(value))) : fallback;
const fonts = { Inter:'Inter, ui-sans-serif, system-ui, sans-serif', Arial:'Arial, Helvetica, sans-serif', Georgia:'Georgia, "Times New Roman", serif', system:'system-ui, -apple-system, "Segoe UI", sans-serif' };
const contrasting = hex => { const rgb = /^#[\da-f]{6}$/i.test(hex || "") ? hex.slice(1).match(/../g).map(v => parseInt(v,16)/255).map(v => v<=.04045?v/12.92:((v+.055)/1.055)**2.4) : [0,0,0]; return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722>.179 ? '#102536' : '#ffffff'; };

export function SandboxTheme({channel="web"}={}) {
  const document = useSandbox(channel,true);
  useLayoutEffect(() => {
    const root = window.document.documentElement;
    root.dataset.studioThemeApplying = 'true';
    const theme = document.theme || {}, commerce = document.commerce || {};
    const header = document.chrome?.header || {}, footer = document.chrome?.footer || {};
    const navy = theme.navy || '#04203b', accent = theme.accent || '#c45100';
    const shadow = theme.shadow === 'none' ? 'none' : theme.shadow === 'strong' ? '0 16px 42px rgb(5 24 45 / 20%)' : '0 6px 22px rgb(5 24 45 / 7%)';
    const values = {
      '--orange':accent,'--orange-500':accent,'--orange-bright':accent,'--orange-600':accent,'--orange-700':accent,'--orange-100':`color-mix(in srgb, ${accent} 10%, transparent)`,
      '--navy-900':navy,'--navy-950':navy,'--navy-800':navy,'--navy-700':navy,
      '--page':theme.background || '#ffffff','--studio-background':theme.background || '#ffffff','--surface':theme.surface || '#f5f7fa','--studio-surface':theme.surface || '#f5f7fa',
      '--ink':theme.text || '#11263a','--muted':theme.muted || '#607080','--soft-muted':theme.muted || '#607080','--line':theme.border || '#dfe5ec','--line-dark':theme.border || '#dfe5ec',
      '--commerce-pro-font':fonts[theme.fontFamily] || fonts.Inter,
      '--sandbox-radius':`${bounded(theme.radius,0,40,12)}px`,'--sandbox-font-scale':bounded(theme.fontScale,.75,1.5,1),'--studio-heading-scale':bounded(theme.headingScale,.75,1.5,1),
      '--studio-spacing':bounded(theme.spacing,.5,2,1),'--shell':`${bounded(theme.contentWidth,960,1920,1440)}px`,
      '--shadow-sm':shadow,'--shadow-md':shadow,'--studio-shadow':shadow,'--studio-accent-ink':contrasting(accent),
      '--studio-navy-ink':contrasting(navy),
      '--studio-header-background':header.background || navy,'--studio-header-text':header.textColor || '#ffffff',
      '--studio-footer-background':footer.background || navy,'--studio-footer-text':footer.textColor || '#ffffff',
      '--studio-grid-columns':Math.round(bounded(commerce.gridColumns,2,5,4)),
      '--studio-tablet-columns':Math.min(3,Math.round(bounded(commerce.gridColumns,2,5,4))),
      '--studio-footer-columns':Math.max(1,Math.min(6,(footer.columns||[]).length)),
      '--studio-image-ratio':commerce.imageRatio === 'portrait' ? '3 / 4' : commerce.imageRatio === 'landscape' ? '4 / 3' : '1 / 1',
    };
    Object.entries(values).forEach(([key,value]) => root.style.setProperty(key,String(value)));
    const datasets = { studioTheme:'web',studioFamily:resolveStudioFamily(theme.family),studioMode:isStudioMode()?'edit':'browse',sandboxMotion:theme.motion===false||theme.motion==='none'||theme.motion==='reduced'?'reduced':'full',studioButtonStyle:['solid','outline','soft'].includes(theme.buttonStyle)?theme.buttonStyle:'solid',studioHeaderSticky:header.sticky===false?'false':'true',studioRating:commerce.showRating===false?'hide':'show',studioBrand:commerce.showBrand===false?'hide':'show',studioDiscount:commerce.showDiscount===false?'hide':'show',studioQuickAdd:commerce.showQuickAdd===false?'hide':'show' };
    Object.entries(datasets).forEach(([key,value]) => {root.dataset[key]=value;});
    // Commit the selected colors without transitioning from the base stylesheet.
    // This synchronous layout happens before paint; normal hover motion resumes below.
    root.getBoundingClientRect();
    delete root.dataset.studioThemeApplying;
    return () => {Object.keys(values).forEach(key=>root.style.removeProperty(key));Object.keys(datasets).forEach(key=>delete root.dataset[key]);};
  },[document]);
  return <VisualEditingLayer document={document} channel={channel}/>;
}

export function SandboxSeo({ route }) {
  const document = useSandbox('web',isDraftPreview());
  useEffect(() => {
    const page = route.type==='sandbox-page' ? document.pages?.find(page=>(page.id===route.id||page.slug===route.id)&&page.enabled!==false) : null;
    const product = route.type==='product' ? getVisibleProducts().find(product=>product.slug===route.slug) : null;
    const category = route.type==='category' ? resolveCategoryPath(route.path) : null;
    const name = document.chrome?.header?.logoText || 'NovaStore';
    const labels = {'search':'Arama','cart-page':'Sepetim','account':'Hesabım','help':'Yardım merkezi','support':'Destek','favorites':'Favorilerim','sandbox-categories':'Tüm kategoriler'};
    const title = page ? page.seoTitle || `${page.title} · ${name}` : product ? `${product.name} · ${name}` : category ? `${category.name} · ${name}` : labels[route.type] ? `${labels[route.type]} · ${name}` : name;
    const description = page?.seoDescription || product?.description || category?.seoDescription || document.chrome?.header?.tagline || 'İhtiyacına uygun ürünleri NovaStore’da keşfet.';
    const previousTitle=window.document.title;
    let meta=window.document.querySelector('meta[name="description"]'); const existing=Boolean(meta), previousDescription=meta?.getAttribute('content');
    if(!meta){meta=window.document.createElement('meta');meta.name='description';window.document.head.appendChild(meta);}
    window.document.title=title;meta.setAttribute('content',description);
    return ()=>{window.document.title=previousTitle;if(existing)meta.setAttribute('content',previousDescription||'');else meta.remove();};
  },[document,route.type,route.id,route.slug,route.path]);
  return null;
}

export function SandboxPage({ id, favorites, onFavorite, onAdd }) {
  const document = useSandbox('web',isDraftPreview());
  const page = (document.pages || []).find(item => (item.id===id || item.slug===id) && item.enabled!==false);
  if(!page)return <main id="main-content" className="page sandbox-content-page"><article className="shell"><span className="section-kicker">NovaStore</span><h1>Bu sayfa yayında değil</h1><p>Diğer kategorileri ve seçkileri keşfedebilirsin.</p><a className="primary-button" href="#/">Ana sayfaya dön</a></article></main>;
  return <main id="main-content" className="page sandbox-content-page"><article className="shell studio-page-intro"><a className="text-link" href="#/">Ana sayfa</a><span className="section-kicker">{document.chrome?.header?.logoText||'NovaStore'}</span><h1>{page.title}</h1>{String(page.body||'').split(/\n\s*\n/).filter(Boolean).map((paragraph,index)=><p key={index}>{paragraph}</p>)}</article><StudioBlocks blocks={page.blocks||[]} {...{document,favorites,onFavorite,onAdd}} /></main>;
}

export function SandboxCategoriesPage() {
  const document=useSandbox('web',isDraftPreview());
  const family=resolveStudioFamily(document.theme?.family);
  if (family !== "nova-commerce") return <main id="main-content" className={`page sandbox-categories-page demo-categories-page demo-categories-page--${family}`}><div className="shell"><div className="demo-categories-intro"><div><span className="section-kicker">Keşfet</span><h1>Tüm kategoriler</h1><p>İhtiyacına uygun ürünlerle tanış.</p></div><span className="demo-categories-count"><Grid2X2 size={25}/>{getVisibleRoots().length} kategori</span></div><StudioCategoryCollection family={family} expanded/></div></main>;
  return <main id="main-content" className="page sandbox-categories-page"><div className="shell"><span className="section-kicker">Keşfet</span><h1>Tüm kategoriler</h1><p>İhtiyacına uygun kategoriye göz at.</p><div className="sandbox-category-links">{getVisibleRoots().map(root=><section key={root.id}><h2><a href={`#/kategori/${root.canonicalPath}`}>{root.name}</a></h2><ul>{getVisibleChildren(root.id).map(child=><li key={child.id}><a href={`#/kategori/${child.canonicalPath}`}>{child.name}<CaretRight/></a></li>)}</ul></section>)}</div></div></main>;
}

const templateKey = route => ({category:'category',product:'product','product-id':'product',search:'search','cart-page':'cart',account:'account',help:'support',support:'support','public-contact':'support','return-exchange':'support',tracking:'support'}[route.type]);
export function SandboxTemplate({ route, favorites, onFavorite, onAdd }) {
  const document=useSandbox('web',isDraftPreview()), key=templateKey(route), template=key&&document.templates?.[key];
  if(!template)return null;
  return <div className="studio-template-content" data-template={key}>{template.showIntro && (template.title||template.description) && <section className="shell studio-template-intro"><span className="section-kicker">{document.chrome?.header?.logoText||'NovaStore'}</span>{template.title&&<h2>{template.title}</h2>}{template.description&&<p>{template.description}</p>}</section>}<StudioBlocks blocks={template.blocks||[]} {...{document,favorites,onFavorite,onAdd}} /></div>;
}

export function SandboxFooter({ Logo, businessIdentity }) {
  const document=useSandbox('web',isDraftPreview()), footer=document.chrome?.footer||{};
  const family=resolveStudioFamily(document.theme?.family);
  const identity=businessIdentity?.status==='configured'?businessIdentity.identity:null;
  const columns=footer.columns||[];
  if (family !== "nova-commerce") {
    const brand=<div className="studio-footer-brand"><Logo/><p>{footer.description??'Doğru ürünü bulmanın daha kolay yolu.'}</p></div>;
    const links=column=>(column.links||[]).filter(link=>link.enabled!==false).map(link=><a key={link.id} href={targetHref(link.target,document)}>{link.label}{family==='gallery'&&<ArrowUpRight size={14}/>}</a>);
    const bottom=<div className="shell footer-bottom"><span>{footer.copyright??`© ${new Date().getFullYear()} ${document.chrome?.header?.logoText||'NovaStore'}.`}</span><a href="#/yardim">Yardım merkezi</a></div>;
    const columnNodes=columns.map(column=><div className="studio-footer-column" key={column.id}><strong>{column.title}</strong>{links(column)}</div>);
    const accordionNodes=<div className="family-footer-accordions">{columns.map(column=><details key={column.id}><summary>{column.title}<Plus size={18}/></summary><div>{links(column)}</div></details>)}</div>;
    let content;
    if (family==='pocket') content=<div className="shell family-pocket-footer">{brand}{accordionNodes}</div>;
    else if (family==='workspace') content=<div className="shell family-workspace-footer">{brand}<div className="family-workspace-footer-links">{columnNodes}</div></div>;
    else if (family==='tech') content=<div className="shell demo-tech-footer"><div className="demo-tech-footer-top">{brand}<a className="demo-footer-support" href="#/yardim"><Headphones size={29}/><span>Birlikte doğru seçelim.<small>Yardım merkezini ziyaret et</small></span><ArrowUpRight size={23}/></a></div><div className="demo-footer-columns">{columnNodes}</div></div>;
    else if (family==='living') content=<div className="shell demo-living-footer"><div className="demo-living-footer-statement">{brand}<a href="#/kategoriler">Kendine bir alan aç.<ArrowUpRight size={32}/></a></div><div className="demo-footer-columns">{columnNodes}</div></div>;
    else if (family==='fashion') content=<div className="shell demo-fashion-footer"><div className="demo-fashion-footer-wordmark" aria-hidden="true">{document.chrome?.header?.logoText || 'NovaStore'}</div><div className="demo-fashion-footer-body">{brand}<div className="demo-footer-columns">{columnNodes}</div></div></div>;
    else if (family==='market') content=<div className="shell demo-market-footer"><div className="demo-market-footer-shortcuts"><a href="#/kategoriler"><ShoppingBag size={22}/><span>Alışverişe devam et</span><ArrowRight size={19}/></a><a href="#/hesabim"><Grid2X2 size={22}/><span>Hesabım</span><ArrowRight size={19}/></a><a href="#/yardim"><Headphones size={22}/><span>Yardım merkezi</span><ArrowRight size={19}/></a></div><div className="demo-market-footer-links">{brand}<div className="demo-footer-columns">{columnNodes}</div></div></div>;
    else content=<><div className="shell family-gallery-footer-heading">{brand}<a href="#/kategoriler" className="family-footer-discover">Kategorileri keşfet <ArrowUpRight size={24}/></a></div><div className="shell family-gallery-footer-links">{columnNodes}</div></>;
    return <footer className={`site-footer studio-footer family-footer family-footer--${family}`} data-footer-family={family}>{content}{identity&&<address className="shell studio-footer-identity"><strong>{identity.legalCompanyName}</strong><span>{identity.registeredAddress}</span></address>}{bottom}</footer>;
  }
  return <footer className="site-footer studio-footer"><div className="shell studio-footer-grid"><div className="studio-footer-brand"><Logo/><p>{footer.description??'Doğru ürünü bulmanın daha kolay yolu.'}</p></div>{columns.map(column=><div key={column.id} className="studio-footer-column"><strong>{column.title}</strong>{(column.links||[]).filter(link=>link.enabled!==false).map(link=><a key={link.id} href={targetHref(link.target,document)}>{link.label}</a>)}</div>)}</div>{identity&&<address className="shell studio-footer-identity"><strong>{identity.legalCompanyName}</strong><span>{identity.registeredAddress}</span></address>}<div className="shell footer-bottom"><span>{footer.copyright??`© ${new Date().getFullYear()} ${document.chrome?.header?.logoText||'NovaStore'}.`}</span><a href="#/yardim">Yardım merkezi</a></div></footer>;
}
