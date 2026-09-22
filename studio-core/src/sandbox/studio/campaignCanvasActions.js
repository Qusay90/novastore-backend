import {MAX_CANVAS_LAYERS, normalizeCampaignCanvas, safeCanvasImage} from '../campaignCanvas.js';

function copyCanvas(current) {
  if (!current) throw Error('Düzenlenecek tuval bulunamadı.');
  return normalizeCampaignCanvas(JSON.parse(JSON.stringify(current)));
}

function requireLayer(canvas, targetId, kind) {
  const layer = canvas.layers.find(item => item.id === targetId);
  if (!layer || (kind && layer.kind !== kind)) {
    throw Error('Seçilen öğe artık tuvalde yok veya türü değişti. Görsel uygulanmadı.');
  }
  return layer;
}

function requireCapacity(canvas) {
  if (canvas.layers.length >= MAX_CANVAS_LAYERS) {
    throw Error(`Tuvalde en fazla ${MAX_CANVAS_LAYERS} öğe bulunabilir. Önce bir öğeyi kaldır veya mevcut görseli değiştir.`);
  }
}

/** Run against the current document when a picker/upload completes, never its
 * opening snapshot. The caller owns history, selection and asynchronous reads. */
export function applyCanvasMedia(current, {mode = 'add', targetId, id, src, alt = '', imageKind = 'scene'} = {}) {
  const next = copyCanvas(current);
  if (!['add', 'replace', 'shape', 'background'].includes(mode)) throw Error('Görsel ekleme biçimi desteklenmiyor.');
  safeCanvasImage(src);
  if (mode === 'replace') {
    const layer = requireLayer(next, targetId, 'image');
    Object.assign(layer, {src, alt, imageKind});
  } else if (mode === 'shape') {
    const layer = requireLayer(next, targetId, 'shape');
    if (layer.shape === 'line' && !layer.shapeId) throw Error('Çizginin içine görsel yerleştirilemez. Önce kapalı bir şekil seç.');
    Object.assign(layer, {fillMode: 'image', imageSrc: src, imageAlt: alt, imageFit: 'cover'});
  } else {
    requireCapacity(next);
    const layer = {id, kind: 'image', x: 30, y: 35, width: 20, height: 30, color: '@accent', src, alt, imageKind, fit: imageKind === 'scene' ? 'cover' : 'contain'};
    if (mode === 'background') {
      Object.assign(layer, {x: 0, y: 0, width: 100, height: 100, fit: 'cover'});
      next.layers.unshift(layer);
    } else next.layers.push(layer);
  }
  return normalizeCampaignCanvas(next);
}

/** DOM rendering follows layer order: the last layer is nearest the viewer. */
export function moveCanvasLayer(current, targetId, direction) {
  if (!['front', 'back'].includes(direction)) throw Error('Katman sıralama yönü desteklenmiyor.');
  const next = copyCanvas(current);
  requireLayer(next, targetId);
  const index = next.layers.findIndex(layer => layer.id === targetId);
  const [layer] = next.layers.splice(index, 1);
  if (direction === 'front') next.layers.push(layer);
  else next.layers.unshift(layer);
  return normalizeCampaignCanvas(next);
}

/** Do not turn typing/editing Delete into a canvas operation. Text-node targets
 * are supported; unknown/non-DOM targets fail closed instead of deleting. */
export function shouldDeleteCanvasLayer(eventTarget) {
  const element = typeof eventTarget?.closest === 'function' ? eventTarget : eventTarget?.parentElement;
  if (!element || typeof element.closest !== 'function') return false;
  if (element.isContentEditable === true) return false;
  try {
    return !element.closest('input,textarea,select,[contenteditable]:not([contenteditable="false" i]),[role="textbox" i]');
  } catch {
    return false;
  }
}
