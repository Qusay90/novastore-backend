import {createAdminHttp} from '../../../admin-commerce-pro/src/integration/adminHttp.js';
import {createAdminRootLoginLocation} from '../../../admin-commerce-pro/src/theme-platform/adminThemeClient.js';

// Capture one private transport before the original local authoring runtime
// disables global fetch/XHR. Only the real Admin adapter receives this closure.
export async function authorizeWorkshop({fetchImpl=globalThis.fetch.bind(globalThis),http=createAdminHttp({fetchImpl,location:createAdminRootLoginLocation()})}={}){
  const descriptor=await http.request('/api/admin/theme-platform/workshop-launch',{cache:'no-store'});
  if(descriptor?.url!=='/studio-pro/?surface=admin'||descriptor.mode!=='AUTHORING_WITH_SCOPED_OFFERS'||descriptor.liveData!==false||descriptor.uiPreserved!==true||descriptor.sellerOffers!=='SERVER_SCOPED')throw Error('Studio yetkili çalışma alanı doğrulanamadı.');
  return {http,fetchImpl};
}
export function showWorkshopFailure(error){const root=document.getElementById('root');root.replaceChildren();const heading=document.createElement('h1'),message=document.createElement('p'),link=document.createElement('a');heading.textContent='Studio Pro açılamadı';message.textContent=error?.status===403?'Bu çalışma alanı için yönetici yetkisi gerekli.':'Yönetici oturumunu ve sunucu bağlantısını kontrol edip yeniden dene.';link.href='/admin-commerce-pro-live.html';link.textContent='Yönetim paneline dön';root.append(heading,message,link);root.style.padding='32px';}
