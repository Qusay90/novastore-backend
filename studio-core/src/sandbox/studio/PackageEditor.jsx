import React, { useEffect, useMemo, useRef, useState } from 'react';
import {createPortal} from 'react-dom';
import { ArrowDown, ArrowUp, Check, Copy, EyeOff, Layers3, Plus, Redo2, Save, Trash2, Undo2, X } from 'lucide-react';
import { cloneSectionBlocks } from '../designLibrary.js';
import { createBlock, getDocumentCatalog, getPageBlocks } from '../store.js';
import { BLOCKS, clone, uid } from './Controls.jsx';
import Inspector from './Inspector.jsx';
import SortableList from './SortableList.jsx';
import CampaignSettings from './CampaignSettings.jsx';
import { CAMPAIGN_PACKS } from '../campaignLibrary.js';
import { MAX_CAMPAIGN_PACKAGES, defaultCampaign, normalizeCampaign } from '../campaignModel.js';
import {renderCampaignCanvas} from '../campaignCanvas.js';
import CampaignCanvasEditor from './CampaignCanvasEditor.jsx';
import {createCampaignCanvas} from '../campaignCanvasPresets.js';
import {prepareHostCampaign} from '../../studio-integration/campaign-host.js';
import {assetURL} from '../../studio-integration/context.js';

const titleOf = block => block.title || BLOCKS[block.type]?.label || 'İsimsiz bölüm';
const money = value => new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(Number(value) || 0);
const fixtureMediaFiles = { 'phone-iphone':'phone-iphone', 'phone-samsung':'phone-samsung', 'phone-xiaomi':'phone-xiaomi', home:'category-home' };
const imagePath = image => typeof image === 'string' ? image : image?.url || image?.path || '';
const productImage = product => imagePath(product.imageUrl) || imagePath(product.image) || imagePath(product.media?.[0]) || (product.imageKey ? `/media/${fixtureMediaFiles[product.imageKey] || `product-${product.imageKey}`}.webp` : '');
const productPrice = product => product.amount !== undefined ? money(product.amount) : typeof product.price === 'string' ? product.price : product.price !== undefined ? money(product.price) : '';

function packageProductSelection(catalog, source) {
  const pool = catalog.products || [];
  if (source.mode === 'selected') return (source.productIds || []).map(id => pool.find(item => String(item.id) === String(id))).filter(Boolean);
  if (source.mode !== 'category') return pool;
  const categoryIds = new Set([String(source.categoryId)]), queue = [String(source.categoryId)];
  while (queue.length) {
    const parent = queue.shift();
    for (const category of catalog.categories || []) if (String(category.parentId) === parent && !categoryIds.has(String(category.id))) { categoryIds.add(String(category.id)); queue.push(String(category.id)); }
  }
  return pool.filter(item => categoryIds.has(String(item.categoryId)) || item.categoryIds?.some(id => categoryIds.has(String(id))));
}

function BlockContent({ block, catalog, channel,theme }) {
  if(block.campaignCanvas)return <div dangerouslySetInnerHTML={{__html:renderCampaignCanvas(block.campaignCanvas,{theme})}}/>;
  const source = block.productSource || { mode: 'all' };
  const products = packageProductSelection(catalog, source);
  const visible = products.slice(0, block.productLimit || 8);
  const image = channel === 'android' ? block.mobileImage || block.image : block.image || block.mobileImage;
  const copyVisible = !(channel === 'android' && block.type === 'hero' && block.showCopy === false);
  if (block.type === 'spacer') return <div className="sl-package-space" style={{ minHeight: Math.max(24, Math.min(160, block.style?.padding || 0)) }}>Boşluk · {block.style?.padding || 0} px</div>;
  if (block.type === 'divider') return <hr className="sl-package-divider"/>;
  return <>
    {image && ['hero', 'banner', 'editorial'].includes(block.type) && <img className="sl-package-block-image" src={assetURL(image)} alt={block.alt || ''}/>}
    {copyVisible && <div className="sl-package-block-copy">{block.kicker && <small>{block.kicker}</small>}{block.title && <h3>{block.title}</h3>}{block.description && <p>{block.description}</p>}</div>}
    {block.type === 'products' && <><div className="sl-package-products">{visible.slice(0, 6).map(product => <div key={product.id}>{productImage(product) ? <img src={productImage(product)} alt=""/> : <span className="sl-package-product-placeholder"><Layers3 size={24}/></span>}<strong>{product.name}</strong>{productPrice(product) && <span>{productPrice(product)}</span>}</div>)}</div>{!visible.length && <p className="sl-package-empty-products">Bu rafta gösterilecek ürün yok. İçerik sekmesinden ürünlerini seç.</p>}{visible.length > 6 && <p className="sl-package-preview-note">Rafta {visible.length} ürün · İlk 6 ürün gösteriliyor</p>}</>}
    {block.type === 'categories' && <div className="sl-package-category-list">{catalog.categories.map(category => <span key={category.id}>{category.name}</span>)}</div>}
    {!!block.items?.length && <div className="sl-package-item-list">{block.items.map(item => <div key={item.id}>{item.value && <b>{item.value}</b>}<strong>{item.title}</strong><p>{item.body}</p></div>)}</div>}
    {copyVisible && block.buttonText && <span className="sl-package-button-label">{block.buttonText} ↗</span>}
  </>;
}

/** Local editing is committed through the studio's reversible document update. */
export default function PackageEditor({ initialPackage, document: doc, channel, pages = [], update, notify, onClose, onSaved }) {
  const initial = useRef({ name: initialPackage.name, blocks: clone(initialPackage.blocks), campaign: clone(initialPackage.campaign || defaultCampaign({},channel)) });
  const [history, setHistory] = useState({ past: [], present: initial.current, future: [] });
  const [selectedId, setSelectedId] = useState(initialPackage.blocks[0]?.id || '');
  const [addOpen, setAddOpen] = useState(!initialPackage.blocks.length);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [error, setError] = useState('');
  const [saving,setSaving]=useState(false),active=useRef(true);
  useEffect(()=>()=>{active.current=false;},[]);
  const [dragPreview,setDragPreview] = useState(null);
  const [canvasId,setCanvasId]=useState(null);
  const dialogRef = useRef(null), nameRef = useRef(null), latestCommit = useRef(null);
  const draft = history.present;
  const previewBlocks=dragPreview?.order?dragPreview.order.map(id=>draft.blocks.find(block=>block.id===id)).filter(Boolean):draft.blocks;
  const selected = draft.blocks.find(block => block.id === selectedId) || null;
  const catalog = useMemo(() => getDocumentCatalog(doc, channel), [doc, channel]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial.current);
  let campaignError='';try{normalizeCampaign(draft.campaign);}catch(error){campaignError=error.message;}
  const valid = !!draft.name.trim() && draft.blocks.length > 0 && draft.blocks.length <= 20 && !campaignError;
  const existing = !!initialPackage.id;
  const atPackageLimit = (doc.savedSections || []).length >= MAX_CAMPAIGN_PACKAGES;

  useEffect(() => {
    const previous = window.document.activeElement;
    nameRef.current?.focus();
    return () => { if (previous?.isConnected) previous.focus(); };
  }, []);
  useEffect(() => { if (!draft.blocks.some(block => block.id === selectedId)) setSelectedId(draft.blocks[0]?.id || ''); }, [draft.blocks, selectedId]);

  function change(mutate, key = '') {
    const time = Date.now();
    const coalesce = key && latestCommit.current?.key === key && time - latestCommit.current.time < 750;
    latestCommit.current = { key, time };
    setHistory(state => {
      const next = clone(state.present);
      mutate(next);
      if (JSON.stringify(next) === JSON.stringify(state.present)) return state;
      return { past: coalesce ? state.past : [...state.past, state.present].slice(-30), present: next, future: [] };
    });
    setError('');
    setDiscardOpen(false);
  }
  function undo() {
    latestCommit.current = null;
    setHistory(state => state.past.length ? { past: state.past.slice(0, -1), present: state.past.at(-1), future: [state.present, ...state.future] } : state);
    setError('');
  }
  function redo() {
    latestCommit.current = null;
    setHistory(state => state.future.length ? { past: [...state.past, state.present], present: state.future[0], future: state.future.slice(1) } : state);
    setError('');
  }
  function updateBlock(key, value) { change(next => { const block = next.blocks.find(item => item.id === selectedId); if (block) block[key] = value; }, `${selectedId}:${key}`); }
  function reorder(ids) { setDragPreview(null);change(next => { next.blocks = ids.map(id => next.blocks.find(block => block.id === id)).filter(Boolean); }); }
  function move(index, direction) {
    const ids = draft.blocks.map(block => block.id), to = index + direction;
    if (to < 0 || to >= ids.length) return;
    [ids[index], ids[to]] = [ids[to], ids[index]];
    reorder(ids);
  }
  function add(type) {
    if (draft.blocks.length >= 20) return;
    const block = createBlock(type);
    if (channel === 'android') block.style.padding = 16;
    if (catalog.categories.some(category => category.id.startsWith('sector-'))) {
      if (block.target.startsWith('category:')) block.target = 'categories';
      if (['hero', 'banner', 'editorial'].includes(type)) Object.assign(block, { title: 'Yeni seçkini keşfet.', description: 'Mağazana ve dönemine uygun ürünleri öne çıkar.', kicker: 'ÖZEL SEÇKİ', image: catalog.products[0]?.imageUrl || '', mobileImage: catalog.products[0]?.imageUrl || '', alt: catalog.products[0]?.name || '', buttonText: 'Ürünleri keşfet', target: 'categories' });
    }
    change(next => { next.blocks.push(block); });
    setSelectedId(block.id);
    setAddOpen(false);
  }
  function remove(id) {
    const index = draft.blocks.findIndex(block => block.id === id);
    change(next => { next.blocks = next.blocks.filter(block => block.id !== id); });
    if (id === selectedId) setSelectedId(draft.blocks[index + 1]?.id || draft.blocks[index - 1]?.id || '');
  }
  function duplicate(id) {
    if (draft.blocks.length >= 20) { setError('Bir pakette en fazla 20 bölüm olabilir.'); return; }
    const source = draft.blocks.find(block => block.id === id);
    if (!source) return;
    const copied = cloneSectionBlocks([source])[0];
    change(next => { next.blocks.splice(next.blocks.findIndex(block => block.id === id) + 1, 0, copied); });
    setSelectedId(copied.id);
  }
  function close() { if (dirty) setDiscardOpen(true); else onClose(); }
  async function save(asCopy = false) {
    if(saving)return;
    if (!valid) { setError(campaignError || (!draft.name.trim() ? 'Paketine bir ad ver.' : 'Pakete en az bir bölüm ekle.')); return; }
    const name = draft.name.trim(), copy = asCopy || !existing;
    if (copy && existing && name === initialPackage.name.trim()) { setError('Yeni kopyan için farklı bir paket adı yaz.'); nameRef.current?.focus(); return; }
    if (copy && atPackageLimit) { setError(`Bu kanalda en fazla ${MAX_CAMPAIGN_PACKAGES} paket kaydedebilirsin.`); return; }
    const id = copy ? uid() : initialPackage.id;
    setSaving(true);
    try{
    const value=await prepareHostCampaign({id,name,blocks:cloneSectionBlocks(draft.blocks),campaign:normalizeCampaign(draft.campaign)},doc,channel,()=>active.current);
    if(!active.current)return;
    if (update(next => {
      const packages = next.savedSections || [];
      if (copy && packages.length >= MAX_CAMPAIGN_PACKAGES) throw new Error(`Bu kanalda en fazla ${MAX_CAMPAIGN_PACKAGES} paket kaydedebilirsin.`);
      if (!copy && !packages.some(pack => pack.id === id)) throw new Error('Bu paket kütüphaneden kaldırılmış. Farklı adla kaydedebilirsin.');
      next.savedSections = copy ? [...packages, value] : packages.map(pack => pack.id === id ? value : pack);
    })) {
      notify(`${name}: ${draft.blocks.length} bölüm ${copy ? 'kütüphanene kaydedildi' : 'güncellendi'}. Geri al ile bu işlemi geri çevirebilirsin.`);
      onSaved(id);
    } else setError('Paket kaydedilemedi. Alanları ve bölüm tarihlerini kontrol et; düzenlemelerin burada korunuyor.');
    }catch(e){if(active.current)setError(e.message);}finally{if(active.current)setSaving(false);}
  }
  function keys(event) {
    event.stopPropagation();
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); save(); }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); event.shiftKey ? redo() : undo(); }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') { event.preventDefault(); redo(); }
    if (event.key === 'Escape') { event.preventDefault(); if (addOpen) setAddOpen(false); else close(); }
    if (event.key !== 'Tab') return;
    const fields = [...dialogRef.current.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href]')].filter(element => element.getClientRects().length);
    const first = fields[0], last = fields.at(-1);
    if (event.shiftKey && window.document.activeElement === first) { event.preventDefault(); last?.focus(); }
    if (!event.shiftKey && window.document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }

  return createPortal(<div className="sl-package-backdrop"><section ref={dialogRef} className="sl-package-editor" inert={saving?true:undefined} aria-busy={saving} role="dialog" aria-modal="true" aria-labelledby="sl-package-editor-title" onKeyDown={keys}>
    <header className="sl-package-editor-head"><div><span className="sl-detail-eyebrow">{channel === 'android' ? 'ANDROID' : 'WEB'} · BÖLÜM PAKETİ</span><h2 id="sl-package-editor-title">{existing ? 'Paketini geliştir.' : 'Kendi seçkini oluştur.'}</h2><p>Bölümleri sırala, içeriklerini düzenle ve ürünlerini seç.</p></div><div className="sl-package-head-actions"><button className="sp-icon-button" aria-label="Paket düzenlemesini geri al" title="Geri al · Ctrl+Z" disabled={!history.past.length} onClick={undo}><Undo2 size={17}/></button><button className="sp-icon-button" aria-label="Paket düzenlemesini yinele" title="Yinele · Ctrl+Shift+Z" disabled={!history.future.length} onClick={redo}><Redo2 size={17}/></button><button className="sp-icon-button" aria-label="Paket düzenleyicisini kapat" onClick={close}><X size={20}/></button></div></header>
    <div className="sl-package-namebar"><label className="sp-field"><span>Paket adı</span><input ref={nameRef} maxLength={100} value={draft.name} placeholder="Örn. Yaz seçkim" onChange={event => change(next => { next.name = event.target.value; }, 'name')}/></label><span><Layers3 size={15}/>{draft.blocks.length}/20 bölüm</span><small>{dirty ? 'Kaydedilmemiş değişiklikler' : existing ? 'Kayıtlı paket' : 'Yeni paket'}<i className={dirty ? 'is-dirty' : ''}/></small></div>
    <div className="sl-package-editor-body">
      <aside className="sl-package-layers"><header><strong>Paket bölümleri</strong><button className="sp-icon-button" aria-label="Pakete bölüm ekle" aria-expanded={addOpen} disabled={draft.blocks.length >= 20} onClick={() => setAddOpen(!addOpen)}><Plus size={17}/></button></header><p>Sürükle veya oklarla sırala.</p>{selected&&['hero','banner','editorial'].includes(selected.type)&&<button className="sp-button sp-button-outline" onClick={()=>{if(!selected.campaignCanvas)change(next=>{next.blocks.find(b=>b.id===selected.id).campaignCanvas=createCampaignCanvas({id:'custom',title:selected.title,name:selected.title,description:selected.description,image:selected.image,occasion:selected.kicker},{layout:'split',theme:doc.theme,channel});});setCanvasId(selected.id);}}>{selected.campaignCanvas?'Kampanya tuvalini düzenle':'Serbest tuval oluştur'}</button>}<div className="sl-package-layer-scroll">
        <details className="cl-editor-plan"><summary>Kampanya planı ve hedef</summary><CampaignSettings compact value={draft.campaign} onChange={value=>change(next=>{next.campaign=value;},'campaign')} pack={CAMPAIGN_PACKS.find(p=>p.id===draft.campaign.sourceId)} pages={pages} blocks={pages.some(p=>p.id===draft.campaign.targetPage)?getPageBlocks(doc,draft.campaign.targetPage):[]} channel={channel}/></details>
        {addOpen && <div className="sl-package-add-list"><strong>Yeni bölüm</strong>{Object.entries(BLOCKS).map(([type, meta]) => <button key={type} type="button" disabled={draft.blocks.length >= 20} onClick={() => add(type)}><span>{meta.label}<small>{meta.description}</small></span><Plus size={14}/></button>)}</div>}
        <SortableList items={draft.blocks} onOrder={reorder} onPreviewOrder={setDragPreview} label="Paket bölümleri" getLabel={titleOf} renderItem={(block, index) => <div className={`sl-package-layer ${block.id === selectedId ? 'is-selected' : ''}`}><button className="sl-package-layer-select" aria-pressed={block.id === selectedId} onClick={() => setSelectedId(block.id)}><span>{String(index + 1).padStart(2, '0')}</span><span><strong>{titleOf(block)}</strong><small>{BLOCKS[block.type]?.label}{block.enabled === false ? ' · Gizli' : ''}</small></span></button><div className="sl-package-layer-actions"><button aria-label={`${index + 1}. bölümü yukarı taşı`} disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp size={13}/></button><button aria-label={`${index + 1}. bölümü aşağı taşı`} disabled={index === draft.blocks.length - 1} onClick={() => move(index, 1)}><ArrowDown size={13}/></button><button aria-label={`${index + 1}. bölümü çoğalt`} disabled={draft.blocks.length >= 20} onClick={() => duplicate(block.id)}><Copy size={13}/></button><button className="sp-danger" aria-label={`${index + 1}. bölümü sil`} onClick={() => remove(block.id)}><Trash2 size={13}/></button></div></div>}/>
        {!draft.blocks.length && <div className="sl-empty"><Layers3 size={28}/><strong>İlk bölümünü ekle</strong><p>Bir kampanya, ürün rafı veya metinle başlayabilirsin.</p></div>}
      </div><button className="sp-button sp-button-outline" disabled={draft.blocks.length >= 20} onClick={() => setAddOpen(!addOpen)}><Plus size={15}/> Bölüm ekle</button></aside>
      <main className="sl-package-outline"><div className="sl-package-outline-heading"><strong>İçerik özeti</strong><span>Düzenlemek için bölüme tıkla</span></div><p className="sl-package-preview-note">Bu görünüm paket içeriğini gösterir. Mağazadaki tasarım, eklediğin sayfanın temasını kullanır.</p><div className="sl-package-outline-scroll">{previewBlocks.map((block, index) => <article key={block.id} data-campaign-block={block.id} data-drag-preview={dragPreview?.draggedId===block.id||undefined} className={`sl-package-block ${selectedId === block.id ? 'is-selected' : ''}`}><button className="sl-package-block-heading" onClick={() => setSelectedId(block.id)} aria-label={`${index + 1}. ${titleOf(block)} bölümünü düzenle`}><span>{String(index + 1).padStart(2, '0')} · {BLOCKS[block.type]?.label}</span>{block.enabled === false ? <EyeOff size={14}/> : selectedId === block.id ? <Check size={14}/> : <span>Düzenle</span>}</button>{block.campaignCanvas&&<div className="sl-package-canvas-tools"><button className="sp-button sp-button-outline" onClick={()=>setCanvasId(block.id)}>Katmanları ve kompozisyonu düzenle</button></div>}<div className={`sl-package-block-content ${block.campaignCanvas?'sl-package-canvas-content':''} ${block.style?.imagePosition === 'left' ? 'image-left' : ''}`} style={{ background: block.style?.background || '#ffffff', color: block.style?.textColor || '#203349', textAlign: block.style?.align || 'left' }} onClick={() => setSelectedId(block.id)}><BlockContent block={block} catalog={catalog} channel={channel} theme={doc.theme}/></div></article>)}</div></main>
      <Inspector block={selected} document={doc} channel={channel} updateBlock={updateBlock} remove={() => selected && remove(selected.id)} duplicate={() => selected && duplicate(selected.id)} notify={notify}/>
    </div>
    <footer className="sl-package-editor-footer">{(error||campaignError) && <p className="sl-field-error" role="alert">{error||campaignError}</p>}{discardOpen ? <div className="sl-package-discard" role="alert"><span>Kaydedilmemiş düzenlemelerin var.</span><button className="sp-button sp-button-outline" onClick={() => setDiscardOpen(false)}>Düzenlemeye dön</button><button className="sp-button sp-danger" onClick={onClose}>Kaydetmeden kapat</button></div> : <><p>{existing ? 'Güncelleme, daha önce sayfalara eklenen kopyaları değiştirmez.' : 'Kaydettiğin paketi istediğin sayfaya ayrıca ekleyebilirsin.'}</p><div><button className="sp-button sp-button-outline" onClick={close}>Kapat</button>{existing && <button className="sp-button sp-button-outline" disabled={!valid || atPackageLimit} onClick={() => save(true)}><Copy size={15}/> Farklı adla kaydet</button>}<button className="sp-button sp-button-dark" disabled={!valid || (!existing && atPackageLimit)} onClick={() => save(false)}><Save size={15}/>{existing ? 'Paketi güncelle' : 'Kendi paketim olarak kaydet'}</button></div></>}</footer>
  </section>{canvasId&&draft.blocks.find(b=>b.id===canvasId)?.campaignCanvas&&<CampaignCanvasEditor value={draft.blocks.find(b=>b.id===canvasId).campaignCanvas} theme={doc.theme} onClose={()=>setCanvasId(null)} onSave={canvas=>{change(next=>{next.blocks.find(b=>b.id===canvasId).campaignCanvas=canvas;});setCanvasId(null);}}/>}</div>,window.document.body);
}
