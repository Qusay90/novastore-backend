export const CUSTOMER_CARD_MEDIA_LIMIT = 8;

export const safeCustomerMediaUrl = (value) => {
  const url = String(value || "").trim();
  if (!url) return null;
  if (/[\\\u0000-\u001f\u007f]/.test(url)) return null;
  if (url.startsWith("/") && !url.startsWith("//")) return url;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" ? parsed.href : null;
  } catch {
    return null;
  }
};

export const resolveCustomerCardImages = (product, fallback) => {
  return Object.freeze(resolveCustomerCardMedia(product, fallback).map((item) => item.url));
};

export const resolveCustomerCardMedia = (product, fallback) => {
  const seen = new Set();
  const images = [];
  const add = (value, cardFraming = null, id = null) => {
    const url = safeCustomerMediaUrl(value);
    if (!url || seen.has(url)) return;
    seen.add(url);
    if (images.length < CUSTOMER_CARD_MEDIA_LIMIT) images.push(Object.freeze({ url, cardFraming, id: id || url }));
  };
  (Array.isArray(product?.media) ? product.media : [])
    .filter((item) => item?.type === "image")
    .sort((left, right) => (
      Number(Boolean(right?.isMain)) - Number(Boolean(left?.isMain))
      || Number(left?.sortOrder || 0) - Number(right?.sortOrder || 0)
      || String(left?.id || "").localeCompare(String(right?.id || ""))
    ))
    .forEach((item) => add(item?.url, item?.cardFraming || null, item?.id));
  add(product?.imageUrl, null, `${product?.id || "product"}-primary`);
  add(fallback, null, `${product?.id || "product"}-fallback`);
  return Object.freeze(images);
};

export const productCardMediaIndex = (clientX, left, width, count) => {
  const total = Math.max(1, Math.floor(Number(count) || 1));
  const stageWidth = Math.max(1, Number(width) || 1);
  const position = Math.min(stageWidth - 0.001, Math.max(0, Number(clientX) - Number(left || 0)));
  return Math.min(total - 1, Math.floor((position / stageWidth) * total));
};
