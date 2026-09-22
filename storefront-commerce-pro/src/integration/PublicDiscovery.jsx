import { useCallback, useEffect, useMemo, useState } from "react";
import { useCursorPage } from "./useCursorPage.js";
import { Funnel, Check } from "../CustomerIcon.jsx";

export function usePublicDiscovery(discovery) {
  const baseKey = JSON.stringify(discovery?.query || {});
  const [selection, setSelection] = useState({ key: baseKey, attributes: {} });
  const attributes = selection.key === baseKey ? selection.attributes : {};
  const attributeKey = JSON.stringify(attributes);
  const load = useCallback((options) => discovery.loadPage({ ...JSON.parse(baseKey), attributes: JSON.parse(attributeKey), ...options }),
    [discovery?.loadPage, baseKey, attributeKey]);
  const page = useCursorPage(load, `${baseKey}|${attributeKey}`, Boolean(discovery));
  const [facets, setFacets] = useState({ key: "", items: [], phase: "idle" });
  const [attempt, setAttempt] = useState(0);
  const slug = discovery?.categorySlug;
  useEffect(() => {
    if (!slug || !discovery?.loadFilters) return;
    const controller = new AbortController();
    setFacets({ key: slug, items: [], phase: "loading" });
    discovery.loadFilters(slug, { signal: controller.signal }).then((items) => {
      if (!controller.signal.aborted) setFacets({ key: slug, items, phase: "ready" });
    }).catch(() => { if (!controller.signal.aborted) setFacets({ key: slug, items: [], phase: "error" }); });
    return () => controller.abort();
  }, [slug, discovery?.loadFilters, attempt]);
  const select = (code, value) => setSelection((current) => {
    const next = { ...(current.key === baseKey ? current.attributes : {}) };
    if (value === undefined || (Array.isArray(value) && !value.length)) delete next[code]; else next[code] = value;
    return { key: baseKey, attributes: next };
  });
  const clear = () => setSelection({ key: baseKey, attributes: {} });
  const visibleFacets = facets.key === slug ? facets.items : [];
  const activeFilters = Object.entries(attributes).map(([code, value]) => ({ key: code,
    label: `${visibleFacets.find((facet) => facet.code === code)?.name || code}: ${Array.isArray(value) ? value.join(", ") : typeof value === "object" ? `${value.min ?? ""}–${value.max ?? ""}` : value}`,
    remove: () => select(code, undefined) }));
  return { page, activeFilters, clear, filters: { facets: visibleFacets, attributes, select, clear,
    phase: facets.key === slug ? facets.phase : "idle", retry: () => setAttempt((n) => n + 1), hasCategory: Boolean(slug) } };
}

export function PublicAttributeFilters({ facets, attributes, select, clear, phase, retry, hasCategory }) {
  return <div className="filters-panel public-attribute-filters">
    <div className="filters-title"><span><Funnel /> Filtreler</span><button type="button" onClick={clear}>Temizle</button></div>
    {!hasCategory && <p>Ürün özelliklerine göre süzmek için bir kategori seç.</p>}
    {phase === "loading" && <p role="status">Filtreler yükleniyor…</p>}
    {phase === "error" && <p role="alert">Filtreler alınamadı. <button type="button" onClick={retry}>Yeniden dene</button></p>}
    {phase === "ready" && !facets.length && <p>Bu kategori için özellik filtresi bulunmuyor.</p>}
    {facets.map((facet) => <section className="filter-section" key={facet.code}>
      <h3>{facet.name}</h3><div className="filter-section__body">
        {facet.type === "number" || facet.type === "range" ? ["min", "max"].map((bound) => <label key={bound}>
          {bound === "min" ? "En az" : "En çok"} {facet.name}
          <input type="number" value={attributes[facet.code]?.[bound] ?? ""} min={facet.min ?? undefined} max={facet.max ?? undefined}
            onChange={(event) => { const next = { ...attributes[facet.code] }; if (event.target.value === "") delete next[bound]; else next[bound] = Number(event.target.value); select(facet.code, Object.keys(next).length ? next : undefined); }} />
        </label>) : (facet.type === "boolean" ? [{ value: true, label: "Evet" }, { value: false, label: "Hayır" }] : facet.options).map((option) => {
          const values = Array.isArray(attributes[facet.code]) ? attributes[facet.code] : [attributes[facet.code]];
          const checked = values.includes(option.value);
          return <label className="check-option" key={String(option.value)}><input type="checkbox" checked={checked}
            onChange={() => select(facet.code, facet.type === "boolean" ? checked ? undefined : option.value
              : checked ? values.filter((value) => value !== option.value) : [...values.filter((value) => value !== undefined), option.value])} />
            <span><Check />{option.label}</span></label>;
        })}
      </div>
    </section>)}
  </div>;
}

// A separate request supplies suggestions. The browser never searches its partial cache.
export function usePublicSuggestions(value, loadPage) {
  const q = value.trim();
  const [state, setState] = useState({ q: "", items: [] });
  useEffect(() => {
    if (!loadPage || q.length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(() => loadPage({ q, limit: 4, signal: controller.signal }).then((page) => {
      if (!controller.signal.aborted) setState({ q, items: page.items });
    }).catch(() => { if (!controller.signal.aborted) setState({ q, items: [] }); }), 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [q, loadPage]);
  return state.q === q ? state.items : [];
}
