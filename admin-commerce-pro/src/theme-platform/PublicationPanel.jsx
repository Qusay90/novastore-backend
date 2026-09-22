import React,{useEffect,useState} from 'react';
import {errorMessage} from './ThemeTools.jsx';
import {useFormGuard} from './useFormGuard.js';

const labels={DRAFT:'Taslak',VALIDATING:'Kontrol ediliyor',READY:'Paket doğrulandı',PUBLICATION_REQUESTED:'Yayın isteği',BUILDING:'Oluşturuluyor',DEPLOYING:'Yerel paket kaydediliyor',ACTIVE:'Yerel aktif sürüm',SUPERSEDED:'Önceki sürüm',BLOCKED:'Kontroller tamamlanmadı',FAILED:'Başarısız'};
const reasons={THEME_PRESENTATION_NOT_READY:'Tema henüz yeni yayın için kabul edilmedi.',THEME_RESPONSIVE_EVIDENCE_REQUIRED:'Bu paket için ekran boyutu ve gezinme kabulü eksik.',THEME_LEGAL_REQUIRED:'Gerekli hukuki metinlerin onayı eksik.',THEME_STORE_CONTACT_REQUIRED:'Mağazanın zorunlu iletişim bilgileri eksik.',THEME_COMMERCE_RUNTIME_REQUIRED:'Gerekli müşteri işlemleri henüz hazır değil.',THEME_PUBLICATION_POLICY_STALE:'Yayın isteğinden sonra yetki politikası değişti. Yeni bir istek oluşturun.'};
export default function PublicationPanel({client,publications=[],onDone,onFormState}){
 const [id,setId]=useState(''),[data,setData]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[revision,refresh]=useState(0);
 useFormGuard(onFormState,{dirty:false,pending:busy});
 useEffect(()=>{let active=true;const controller=new AbortController();setData(null);
   if(id)client.get(`/publications/${id}/local-status`,{signal:controller.signal}).then(value=>{if(active)setData(value);}).catch(e=>{if(active)setError(errorMessage(e));});
   return()=>{active=false;controller.abort();};
 },[client,id,revision]);
 async function run(action){setBusy(true);setError('');try{await client.write(`/publications/${id}/${action}-local`,action==='build'?{}:{expectedGeneration:Number(data?.pointer?.generation||0)});refresh(n=>n+1);await onDone?.();}catch(e){setError(reasons[e.code]||errorMessage(e));refresh(n=>n+1);}finally{setBusy(false);}}
 const current=data?.artifact&&data?.pointer?.artifact_id===data.artifact.id,previous=data?.artifact&&data?.pointer?.previous_artifact_id===data.artifact.id;
 return <section className="tp-panel" aria-label="Yerel yayın yönetimi"><h2>Yayın kontrolleri</h2><p>Studio'da oluşturulmuş yayın isteğini doğrulayın. Bu işlemler yalnız yerel yayın ortamını yönetir; production dağıtımı veya alan adı değişikliği yapmaz.</p>
   <label>Yayın isteği<select disabled={busy} value={id} onChange={e=>setId(e.target.value)}><option value="">İstek seçin</option>{publications.map(p=><option key={p.id} value={p.id}>{new Date(p.created_at).toLocaleString('tr-TR')} · {labels[p.status]||p.status}</option>)}</select></label>
   {!publications.length&&<p>Henüz yayın isteği yok. İzin verilen Studio düzenleyicisinden yayın isteği oluşturabilirsiniz.</p>}
   {error&&<p role="alert" className="tp-error">{error}</p>}
   {id&&<button disabled={busy} onClick={()=>refresh(n=>n+1)}>Durumu yenile</button>}
   {data&&<><p><strong>{labels[data.status]||data.status}</strong> · Yerel ortam</p>
    {data.artifact&&<p>Paket özeti: <code>{data.artifact.digest}</code></p>}
    <div className="tp-actions"><button disabled={busy||!!data.artifact} onClick={()=>run('build')}>Yerel paketi oluştur ve doğrula</button>
      <button disabled={busy||!data.artifact||current} onClick={()=>run('activate')}>Doğrulanmış paketi yerelde etkinleştir</button>
      {previous&&<button disabled={busy} onClick={()=>run('rollback')}>Bu önceki doğrulanmış sürüme dön</button>}
    </div><p>Etkinleştirmede tema, yetki, mağaza, görsel, hukuki metin ve tarayıcı kabulü sunucuda yeniden kontrol edilir. Geri dönüş, siparişleri veya stokları değiştirmez.</p>
    <ol>{data.stages.map(s=><li key={s.id}>{labels[s.state]||s.state}{s.reason?` · ${reasons[s.reason]||s.reason}`:''} · {new Date(s.created_at).toLocaleString('tr-TR')}</li>)}</ol>
   </>}
 </section>;
}
