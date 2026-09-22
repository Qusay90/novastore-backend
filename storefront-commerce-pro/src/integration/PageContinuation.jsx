import "./public-discovery.css";

export function PageContinuation({ page, label = "ürün", refresh = true }) {
  const busy = ["idle", "loading", "appending"].includes(page.phase);
  return <div className="public-continuation" data-continuation={label}>
    <p role={page.error ? "alert" : "status"} aria-live="polite">
      {page.phase === "loading" || page.phase === "idle" ? "Yükleniyor…"
        : page.phase === "error" ? "Liste alınamadı. Yeniden deneyebilirsin."
          : page.phase === "append-error" ? "Sonraki sayfa alınamadı. Yüklenen kayıtlar korunuyor."
            : page.phase === "appending" ? "Sonraki sayfa yükleniyor…"
              : `${page.items.length} ${label} yüklendi${page.pagination?.hasMore ? "; daha fazlası var." : "."}`}
    </p>
    {(page.pagination?.hasMore || page.phase === "appending") && <button type="button" className="secondary-button" aria-disabled={busy}
      onClick={() => { if (!busy) page.more(); }}>{page.phase === "append-error" ? "Sonraki sayfayı yeniden dene" : `Daha fazla ${label} göster`}</button>}
    {(refresh || page.phase === "error") && <button type="button" className="secondary-button" aria-disabled={page.phase === "loading"}
      onClick={() => { if (page.phase !== "loading") page.refresh(); }}>{page.phase === "error" ? "Yeniden dene" : "Listeyi yenile"}</button>}
  </div>;
}
