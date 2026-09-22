import { createAdminHttp, AdminHttpError, ADMIN_LOGIN_URL } from '../integration/adminHttp.js';

// Existing AdminHttp intentionally uses a relative login URL. The same helper
// under /studio-pro/ must resolve that one known target from the origin root.
export function createAdminRootLoginLocation(location = globalThis.location) {
  return {set href(value) {
    if (value !== ADMIN_LOGIN_URL) throw new Error('Geçersiz yönetici giriş hedefi.');
    if (location) location.href = '/' + ADMIN_LOGIN_URL;
  }};
}

export function createAdminThemeClient(http, { fetchImpl = globalThis.fetch.bind(globalThis), location = globalThis.location } = {}) {
  const rootLoginLocation = createAdminRootLoginLocation(location);
  const adminHttp = http || createAdminHttp({fetchImpl, location:rootLoginLocation});
  const prefix = '/api/admin/theme-platform';
  const pending = new Map();
  const pathFor = path => {
    if (typeof path !== 'string' || !/^\/[a-z0-9/.%:_-]*$/i.test(path) || path.includes('..') || path.includes('//')) throw new Error('Geçersiz tema API yolu.');
    const decoded = decodeURIComponent(path);
    if (decoded.includes('..') || decoded.includes('//') || /[\\?#\u0000-\u001f]/.test(decoded)) throw new Error('Geçersiz tema API yolu.');
    return prefix + path;
  };
  // Reuse the existing Admin token validation, same-origin transport and expired
  // session redirect. This adapter only wraps successful image bytes as JSON.
  const blobHttp = createAdminHttp({ location:rootLoginLocation, fetchImpl: async (path, init) => {
    const response = await fetchImpl(path, { ...init, redirect: 'error' });
    if (!response.ok) return response;
    const type = response.headers.get('content-type')?.split(';')[0];
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(type)) throw new AdminHttpError('Görsel biçimi desteklenmiyor.', { code: 'THEME_IMAGE_RESPONSE_INVALID' });
    const blob = await response.blob();
    if (blob.size > 6000000) throw new AdminHttpError('Görsel boyutu sınırı aşıldı.', { code: 'THEME_IMAGE_RESPONSE_INVALID' });
    const key = crypto.randomUUID(); blobs.set(key, blob);
    return new Response(JSON.stringify({ blobKey: key }), { headers: { 'content-type': 'application/json' } });
  } });
  const blobs = new Map();
  const request = async (path, options = {}) => {
    const method = options.method || 'GET';
    const body = options.body === undefined ? undefined : JSON.stringify(options.body);
    const identity = JSON.stringify([method, path, body]);
    const headers = {};
    if (method !== 'GET') {
      if (!pending.has(identity)) pending.set(identity, crypto.randomUUID());
      headers['Idempotency-Key'] = options.key || pending.get(identity);
      if (options.body?.expectedRevision !== undefined) headers['If-Match'] = `"${options.body.expectedRevision}"`;
    }
    const result = await adminHttp.request(pathFor(path), { method, headers, body, signal: options.signal, cache: 'no-store' });
    if (method !== 'GET') pending.delete(identity);
    return result;
  };
  return { kind: 'admin', prefix, request, get: (path, options = {}) => request(path, options),
    write: (path, body, method = 'POST', key) => request(path, { method, body, key }),
    blob: async (path, options = {}) => {
      const result = await blobHttp.request(pathFor(path), { cache: 'no-store', signal: options.signal });
      const blob = blobs.get(result.blobKey); blobs.delete(result.blobKey);
      if (!blob) throw new Error('Görsel yanıtı okunamadı.');
      return blob;
    } };
}
