import { useEffect, useRef, useState } from "react";
import { Heart } from "./CustomerIcon.jsx";

export function CustomerFavoriteButton({
  productId,
  productName,
  favorite = false,
  onFavorite,
  className = "",
}) {
  const [motion, setMotion] = useState("idle");
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const motionTimer = useRef(null);

  useEffect(() => {
    pendingRef.current = false;
    setPending(false);
    setMotion("idle");
  }, [productId]);

  useEffect(() => () => window.clearTimeout(motionTimer.current), []);

  const handleFavorite = async () => {
    if (pendingRef.current) return;
    const successfulMotion = favorite ? "off" : "on";
    pendingRef.current = true;
    setPending(true);
    try {
      const result = await onFavorite?.(productId);
      if (result !== false) {
        window.clearTimeout(motionTimer.current);
        setMotion(successfulMotion);
        motionTimer.current = window.setTimeout(
          () => setMotion("idle"),
          successfulMotion === "on" ? 440 : 340,
        );
      }
    } catch { /* Runtime owns the visible failure notice. */ }
    finally {
      pendingRef.current = false;
      setPending(false);
    }
  };

  const safeName = String(productName || "Ürün").trim() || "Ürün";
  return (
    <button
      className={`favorite-button customer-favorite-button${className ? ` ${className}` : ""}${favorite ? " is-active" : ""}${pending ? " is-pending" : ""}${motion !== "idle" ? ` is-confirmed-${motion}` : ""}`}
      type="button"
      onClick={handleFavorite}
      disabled={pending || typeof onFavorite !== "function"}
      aria-busy={pending || undefined}
      aria-pressed={favorite}
      aria-label={favorite ? `${safeName} ürününü favorilerden çıkar` : `${safeName} ürününü favorilere ekle`}
    >
      <Heart weight={favorite ? "fill" : "regular"} />
    </button>
  );
}
