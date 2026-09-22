import {isStudioHost} from '../studio-integration/context.js';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { withPreviewOrder } from './studio/previewOrder.js';
import { getState, subscribe } from './studioDocumentStore.js';
import { applyDesign, applyDemo } from './designLibrary.js';
export function useSandboxState() { return useSyncExternalStore(subscribe, getState, getState); }
export function useSandbox(channel = 'web', preview = false) {
  const doc = useSandboxState().channels[channel][preview ? 'draft' : 'published'];
  const [orderPreview, setOrderPreview] = useState(null);
  useEffect(() => {
    if (!preview || new URLSearchParams(location.search).get('studio') !== '1' || parent === window) return;
    const receive = event => {
      if (event.origin !== location.origin || event.source !== parent) return;
      const data = event.data;
      if (data?.type !== 'novastore-studio-preview-order' || data.channel !== channel) return;
      if (data.order === null) { setOrderPreview(null); return; }
      if (typeof data.pageKey !== 'string' || data.pageKey.length > 110 || !Array.isArray(data.order) || data.order.length > 80 || !data.order.every(id => typeof id === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/.test(id))) return;
      setOrderPreview({pageKey:data.pageKey, order:data.order});
    };
    const clear = () => setOrderPreview(null);
    window.addEventListener('message', receive);
    window.addEventListener('hashchange', clear);
    return () => { window.removeEventListener('message', receive); window.removeEventListener('hashchange', clear); };
  }, [channel, preview]);
  const design = !isStudioHost() && preview && typeof location !== 'undefined' ? new URLSearchParams(location.search).get('designPreview') : '';
  const keepContent = typeof location !== 'undefined' && new URLSearchParams(location.search).get('designContent') === 'keep';
  return useMemo(() => withPreviewOrder(design ? (keepContent ? applyDesign : applyDemo)(doc, design, channel) : doc, preview ? orderPreview : null), [doc, design, channel, keepContent, preview, orderPreview]);
}
export default useSandbox;
