import React,{useEffect,useState} from 'react';
import {errorMessage} from './ThemeTools.jsx';
import {useFormGuard} from './useFormGuard.js';

const fields={displayName:'Mağaza adı',legalBusinessName:'Ticari unvan',logoAssetId:'Yüklenmiş logo kimliği',email:'E-posta',phone:'Telefon',address:'Açık adres',city:'İl',region:'İlçe / bölge',country:'Ülke',supportEmail:'Destek e-postası',supportPhone:'Destek telefonu',shippingSummary:'Teslimat özeti',returnSummary:'İade özeti'};
const types={privacy:'Gizlilik',terms:'Kullanım koşulları','distance-sales':'Mesafeli satış',returns:'İade koşulları',shipping:'Teslimat',kvkk:'KVKK',cookie:'Çerezler',contact:'İletişim','business-information':'İşletme bilgileri'};
const statuses={DRAFT:'Taslak',APPROVED:'Onaylandı',REVOKED:'Geri çekildi'};
const networks=['instagram','facebook','youtube','tiktok','x','linkedin'];
const extract=identity=>Object.fromEntries([...Object.keys(fields),'socialLinks'].map(key=>[key,identity?.[key]??null]));
export default function StoreContent({client,serviceId,onFormState}){
  const [data,setData]=useState(null),[profile,setProfile]=useState({}),[saved,setSaved]=useState(''),[reason,setReason]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[revision,reload]=useState(0);
  const [type,setType]=useState('privacy'),[content,setContent]=useState(''),[selected,setSelected]=useState(''),[effective,setEffective]=useState(''),[expires,setExpires]=useState('');
  useEffect(()=>{let current=true;const controller=new AbortController();setData(null);setError('');
    client.get(`/services/${serviceId}/store-content`,{signal:controller.signal}).then(value=>{if(!current)return;const next=extract(value.public.storeIdentity);setData(value);setProfile(next);setSaved(JSON.stringify(next));})
      .catch(e=>{if(current)setError(errorMessage(e));});return()=>{current=false;controller.abort();};
  },[client,serviceId,revision]);
  useFormGuard(onFormState,{dirty:!!data&&(JSON.stringify(profile)!==saved||!!content||!!reason),pending:busy});
  async function mutate(path,body,method='POST'){
    if(!reason.trim()){setError('İşlem gerekçesi gerekli.');return false;}
    if(path!=='contact'&&JSON.stringify(profile)!==saved){setError('Önce değiştirdiğiniz iletişim bilgilerini kaydedin.');return false;}
    setBusy(true);setError('');setNotice('');try{await client.write(`/services/${serviceId}/${path}`,{...body,reason},method);setReason('');setNotice('Sunucu kaydı güncellendi.');reload(n=>n+1);return true;}catch(e){setError(errorMessage(e));return false;}finally{setBusy(false);}
  }
  const doc=data?.history.find(item=>item.id===selected),fieldValue=key=>profile[key]||'';
  async function approve(){
    if(!effective||!Number.isFinite(Date.parse(effective))||(expires&&!Number.isFinite(Date.parse(expires)))){setError('Geçerli başlangıç ve bitiş zamanı seçin.');return;}
    await mutate(`legal-documents/${doc.id}/approve`,{expectedRevision:Number(doc.revision),effectiveAt:new Date(effective).toISOString(),expiresAt:expires?new Date(expires).toISOString():null});
  }
  return <section className="tp-panel" aria-label="Mağaza iletişim ve hukuki içerikleri"><h2>İletişim ve hukuki içerikler</h2>
    <p>Burada kaydedilen işletme bilgileri mağazanın herkese açık sayfalarında kullanılır. Özel müşteri adresleri bu alana aktarılmaz.</p>
    {error&&<p role="alert" className="tp-error">{error}</p>}{notice&&<p role="status" className="tp-success">{notice}</p>}
    {!data?<p>Mağaza kayıtları yükleniyor…</p>:<>
      <div className="tp-form-grid">{Object.entries(fields).map(([key,label])=><label key={key}>{label}{['address','shippingSummary','returnSummary'].includes(key)?<textarea value={fieldValue(key)} maxLength={2000} onChange={e=>setProfile({...profile,[key]:e.target.value||null})}/>:<input value={fieldValue(key)} type={key.toLowerCase().endsWith('email')?'email':'text'} maxLength={200} onChange={e=>setProfile({...profile,[key]:e.target.value||null})}/>}</label>)}</div>
      <details><summary>Sosyal hesaplar</summary><div className="tp-form-grid">{networks.map(network=><label key={network}>{network}<input type="url" placeholder="https://" value={profile.socialLinks?.[network]||''} maxLength={600} onChange={e=>{const links={...profile.socialLinks};if(e.target.value)links[network]=e.target.value;else delete links[network];setProfile({...profile,socialLinks:Object.keys(links).length?links:null});}}/></label>)}</div></details>
      <label>İşlem gerekçesi<textarea maxLength={240} value={reason} onChange={e=>setReason(e.target.value)}/></label>
      <button disabled={busy||!reason.trim()||JSON.stringify(profile)===saved} onClick={()=>mutate('contact',{expectedRevision:data.public.storeIdentity.revision,profile},'PUT')}>İletişim bilgilerini kaydet</button>
      <hr/><h3>Hukuki metin sürümleri</h3>
      <p>Metinler işletmenin yetkilisi tarafından sağlanır. Taslak oluşturmak, metni yayınlamaz; onay ve geçerlilik zamanı ayrıca belirlenir.</p>
      {!!data.public.missingLegalTypes.length&&<p className="tp-notice">Geçerli onayı bulunmayan belgeler: {data.public.missingLegalTypes.map(key=>types[key]||key).join(', ')}</p>}
      <label>Belge türü<select value={type} onChange={e=>setType(e.target.value)}>{Object.entries(types).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
      <label>Yeni sürümün Türkçe metni<textarea rows={10} maxLength={131072} value={content} onChange={e=>setContent(e.target.value)}/></label>
      <button disabled={busy||!content.trim()||!reason.trim()} onClick={async()=>{if(await mutate('legal-documents',{locale:'tr-TR',type,content}))setContent('');}}>Yeni taslak sürüm oluştur</button>
      <label>Kayıtlı belge<select value={selected} onChange={e=>{setSelected(e.target.value);setEffective('');setExpires('');}}><option value="">Belge seçin</option>{data.history.map(item=><option key={item.id} value={item.id}>{types[item.document_type]||item.document_type} · {item.locale} · v{item.version} · {statuses[item.status]||item.status}</option>)}</select></label>
      {doc&&<article className="tp-legal-record"><p>İçerik özeti: <code>{doc.content_hash}</code></p><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{doc.content}</pre>
        {doc.status==='DRAFT'&&<><div className="tp-form-grid"><label>Geçerlilik başlangıcı<input type="datetime-local" value={effective} onChange={e=>setEffective(e.target.value)}/></label><label>Bitiş zamanı (isteğe bağlı)<input type="datetime-local" value={expires} onChange={e=>setExpires(e.target.value)}/></label></div><button disabled={busy||!reason.trim()||!effective} onClick={approve}>Bu metni onayla</button></>}
        {doc.status!=='REVOKED'&&<button disabled={busy||!reason.trim()} onClick={()=>mutate(`legal-documents/${doc.id}/revoke`,{expectedRevision:Number(doc.revision)})}>Bu sürümü geri çek</button>}
      </article>}
    </>}
  </section>;
}
