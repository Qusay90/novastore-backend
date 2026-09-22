import React, {useEffect, useId, useMemo, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import {Check, Image, Search, X} from 'lucide-react';
import {CAMPAIGN_MEDIA, CAMPAIGN_MEDIA_CATEGORIES, filterCampaignMedia} from '../campaignMedia.js';
import './campaign-media-picker.css';
import {assetURL} from '../../studio-integration/context.js';

/** Selecting a thumbnail only changes this dialog's draft selection. The host
 * owns placement, replacement and closing after the explicit confirmation. */
export default function CampaignMediaPicker({onSelect, onClose}) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [selectedId, setSelectedId] = useState(null);
  const [failedImages, setFailedImages] = useState(() => new Set());
  const dialog = useRef(null), search = useRef(null), closeRef = useRef(onClose);
  closeRef.current = onClose;
  const titleId = useId(), hintId = useId(), searchId = useId(), categoryId = useId();
  const items = useMemo(() => filterCampaignMedia(query, category), [query, category]);
  const selected = CAMPAIGN_MEDIA.find(item => item.id === selectedId);
  const selectedFailed = selected && failedImages.has(selected.id);

  useEffect(() => {
    const previous = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    search.current?.focus();

    const focusable = () => [...(dialog.current?.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),[tabindex="0"]') || [])]
      .filter(element => element.getClientRects().length && !element.closest('[hidden]'));
    function keys(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closeRef.current?.();
      } else if (event.key === 'Tab') {
        const all = focusable(), first = all[0], last = all.at(-1);
        if (!first) { event.preventDefault(); dialog.current?.focus(); return; }
        const active = document.activeElement;
        if (event.shiftKey && (active === first || !all.includes(active))) {
          event.preventDefault(); last.focus();
        } else if (!event.shiftKey && (active === last || !all.includes(active))) {
          event.preventDefault(); first.focus();
        }
      }
    }
    function keepFocus(event) {
      if (dialog.current && !dialog.current.contains(event.target)) {
        (focusable()[0] || dialog.current).focus();
      }
    }
    document.addEventListener('keydown', keys, true);
    document.addEventListener('focusin', keepFocus);
    return () => {
      document.removeEventListener('keydown', keys, true);
      document.removeEventListener('focusin', keepFocus);
      document.body.style.overflow = previousOverflow;
      if (previous?.isConnected && typeof previous.focus === 'function') previous.focus({preventScroll: true});
    };
  }, []);

  function imageFailed(id) {
    setFailedImages(current => current.has(id) ? current : new Set([...current, id]));
  }
  function clearFilters() { setQuery(''); setCategory('all'); search.current?.focus(); }

  return createPortal(
    <div className="cm-picker-backdrop" onClick={event => { if (event.target === event.currentTarget) onClose?.(); }}>
      <section className="cm-picker" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={hintId}
        ref={dialog} tabIndex={-1} onKeyDown={event => event.stopPropagation()}>
        <header className="cm-picker-header">
          <div><span className="cm-picker-brand">Nova Store<span aria-hidden="true">.</span></span><h2 id={titleId}>Görsel kütüphanesi</h2>
            <p id={hintId}>Kampanyana bir görsel seç. Tuvalde boyutunu, yerini ve çerçevesini dilediğin gibi düzenle.</p></div>
          <button className="cm-picker-close" type="button" onClick={onClose} aria-label="Görsel kütüphanesini kapat"><X size={21} aria-hidden="true"/></button>
        </header>
        <div className="cm-picker-tools">
          <label className="cm-picker-search" htmlFor={searchId}><Search size={19} aria-hidden="true"/><span className="cm-picker-sr-only">Görsellerde ara</span>
            <input id={searchId} ref={search} type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Ramazan, sofra, okul, doğa…" autoComplete="off"/>
          </label>
          <label className="cm-picker-category" htmlFor={categoryId}><span>Kategori</span>
            <select id={categoryId} value={category} onChange={event => setCategory(event.target.value)}>
              {CAMPAIGN_MEDIA_CATEGORIES.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          </label>
        </div>
        <div className="cm-picker-body">
          <div className="cm-picker-collection">
            <div className="cm-picker-result-heading"><p role="status" aria-live="polite">{items.length} görsel<span> / {CAMPAIGN_MEDIA.length}</span></p>
              {(query || category !== 'all') && <button type="button" onClick={clearFilters}>Filtreleri temizle</button>}</div>
            {items.length ? <div className="cm-picker-grid" aria-label="Hazır kampanya görselleri">
              {items.map(item => <button type="button" className="cm-picker-card" key={item.id} aria-pressed={selectedId === item.id}
                aria-label={`${item.label} görselini seç`} onClick={() => setSelectedId(item.id)} disabled={failedImages.has(item.id)}>
                <span className="cm-picker-thumbnail">
                  {failedImages.has(item.id) ? <span className="cm-picker-unavailable"><Image size={24} aria-hidden="true"/>Görsel yüklenemedi</span> :
                    <img src={assetURL(item.src)} alt="" loading="lazy" decoding="async" onError={() => imageFailed(item.id)}/>}
                  {selectedId === item.id && <span className="cm-picker-selected-mark"><Check size={16} aria-hidden="true"/></span>}
                </span><span className="cm-picker-card-label">{item.label}</span><small>{item.categoryLabel}</small>
              </button>)}
            </div> : <div className="cm-picker-empty"><Search size={30} aria-hidden="true"/><h3>Bu aramada görsel bulunamadı</h3><p>Başka bir kelime dene veya tüm görsellere dön.</p><button type="button" onClick={clearFilters}>Tüm görselleri göster</button></div>}
          </div>
          <aside className="cm-picker-preview" aria-label="Seçili görselin önizlemesi">
            <div className="cm-picker-preview-label"><span className="cm-picker-status-dot" aria-hidden="true"/>Önizleme</div>
            {selected ? <>
              <div className="cm-picker-preview-image">{selectedFailed ? <p role="alert">Bu görsel yüklenemedi. Başka bir görsel seçebilirsin.</p> :
                <img key={selected.id} src={assetURL(selected.src)} alt={selected.alt} decoding="async" onError={() => imageFailed(selected.id)}/>}</div>
              <div className="cm-picker-preview-details"><span className="cm-picker-preview-category">{selected.categoryLabel}</span><h3>{selected.label}</h3>
              <p>Görseli kullanmadan önce burada tam görünümünü inceleyebilirsin.</p></div>
            </> : <div className="cm-picker-preview-placeholder"><span><Image size={38} strokeWidth={1.3} aria-hidden="true"/></span><h3>Vitrinin için bir görsel seç</h3><p>Görsellerden birine dokun; büyük önizlemesi burada açılsın.</p></div>}
          </aside>
        </div>
        <footer className="cm-picker-footer"><p>{selected ? selected.label : 'Bir görsel seçerek başla.'}</p><div>
          <button type="button" className="cm-picker-cancel" onClick={onClose}>Vazgeç</button>
          <button type="button" className="cm-picker-confirm" disabled={!selected || selectedFailed} onClick={() => { if (selected && !selectedFailed) onSelect?.(selected); }}><Check size={18} aria-hidden="true"/>Görseli kullan</button>
        </div></footer>
      </section>
    </div>, document.body
  );
}
