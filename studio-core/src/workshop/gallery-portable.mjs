// Used only by local gallery HTML export. Preview uses ordinary cached image
// URLs; export reconstructs the original embedded image strings on demand.
export function createPortableGallerySource({sources,assets,mimeTypes,fetchImpl,encodeBase64}){
 const cache=new Map();
 async function read(id){if(cache.has(id))return cache.get(id);const request=(async()=>{const response=await fetchImpl(assets[id],{credentials:'omit',redirect:'error'});if(!response.ok)throw Error('Tema görseli dışa aktarma için okunamadı.');const bytes=new Uint8Array(await response.arrayBuffer());return `data:${mimeTypes[id]};base64,${encodeBase64(bytes)}`;})();cache.set(id,request);try{return await request;}catch(error){cache.delete(id);throw error;}}
 return async key=>{const source=sources[key];if(typeof source!=='string')throw Error('Tema kaynağı bulunamadı.');const ids=[...new Set(source.match(/__NS_ASSET_[a-f0-9]{24}__/g)||[])];if(ids.some(id=>!Object.hasOwn(assets,id)||!Object.hasOwn(mimeTypes,id)))throw Error('Tema görseli kaydı eksik.');const values=Object.fromEntries(await Promise.all(ids.map(async id=>[id,await read(id)])));return source.replace(/__NS_ASSET_[a-f0-9]{24}__/g,id=>values[id]);};
}
