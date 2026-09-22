import React,{useEffect,useRef,useState} from 'react';
import {mountPlatformStudio} from '../../../studio-core/src/studio-integration/platform-bridge.js';
import {createStudioLeaveGuard,hasUnsavedStudioWork} from './studioNavigationGuard.js';
export default function StudioFrame({client,path,renderOnly=false,externalShell=false,initialSection='editor',onReady,onFailure,onLeaveGuard}) {
  const host=useRef(null),handle=useRef(null),desiredSection=useRef(initialSection),callbacks=useRef({onReady,onFailure,onLeaveGuard}),[error,setError]=useState(''),[loading,setLoading]=useState(true);
  desiredSection.current=initialSection;
  callbacks.current={onReady,onFailure,onLeaveGuard};
  useEffect(()=>{
    const readState=()=>handle.current?.frame?.contentWindow?.NovaStoreStudio?.getState();
    const guard=createStudioLeaveGuard({readState,confirm:message=>window.confirm(message),notify:setError});
    callbacks.current.onLeaveGuard?.(guard);
    const beforeUnload=event=>{try{if(hasUnsavedStudioWork(readState())){event.preventDefault();event.returnValue='';}}catch{event.preventDefault();event.returnValue='';}};
    window.addEventListener('beforeunload',beforeUnload);
    return()=>{callbacks.current.onLeaveGuard?.(null);window.removeEventListener('beforeunload',beforeUnload);};
  },[]);
  useEffect(()=>{let cancelled=false,mounted;const controller=new AbortController();setError('');setLoading(true);(async()=>{try{const context=await client.get(path,{signal:controller.signal});if(cancelled)return;mounted=await mountPlatformStudio(host.current,{client,context,contextPath:path,renderOnly,externalShell,initialSection,signal:controller.signal,onError:e=>{if(!cancelled){setError(e.message);callbacks.current.onFailure?.(e);}}});if(cancelled)mounted.unmount();else{handle.current=mounted;if(externalShell)mounted.navigate?.(desiredSection.current);setLoading(false);callbacks.current.onReady?.(context);}}catch(e){if(!cancelled){setLoading(false);setError(e.message);callbacks.current.onFailure?.(e);}}})();return()=>{cancelled=true;controller.abort();mounted?.unmount();handle.current=null;};},[client,path,renderOnly,externalShell]);
  useEffect(()=>{try{handle.current?.navigate?.(initialSection);}catch(e){setError(e.message);callbacks.current.onFailure?.(e);}},[initialSection]);
  return <section className="theme-studio-container" aria-busy={loading}>{loading&&<p role="status" className="tp-notice">Gerçek mağaza verileri ve Studio görünümü hazırlanıyor…</p>}{error&&<p role="alert" className="tp-error">{error} · Yetki veya politika değiştiyse çalışma alanını yeniden açın.</p>}<div ref={host}/></section>;
}
