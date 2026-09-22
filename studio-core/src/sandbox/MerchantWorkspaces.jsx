import React, {useEffect,useMemo,useRef,useState} from 'react';
import {ArrowRight,ArrowUpRight,Check,ChevronDown,LayoutDashboard,Plus,Search,Smartphone,Store,X} from 'lucide-react';
import {createMerchant,getCurrentMerchant,listMerchants,merchantSlug,MERCHANT_SECTORS,subscribeMerchants,withMerchantScope} from './merchantWorkspaces.js';
import {getSectorCatalog} from './sectorCatalog.js';
import {getStoreDemo} from './storeDemos.js';
import './merchant-workspaces.css';

const initialForm={name:'',slug:'',catalogFamily:'fashion'};

export default function MerchantWorkspaces() {
  const [merchants,setMerchants]=useState(listMerchants);
  const [query,setQuery]=useState('');
  const [sectorFilter,setSectorFilter]=useState('all');
  const [formOpen,setFormOpen]=useState(false);
  const [form,setForm]=useState(initialForm);
  const [slugEdited,setSlugEdited]=useState(false);
  const [error,setError]=useState('');
  const [created,setCreated]=useState(null);
  const [saving,setSaving]=useState(false);
  const nameInput=useRef(null),formTrigger=useRef(null);
  const current=getCurrentMerchant();
  useEffect(()=>subscribeMerchants(()=>setMerchants(listMerchants())),[]);
  useEffect(()=>{if(formOpen)nameInput.current?.focus();},[formOpen]);
  const visible=useMemo(()=>merchants.filter(merchant=>{
    const sector=MERCHANT_SECTORS.find(item=>item.id===merchant.catalogFamily);
    return (sectorFilter==='all'||merchant.catalogFamily===sectorFilter) && `${merchant.name} ${merchant.slug} ${sector?.name || ''}`.toLocaleLowerCase('tr').includes(query.trim().toLocaleLowerCase('tr'));
  }),[merchants,query,sectorFilter]);
  const changeName=name=>setForm(current=>({...current,name,slug:slugEdited?current.slug:merchantSlug(name)}));
  const closeForm=()=>{setFormOpen(false);setError('');formTrigger.current?.focus();};
  const submit=event=>{
    event.preventDefault();
    if(saving)return;
    setSaving(true);setError('');
    try {
      const profile=createMerchant(form);
      setMerchants(listMerchants());setCreated(profile);setQuery('');setSectorFilter('all');setForm(initialForm);setSlugEdited(false);closeForm();
    } catch(cause) {setError(cause.message || 'Mağaza oluşturulamadı.');}
    finally {setSaving(false);}
  };

  return <section className="mw-root" aria-label="Mağaza çalışma alanları">
    <header className="mw-heading"><div><span className="mw-eyebrow"><Store size={15}/>MAĞAZA ALANLARI</span><h2>Her mağaza, kendi dünyası.</h2><p>Ürünlerini ayrı tut, tasarımını özgürce seç. Her mağazanın vitrini ve Android görünümü birlikte hazır.</p></div><button type="button" className="mw-primary" ref={formTrigger} aria-expanded={formOpen} aria-controls="merchant-create-form" onClick={()=>{setFormOpen(!formOpen);setError('');}}><Plus size={17}/>Yeni mağaza</button></header>

    {created&&<div className="mw-created" role="status"><Check size={19}/><div><strong>{created.name} hazır.</strong><span>Tasarımını düzenleyerek kendi mağazana dönüştürebilirsin.</span></div><a href={withMerchantScope('/?surface=admin',created.id)}>Yönetimini aç <ArrowRight size={15}/></a><button type="button" aria-label="Mağaza oluşturuldu bilgisini kapat" onClick={()=>setCreated(null)}><X size={17}/></button></div>}

    {formOpen&&<form id="merchant-create-form" className="mw-form" onSubmit={submit} aria-label="Yeni mağaza oluştur" aria-describedby={error?'merchant-create-error':undefined}>
      <div className="mw-form-heading"><div><h3>Yeni mağazana bir isim ver.</h3><p>Seçtiğin sektör ürün koleksiyonunu belirler. Görünümü daha sonra değiştirebilirsin.</p></div><button type="button" className="mw-icon-button" aria-label="Yeni mağaza formunu kapat" onClick={closeForm}><X size={18}/></button></div>
      <div className="mw-fields"><label><span>Mağaza adı</span><input ref={nameInput} name="merchantName" value={form.name} onChange={event=>changeName(event.target.value)} placeholder="Örn. Kuzey Atölye" autoComplete="off" minLength={2} maxLength={60} required/></label><label><span>Kısa ad</span><input name="merchantSlug" value={form.slug} onChange={event=>{setSlugEdited(true);setForm(current=>({...current,slug:event.target.value}));}} placeholder="kuzey-atolye" autoComplete="off" autoCapitalize="none" spellCheck={false} pattern="[a-z0-9]+(-[a-z0-9]+)*" minLength={2} maxLength={48} required/><small>Mağaza bağlantısında kullanılır.</small></label><label><span>Ürün sektörü</span><select name="merchantSector" value={form.catalogFamily} onChange={event=>setForm(current=>({...current,catalogFamily:event.target.value}))}>{MERCHANT_SECTORS.map(sector=><option key={sector.id} value={sector.id}>{sector.name}</option>)}</select><small>Örnek ürünler ve kategoriler bu sektörden gelir.</small></label></div>
      {error&&<p className="mw-error" id="merchant-create-error" role="alert">{error}</p>}
      <div className="mw-form-footer"><span><Store size={15}/>Bu tarayıcıdaki denemeye eklenir.</span><div><button type="button" className="mw-secondary" onClick={closeForm}>Vazgeç</button><button className="mw-primary" type="submit" disabled={saving}>{saving?'Oluşturuluyor…':'Mağazayı oluştur'}<ArrowRight size={16}/></button></div></div>
    </form>}

    <div className="mw-toolbar"><div><strong>{merchants.length} mağaza</strong><span>{current?`${current.name} alanındasın`:'Tüm mağazalarını keşfet'}</span></div><label className="mw-search"><Search size={17}/><input type="search" aria-label="Mağaza ara" placeholder="Mağaza veya sektör ara" value={query} onChange={event=>setQuery(event.target.value)}/></label><label className="mw-filter"><select aria-label="Mağazaları sektöre göre filtrele" value={sectorFilter} onChange={event=>setSectorFilter(event.target.value)}><option value="all">Tüm sektörler</option>{MERCHANT_SECTORS.map(sector=><option value={sector.id} key={sector.id}>{sector.name}</option>)}</select><ChevronDown size={15}/></label></div>

    <div className="mw-grid">{visible.map(merchant=>{
      const sector=MERCHANT_SECTORS.find(item=>item.id===merchant.catalogFamily),catalog=getSectorCatalog(merchant.catalogFamily),design=getStoreDemo(merchant.defaultDesign),selected=current?.id===merchant.id;
      return <article className={`mw-card${selected?' is-current':''}`} key={merchant.id} data-merchant-id={merchant.id} style={{'--mw-accent':design?.colors.accent || '#243b57','--mw-surface':design?.colors.background || '#f4f6f9'}}>
        <a className="mw-card-cover" href={withMerchantScope('/?surface=storefront&preview=draft',merchant.id)} target="_blank" rel="noreferrer" aria-label={`${merchant.name} vitrinini yeni sekmede aç`}><span className="mw-card-sector">{sector?.name}</span>{selected&&<span className="mw-current"><Check size={12}/>Bu mağazadasın</span>}<div className="mw-product-preview" aria-hidden="true">{catalog?.products.slice(0,3).map(product=><img src={product.imageUrl} alt="" key={product.id} loading="lazy"/>)}</div><span className="mw-cover-caption">Koleksiyonu keşfet<ArrowUpRight size={16}/></span></a>
        <div className="mw-card-body"><h3>{merchant.name}</h3><span className="mw-slug">{merchant.slug}</span><div className="mw-card-details"><span>{catalog?.products.length || 0} ürün</span><span>{catalog?.categories.length || 0} kategori</span><span>{design?.name || 'Mağaza tasarımı'}</span></div><div className="mw-card-actions"><a className="mw-admin-link" href={withMerchantScope('/?surface=admin',merchant.id)}><LayoutDashboard size={15}/>Yönetim<ArrowRight size={15}/></a><a href={withMerchantScope('/?surface=storefront&preview=draft',merchant.id)} target="_blank" rel="noreferrer" aria-label={`${merchant.name} vitrinini yeni sekmede aç`}><Store size={15}/>Vitrin</a><a href={withMerchantScope('/?surface=android&preview=draft',merchant.id)} target="_blank" rel="noreferrer" aria-label={`${merchant.name} Android görünümünü yeni sekmede aç`}><Smartphone size={15}/>Android</a></div></div>
      </article>;
    })}</div>
    {visible.length===0&&<div className="mw-empty"><Search size={28}/><h3>Bu aramada mağaza bulunamadı.</h3><p>Farklı bir ad ara veya sektör filtresini değiştir.</p><button className="mw-secondary" type="button" onClick={()=>{setQuery('');setSectorFilter('all');}}>Tüm mağazaları göster</button></div>}
  </section>;
}
