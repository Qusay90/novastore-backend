import React from 'react';
import {createRoot} from 'react-dom/client';
import {configureStudioHost,attachStudioSession,updateStudioPolicy,registerTrustedBundledAssets} from './context.js';
import './module.css';
const container=document.getElementById('studio-module-root');
let root=createRoot(container),session,disposed=false;
const screen=(title,message)=>root.render(<main className="nsi-connect-page"><h1>{title}</h1><p>{message}</p></main>);
screen('Nova Store Studio Pro','Bu admin modülü henüz mağaza bağlantısı almadı. Yetkili admin tarafından açılmalıdır.');
// The embedding administrator supplies scoped ports in this same-origin iframe.
// No token is passed in a query string or persisted in browser storage.
window.NovaStoreStudio=Object.freeze({
  contractVersion:'novastore-studio-host/1',
  async mount(configuration){
    try{
      if(window.parent===window)throw new Error('Modülü admin menüsünden aç.');
      const config=configureStudioHost({...configuration,baseURL:location.href});
      const {bundledCampaignAssets}=await import('./bundled-campaign-assets.js');registerTrustedBundledAssets(bundledCampaignAssets);
      if(config.externalShell)container.classList.add('nsi-external-shell');
      screen('Mağaza taslağı yükleniyor','Yetki, mağaza kapsamı ve kayıtlı tasarımlar doğrulanıyor.');
      const {createStudioSession}=await import('./session.js');
      session=createStudioSession(config);attachStudioSession(session);await session.initialize();
      const {default:Studio}=config.renderOnly?await import('./NativePreview.jsx'):await import('../sandbox/studio/Studio.jsx');
      if(disposed)return;
      root.render(<Studio/>);
      return {contractVersion:'novastore-studio-host/1',scope:{...config.scope}};
    }catch(error){if(!disposed)screen('Admin bağlantısı kurulamadı','Yetkili mağaza taslağı alınamadı. Örnek veriler veya yerel kayıtlar kullanılmadı. Admin bağlantı ayarlarını kontrol et.');throw error;}
  },
  updatePolicy(capabilities,policy,assetURLs,channelPolicies){updateStudioPolicy(capabilities,policy,assetURLs,channelPolicies);if(capabilities.read!==true)screen('Studio erişimi kapatıldı','Oturum veya mağaza yetkisi yeniden doğrulanamadı. Çalışma alanını yeniden açın.');},
  getState(){return session?structuredClone(session.getState()):null;},
  updateWorkingPreview(payload){if(!disposed)return session?.replaceWorkingPreview(payload);},
  navigate(section){if(!disposed)window.dispatchEvent(new CustomEvent('novastore-studio-section',{detail:section}));},
  unmount(){disposed=true;session?.dispose();root.unmount();},
});
window.addEventListener('beforeunload',event=>{if(session&&Object.values(session.getState().host.dirty).some(Boolean)){event.preventDefault();event.returnValue='';}});
