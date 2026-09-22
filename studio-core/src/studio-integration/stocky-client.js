// Normal Stocky web session and CSRF only. No PC1 credential reaches this client.
const validPath = path => typeof path === 'string' && /^\/[a-z0-9/%.:_-]*$/i.test(path)
  && !path.includes('..') && !path.includes('//') && !/%2e|%5c/i.test(path);
export function stockyCsrf(cookie = document.cookie) {
  const value = cookie.split('; ').find(part => part.startsWith('XSRF-TOKEN='));
  try { return value ? decodeURIComponent(value.slice(11)) : ''; } catch { return ''; }
}
export function createStockyThemeClient({fetcher = (...args) => fetch(...args), csrf = stockyCsrf, onUnauthorized = () => {}} = {}) {
  const pending = new Map();
  let closed = false;
  const unavailable = () => Object.assign(new Error('Stocky oturumu sona erdi. Yeniden giriş yapın.'), {status:401,code:'THEME_AUTH_REQUIRED'});
  async function request(path, options = {}) {
    if(closed) throw unavailable();
    if(!validPath(path)) throw Error('Geçersiz tema yolu.');
    const method=options.method||'GET';
    const supportState=method==='PATCH'&&/^\/services\/[0-9a-f-]{36}\/support\/threads\/[0-9a-f-]{36}\/state$/.test(path);
    if((!['GET','POST','PUT'].includes(method)&&!supportState) || (method==='GET'&&options.body!==undefined)) throw Error('Geçersiz tema işlemi.');
    const csrfToken=csrf(); if(!csrfToken) {closed=true;onUnauthorized();throw unavailable();}
    const message={method,path};
    const identity=JSON.stringify([method,path,options.body]);
    if(method!=='GET') {
      message.body=options.body;
      if(!pending.has(identity))pending.set(identity,crypto.randomUUID());
      message.idempotencyKey=options.key||pending.get(identity);
      if(options.body?.expectedRevision!==undefined)message.ifMatch=`"${options.body.expectedRevision}"`;
    }
    const response=await fetcher('/novastore/theme/dispatch',{method:'POST',credentials:'same-origin',cache:'no-store',signal:options.signal,
      headers:{'Content-Type':'application/json','Accept':'application/json','X-Requested-With':'XMLHttpRequest','X-XSRF-TOKEN':csrfToken},body:JSON.stringify(message)});
    const data=await response.json().catch(()=>({code:'THEME_RESPONSE_INVALID'}));
    if(closed)throw unavailable();
    if(!response.ok) {
      if([401,419].includes(response.status)){closed=true;pending.clear();onUnauthorized();}
      throw Object.assign(new Error(data.code||'THEME_CONNECTION_FAILED'),{code:data.code,status:response.status});
    }
    if(method!=='GET')pending.delete(identity);
    if(options.blob) {
      if(!['image/png','image/jpeg','image/webp'].includes(data.mime) || typeof data.bytesBase64!=='string'
        || data.bytesBase64.length>8000000 || !/^[A-Za-z0-9+/]*={0,2}$/.test(data.bytesBase64))throw Error('Görsel yanıtı geçersiz.');
      const bytes=Uint8Array.from(atob(data.bytesBase64),char=>char.charCodeAt(0));
      return new Blob([bytes],{type:data.mime});
    }
    return data;
  }
  return {kind:'seller',prefix:'/novastore/theme/dispatch',request,
    get:(path,options={})=>request(path,options),write:(path,body,method='POST',key)=>request(path,{method,body,key}),
    blob:(path,options={})=>request(path,{...options,blob:true}),dispose(){closed=true;pending.clear();}};
}
