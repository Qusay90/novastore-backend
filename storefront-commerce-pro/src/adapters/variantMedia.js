import productCardFraming from "../../../shared/productCardFraming.js";
import { normalizeVariantId } from "./variantContract.js";

// Same public image origins as PC1. The configured Cloudinary account is
// validated by PC1; the consumer never widens this to arbitrary HTTPS hosts.
export function safeVariantMediaUrl(value) {
  if (typeof value !== "string" || !value || value.length > 2048 || /[\u0000-\u001f\u007f\\]/u.test(value)) return null;
  if (/^\/uploads\/local-products\/[A-Za-z0-9][A-Za-z0-9._-]{0,254}$/u.test(value)) return value;
  try {
    const url = new URL(value);
    const pathname = decodeURIComponent(url.pathname);
    if (url.protocol !== "https:" || url.hostname !== "res.cloudinary.com" || url.port ||
      url.username || url.password || url.search || url.hash || pathname.includes("..") || /%[0-9a-f]{2}/i.test(pathname) ||
      /[\u0000-\u001f\u007f\\]/u.test(pathname) ||
      !/^\/[A-Za-z0-9_-]{1,255}\/image\/upload\/.+[^/]$/u.test(pathname)) return null;
    return url.href;
  } catch { return null; }
}

const empty = () => Object.freeze({ version: 1, driverGroup: null, optionValues: [], variants: [] });
export function normalizeVariantMediaContract(input, variants, defaultMedia) {
  if (input?.version !== 1) return null;
  const defaults = new Map(defaultMedia.map((item) => [String(item.id), item.url]));
  const canonicalIds = new Set(variants.map((variant) => variant.id));
  const driver = typeof input.media_driver_option_group === "string" ? input.media_driver_option_group : null;
  const values = new Set(variants.flatMap((variant) => variant.selections
    .filter((choice) => choice.group === driver).map((choice) => choice.value)));
  const gallery = (rows) => {
    if (!Array.isArray(rows) || rows.length > 10) return [];
    const seen = new Set();
    return Object.freeze(rows.map((row) => {
      const id = normalizeVariantId(row?.id), url = safeVariantMediaUrl(row?.media_url);
      if (!id || !url || row.media_type !== "image" || seen.has(id) || defaults.get(String(id)) !== url) return null;
      seen.add(id);
      let cardFraming = null;
      try { cardFraming = productCardFraming.normalizeCardFraming(row.card_framing); } catch { /* invalid framing is not applied */ }
      return Object.freeze({ id: String(id), url, type: "image", isMain: row.is_main === true,
        sortOrder: Number.isSafeInteger(row.sort_order) && row.sort_order >= 0 ? row.sort_order : 0, cardFraming });
    }).filter(Boolean).sort((a,b) => Number(b.isMain)-Number(a.isMain) || a.sortOrder-b.sortOrder || a.id.localeCompare(b.id)));
  };
  const bindings = (rows, key, valid) => {
    if (!Array.isArray(rows) || rows.length > 128) return [];
    const counts = new Map();
    rows.forEach((row) => { const id = key(row); counts.set(id, (counts.get(id) || 0) + 1); });
    return Object.freeze(rows.map((row) => {
      const id = key(row), media = gallery(row?.media);
      return valid(id) && counts.get(id) === 1 && media.length ? Object.freeze({ key: id, media }) : null;
    }).filter(Boolean));
  };
  return Object.freeze({ ...empty(), driverGroup: values.size ? driver : null,
    optionValues: bindings(input.option_value_media, (row) => row?.value, (value) => values.has(value)),
    variants: bindings(input.variant_media, (row) => normalizeVariantId(row?.variant_id), (id) => canonicalIds.has(id)) });
}

export const galleryIdentity = (media) => JSON.stringify(media.map((item) => [item.id, item.url, item.type]));

export function resolveVariantGallery(product, selections = [], resolvedVariant = null) {
  const contract = product.variantMedia;
  const defaults = product.media || [];
  const result = (media, source) => ({ media, source, key: galleryIdentity(media) });
  if (!contract) return result(defaults, "product_default");
  // An exact ID comes from the unchanged R29 complete canonical row resolver.
  const canonical = resolvedVariant && product.variants?.find((variant) => variant === resolvedVariant);
  if (canonical && canonical.selections.length === selections.length &&
    canonical.selections.every((choice) => selections.some((s) => s.group === choice.group && s.value === choice.value))) {
    const exact = contract.variants.find((binding) => binding.key === canonical.id);
    if (exact?.media.length) return result(exact.media, "exact_variant");
  }
  const selected = selections.filter((choice) => choice.group === contract.driverGroup);
  const binding = selected.length === 1 && contract.optionValues.find((item) => item.key === selected[0].value);
  return binding?.media?.length ? result(binding.media, "driver_option_value") : result(defaults, "product_default");
}
