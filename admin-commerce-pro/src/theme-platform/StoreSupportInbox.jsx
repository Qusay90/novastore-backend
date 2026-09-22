import React,{useEffect,useMemo,useRef,useState} from 'react';
import './store-support-inbox.css';

const recipientLabel=value=>value==='PLATFORM'?'Nova Store desteği':'Mağaza desteği';
const date=value=>value?new Date(value).toLocaleString('tr-TR'):'';
const problem=error=>({THEME_SUPPORT_REVISION_CONFLICT:'Görüşme veya yönlendirme başka bir oturumda değişti. Güncel kaydı yenileyip tekrar deneyin.',
  THEME_SUPPORT_THREAD_CLOSED:'Bu görüşme kapatıldı. Yanıtlamak için yeniden açın.',THEME_PERMISSION_DENIED:'Bu işlem için güncel yetkiniz bulunmuyor.',
  THEME_RESOURCE_NOT_FOUND:'Görüşme bulunamadı veya bu mağazadaki yetkinizin dışında.',THEME_AUTH_REQUIRED:'Oturumunuz sona erdi. Yeniden giriş yapın.',
  THEME_SUPPORT_IDEMPOTENCY_CONFLICT:'Bu gönderim farklı bir metinle kullanılmış. Metni kontrol ederek tekrar deneyin.'}[error?.code]||'İşlem tamamlanamadı. Bağlantınızı kontrol ederek tekrar deneyin.');
const denied=error=>[401,403].includes(error?.status||error?.statusCode);
export function StoreSupportMessage({message}){
  return <li className={message.senderKind==='CUSTOMER'?'from-customer':'from-support'}>
    <div><strong>{message.senderKind==='CUSTOMER'?'Müşteri':message.senderKind==='SELLER'?'Mağaza desteği':'Nova Store desteği'}</strong><time dateTime={message.createdAt}>{date(message.createdAt)}</time></div><p>{message.body}</p>
  </li>;
}

// All routing and role decisions remain on the scoped service. The same view
// works with the Admin client and the finite Stocky human-Seller bridge client.
export default function StoreSupportInbox({client,serviceId,kind=client?.kind||'seller',onFormState}){
  if(!serviceId)return <p className="nss-empty">Destek görüşmelerini görmek için bir mağaza seçin.</p>;
  return <SupportSession key={`${kind}:${serviceId}`} {...{client,serviceId,kind,onFormState}}/>;
}
function SupportSession({client,serviceId,kind,onFormState}){
  const base=`/services/${encodeURIComponent(serviceId)}/support`;
  const scope=useMemo(()=>({client,serviceId,kind}),[client,serviceId,kind]);
  const current=useRef(scope);current.current=scope;
  const alive=useRef(true),listSequence=useRef(0),detailSequence=useRef(0),selected=useRef(''),writing=useRef(false),retry=useRef(null);
  const [loadedScope,setLoadedScope]=useState(null),[threads,setThreads]=useState([]),[detail,setDetail]=useState(null),[selection,setSelection]=useState('');
  const [loading,setLoading]=useState(true),[detailLoading,setDetailLoading]=useState(false),[busy,setBusy]=useState(false),[reply,setReply]=useState('');
  const [error,setError]=useState(''),[notice,setNotice]=useState(''),[writeDenied,setWriteDenied]=useState(false);
  const [policy,setPolicy]=useState(null),[target,setTarget]=useState('SELLER'),[reason,setReason]=useState('');
  const valid=token=>alive.current&&current.current===token;
  const changedPolicy=!!policy&&(target!==policy.recipient||!!reason.trim());
  useEffect(()=>{onFormState?.({dirty:!!reply.trim()||changedPolicy,pending:busy});},[onFormState,reply,changedPolicy,busy]);
  useEffect(()=>()=>onFormState?.({dirty:false,pending:false}),[onFormState]);
  const report=(failure,token)=>{
    if(!valid(token))return;setError(problem(failure));
    if(denied(failure)){setWriteDenied(true);setDetail(null);setThreads([]);setPolicy(null);}
  };
  async function loadList(token=scope){
    const sequence=++listSequence.current;setLoading(true);
    try{const result=await client.get(base+'/threads');if(!valid(token)||sequence!==listSequence.current)return;
      setThreads(Array.isArray(result.threads)?result.threads:[]);setLoadedScope(token);
    }catch(failure){report(failure,token);}finally{if(valid(token)&&sequence===listSequence.current)setLoading(false);}
  }
  async function loadPolicy(token=scope){
    if(kind!=='admin')return;
    try{const value=await client.get(base+'/policy');if(valid(token)){setPolicy(value);setTarget(value.recipient);}}
    catch(failure){if(valid(token)){setPolicy(null);if(![401,403].includes(failure?.status||failure?.statusCode))setError(problem(failure));}}
  }
  async function loadThread(id,{append=false,after}={}){
    const token=scope,sequence=++detailSequence.current;setDetailLoading(true);
    try{const result=await client.get(`${base}/threads/${encodeURIComponent(id)}${after?`/after/${after}`:''}`);
      if(!valid(token)||selected.current!==id||sequence!==detailSequence.current)return;
      setDetail(previous=>({thread:result.thread,messages:append&&previous?.thread.id===id?[...previous.messages,...result.messages.filter(row=>!previous.messages.some(old=>old.id===row.id))]:result.messages,nextAfter:result.nextAfter}));
    }catch(failure){if(selected.current===id&&sequence===detailSequence.current)report(failure,token);}
    finally{if(valid(token)&&selected.current===id&&sequence===detailSequence.current)setDetailLoading(false);}
  }
  useEffect(()=>{
    alive.current=true;selected.current='';setSelection('');setDetail(null);setReply('');setPolicy(null);setWriteDenied(false);setError('');setLoadedScope(null);
    loadList(scope);loadPolicy(scope);
    return()=>{alive.current=false;listSequence.current++;detailSequence.current++;};
  },[scope]);
  function selectThread(id){
    if(writing.current||id===selected.current)return;
    if(reply.trim()&&!window.confirm('Yazdığınız gönderilmemiş yanıt silinsin mi?'))return;
    selected.current=id;setSelection(id);setDetail(null);setReply('');retry.current=null;setError('');setNotice('');loadThread(id);
  }
  async function runWrite(work,onSuccess){
    if(writing.current||writeDenied)return;
    const token=scope;writing.current=true;setBusy(true);setError('');setNotice('');
    try{const result=await work();if(valid(token))await onSuccess(result,token);}
    catch(failure){report(failure,token);}
    finally{writing.current=false;if(valid(token))setBusy(false);}
  }
  function sendReply(event){
    event.preventDefault();const body=reply.trim(),id=selected.current;if(!body||!id||detail?.thread.status!=='OPEN')return;
    if(!retry.current||retry.current.id!==id||retry.current.body!==body)retry.current={id,body,clientMessageId:crypto.randomUUID()};
    const payload={body,clientMessageId:retry.current.clientMessageId};
    runWrite(()=>client.write(`${base}/threads/${id}/messages`,payload),async(_result,token)=>{
      setReply('');retry.current=null;setNotice('Yanıt görüşmeye eklendi.');await Promise.all([loadThread(id),loadList(token)]);
    });
  }
  function changeState(){
    if(!detail)return;const id=detail.thread.id,status=detail.thread.status==='OPEN'?'CLOSED':'OPEN';
    runWrite(()=>client.write(`${base}/threads/${id}/state`,{status,expectedRevision:detail.thread.revision},'PATCH'),async(result,token)=>{
      setDetail(previous=>previous?{...previous,thread:result.thread}:previous);setNotice(status==='CLOSED'?'Görüşme kapatıldı.':'Görüşme yeniden açıldı.');await loadList(token);
    });
  }
  function markRead(){
    const last=detail?.messages.at(-1);if(!last)return;const id=detail.thread.id;
    runWrite(()=>client.write(`${base}/threads/${id}/read`,{throughMessageId:last.id}),async(result,token)=>{
      setDetail(previous=>previous?{...previous,thread:result.thread}:previous);setNotice('Görüntülenen mesajlar okundu olarak işaretlendi.');await loadList(token);
    });
  }
  function savePolicy(event){
    event.preventDefault();if(!policy||!reason.trim())return;
    runWrite(()=>client.write(base+'/policy',{recipient:target,expectedRevision:policy.revision,reason:reason.trim()},'PUT'),async result=>{
      setPolicy(result);setTarget(result.recipient);setReason('');setNotice('Yeni görüşmelerin destek yönlendirmesi güncellendi. Önceki görüşmelerin alıcısı korunur.');
    });
  }
  const visible=loadedScope===scope,active=visible?detail:null;
  return <section className="nss-inbox" aria-label="Mağaza destek gelen kutusu">
    <header className="nss-heading"><div><h2>Müşteri desteği</h2><p>{kind==='admin'?'Nova Store desteğine yönlendirilen görüşmeler.':'Yalnız bu mağazanın destek görüşmeleri.'}</p></div>
      <button type="button" disabled={busy||loading} onClick={()=>{setError('');loadList();loadPolicy();if(selected.current)loadThread(selected.current);}}>Yenile</button></header>
    {error&&<p className="nss-alert" role="alert">{error}</p>}{notice&&<p className="nss-notice" role="status">{notice}</p>}
    {policy&&kind==='admin'&&<form className="nss-policy" onSubmit={savePolicy}>
      <label>Yeni görüşmelerin alıcısı<select value={target} disabled={busy||writeDenied} onChange={event=>setTarget(event.target.value)}><option value="SELLER">Mağaza desteği</option><option value="PLATFORM">Nova Store desteği</option></select></label>
      <label>Yönlendirme gerekçesi<input value={reason} maxLength={500} disabled={busy||writeDenied} onChange={event=>setReason(event.target.value)} placeholder="Değişikliğin gerekçesini yazın"/></label>
      <button disabled={busy||writeDenied||!reason.trim()} type="submit">Yönlendirmeyi kaydet</button>
      <p>Sunucu onaylı mevcut alıcı: {recipientLabel(policy.recipient)}. Önceki görüşmeler yeniden yönlendirilmez.</p>
    </form>}
    <div className="nss-layout"><nav className="nss-threads" aria-label="Destek görüşmeleri">
      {loading&&<p role="status">Görüşmeler yükleniyor…</p>}
      {!loading&&(!visible||!threads.length)&&<p className="nss-empty">Bu mağazada yetkiniz kapsamında bir görüşme bulunmuyor.</p>}
      {visible&&threads.map(thread=><button type="button" key={thread.id} className={selection===thread.id?'is-selected':''} disabled={busy} aria-current={selection===thread.id?'true':undefined} onClick={()=>selectThread(thread.id)}>
        <strong>{thread.subject}</strong><span>{recipientLabel(thread.recipient)} · {thread.status==='OPEN'?'Açık':'Kapalı'}</span><time dateTime={thread.lastMessageAt}>{date(thread.lastMessageAt)}</time>
        {thread.unreadCount>0&&<em aria-label={`${thread.unreadCount} okunmamış mesaj`}>{thread.unreadCount}</em>}
      </button>)}
    </nav><div className="nss-conversation" aria-busy={detailLoading||busy}>
      {detailLoading&&!active&&<p role="status">Görüşme yükleniyor…</p>}
      {!active&&!detailLoading&&<p className="nss-empty">Mesajları görüntülemek için bir görüşme seçin.</p>}
      {active&&<><header className="nss-conversation-heading"><div><h3>{active.thread.subject}</h3><p>{recipientLabel(active.thread.recipient)} · {active.thread.status==='OPEN'?'Açık görüşme':'Kapalı görüşme'}</p></div><div>
        <button type="button" onClick={markRead} disabled={busy||writeDenied||!active.thread.unreadCount}>Okundu işaretle</button>
        <button type="button" onClick={changeState} disabled={busy||writeDenied}>{active.thread.status==='OPEN'?'Görüşmeyi kapat':'Yeniden aç'}</button></div></header>
        <ol className="nss-messages" aria-label="Görüşme mesajları">{active.messages.map(message=><StoreSupportMessage key={message.id} message={message}/>)}</ol>
        {active.nextAfter&&<button type="button" className="nss-more" disabled={busy||detailLoading} onClick={()=>loadThread(active.thread.id,{append:true,after:active.nextAfter})}>Sonraki mesajları yükle</button>}
        <form className="nss-reply" onSubmit={sendReply}><label>Yanıtınız<textarea rows={4} maxLength={5000} value={reply} onChange={event=>setReply(event.target.value)} disabled={busy||writeDenied||active.thread.status!=='OPEN'} placeholder={active.thread.status==='OPEN'?'Müşteriye yanıt yazın…':'Yanıtlamak için görüşmeyi yeniden açın.'}/></label>
          <div><small>{reply.length}/5000 · Yanıt yalnız bu görüşmeye gönderilir.</small><button type="submit" disabled={busy||writeDenied||active.thread.status!=='OPEN'||!reply.trim()}>{busy?'İşleniyor…':'Yanıtı gönder'}</button></div></form>
      </>}
    </div></div>
  </section>;
}
