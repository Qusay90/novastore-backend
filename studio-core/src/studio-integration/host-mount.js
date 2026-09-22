/** Mount the real Studio UI without importing its global styles into the admin DOM. */
export function mountNovaStoreStudio(container,configuration) {
  if(!container?.appendChild)throw new Error('Stüdyo için bir kapsayıcı gerekir.');
  const url=new URL(configuration.moduleURL,location.href);
  if(url.origin!==location.origin||!['http:','https:'].includes(url.protocol)||url.username||url.password)throw new Error('Stüdyo modülü admin ile aynı kaynaktan sunulmalı.');
  if(url.search||url.hash)throw new Error('Modül adresinde demo, mağaza veya atölye sorgusu bulunmamalı.');
  const frame=document.createElement('iframe');frame.title='Nova Store Studio Pro';frame.src=url.href;frame.style.cssText='width:100%;height:100%;min-height:760px;border:0;display:block';
  // Trusted same-origin module: iframe provides CSS/lifecycle isolation, not a security boundary.
  let disposed=false,settled=false,rejectReady;
  const ready=new Promise((resolve,reject)=>{
    rejectReady=reject;
    frame.addEventListener('load',async()=>{if(disposed)return;try{const module=frame.contentWindow.NovaStoreStudio;if(module?.contractVersion!=='novastore-studio-host/1')throw new Error('Uyumlu Studio modülü yüklenemedi.');const {moduleURL,...host}=configuration;const result=await module.mount(host);settled=true;resolve(result);}catch(error){settled=true;reject(error);}}, {once:true});
    frame.addEventListener('error',()=>{settled=true;reject(new Error('Stüdyo yüklenemedi.'));},{once:true});
  });
  container.append(frame);
  return {frame,ready,getState:()=>frame.contentWindow?.NovaStoreStudio?.getState(),unmount(){disposed=true;frame.contentWindow?.NovaStoreStudio?.unmount();frame.remove();if(!settled)rejectReady(new Error('Stüdyo açılmadan kapatıldı.'));}};
}
