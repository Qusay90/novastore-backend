import { useEffect, useMemo, useRef, useState } from "react";
import { galleryIdentity } from "../adapters/variantMedia.js";

const preloadImage = (item) => new Promise((resolve) => {
  if (item.type !== "image") { resolve(true); return; }
  const image = new Image();
  let settled = false;
  const finish = (ok) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    image.onload = null;
    image.onerror = null;
    resolve(ok);
  };
  const timer = setTimeout(() => finish(false), 4000);
  image.onload = () => {
    if (typeof image.decode === "function") image.decode().then(() => finish(true), () => finish(image.naturalWidth > 0));
    else finish(true);
  };
  image.onerror = () => finish(false);
  image.src = item.url;
});

export function useCanonicalGallery(product, fallbackUrl) {
  const snapshot = product.gallerySnapshot || product;
  const desired = useMemo(() => {
    const rows = (product.media || []).filter((item) => item?.url && ["image","video"].includes(item.type));
    return rows.length || product.variantMedia ? rows
      : [{ id: product.id + "-primary", url: fallbackUrl, type: "image", isMain: true }];
  }, [product.media, product.id, product.variantMedia, fallbackUrl]);
  const defaults = product.defaultMedia || desired;
  const key = galleryIdentity(desired);
  const owner = useRef(null), cache = useRef(new Map()), failed = useRef(new Set()), generation = useRef(0);
  const touch = useRef(null), suppressClick = useRef(false);
  const [retry, setRetry] = useState(0);
  const [visible, setVisible] = useState(() => ({ media: desired, activeId: desired[0]?.id, key, source: product.gallerySource || "product_default" }));
  const [pending, setPending] = useState(false);
  const load = (item) => {
    if (failed.current.has(item.url)) return Promise.resolve(false);
    if (!cache.current.has(item.url)) cache.current.set(item.url, preloadImage(item));
    return cache.current.get(item.url);
  };
  useEffect(() => {
    const version = ++generation.current;
    let current = true;
    const ownerChanged = owner.current !== snapshot;
    if (ownerChanged) {
      owner.current = snapshot;
      failed.current = new Set();
      cache.current = new Map();
    }
    // Preload the whole canonical set concurrently. Only the first usable main
    // image gates swapping; a slow secondary image never delays option intent.
    [...desired, ...defaults].forEach((item) => { load(item); });
    if (visible.key === key && visible.media.length && !visible.media.some((item) => failed.current.has(item.url)) &&
      (!ownerChanged || galleryIdentity(visible.media) === key)) {
      setVisible((state) => ({ ...state, source: product.gallerySource || "product_default" }));
      setPending(false);
      return () => { current = false; };
    }
    setPending(true);
    const prepare = async () => {
      for (const [media, source] of [[desired, product.gallerySource || "product_default"], [defaults, "product_default"]]) {
        for (const item of media) {
          const ok = await load(item);
          if (!current || generation.current !== version) return;
          if (!ok) { failed.current.add(item.url); continue; }
          setVisible({ media: media.filter((row) => !failed.current.has(row.url)), activeId: item.id, key, source });
          setPending(false);
          return;
        }
      }
      if (current && generation.current === version) {
        setVisible({ media: [], activeId: null, key, source: "product_default" });
        setPending(false);
      }
    };
    prepare();
    return () => { current = false; };
    // Content identity, not selected variant or its stock, owns gallery position.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, snapshot, retry, product.gallerySource]);

  const activeMedia = visible.media.find((item) => item.id === visible.activeId) || visible.media[0];
  const onMediaError = (item) => {
    if (!item || failed.current.has(item.url)) return;
    failed.current.add(item.url);
    if (item.id === activeMedia?.id) setRetry((value) => value + 1);
    else setVisible((state) => ({ ...state, media: state.media.filter((row) => row.url !== item.url) }));
  };
  const selectMedia = async (id) => {
    const item = visible.media.find((row) => row.id === id);
    if (!item || pending || visible.key !== key) return;
    const version = ++generation.current;
    const ok = await load(item);
    if (version !== generation.current) return;
    if (!ok) { onMediaError(item); return; }
    setVisible((state) => ({ ...state, activeId: id }));
  };
  const onPointerDown = (event) => {
    suppressClick.current = false;
    if (event.pointerType === "touch") touch.current = { x: event.clientX, y: event.clientY };
  };
  const onPointerUp = (event) => {
    const start = touch.current; touch.current = null;
    if (!start) return;
    const dx = event.clientX - start.x, dy = event.clientY - start.y;
    if (Math.abs(dx) < 45 || Math.abs(dx) <= Math.abs(dy)) return;
    suppressClick.current = true;
    const index = visible.media.findIndex((item) => item.id === activeMedia?.id);
    const next = visible.media[index + (dx < 0 ? 1 : -1)];
    if (next) selectMedia(next.id);
  };
  const canOpen = () => {
    if (suppressClick.current) { suppressClick.current = false; return false; }
    return !pending && visible.key === key && !!activeMedia;
  };
  return { runtimeMedia: visible.media, activeMedia, activeMediaId: activeMedia?.id, setActiveMediaId: selectMedia,
    galleryKey: key, galleryPending: pending || visible.key !== key, gallerySource: visible.source, onMediaError, onPointerDown, onPointerUp, canOpen };
}
