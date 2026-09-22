// Explicit iframe-local activation. An absent host never selects production mode.
import {assetCacheKey} from './asset-cache.js';
let context = null;
let session = null;
let bundledAssets=Object.freeze({});
export function registerTrustedBundledAssets(value){bundledAssets=Object.freeze({...value});}
export const bundledAssetURL=value=>Object.hasOwn(bundledAssets,value)?bundledAssets[value]:'';
export const isStudioHost = () => context !== null;
export const getStudioHost = () => context;
export const getStudioSession = () => session;
export function configureStudioHost(value) {
  if (context) throw new Error('Bu stüdyo zaten bir mağazaya bağlı. Mağaza değişimi için yeni modül aç.');
  if (!value || !value.scope || !value.actor || !value.ports) throw new Error('Admin bağlantı ayarları eksik.');
  for (const key of ['tenantId','storeId']) if (typeof value.scope[key] !== 'string' || !/^[\w.-]{1,100}$/.test(value.scope[key])) throw new Error('Mağaza kapsamı geçersiz.');
  if (typeof value.actor.id !== 'string' || !value.actor.id.trim()) throw new Error('Admin kullanıcısı eksik.');
  context = Object.freeze({...value, scope:Object.freeze({...value.scope}), actor:Object.freeze({...value.actor}), capabilities:Object.freeze({...value.capabilities}), ports:Object.freeze({...value.ports})});
  return context;
}
export function attachStudioSession(value) { session = value; }
export function getHostCatalog(channel = 'web') { return session?.getCatalog(channel) || {products:[],categories:[]}; }

export function updateStudioPolicy(capabilities,policy,assetURLs,channelPolicies){
 if(!context)return;
 const policies=channelPolicies===undefined?context.channelPolicies:channelPolicies;
 const active=policies?.[context.activeChannel||context.availableChannels[0]];
 // A failed connection denies every channel regardless of prior policy.
 const selected=capabilities.read===false?{capabilities,policy}:active||{capabilities,policy};
 context=Object.freeze({...context,channelPolicies:policies,capabilities:Object.freeze({...selected.capabilities}),policy:Object.freeze({...selected.policy}),assetURLs:assetURLs||context.assetURLs});
 session?.updateCapabilities(context.capabilities,context.policy);
}
export function setStudioChannel(channel){
 if(!context||!context.availableChannels.includes(channel))return;
 const selected=context.channelPolicies?.[channel];
 context=Object.freeze({...context,activeChannel:channel,...(selected?{capabilities:Object.freeze({...selected.capabilities}),policy:Object.freeze({...selected.policy})}:{})});
 session?.updateCapabilities(context.capabilities,context.policy);
}
export function assetURL(value){if(!isStudioHost())return value;if(!value)return '';const version=context.themeVersions?.[context.activeChannel||context.availableChannels[0]];return context.assetURLs?.[assetCacheKey(value,version)]||bundledAssetURL(value)||(value.length<=8_000_000&&/^data:image\/(?:png|jpeg|webp);base64,[a-z0-9+/]+={0,2}$/i.test(value)?value:'');}
export const capabilityState=code=>context?.policy?.[code]?.state||'HIDDEN';
export const capabilityVisible=code=>!isStudioHost()||capabilityState(code)!=='HIDDEN';
export const capabilityWritable=code=>!isStudioHost()||(!context.readOnly&&['EDITABLE','MANAGE','PUBLISH'].includes(capabilityState(code)));
