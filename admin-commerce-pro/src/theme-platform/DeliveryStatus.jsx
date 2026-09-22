import React,{useEffect,useState} from 'react';
import {errorMessage} from './ThemeTools.jsx';

const labels={PREPARED:'Teslim bağlantısı bekleniyor',PREPARED_FOR_DELIVERY:'Teslime hazırlandı',CONNECTION_REQUIRED:'Stocky mağaza bağlantısı gerekli',DELIVERY_PENDING:'Teslim kuyruğunda',PENDING:'İşlem kuyruğunda',DELIVERING:'Gönderiliyor',DELIVERED:'Stocky alındısı doğrulandı',RECEIPT_CONFIRMED:'Stocky alındısı ve onayı doğrulandı',REJECTED:'Teslim reddedildi',FAILED:'Gönderim başarısız'};
export default function DeliveryStatus({client,offerId}){
  const [rows,setRows]=useState(null),[error,setError]=useState(''),[revision,refresh]=useState(0);
  useEffect(()=>{let current=true;const controller=new AbortController();setRows(null);setError('');
    client.get(`/offers/${offerId}`,{signal:controller.signal}).then(value=>{if(current)setRows(value.themeDelivery||[]);})
      .catch(e=>{if(current)setError(errorMessage(e));});
    return()=>{current=false;controller.abort();};
  },[client,offerId,revision]);
  return <section aria-label="Stocky teslim durumu"><div className="tp-section-heading"><h3>Stocky teslimi</h3><button type="button" onClick={()=>refresh(n=>n+1)}>Teslim durumunu yenile</button></div>
    {error?<p role="alert" className="tp-error">{error}</p>:rows===null?<p role="status">Teslim kaydı okunuyor…</p>:!rows.length?<p>Bu sunuma ait Stocky teslim kaydı yok.</p>:rows.map(row=><article key={row.eventId} className="tp-panel">
      <strong>{row.deliveredAt&&row.resultId?'Stocky alındısı doğrulandı':labels[row.status]||row.status}</strong>
      {row.deliveredAt&&<p>Alındı zamanı: {new Date(row.deliveredAt).toLocaleString('tr-TR')}</p>}
      <p>{row.acknowledgedAt?'Alındı onayı Stocky tarafından kabul edildi.':row.resultId?'Alındı kalıcı olarak kaydedildi; karşı tarafın onay cevabı bekleniyor.':'Henüz doğrulanmış alındı bulunmuyor.'}</p>
      {row.errorCode&&<p role="status">Son işlem sonucu: {row.errorCode}</p>}
      <small>Olay: {row.eventId}{row.resultId?` · Alındı: ${row.resultId}`:''}</small>
    </article>)}
    <p className="tp-notice">Teslim alındısı paketin Stocky tarafından kaydedildiğini gösterir. Satıcının ekranı görmesi ve mağazanın yayına alınması ayrıca doğrulanır.</p>
  </section>;
}
