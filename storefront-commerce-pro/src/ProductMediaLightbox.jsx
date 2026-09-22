import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CaretLeft, CaretRight, ResetView, X, ZoomIn, ZoomOut } from "./CustomerIcon.jsx";

export const PDP_LIGHTBOX_ZOOM_MIN = 1;
export const PDP_LIGHTBOX_ZOOM_MAX = 4;
export const PDP_LIGHTBOX_ZOOM_STEP = 0.5;

const focusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

const isolatePage = () => {
  const nodes = [...document.querySelectorAll("#root > *")];
  const snapshots = nodes.map((node) => ({
    node,
    inert: node.inert,
    ariaHidden: node.getAttribute("aria-hidden"),
  }));
  nodes.forEach((node) => {
    node.inert = true;
    node.setAttribute("aria-hidden", "true");
  });
  return () => snapshots.forEach(({ node, inert, ariaHidden }) => {
    node.inert = inert;
    if (ariaHidden === null) node.removeAttribute("aria-hidden");
    else node.setAttribute("aria-hidden", ariaHidden);
  });
};

const keepFocusInDialog = (event, dialog) => {
  if (event.key !== "Tab" || !dialog) return;
  const focusable = [...dialog.querySelectorAll(focusableSelector)];
  if (!focusable.length) {
    event.preventDefault();
    dialog.focus();
    return;
  }
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
};

export function ProductMediaLightbox({
  activeMediaId,
  media,
  onActiveMediaIdChange,
  onClose,
  open,
  productName,
  returnFocusRef,
}) {
  const [zoom, setZoom] = useState(PDP_LIGHTBOX_ZOOM_MIN);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dialogRef = useRef(null);
  const closeRef = useRef(null);
  const viewportRef = useRef(null);
  const dragRef = useRef(null);
  const zoomRef = useRef(PDP_LIGHTBOX_ZOOM_MIN);
  const mediaRef = useRef(media);
  const activeIndexRef = useRef(0);
  const onActiveMediaIdChangeRef = useRef(onActiveMediaIdChange);
  const onCloseRef = useRef(onClose);
  mediaRef.current = media;
  onActiveMediaIdChangeRef.current = onActiveMediaIdChange;
  onCloseRef.current = onClose;

  const activeIndex = Math.max(0, media.findIndex((item) => item.id === activeMediaId));
  const activeMedia = media[activeIndex];
  activeIndexRef.current = activeIndex;

  const boundPan = useCallback((nextPan, nextZoom = zoomRef.current) => {
    const bounds = viewportRef.current?.getBoundingClientRect();
    if (!bounds || nextZoom <= PDP_LIGHTBOX_ZOOM_MIN) return { x: 0, y: 0 };
    const maximumX = (bounds.width * (nextZoom - 1)) / 2;
    const maximumY = (bounds.height * (nextZoom - 1)) / 2;
    return {
      x: clamp(Number(nextPan?.x) || 0, -maximumX, maximumX),
      y: clamp(Number(nextPan?.y) || 0, -maximumY, maximumY),
    };
  }, []);

  const setBoundedZoom = useCallback((value) => {
    const nextZoom = clamp(Number(value) || PDP_LIGHTBOX_ZOOM_MIN, PDP_LIGHTBOX_ZOOM_MIN, PDP_LIGHTBOX_ZOOM_MAX);
    zoomRef.current = nextZoom;
    setZoom(nextZoom);
    setPan((current) => boundPan(current, nextZoom));
  }, [boundPan]);

  const resetView = useCallback(() => {
    zoomRef.current = PDP_LIGHTBOX_ZOOM_MIN;
    dragRef.current = null;
    setZoom(PDP_LIGHTBOX_ZOOM_MIN);
    setPan({ x: 0, y: 0 });
  }, []);

  const adjustZoom = useCallback((amount) => {
    setBoundedZoom(zoomRef.current + amount);
  }, [setBoundedZoom]);

  const selectMedia = useCallback((index) => {
    const items = mediaRef.current;
    if (index < 0 || index >= items.length) return false;
    activeIndexRef.current = index;
    onActiveMediaIdChangeRef.current?.(items[index].id);
    resetView();
    return true;
  }, [resetView]);

  const moveMedia = useCallback((direction) => {
    selectMedia(activeIndexRef.current + direction);
  }, [selectMedia]);

  const close = useCallback(() => onCloseRef.current?.(), []);

  useEffect(() => {
    if (!open) return undefined;
    resetView();
    const restorePage = isolatePage();
    document.body.classList.add("is-locked");
    window.requestAnimationFrame(() => closeRef.current?.focus());
    const handleKeyDown = (event) => {
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName))) return;
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        moveMedia(-1);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        moveMedia(1);
      } else if (["+", "="].includes(event.key)) {
        event.preventDefault();
        adjustZoom(PDP_LIGHTBOX_ZOOM_STEP);
      } else if (["-", "_"].includes(event.key)) {
        event.preventDefault();
        adjustZoom(-PDP_LIGHTBOX_ZOOM_STEP);
      } else if (event.key === "0") {
        event.preventDefault();
        resetView();
      } else if (event.key === "Home") {
        event.preventDefault();
        selectMedia(0);
      } else if (event.key === "End") {
        event.preventDefault();
        selectMedia(mediaRef.current.length - 1);
      }
      keepFocusInDialog(event, dialogRef.current);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.classList.remove("is-locked");
      restorePage();
      returnFocusRef?.current?.focus();
    };
  }, [adjustZoom, close, moveMedia, open, resetView, returnFocusRef, selectMedia]);

  useEffect(() => {
    if (open) resetView();
  }, [activeMediaId, open, resetView]);

  if (!open || !activeMedia) return null;

  const startPan = (event) => {
    if (zoomRef.current <= PDP_LIGHTBOX_ZOOM_MIN || activeMedia.type !== "image") return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragRef.current = { x: event.clientX, y: event.clientY, pan };
  };

  const movePan = (event) => {
    if (!dragRef.current) return;
    const drag = dragRef.current;
    setPan(boundPan({ x: drag.pan.x + event.clientX - drag.x, y: drag.pan.y + event.clientY - drag.y }));
  };

  const stopPan = (event) => {
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    dragRef.current = null;
  };

  const handleWheel = (event) => {
    if (activeMedia.type !== "image") return;
    event.preventDefault();
    adjustZoom(event.deltaY < 0 ? 0.25 : -0.25);
  };

  return createPortal(
    <div className="runtime-media-lightbox" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && close()}>
      <div ref={dialogRef} className="runtime-media-lightbox__dialog" role="dialog" aria-modal="true" aria-label={`${productName} medya önizlemesi`} tabIndex="-1">
        <header className="runtime-media-lightbox__header">
          <span className="runtime-media-lightbox__position" aria-live="polite">{activeIndex + 1} / {media.length}</span>
          <div className="runtime-media-lightbox__zoom-controls" aria-label="Görsel yakınlaştırma kontrolleri">
            <button type="button" onClick={() => adjustZoom(-PDP_LIGHTBOX_ZOOM_STEP)} disabled={activeMedia.type !== "image" || zoom <= PDP_LIGHTBOX_ZOOM_MIN} aria-label="Görseli uzaklaştır"><ZoomOut /></button>
            <span aria-live="polite">%{Math.round(zoom * 100)}</span>
            <button type="button" onClick={() => adjustZoom(PDP_LIGHTBOX_ZOOM_STEP)} disabled={activeMedia.type !== "image" || zoom >= PDP_LIGHTBOX_ZOOM_MAX} aria-label="Görseli yakınlaştır"><ZoomIn /></button>
            <button type="button" onClick={resetView} disabled={activeMedia.type !== "image" || zoom === PDP_LIGHTBOX_ZOOM_MIN} aria-label="Görseli pencereye sığdır"><ResetView /></button>
          </div>
          <button ref={closeRef} className="runtime-media-lightbox__close" type="button" onClick={close} aria-label="Medya önizlemesini kapat"><X /></button>
        </header>
        <div
          ref={viewportRef}
          className={`runtime-media-lightbox__viewport${zoom > PDP_LIGHTBOX_ZOOM_MIN ? " is-zoomed" : ""}`}
          onPointerDown={startPan}
          onPointerMove={movePan}
          onPointerUp={stopPan}
          onPointerCancel={stopPan}
          onWheel={handleWheel}
        >
          {activeMedia.type === "video"
            ? <video src={activeMedia.url} controls autoPlay playsInline />
            : <img src={activeMedia.url} alt={productName} draggable="false" style={{ transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})` }} />}
        </div>
        {media.length > 1 && <>
          <button className="runtime-media-lightbox__previous" type="button" disabled={activeIndex === 0} onClick={() => moveMedia(-1)} aria-label="Önceki medyayı göster"><CaretLeft /></button>
          <button className="runtime-media-lightbox__next" type="button" disabled={activeIndex === media.length - 1} onClick={() => moveMedia(1)} aria-label="Sonraki medyayı göster"><CaretRight /></button>
        </>}
      </div>
    </div>,
    document.body,
  );
}
