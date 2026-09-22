import {createStockyThemeClient} from './stocky-client.js';
import {mountPlatformStudio} from './platform-bridge.js';
import {mountStockySupport} from './stocky-support-host.jsx';
import './stocky-shell.css';

const list=document.querySelector('#theme-list'),status=document.querySelector('#theme-status'),workspace=document.querySelector('#theme-workspace');
const refresh=document.querySelector('#theme-refresh'),back=document.querySelector('#theme-back');
let studio=null,support=null,supportState={dirty:false,pending:false},sequence=0,controller=null;
const client=createStockyThemeClient({onUnauthorized:()=>{sequence++;controller?.abort();studio?.unmount();studio=null;support?.unmount();support=null;list.replaceChildren();workspace.replaceChildren();
  status.textContent='Stocky oturumunuz sona erdi. Tasarımlarınıza erişmek için yeniden giriş yapın.';document.querySelector('#theme-login').hidden=false;}});
function describe(error){if([401,419].includes(error.status))return 'Oturum sona erdi. Yeniden giriş yapın.';
 if(error.status===409)return 'Tasarım veya yetkiler değişti. Güncel durumu görmek için yenileyin.';
 if(error.status===403)return 'Bu işlem için mağazanıza yetki verilmemiş.';
 if(error.status===404)return 'Bu tasarıma erişilemiyor. Atama kaldırılmış olabilir.';
 return 'Tasarım yüklenemedi. Bağlantıyı kontrol edip yeniden deneyin.';}
function canLeave(){if(supportState.pending){status.textContent='Gönderim tamamlanana kadar bekleyin.';return false;}return !supportState.dirty||window.confirm('Gönderilmemiş destek yanıtını bırakmak istiyor musunuz?');}
function closeStudio(){controller?.abort();controller=null;studio?.unmount();studio=null;support?.unmount();support=null;supportState={dirty:false,pending:false};workspace.replaceChildren();workspace.hidden=true;back.hidden=true;list.hidden=false;}
function openSupport(row){if(!canLeave())return;sequence++;closeStudio();list.hidden=true;workspace.hidden=false;back.hidden=false;status.textContent='Mağazanıza yönlendirilen müşteri destek görüşmeleri.';support=mountStockySupport(workspace,{client,serviceId:row.service_id,onFormState:value=>{supportState=value;}});}
async function open(row){if(!canLeave())return;const current=++sequence;closeStudio();controller=new AbortController();status.textContent='Mağaza kapsamı ve güncel tasarım yetkileri doğrulanıyor…';
 try{const contextPath=`/services/${row.service_id}/editor-context`,context=await client.get(contextPath,{signal:controller.signal});if(current!==sequence)return;
   list.hidden=true;workspace.hidden=false;back.hidden=false;
   studio=await mountPlatformStudio(workspace,{client,context,contextPath,signal:controller.signal,onError:error=>{status.textContent=describe(error);},onContextUpdated:(_context,event)=>{if(event?.reason==='saved')status.textContent='Değişiklikler sunucudaki mağaza taslağıyla eşitlendi.';}});
   if(current!==sequence){studio?.unmount();return;}status.textContent='Mağazanıza verilen izinlerle düzenleyin; kaydetme ve önizleme sunucu üzerinden çalışır.';
 }catch(error){if(current!==sequence)return;closeStudio();status.textContent=describe(error);}}
function button(text,action,secondary=false){const node=document.createElement('button');node.type='button';node.className=secondary?'secondary':'';node.textContent=text;node.onclick=async()=>{node.disabled=true;try{await action();}finally{node.disabled=false;}};return node;}
async function load(){if(!canLeave())return;const current=++sequence;closeStudio();refresh.disabled=true;status.textContent='Mağazanıza sunulan tasarımlar yükleniyor…';list.replaceChildren();
 try{const rows=await client.get('/assignments');if(current!==sequence)return;if(!Array.isArray(rows))throw Error('Invalid assignments');
   for(const row of rows){const card=document.createElement('article');card.className='theme-card';
     const icon=document.createElement('div');icon.className='theme-card-mark';icon.textContent=row.channel==='app'?'Uygulama':'Web';
     const title=document.createElement('h2');title.textContent=row.theme_name||row.name||(row.channel==='app'?'Mobil mağaza tasarımı':'Web mağaza tasarımı');
     const info=document.createElement('p');info.textContent=row.status==='ACCEPTED'?'Kabul edildi · Düzenlemeye hazır':'Mağazanıza sunuldu · Kabulünüz bekleniyor';
     const actions=document.createElement('div');actions.className='theme-actions';actions.append(button('Tasarımı aç',()=>open(row)),button('Mağaza desteği',()=>openSupport(row),true));
     if(row.status==='OFFERED'||row.status==='ASSIGNED')actions.append(button('Temayı kabul et',async()=>{try{await client.write(`/assignments/${row.id}/accept`,{expectedRevision:Number(row.revision),reason:'Satıcı sunulan mağaza tasarımını kabul etti'});await load();}catch(error){status.textContent=describe(error);}},true));
     card.append(icon,title,info,actions);list.append(card);}
   status.textContent=rows.length?`${rows.length} tasarım ataması bulundu. Yalnız kendi mağazanızın tasarımları gösterilir.`:'Mağazanıza henüz bir tasarım sunulmamış.';
 }catch(error){if(current===sequence)status.textContent=describe(error);}finally{refresh.disabled=false;}}
refresh.onclick=load;back.onclick=load;
window.addEventListener('pagehide',()=>{sequence++;closeStudio();client.dispose();},{once:true});
window.addEventListener('beforeunload',event=>{if(supportState.dirty||supportState.pending){event.preventDefault();event.returnValue='';}});
load();
