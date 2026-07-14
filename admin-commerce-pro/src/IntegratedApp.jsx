import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createSameOriginAdapter } from "./adapters/sameOriginAdapter.js";
import { hasCapability } from "./integration/capabilities.js";
import { ADMIN_TOKEN_KEY, createAdminHttp } from "./integration/adminHttp.js";
import { useResource } from "./integration/useResource.js";

const money = (value) => new Intl.NumberFormat("tr-TR", {
  style: "currency",
  currency: "TRY",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
}).format(value);

const dateTime = (value) => value instanceof Date
  ? new Intl.DateTimeFormat("tr-TR", { dateStyle: "short", timeStyle: "short" }).format(value)
  : "Tarih bilgisi yok";

const statusClass = (value) => String(value || "")
  .toLocaleLowerCase("tr-TR")
  .replaceAll("\u0307", "")
  .replaceAll(" ", "-");

function Icon({ name }) {
  const markup = window.NovaIcons?.icon?.(name, "icon") || "";
  return <span className="icon-wrap" aria-hidden="true" dangerouslySetInnerHTML={{ __html: markup }} />;
}

function StatePanel({ phase, error, onRetry }) {
  if (phase === "loading" || phase === "idle") {
    return (
      <section className="state-panel live-state-card" role="status" aria-live="polite">
        <span className="live-loader" aria-hidden="true" />
        <h3>Entegre yönetim verisi yükleniyor</h3>
        <p>Gerekli admin kaynağı aynı-origin API üzerinden doğrulanıyor.</p>
      </section>
    );
  }

  const forbidden = phase === "forbidden";
  return (
    <section className="state-panel live-state-card" role="alert">
      <Icon name={forbidden ? "shield" : "warning"} />
      <h3>{forbidden ? "Bu alan için yetki yok" : "Entegre veri alınamadı"}</h3>
      <p>{error?.message || "Beklenmeyen bir bağlantı hatası oluştu."}</p>
      {error?.requestId && <small>İstek kimliği: {error.requestId}</small>}
      {!forbidden && <button className="primary-button" onClick={onRetry}>Yeniden dene</button>}
    </section>
  );
}

function ResourceWarning({ error, onRetry }) {
  if (!error) return null;
  return (
    <section className="notice-card warning-card live-resource-warning" role="alert">
      <Icon name="warning" />
      <div><strong>Son yenileme tamamlanamadı</strong><p>{error.message} Son başarılı veri korunuyor.</p></div>
      <button className="secondary-button small" onClick={onRetry}>Yeniden dene</button>
    </section>
  );
}

function Kpi({ label, value, note }) {
  return (
    <article className="kpi-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  );
}

function OrdersTable({ orders, compact = false }) {
  return (
    <div className="table-scroll table-scroll-hint" tabIndex="0" role="region" aria-label="Sipariş özeti tablosu">
      <table className="data-table live-orders-table">
        <caption className="sr-only">Entegre backend’den okunan salt-okunur sipariş özetleri</caption>
        <thead>
          <tr>
            <th scope="col">Sipariş</th>
            <th scope="col">Müşteri</th>
            <th scope="col">Durum</th>
            <th scope="col">Ödeme</th>
            <th scope="col">Satır</th>
            <th scope="col">Tutar</th>
            <th scope="col">Tarih</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => (
            <tr key={order.id}>
              <td><strong>{order.id}</strong></td>
              <td>
                <span className="live-customer-cell">
                  <strong>{order.customerName}</strong>
                  {!compact && order.email && <small>{order.email}</small>}
                </span>
              </td>
              <td>
                <span className={`status status-${statusClass(order.status)}`}>{order.status}</span>
                {order.statusNote && <small className="live-status-note">{order.statusNote}</small>}
              </td>
              <td>
                <span className={order.paymentFailed ? "negative" : order.pendingPayment ? "live-payment-pending" : ""}>
                  {order.paymentStatus}
                </span>
              </td>
              <td>{order.itemCount}</td>
              <td><strong>{money(order.total)}</strong></td>
              <td>{dateTime(order.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Dashboard({ stats, orderPage, orderPhase, orderError, ordersEnabled, onRetryOrders, onOpenOrders }) {
  const recent = (orderPage?.items || []).slice(0, 6);
  const ordersLoaded = orderPhase === "ready" || orderPhase === "empty";
  return (
    <section className="workspace live-workspace" data-testid="live-dashboard">
      <header className="workspace-heading">
        <div>
          <span className="eyebrow">Entegre backend · salt okunur</span>
          <h2 tabIndex="-1">Genel Bakış</h2>
          <p>Göstergeler `/api/admin/stats`; sipariş özetleri sınırlı `/api/admin/orders/summary` kaynağından gelir.</p>
        </div>
        <button className="secondary-button" onClick={onOpenOrders} disabled={!ordersEnabled}><Icon name="orders" />{ordersEnabled ? "Sipariş özetlerini aç" : "Sipariş modülü kapalı"}</button>
      </header>

      <section className="kpi-grid">
        <Kpi label="Filtrelenmiş sipariş tutarı" value={money(stats.totalRevenue)} note="İptal, iade ve ödeme bekleyen hariç" />
        <Kpi label="Filtrelenmiş sipariş sayısı" value={String(stats.totalOrders)} note="İptal ve ödeme bekleyen hariç" />
        <Kpi label="Mevcut ürün kaydı" value={String(stats.totalProducts)} note="Products tablosu toplamı" />
        <Kpi label="Müşteri hesabı" value={String(stats.totalUsers)} note="Admin rolü hariç" />
      </section>

      <section className="notice-card live-boundary-notice" role="note">
        <Icon name="shield" />
        <div>
          <strong>Entegre tek-satıcı sınırı</strong>
          <p>Satıcı, teklif, hakediş ve payout modelleri backend’de oluşana kadar bu alanlar kapalıdır; mock kayıt gösterilmez.</p>
        </div>
      </section>

      <section className="table-card">
        <header className="card-header live-card-header">
          <div><h3>Son siparişler</h3><p>En yeni {recent.length} doğrulanmış özet kayıt</p></div>
          <button className="secondary-button small" onClick={onOpenOrders} disabled={!ordersEnabled}>{ordersEnabled ? "Listeyi aç" : "Modül kapalı"}</button>
        </header>
        {ordersEnabled && <ResourceWarning error={orderError} onRetry={onRetryOrders} />}
        {!ordersEnabled ? <StatePanel phase="forbidden" error={ordersUnavailableError} onRetry={onRetryOrders} /> : !ordersLoaded ? <StatePanel phase={orderPhase} error={orderError} onRetry={onRetryOrders} /> : recent.length > 0 ? <OrdersTable orders={recent} compact /> : (
          <div className="state-panel"><Icon name="orders" /><h3>Henüz sipariş yok</h3><p>Backend boş bir sipariş listesi döndürdü.</p></div>
        )}
      </section>
    </section>
  );
}

function Orders({ orderPage, error, refreshing, onRefresh }) {
  const orders = orderPage.items;
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("Tümü");
  const statuses = useMemo(() => ["Tümü", ...new Set(orders.map((order) => order.status))], [orders]);
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("tr-TR");
    return orders.filter((order) => {
      const matchesStatus = status === "Tümü" || order.status === status;
      const haystack = `${order.id} ${order.customerName} ${order.email}`.toLocaleLowerCase("tr-TR");
      return matchesStatus && (!normalized || haystack.includes(normalized));
    });
  }, [orders, query, status]);

  return (
    <section className="workspace live-workspace" data-testid="live-orders">
      <header className="workspace-heading operations-heading">
        <div>
          <span className="eyebrow">Entegre backend · salt okunur</span>
          <h2 tabIndex="-1">Son sipariş özetleri</h2>
          <p>En fazla son {orderPage.limit} kayıt gösterilir; bu arayüz durum, sahip, iptal veya toplu işlem yazma isteği göndermez.</p>
        </div>
        <button className="secondary-button" onClick={onRefresh} disabled={refreshing}>
          <Icon name="refresh" />{refreshing ? "Yenileniyor" : "Yenile"}
        </button>
      </header>

      <ResourceWarning error={error} onRetry={onRefresh} />
      <section className="table-card">
        <div className="ledger-toolbar filter-toolbar live-filter-toolbar">
          <label className="table-search">
            <Icon name="search" />
            <span className="sr-only">Sipariş ara</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Sipariş, müşteri veya e-posta ara" />
          </label>
          <label className="heading-select">
            <span className="sr-only">Duruma göre filtrele</span>
            <select value={status} onChange={(event) => setStatus(event.target.value)}>
              {statuses.map((value) => <option key={value}>{value}</option>)}
            </select>
          </label>
          <span className="live-result-count">{filtered.length} / {orders.length} kayıt{orderPage.hasMore ? " · daha eski kayıtlar bu turda gösterilmiyor" : ""}</span>
        </div>
        {filtered.length > 0 ? <OrdersTable orders={filtered} /> : (
          <div className="state-panel">
            <Icon name="search" />
            <h3>Eşleşen sipariş yok</h3>
            <p>Arama veya durum filtresini değiştirin.</p>
            <button className="secondary-button" onClick={() => { setQuery(""); setStatus("Tümü"); }}>Filtreleri temizle</button>
          </div>
        )}
      </section>
    </section>
  );
}

const railItems = [
  { id: "dashboard", label: "Pano", icon: "house", capability: "dashboardRead", implemented: true },
  { id: "orders", label: "Siparişler", icon: "orders", capability: "ordersRead", implemented: true },
  { id: "catalog", label: "Ürünler · sonraki tur", icon: "package", capability: "firstPartyCatalogRead", implemented: false },
  { id: "customers", label: "Müşteriler · endpoint yok", icon: "user", capability: "customerAdmin", implemented: false },
  { id: "sellers", label: "Satıcılar · altyapı yok", icon: "storefront", capability: "sellerAdmin", implemented: false },
  { id: "finance", label: "Finans · ledger yok", icon: "card", capability: "settlements", implemented: false },
];

const pageCapabilities = Object.freeze({ dashboard: "dashboardRead", orders: "ordersRead" });
const noSupportedModuleError = Object.freeze({
  message: "Bu admin oturumunda Commerce Pro'nun mevcut Dashboard veya Sipariş modülü açık değil.",
});
const ordersUnavailableError = Object.freeze({
  message: "Sipariş özeti okuma yeteneği bu admin oturumunda açık değil.",
});
const dashboardUnavailableError = Object.freeze({
  message: "Dashboard okuma yeteneği bu admin oturumunda açık değil.",
});

export function IntegratedApp() {
  const [page, setPage] = useState("dashboard");
  const [mobile, setMobile] = useState(() => window.innerWidth <= 760);
  const [contextOpen, setContextOpen] = useState(() => window.innerWidth > 760);
  const contextRef = useRef(null);
  const contextToggleRef = useRef(null);
  const http = useMemo(() => createAdminHttp(), []);
  const adapter = useMemo(() => createSameOriginAdapter(http), [http]);
  const loadSession = useCallback(({ signal }) => adapter.session({ signal }), [adapter]);
  const loadStats = useCallback(({ signal }) => adapter.dashboard({ signal }), [adapter]);
  const loadOrders = useCallback(({ signal }) => adapter.orders({ signal }), [adapter]);
  const sessionResource = useResource(loadSession, { preserveDataOnError: false });
  const sessionLoaded = sessionResource.phase === "ready";
  const capabilities = sessionResource.data?.capabilities || {};
  const statsEnabled = sessionLoaded && hasCapability(capabilities, "dashboardRead");
  const ordersEnabled = sessionLoaded && hasCapability(capabilities, "ordersRead");
  const statsResource = useResource(loadStats, { enabled: statsEnabled });
  const ordersResource = useResource(loadOrders, { enabled: ordersEnabled });
  const statsLoaded = statsResource.phase === "ready";
  const ordersLoaded = ordersResource.phase === "ready" || ordersResource.phase === "empty";

  useEffect(() => {
    const onResize = () => {
      const nextMobile = window.innerWidth <= 760;
      setMobile(nextMobile);
      if (nextMobile) setContextOpen(false);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (!sessionLoaded) return;
    if (page === "dashboard" && !statsEnabled && ordersEnabled) setPage("orders");
    if (page === "orders" && !ordersEnabled && statsEnabled) setPage("dashboard");
  }, [ordersEnabled, page, sessionLoaded, statsEnabled]);

  useEffect(() => {
    if (!mobile || !contextOpen) return undefined;
    const panel = contextRef.current;
    const previousFocus = document.activeElement;
    const focusable = () => Array.from(panel?.querySelectorAll("button:not([disabled])") || []);
    requestAnimationFrame(() => focusable()[0]?.focus());
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setContextOpen(false);
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusable();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    panel?.addEventListener("keydown", onKeyDown);
    return () => {
      panel?.removeEventListener("keydown", onKeyDown);
      requestAnimationFrame(() => (previousFocus || contextToggleRef.current)?.focus?.());
    };
  }, [contextOpen, mobile]);

  const navigate = (next) => {
    const capability = pageCapabilities[next];
    if (!capability || !hasCapability(capabilities, capability)) return;
    setPage(next);
    if (mobile) setContextOpen(false);
  };
  const reloadAll = () => {
    sessionResource.reload();
    if (statsEnabled) statsResource.reload();
    if (ordersEnabled) ordersResource.reload();
  };
  const logout = () => {
    localStorage.removeItem(ADMIN_TOKEN_KEY);
    window.location.href = "admin-login.html?next=admin-commerce-pro-live.html";
  };

  return (
    <div className={`admin-shell ${contextOpen ? "context-open" : "context-closed"}`} data-testid="integrated-admin-shell">
      <a className="skip-link" href="#main-content">Ana içeriğe geç</a>
      <aside className="icon-rail" aria-label="Ana yönetim alanları">
        <div className="rail-logo"><Icon name="storefront" /><span>NOVA</span></div>
        <nav className="rail-nav">
          {railItems.map((item) => {
            const enabled = item.implemented && hasCapability(capabilities, item.capability);
            return (
              <button
                key={item.id}
                className={page === item.id ? "active" : ""}
                disabled={!enabled}
                aria-label={item.label}
                title={item.label}
                onClick={() => navigate(item.id)}
              ><Icon name={item.icon} /></button>
            );
          })}
        </nav>
        <div className="rail-bottom"><button aria-label="Çıkış yap" title="Çıkış yap" onClick={logout}><Icon name="back" /></button></div>
      </aside>

      {contextOpen && (
        <aside ref={contextRef} className="context-rail" id="context-navigation" aria-label="Entegre yönetim menüsü" tabIndex="-1">
          <header className="context-title"><h1>Commerce Pro</h1><span className="live-mode-chip">ENTEGRE</span></header>
          <section className="context-nav">
            <button className={page === "dashboard" ? "active" : ""} onClick={() => navigate("dashboard")} disabled={!hasCapability(capabilities, "dashboardRead")}><Icon name="house" /><span>Genel Bakış</span></button>
            <button className={page === "orders" ? "active" : ""} onClick={() => navigate("orders")} disabled={!hasCapability(capabilities, "ordersRead")}><Icon name="orders" /><span>Siparişler</span><b>{ordersResource.data?.items.length || 0}</b></button>
            <button disabled><Icon name="refresh" /><span>İadeler</span><small>Tur 2</small></button>
          </section>
          <section className="marketplace-links">
            <strong>Planlanan modüller</strong>
            <button disabled><Icon name="package" /><span>Katalog</span><small>Tur 3</small></button>
            <button disabled><Icon name="storefront" /><span>Satıcılar</span><small>Tur 6</small></button>
            <button disabled><Icon name="card" /><span>Hakedişler</span><small>Tur 8</small></button>
          </section>
          <button className="collapse-caption" onClick={() => setContextOpen(false)}><Icon name="back" />Menüyü daralt</button>
        </aside>
      )}
      {contextOpen && mobile && <button className="context-scrim" aria-label="Menüyü kapat" onClick={() => setContextOpen(false)} />}

      <div className="admin-main" inert={mobile && contextOpen ? true : undefined}>
        <header className="topbar">
          <div className="topbar-leading">
            <button ref={contextToggleRef} className="icon-button rail-toggle" onClick={() => setContextOpen((value) => !value)} aria-label={contextOpen ? "Menüyü daralt" : "Menüyü aç"} aria-expanded={contextOpen}><Icon name={contextOpen ? "back" : "menu"} /></button>
            <div className="breadcrumb"><span>Entegre yönetim</span><Icon name="right" /><strong>{page === "dashboard" ? "Pano" : "Siparişler"}</strong></div>
          </div>
          <div className="command-trigger live-command-status" role="status"><Icon name="shield" /><span>{sessionLoaded ? "Admin oturumu doğrulandı" : "Admin oturumu doğrulanıyor"}</span></div>
          <button className="secondary-button live-refresh" onClick={reloadAll} disabled={sessionResource.refreshing || sessionResource.phase === "loading"}><Icon name="refresh" /><span>Veriyi yenile</span></button>
          <button className="profile-button" onClick={logout}><span className="avatar avatar-small">A</span><span>Çıkış</span></button>
        </header>

        <main className="content-area" id="main-content">
          {!sessionLoaded ? <StatePanel phase={sessionResource.phase} error={sessionResource.error} onRetry={sessionResource.reload} /> : !statsEnabled && !ordersEnabled ? (
            <StatePanel phase="forbidden" error={noSupportedModuleError} onRetry={sessionResource.reload} />
          ) : page === "dashboard" ? (
            !statsEnabled
              ? <StatePanel phase="forbidden" error={dashboardUnavailableError} onRetry={statsResource.reload} />
              : statsLoaded
              ? <><ResourceWarning error={statsResource.error} onRetry={statsResource.reload} /><Dashboard stats={statsResource.data} orderPage={ordersResource.data} orderPhase={ordersResource.phase} orderError={ordersResource.error} ordersEnabled={ordersEnabled} onRetryOrders={ordersResource.reload} onOpenOrders={() => navigate("orders")} /></>
              : <StatePanel phase={statsResource.phase} error={statsResource.error} onRetry={statsResource.reload} />
          ) : !ordersEnabled ? (
            <StatePanel phase="forbidden" error={ordersUnavailableError} onRetry={ordersResource.reload} />
          ) : ordersLoaded ? (
            <Orders orderPage={ordersResource.data} error={ordersResource.error} refreshing={ordersResource.refreshing} onRefresh={ordersResource.reload} />
          ) : <StatePanel phase={ordersResource.phase} error={ordersResource.error} onRetry={ordersResource.reload} />}
        </main>

        <footer className="statusbar">
          <div className="preview-banner live-banner" role="note" data-testid="live-banner"><Icon name="shield" /><strong>Entegre tek-satıcı modu</strong><span>Mock fallback yok · bu arayüz yazma isteği göndermez</span></div>
          <span className={sessionLoaded ? "healthy" : ""}>{sessionLoaded ? "Oturum doğrulandı" : sessionResource.phase === "error" ? "Bağlantı hatası" : "Bağlantı bekleniyor"}</span>
          <span>{ordersResource.updatedAt ? `Son sipariş okuması ${dateTime(ordersResource.updatedAt)}` : "Sipariş verisi bekleniyor"}</span>
          <button onClick={reloadAll} disabled={sessionResource.refreshing || statsResource.refreshing || ordersResource.refreshing}><Icon name="refresh" />Yenile</button>
        </footer>
      </div>
    </div>
  );
}
