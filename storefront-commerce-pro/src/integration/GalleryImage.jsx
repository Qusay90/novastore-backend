import { useEffect, useState } from "react";

export function GalleryImage({ media, alt, onError }) {
  const key = media?.url || "";
  const [frame, setFrame] = useState({ key, current: media, previous: null, entered: true });
  if (key !== frame.key) setFrame({ key, current: media, previous: frame.current, entered: false });
  useEffect(() => {
    let second;
    const first = requestAnimationFrame(() => { second = requestAnimationFrame(() =>
      setFrame((state) => state.key === key ? { ...state, entered: true } : state)); });
    const timer = setTimeout(() => setFrame((state) => state.key === key ? { ...state, previous: null } : state), 230);
    return () => { cancelAnimationFrame(first); cancelAnimationFrame(second); clearTimeout(timer); };
  }, [key]);
  if (!frame.current) return <span className="runtime-gallery-empty">Görsel yüklenemedi</span>;
  if (frame.current.type === "video") return <video src={frame.current.url} muted playsInline preload="metadata" onError={() => onError(frame.current)} />;
  return <>
    {frame.previous?.type === "image" && <img className="runtime-gallery-previous" src={frame.previous.url} alt="" aria-hidden="true" />}
    <img data-gallery-current className={frame.entered ? "runtime-gallery-current is-entered" : "runtime-gallery-current"}
      src={frame.current.url} alt={alt} onError={() => onError(frame.current)} />
  </>;
}
