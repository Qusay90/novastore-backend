/* Nova Store support host contract. No endpoint, token, URL, or theme inference. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.NovaStoreSupportRuntime = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const VERSION = 'novastore-support-host/1';
  const MAX_MESSAGE = 2000;
  const MAX_TITLE = 120;
  const MAX_DETAIL = 4000;
  const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
  const text = (value, max) => String(value == null ? '' : value).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
  const fail = (code, message) => Object.assign(new Error(message), {code});
  const scope = value => {
    const tenantId = text(value && value.tenantId, 128), storeId = text(value && value.storeId, 128);
    if (!tenantId || !storeId || /[\s<>"']/.test(`${tenantId}${storeId}`)) throw fail('SCOPE_MISMATCH', 'Destek mağaza kapsamı doğrulanamadı.');
    return {tenantId, storeId};
  };
  const sameScope = (a, b) => a && b && a.tenantId === b.tenantId && a.storeId === b.storeId;
  const actorId = value => {
    const id = text(value, 128);
    if (!id || /[\s<>"']/.test(id)) throw fail('AUTH_REQUIRED', 'Doğrulanmış destek oturumu gerekli.');
    return id;
  };
  const recipientOf = value => {
    const kind = value && (value.kind === 'platform' || value.kind === 'seller' ? value.kind : '');
    const id = text(value && value.id, 128), name = text(value && value.name, 200);
    if (!kind || !id || !name || /[\s<>"']/.test(id)) throw fail('CONTRACT', 'Destek alıcısı sunucudan doğrulanamadı.');
    return Object.freeze({kind, id, name});
  };
  const secretLike = value => /(?:bearer\s+[a-z0-9._~+/=-]{12,}|sk-[a-z0-9_-]{12,}|AIza[0-9A-Za-z_-]{20,}|-----BEGIN|kart\s*(?:numarası|no)|şifre\s*[:=])/i.test(value);
  function messageOf(value) {
    const message = String(value == null ? '' : value).replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
    if (!message) throw fail('INVALID_MESSAGE', 'Bir destek mesajı yaz.');
    if (message.length > MAX_MESSAGE) throw fail('INVALID_MESSAGE', 'Destek mesajı 2000 karakteri geçemez.');
    if (secretLike(message)) throw fail('SECRET_INPUT', 'Şifre, kart veya erişim anahtarı paylaşma.');
    return message;
  }
  function normalizeContext(raw, expected) {
    if (!raw || raw.contractVersion !== VERSION) throw fail('CONTRACT', 'Destek bağlantısı beklenen sözleşmeyi sağlamıyor.');
    const returnedScope = scope(raw.scope);
    if (!sameScope(returnedScope, expected.scope)) throw fail('SCOPE_MISMATCH', 'Destek yanıtı mağaza kapsamıyla eşleşmiyor.');
    const returnedActor = actorId(raw.actor && raw.actor.id);
    if (returnedActor !== expected.actorId) throw fail('AUTH_CHANGED', 'Destek oturumu değişti. Yeniden deneyebilirsin.');
    const platform = raw.platform === 'web' || raw.platform === 'app' ? raw.platform : '';
    const store = raw.store && {id: text(raw.store.id, 128), name: text(raw.store.name, 200)};
    if (!platform || !store.id || store.id !== expected.scope.storeId || !store.name) throw fail('SCOPE_MISMATCH', 'Destek mağaza bağlamı kapsamıyla eşleşmiyor.');
    const recipient = recipientOf(raw.recipient);
    return Object.freeze({contractVersion: VERSION, scope: returnedScope, actor: Object.freeze({id: returnedActor}), recipient, platform, store: Object.freeze(store)});
  }
  function normalizeThread(raw, expected) {
    if (!raw || !text(raw.id, 128) || !sameScope(scope(raw.scope), expected.scope) || text(raw.storeId, 128) !== expected.context.store.id) throw fail('SCOPE_MISMATCH', 'Destek görüşmesi mağazaya ait değil.');
    return Object.freeze({
      id: text(raw.id, 128), title: text(raw.title || 'Destek görüşmesi', MAX_TITLE), status: ['open', 'pending', 'closed'].includes(raw.status) ? raw.status : 'open',
      messages: Array.isArray(raw.messages) ? raw.messages.slice(0, 100).map(item => Object.freeze({id: text(item && item.id, 128), from: item && item.from === 'customer' ? 'customer' : 'support', message: text(item && item.message, MAX_DETAIL), createdAt: text(item && item.createdAt, 64)})) : []
    });
  }
  function create(options = {}) {
    const mode = options.mode === 'host' ? 'host' : 'local';
    const port = options.port || null;
    const hostBridge = options.hostBridge || null;
    let generation = 0;
    let state = Object.freeze({phase: mode === 'local' ? 'ready' : 'idle', mode, context: null, threads: Object.freeze([]), error: null});
    const listeners = new Set();
    const publish = patch => { state = Object.freeze({...state, ...patch}); listeners.forEach(listener => { try { listener(state); } catch (_) {} }); return state; };
    const currentSnapshot = () => hostBridge && typeof hostBridge.snapshot === 'function' ? hostBridge.snapshot() : null;
    const expected = () => {
      const snapshot = currentSnapshot();
      if (!snapshot || snapshot.phase !== 'ready' || snapshot.session?.status !== 'authenticated') throw fail('AUTH_REQUIRED', 'Doğrulanmış destek oturumu gerekli.');
      const currentScope = scope(snapshot.scope);
      const session = snapshot.session || {};
      const id = actorId(session.user && session.user.id);
      return {scope: currentScope, actorId: id};
    };
    const assertHostPort = method => { if (mode !== 'host' || typeof port?.[method] !== 'function') throw fail('PORT_UNAVAILABLE', 'Destek bağlantısı bu mağazada henüz kullanılamıyor.'); };
    const assertFresh = token => { if (token !== generation) throw fail('STALE_CONTEXT', 'Destek bağlamı değişti. Bilgiler yenileniyor.'); };
    const assertCurrent = context => {
      const now = expected();
      if (!sameScope(now.scope, context.scope) || now.actorId !== context.actor.id) throw fail('AUTH_CHANGED', 'Destek oturumu değişti. Yeniden deneyebilirsin.');
      return now;
    };
    const responseEnvelope = (raw, context, label) => {
      if (!raw || raw.contractVersion !== VERSION) throw fail('CONTRACT', `${label} sunucu tarafından doğrulanmadı.`);
      const returnedScope = scope(raw.scope);
      const returnedActor = actorId(raw.actor && raw.actor.id);
      const returnedRecipient = recipientOf(raw.recipient);
      if (returnedActor !== context.actor.id) throw fail('AUTH_CHANGED', `${label} kullanıcı oturumuyla eşleşmiyor.`);
      if (returnedRecipient.kind !== context.recipient.kind || returnedRecipient.id !== context.recipient.id) throw fail('RECIPIENT_MISMATCH', `${label} destek alıcısıyla eşleşmiyor.`);
      if (!sameScope(returnedScope, context.scope) || text(raw.storeId, 128) !== context.store.id) throw fail('SCOPE_MISMATCH', `${label} mağaza kapsamıyla eşleşmiyor.`);
      return {returnedScope, returnedActor, returnedRecipient};
    };
    async function initialize() {
      const token = ++generation;
      if (mode === 'local') return publish({phase: 'ready', context: {contractVersion: VERSION, scope: {tenantId: 'local-demo', storeId: 'local-demo'}, actor: {id: 'local-demo'}, recipient: {kind: 'platform', id: 'local-demo', name: 'Nova Store yerel destek'}, platform: options.platform === 'app' ? 'app' : 'web', store: {id: 'local-demo', name: 'Nova Store yerel demosu'}}, threads: Object.freeze(clone(options.sampleThreads || [])), error: null});
      assertHostPort('readContext');
      const request = expected();
      const raw = await port.readContext({contractVersion: VERSION, scope: request.scope, actor: {id: request.actorId}});
      assertFresh(token);
      const latest = expected();
      if (!sameScope(latest.scope, request.scope) || latest.actorId !== request.actorId) throw fail('AUTH_CHANGED', 'Destek oturumu değişti. Yeniden deneyebilirsin.');
      const context = normalizeContext(raw, latest);
      return publish({phase: 'ready', context, threads: Object.freeze([]), error: null});
    }
    async function readThreads() {
      const token = generation; if (state.phase !== 'ready' || !state.context) throw fail('NOT_READY', 'Destek bağlantısı henüz hazır değil.');
      if (mode === 'local') return state.threads;
      assertHostPort('readThreads');
      const context = state.context;
      assertCurrent(context);
      const raw = await port.readThreads({contractVersion: VERSION, scope: context.scope, actor: context.actor, recipient: context.recipient, storeId: context.store.id});
      assertFresh(token);
      assertCurrent(context);
      responseEnvelope(raw, context, 'Destek geçmişi');
      const threads = Array.isArray(raw.threads) ? raw.threads.map(item => normalizeThread(item, {scope: context.scope, context})) : [];
      return publish({threads: Object.freeze(threads)}).threads;
    }
    async function sendMessage(threadId, value) {
      const message = messageOf(value); const id = text(threadId, 128); const token = generation;
      if (state.phase !== 'ready' || !state.context) throw fail('NOT_READY', 'Destek bağlantısı henüz hazır değil.');
      if (mode === 'local') return Object.freeze({sent: false, mode: 'local', threadId: text(threadId, 128), message: 'Yerel demoda mesaj gönderilmez; örnek destek akışını inceliyorsun.'});
      assertHostPort('sendMessage');
      if (!id) throw fail('INVALID_THREAD', 'Destek görüşmesi seçilmedi.');
      const context = state.context;
      assertCurrent(context);
      const raw = await port.sendMessage({contractVersion: VERSION, scope: context.scope, actor: context.actor, recipient: context.recipient, storeId: context.store.id, threadId: id, message});
      assertFresh(token);
      assertCurrent(context);
      responseEnvelope(raw, context, 'Destek mesajı');
      if (raw.sent !== true) throw fail('CONTRACT', 'Destek mesajı sunucu tarafından doğrulanmadı.');
      const responseThreadId = text(raw.threadId, 128);
      if (!responseThreadId) throw fail('CONTRACT', 'Destek mesajı görüşme kimliği sağlamıyor.');
      return Object.freeze({sent: true, mode: 'host', threadId: responseThreadId, message: text(raw.message || 'Mesajın destek kaydına eklendi.', 300)});
    }
    async function createTicket(input = {}) {
      const title = String(input.title == null ? '' : input.title).replace(/[\u0000-\u001f\u007f]/g, ' ').trim(), detail = messageOf(input.detail);
      if (!title) throw fail('INVALID_TICKET', 'Destek konusu yaz.');
      if (title.length > MAX_TITLE) throw fail('INVALID_TICKET', 'Destek konusu 120 karakteri geçemez.');
      const token = generation;
      if (state.phase !== 'ready' || !state.context) throw fail('NOT_READY', 'Destek bağlantısı henüz hazır değil.');
      if (mode === 'local') return Object.freeze({created: false, mode: 'local', message: 'Yerel demoda destek kaydı oluşturulmaz; örnek form gösterilir.'});
      assertHostPort('createTicket');
      const context = state.context;
      assertCurrent(context);
      const raw = await port.createTicket({contractVersion: VERSION, scope: context.scope, actor: context.actor, recipient: context.recipient, storeId: context.store.id, title, detail});
      assertFresh(token);
      assertCurrent(context);
      responseEnvelope(raw, context, 'Destek kaydı');
      if (raw.created !== true) throw fail('CONTRACT', 'Destek kaydı sunucu tarafından doğrulanmadı.');
      const ticketId = text(raw.ticketId, 128);
      if (!ticketId) throw fail('CONTRACT', 'Destek kaydı kimliği sağlamıyor.');
      return Object.freeze({created: true, mode: 'host', ticketId, message: text(raw.message || 'Destek kaydın oluşturuldu.', 300)});
    }
    function invalidate() { generation += 1; state = Object.freeze({phase: mode === 'local' ? 'ready' : 'idle', mode, context: null, threads: Object.freeze([]), error: null}); listeners.forEach(listener => { try { listener(state); } catch (_) {} }); return state; }
    function syncIdentity(snapshot) {
      if (mode !== 'host' || !state.context || !snapshot) return;
      const sessionId = snapshot.session?.user?.id || '';
      if (snapshot.phase !== 'ready' || !sameScope(snapshot.scope, state.context.scope) || String(sessionId) !== state.context.actor.id || snapshot.session?.status !== 'authenticated') invalidate();
    }
    return Object.freeze({version: VERSION, mode, available: mode === 'local' || typeof port?.readContext === 'function', state: () => state, subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); }, initialize, readThreads, sendMessage, createTicket, invalidate, syncIdentity, normalizeContext});
  }
  return Object.freeze({VERSION, MAX_MESSAGE, MAX_TITLE, MAX_DETAIL, create, messageOf, normalizeContext, sameScope, errors: Object.freeze({PORT_UNAVAILABLE: 'PORT_UNAVAILABLE', STALE_CONTEXT: 'STALE_CONTEXT'})});
});
