import * as site from './store.js';
import * as workshop from './themeWorkshopStore.js';
import {isStudioHost,getStudioSession} from '../studio-integration/context.js';
export * from './store.js';
const active=()=>Boolean(workshop.workshopId());
export const getState=()=>isStudioHost()?getStudioSession().getState():active()?workshop.getWorkshop():site.getState();
export const subscribe=listener=>isStudioHost()?getStudioSession().subscribe(listener):active()?workshop.subscribeWorkshop(listener):site.subscribe(listener);
export const getDocument=(channel,preview)=>isStudioHost()?getStudioSession().getDocument(channel,preview):active()?workshop.getWorkshopDocument(channel,preview):site.getDocument(channel,preview);
export const saveDraft=(...args)=>isStudioHost()?getStudioSession().edit(...args):active()?workshop.saveWorkshopDraft(...args):site.saveDraft(...args);
export const getEditorHistory=channel=>isStudioHost()?getStudioSession().getHistory(channel):active()?workshop.workshopHistory(channel):site.getEditorHistory(channel);
export const undoDraft=channel=>isStudioHost()?getStudioSession().undo(channel):active()?workshop.undoWorkshop(channel):site.undoDraft(channel);
export const redoDraft=channel=>isStudioHost()?getStudioSession().redo(channel):active()?workshop.redoWorkshop(channel):site.redoDraft(channel);
function siteOnly(fn,args){if(isStudioHost())throw new Error('Admin modülünde bu işlem yalnız yetkili sunucu bağlantısından yapılır.');if(active())throw new Error('Tema atölyesi site yayınını değiştiremez.');return fn(...args);}
export const publish=(...args)=>siteOnly(site.publish,args);
export const rollback=(...args)=>siteOnly(site.rollback,args);
export const resetSandbox=(...args)=>siteOnly(site.resetSandbox,args);
export const importDocument=(...args)=>siteOnly(site.importDocument,args);
export const exportDocument=(...args)=>siteOnly(site.exportDocument,args);
