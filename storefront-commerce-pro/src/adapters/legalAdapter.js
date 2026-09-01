const asString = (value) => String(value ?? "").trim();

const normalizeDocument = (value) => {
  const slug = asString(value?.slug);
  const path = asString(value?.path);
  const title = asString(value?.title);
  const status = asString(value?.status);
  if (!slug || !path.startsWith("/") || !title || !["published", "owner_external_required"].includes(status)) return null;
  return Object.freeze({
    slug,
    path,
    title,
    status,
    requiredForCheckout: value?.requiredForCheckout === true,
    version: status === "published" ? asString(value?.version) : null,
    text: status === "published" ? asString(value?.text) : null,
  });
};

export function createLegalAdapter(http) {
  if (!http || typeof http.request !== "function") throw new TypeError("Yasal belge adapterı HTTP istemcisi gerektirir.");

  const list = async (options = {}) => {
    const payload = await http.request("/api/public/legal", { signal: options.signal });
    return Object.freeze((Array.isArray(payload?.documents) ? payload.documents : []).map(normalizeDocument).filter(Boolean));
  };

  const load = async (slug, options = {}) => {
    const safeSlug = asString(slug);
    if (!/^[a-z][a-z0-9-]{1,63}$/.test(safeSlug)) throw new Error("Yasal belge kimliği geçersiz.");
    const document = normalizeDocument(await http.request(`/api/public/legal/${encodeURIComponent(safeSlug)}`, { signal: options.signal }));
    if (!document) throw new Error("Yasal belge yanıtı doğrulanamadı.");
    return document;
  };

  return Object.freeze({ list, load });
}

export const legalAdapterTestUtils = Object.freeze({ normalizeDocument });
