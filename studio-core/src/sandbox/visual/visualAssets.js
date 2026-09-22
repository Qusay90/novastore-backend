// Byte-identical portable validator from the sector gallery; no second SVG policy.
import './visual-assets.js';
export const visualAssets = globalThis.NovaStoreVisualAssets;
if (!visualAssets) throw new Error('Görsel varlık doğrulayıcısı yüklenemedi.');

const SVG_NS = 'http://www.w3.org/2000/svg';
export function createVisualAssetNode(document, value) {
  if(visualAssets.createAssetElement)return visualAssets.createAssetElement(document,value);
  const asset = visualAssets.normalizeAsset(value);
  if (asset.kind === 'image') {
    const node = document.createElement('img');
    node.src = asset.src;
    node.alt = asset.alt || '';
    node.draggable = false;
    return node;
  }
  const create = description => {
    const node = document.createElementNS(SVG_NS, description.tag);
    for (const [key, setting] of Object.entries(description.attrs || {})) node.setAttribute(key, setting);
    if (description.text !== undefined) node.textContent = description.text;
    for (const child of description.children || []) node.append(create(child));
    return node;
  };
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', asset.viewBox);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  for (const [key, setting] of Object.entries(asset.attrs)) svg.setAttribute(key, setting);
  for (const child of asset.nodes) svg.append(create(child));
  return svg;
}
