import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";
import {
  analyticsPeriods,
  auditRecords,
  buildCsv,
  calculateSellerReviewPriority,
  categoryPreviewRows,
  customerRecords,
  evaluateProductPublication,
  filterTemplateRows,
  getInventoryStatus,
  initialWorkspaceSettings,
  isFirstPartyOffer,
  isSellerDocumentComplete,
  isSellerDocumentStateValid,
  matchesQuery,
  matchesStore,
  moduleRecords,
  notificationRows,
  orderRecords,
  paginateRows,
  productFromDraft,
  productRecords,
  markNotificationsRead,
  returnRows,
  roleLayoutSeed,
  sellerApplicationRecords,
  sellerOrderRows,
  sellerRequiredDocumentKeys,
  setCustomerSegment,
  setOrderOwner,
  setOrderStatuses,
  setSellerDecision,
  settlementRecords,
  stockRiskRows,
  toggleModuleAvailability,
  upsertProductOffer,
  validateProductDraft,
} from "./previewModel.js";

const money = (value) => new Intl.NumberFormat("tr-TR", {
  style: "currency",
  currency: "TRY",
  maximumFractionDigits: 0,
}).format(value);

const nextOrderStatus = {
  Yeni: "Hazırlanıyor",
  Hazırlanıyor: "Kargoya Verildi",
  "Kargoya Verildi": "Teslim Edildi",
};

const dateProfiles = {
  "7 Tem 2026 – 13 Tem 2026": {
    scale: 1,
    revenue: "₺12,8 Mn",
    orders: "6.842",
    label: "Bu hafta",
    days: ["7 Tem", "8 Tem", "9 Tem", "10 Tem", "11 Tem", "12 Tem", "13 Tem"],
  },
  "30 Haz 2026 – 6 Tem 2026": {
    scale: 0.86,
    revenue: "₺11,0 Mn",
    orders: "5.908",
    label: "Önceki hafta",
    days: ["30 Haz", "1 Tem", "2 Tem", "3 Tem", "4 Tem", "5 Tem", "6 Tem"],
  },
  "Son 30 gün": {
    scale: 4.18,
    revenue: "₺53,7 Mn",
    orders: "28.604",
    label: "Son 30 gün",
    days: ["14 Haz", "19 Haz", "24 Haz", "29 Haz", "4 Tem", "9 Tem", "13 Tem"],
  },
};

const revenueSeries = [
  { day: "7 Tem", current: 410000, previous: 520000 },
  { day: "8 Tem", current: 780000, previous: 650000 },
  { day: "9 Tem", current: 640000, previous: 590000 },
  { day: "10 Tem", current: 1100000, previous: 870000 },
  { day: "11 Tem", current: 1000000, previous: 920000 },
  { day: "12 Tem", current: 1500000, previous: 1180000 },
  { day: "13 Tem", current: 2000000, previous: 1310000 },
];

const domains = [
  { id: "dashboard", label: "Pano", icon: "house" },
  { id: "operations", label: "Siparişler", icon: "orders" },
  { id: "catalog", label: "Ürünler", icon: "package" },
  { id: "customers", label: "Müşteriler", icon: "user" },
  { id: "sellers", label: "Satıcılar", icon: "storefront" },
  { id: "finance", label: "Finans", icon: "card" },
  { id: "reports", label: "Raporlar", icon: "chart" },
  { id: "modules", label: "Modüller", icon: "grid" },
  { id: "audit", label: "Denetim", icon: "shield" },
  { id: "settings", label: "Ayarlar", icon: "settings" },
];

const contextByDomain = {
  dashboard: [
    { label: "Genel Bakış" },
    { label: "Bugünkü Öncelikler", count: "12", route: "operations", routeItem: "Bugün" },
    { label: "Mağaza Sağlığı" },
    { label: "Ekip Aktivitesi", route: "audit" },
  ],
  operations: [
    { label: "Bugün", count: "12" },
    { label: "Siparişler", count: "28" },
    { label: "İadeler", count: "3" },
    { label: "Müşteri Soruları", disabled: true },
  ],
  catalog: [
    { label: "Kanonik Katalog", count: "5" },
    { label: "Satıcı Teklifleri", count: "4" },
    { label: "Politika İstisnaları", count: "1" },
    { label: "Kategoriler", count: "5" },
    { label: "Filtre Şablonları", count: "3" },
  ],
  customers: [
    { label: "Tüm Müşteriler", count: "5" },
    { label: "Segmentler", count: "3" },
    { label: "Müşteri Soruları", disabled: true },
    { label: "İade Davranışı", disabled: true },
  ],
  sellers: [
    { label: "Satıcı Başvuruları", count: "4" },
    { label: "Aktif Satıcılar", disabled: true },
    { label: "Politika İstisnaları", route: "catalog", routeItem: "Politika İstisnaları", count: "1" },
    { label: "Performans", disabled: true },
  ],
  finance: [
    { label: "Genel Bakış", disabled: true },
    { label: "Hakedişler", count: "4" },
    { label: "Komisyonlar", disabled: true },
    { label: "Mutabakat", disabled: true },
  ],
  reports: [
    { label: "Satış Raporları" },
    { label: "Dönüşüm", disabled: true },
    { label: "Ürün İçgörüleri", disabled: true },
    { label: "Müşteri Davranışı", disabled: true },
  ],
  modules: [
    { label: "Modül Merkezi" },
    { label: "Etkin Modüller", count: "2" },
    { label: "Rol Düzenleri", count: "3" },
  ],
  audit: [
    { label: "İşlem Geçmişi" },
    { label: "Güvenlik", disabled: true },
    { label: "Dışa Aktarımlar" },
  ],
  settings: [
    { label: "Genel" },
    { label: "Ekip ve Roller", disabled: true },
    { label: "Bildirimler" },
    { label: "Entegrasyonlar", disabled: true },
  ],
};

const savedViewSeed = [
  { name: "Tüm siparişler", status: "Tümü", query: "", scope: "Operasyon ekibi" },
  { name: "Yeni siparişler", status: "Yeni", query: "", scope: "Yalnızca ben" },
  { name: "Hazırlanan siparişler", status: "Hazırlanıyor", query: "", scope: "Tüm yöneticiler" },
];

const roleSeed = roleLayoutSeed.map((role, index) => ({
  ...role,
  moduleIds: index === 0
    ? moduleRecords.map((item) => item.id)
    : index === 1
      ? ["catalog-health", "seller-approvals", "customer-voice", "conversion-lab"]
      : ["settlement-radar", "conversion-lab", "live-orders"],
}));

const focusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

function handleFocusTrap(event, container, onEscape) {
  if (event.key === "Escape") {
    event.preventDefault();
    onEscape();
    return;
  }
  if (event.key !== "Tab") return;
  const focusable = Array.from(container.querySelectorAll(focusableSelector))
    .filter((node) => !node.hidden && node.getAttribute("aria-hidden") !== "true" && node.getClientRects().length > 0);
  if (focusable.length === 0) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (document.activeElement === container) {
    event.preventDefault();
    (event.shiftKey ? last : first).focus();
  } else if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function downloadCsv(filename, columns, rows) {
  const blob = new Blob([buildCsv(columns, rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function Icon({ name, className = "icon" }) {
  const markup = window.NovaIcons?.icon?.(name, className) || "";
  return (
    <span
      className="icon-wrap"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  );
}

function Modal({ title, children, onClose, wide = false, testId, cardClass = "" }) {
  const ref = useRef(null);
  const triggerRef = useRef(null);
  const titleId = useId();

  useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;
    triggerRef.current = document.activeElement;
    if (!node.open) node.showModal();
    const frame = requestAnimationFrame(() => {
      const preferred = node.querySelector(
        "[data-autofocus], .command-input input, .modal-form input, .modal-form select, .quick-grid button, .modal-actions button",
      );
      (preferred || node.querySelector("button"))?.focus();
    });
    return () => {
      cancelAnimationFrame(frame);
      if (node.open) node.close();
      requestAnimationFrame(() => triggerRef.current?.focus?.());
    };
  }, []);

  return (
    <dialog
      ref={ref}
      className={"modal " + (wide ? "modal-wide" : "")}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      data-testid={testId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
      onKeyDown={(event) => handleFocusTrap(event, ref.current, onClose)}
    >
      <div className={("modal-card " + cardClass).trim()} role="document">
        <header className="modal-header">
          <div>
            <span className="eyebrow">NovaStore Yönetim · yerel önizleme</span>
            <h2 id={titleId}>{title}</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Pencereyi kapat">
            <Icon name="close" />
          </button>
        </header>
        {children}
      </div>
    </dialog>
  );
}

function Status({ children }) {
  const key = String(children)
    .toLocaleLowerCase("tr-TR")
    .replaceAll("\u0307", "")
    .replaceAll(" ", "-");
  return <span className={"status status-" + key}>{children}</span>;
}

function Kpi({ label, value, trend, tone = "positive" }) {
  return (
    <article className="kpi-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <small className={tone}>{trend}</small>
    </article>
  );
}

function EmptyState({ title = "Kayıt bulunamadı", description, onReset }) {
  return (
    <div className="empty-state" role="status">
      <Icon name="search" />
      <h3>{title}</h3>
      <p>{description || "Filtreleri değiştirip yeniden deneyin."}</p>
      {onReset && <button className="secondary-button small" onClick={onReset}>Filtreleri temizle</button>}
    </div>
  );
}

function EmptyTable({ colSpan, title, description, onReset }) {
  return (
    <tr>
      <td colSpan={colSpan}>
        <EmptyState title={title} description={description} onReset={onReset} />
      </td>
    </tr>
  );
}

function PreviewBanner() {
  return (
    <div className="preview-banner" role="note" data-testid="preview-banner">
      <Icon name="info" />
      <strong>Commerce Pro önizlemesi</strong>
      <span>Örnek veriler kullanılır; hiçbir işlem kaydedilmez ve ödeme isteği gönderilmez.</span>
    </div>
  );
}

function MarketplaceScopeNotice({ children }) {
  return (
    <section className="architecture-notice" role="note" data-testid="marketplace-scope-notice">
      <Icon name="info" />
      <div>
        <strong>Mevcut backend tek satıcılıdır</strong>
        <p>{children || "Bu alan, gelecekteki çok satıcılı hedef mimariyi yalnız yerel mock verilerle simüle eder; satıcı hesabı, teklif servisi veya yetkilendirme henüz bağlı değildir."}</p>
      </div>
    </section>
  );
}

function RevenueChart({ scale = 1, labels = dateProfiles["7 Tem 2026 – 13 Tem 2026"].days }) {
  const mountRef = useRef(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;
    const chart = new uPlot({
      width: Math.max(1, Math.floor(mount.clientWidth || 640)),
      height: 142,
      padding: [8, 10, 0, 0],
      scales: { x: { time: false }, y: { range: [0, 2200000 * scale] } },
      axes: [
        {
          stroke: "#53657a",
          grid: { show: false },
          ticks: { show: false },
          font: "11px Inter",
          size: 24,
          values: (_chart, values) => values.map((value) => labels[Math.round(value)] || ""),
        },
        {
          stroke: "#53657a",
          grid: { stroke: "#dfe5ec", width: 1 },
          ticks: { show: false },
          font: "11px Inter",
          size: 48,
          values: (_chart, values) => values.map((value) => String((value / 1000000).toFixed(1)).replace(".", ",") + "M"),
        },
      ],
      series: [
        {},
        { label: "Bu dönem", stroke: "#d95a1a", width: 3, points: { show: true, size: 6, width: 2, stroke: "#d95a1a", fill: "#fff" } },
        { label: "Önceki dönem", stroke: "#64758a", width: 2, dash: [8, 7], points: { show: false } },
      ],
      legend: { show: false },
      cursor: { show: false },
      select: { show: false },
    }, [
      revenueSeries.map((_item, index) => index),
      revenueSeries.map((item) => Math.round(item.current * scale)),
      revenueSeries.map((item) => Math.round(item.previous * scale)),
    ], mount);

    const resize = () => {
      const width = Math.floor(mount.clientWidth);
      if (width > 0) chart.setSize({ width, height: 142 });
    };
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(resize) : null;
    observer?.observe(mount);
    window.addEventListener("resize", resize);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", resize);
      chart.destroy();
    };
  }, [labels, scale]);

  return (
    <>
      <div
        className="revenue-chart"
        role="img"
        aria-label="Seçili dönemin net ciro eğilimi; turuncu çizgi bu dönemi, kesikli çizgi önceki dönemi gösterir."
      >
        <div ref={mountRef} aria-hidden="true" />
      </div>
      <ul className="sr-only">
        {revenueSeries.map((item, index) => (
          <li key={labels[index]}>
            {labels[index]}: bu dönem {money(item.current * scale)}, önceki dönem {money(item.previous * scale)}
          </li>
        ))}
      </ul>
    </>
  );
}

function AppHeader({
  title,
  section,
  contextOpen,
  onToggleContext,
  contextToggleRef,
  onCommand,
  onQuickCreate,
  onNotifications,
  onProfile,
  notifications,
  dateRange,
  setDateRange,
  showDate,
  toast,
  clearToast,
}) {
  const unread = notifications.filter((item) => !item.read).length;
  return (
    <>
      <header className="topbar">
        <div className="topbar-leading">
          <button
            ref={contextToggleRef}
            className="icon-button rail-toggle"
            onClick={onToggleContext}
            aria-label={contextOpen ? "Bağlamsal menüyü daralt" : "Bağlamsal menüyü aç"}
            aria-expanded={contextOpen}
            aria-controls="context-navigation"
          >
            <Icon name={contextOpen ? "back" : "menu"} />
          </button>
          <div className="breadcrumb">
            <span>Çalışma Alanları</span>
            <Icon name="right" />
            {section && (
              <>
                <span>{section}</span>
                <Icon name="right" />
              </>
            )}
            <strong>{title}</strong>
          </div>
        </div>
        <button
          className="command-trigger"
          onClick={onCommand}
          aria-label="Komut paletini aç"
          data-testid="command-open"
        >
          <Icon name="search" />
          <span>Ara veya komut çalıştır…</span>
          <kbd>⌘ K</kbd>
        </button>
        {showDate && <label className="date-select">
          <span className="sr-only">Tarih aralığı</span>
          <Icon name="calendar" />
          <select aria-label="Tarih aralığı" value={dateRange} onChange={(event) => setDateRange(event.target.value)}>
            {Object.keys(dateProfiles).map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>}
        <button
          className="icon-button notification-button"
          aria-label={unread + " okunmamış örnek bildirimi göster"}
          onClick={onNotifications}
        >
          <Icon name="bell" />
          {unread > 0 && <span className="notification-dot">{unread}</span>}
        </button>
        <button className="profile-button" onClick={onProfile}>
          <span className="avatar avatar-small">AK</span>
          <span>Operasyon Yöneticisi</span>
          <Icon name="sort" />
        </button>
        <button className="primary-button quick-create" onClick={onQuickCreate}>
          <Icon name="plus" />
          Hızlı oluştur
        </button>
      </header>
      {toast && (
        <div className="toast" role="status">
          <span>{toast}</span>
          <button onClick={clearToast} aria-label="Bildirimi kapat"><Icon name="close" /></button>
        </div>
      )}
    </>
  );
}

function IconRail({ active, setActive, onProfile, inactive = false }) {
  return (
    <nav className="icon-rail" aria-label="Ana çalışma alanları" data-testid="admin-sidebar" inert={inactive ? true : undefined}>
      <div className="rail-logo" aria-label="NovaStore">
        <span className="nova-mark"><Icon name="star" /></span>
        <span>NovaStore</span>
      </div>
      <div className="rail-nav">
        {domains.slice(0, 8).map((item) => (
          <button
            key={item.id}
            className={active === item.id ? "active" : ""}
            aria-current={active === item.id ? "page" : undefined}
            aria-label={item.label}
            title={item.label}
            onClick={() => setActive(item.id)}
            data-testid={"nav-" + item.id}
          >
            <Icon name={item.icon} />
          </button>
        ))}
      </div>
      <div className="rail-bottom">
        {domains.slice(8).map((item) => (
          <button
            key={item.id}
            className={active === item.id ? "active" : ""}
            aria-current={active === item.id ? "page" : undefined}
            aria-label={item.label}
            title={item.label}
            onClick={() => setActive(item.id)}
            data-testid={"nav-" + item.id}
          >
            <Icon name={item.icon} />
          </button>
        ))}
        <button className="rail-profile" onClick={onProfile} aria-label="Profil ve rol önizlemesini aç" title="Profil">
          <span className="avatar">AK</span>
        </button>
      </div>
    </nav>
  );
}

function ContextRail({
  domain,
  open,
  mobile,
  savedViews,
  activeItem,
  onItem,
  onView,
  onSaveView,
  onNavigate,
  onClose,
  store,
  onStoreChange,
  dateRange,
  onDateRangeChange,
  panelRef,
}) {
  if (!open) return null;
  const title = domains.find((item) => item.id === domain)?.label;
  const items = contextByDomain[domain] || [];

  return (
    <aside
      ref={panelRef}
      className="context-rail"
      id="context-navigation"
      data-testid="context-navigation"
      tabIndex="-1"
      role={mobile ? "dialog" : undefined}
      aria-modal={mobile ? "true" : undefined}
      aria-label={mobile ? title + " bağlamsal menüsü" : undefined}
      onKeyDown={(event) => mobile && handleFocusTrap(event, panelRef.current, onClose)}
    >
      <div className="context-title">
        <h1>{title}</h1>
        <button className="icon-button small" onClick={onClose} aria-label="Bağlamsal menüyü kapat">
          <Icon name="back" />
        </button>
      </div>
      {["operations", "catalog", "finance"].includes(domain) && <label className="context-store">
        <Icon name="storefront" />
        <select aria-label="Örnek kapsam" value={store} onChange={(event) => onStoreChange(event.target.value)}>
          <option>Tüm Mağazalar · 24</option>
          <option>NovaStore</option>
          <option>Demo Teknoloji · 2 mağaza</option>
          <option>Demo Ev</option>
        </select>
      </label>}
      {["dashboard", "operations"].includes(domain) && <label className="context-store context-date">
        <Icon name="calendar" />
        <select aria-label="Bağlamsal tarih aralığı" value={dateRange} onChange={(event) => onDateRangeChange(event.target.value)}>
          {Object.keys(dateProfiles).map((item) => <option key={item}>{item}</option>)}
        </select>
      </label>}
      <nav className="context-nav" aria-label={title + " bölümleri"}>
        {items.map((item, index) => (
          <button
            key={item.label}
            className={activeItem === item.label && !item.disabled ? "active" : ""}
            aria-current={activeItem === item.label && !item.disabled ? "page" : undefined}
            disabled={item.disabled}
            title={item.disabled ? "Gerçek servis entegrasyonunda etkinleşecek" : undefined}
            onClick={() => onItem(item)}
          >
            <Icon name={index === 0 ? "house" : index === 1 ? "orders" : "right"} />
            <span>{item.label}</span>
            {item.disabled ? <b className="integration-badge">Entegrasyonda</b> : item.count && <b>{item.count}</b>}
          </button>
        ))}
      </nav>
      {domain === "operations" && (
        <section className="saved-views">
          <header>
            <strong>Kaydedilmiş Görünümler</strong>
            <button className="icon-button small" onClick={onSaveView} aria-label="Görünüm kaydet">
              <Icon name="plus" />
            </button>
          </header>
          {savedViews.map((view) => (
            <button key={view.name} onClick={() => onView(view)}>
              <Icon name="bookmark" />
              <span>{view.name}</span>
            </button>
          ))}
        </section>
      )}
      {domain === "operations" && (
        <section className="marketplace-links">
          <strong>Pazaryeri</strong>
          <button onClick={() => onNavigate("sellers", "Satıcı Başvuruları")}>
            <Icon name="user" />
            Satıcı Başvuruları
            <b>4</b>
          </button>
          <button onClick={() => onNavigate("catalog", "Politika İstisnaları")}>
            <Icon name="package" />
            Politika İstisnaları
            <b>1</b>
          </button>
        </section>
      )}
      <button className="collapse-caption" onClick={onClose}>
        <Icon name="back" />
        Menüyü daralt
      </button>
    </aside>
  );
}

function OperationsPreviewTable({ tab, store }) {
  if (tab === "seller-orders") {
    const rows = sellerOrderRows.filter((row) => matchesStore(row, store));
    return (
      <div className="table-scroll table-scroll-hint" tabIndex="0" aria-label="Satıcı siparişleri tablosu, yatay kaydırılabilir">
        <table className="data-table">
          <caption className="sr-only">Örnek satıcı siparişleri</caption>
          <thead><tr><th scope="col">Satıcı siparişi</th><th scope="col">Ana sipariş</th><th scope="col">Satıcı</th><th scope="col">Ürün</th><th scope="col">Tutar</th><th scope="col">Kargo</th><th scope="col">Durum</th></tr></thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td><strong>{row.id}</strong></td><td>{row.parent}</td><td>{row.seller}</td><td>{row.item}</td>
                <td>{money(row.amount)}</td><td>{row.shipping}</td><td><Status>{row.status}</Status></td>
              </tr>
            ))}
            {rows.length === 0 && <EmptyTable colSpan={7} title="Bu kapsamda satıcı siparişi yok" />}
          </tbody>
        </table>
      </div>
    );
  }
  if (tab === "returns") {
    const rows = returnRows.filter((row) => matchesStore(row, store));
    return (
      <div className="table-scroll table-scroll-hint" tabIndex="0" aria-label="İadeler tablosu, yatay kaydırılabilir">
        <table className="data-table">
          <caption className="sr-only">Örnek iade talepleri</caption>
          <thead><tr><th scope="col">İade</th><th scope="col">Sipariş</th><th scope="col">Müşteri</th><th scope="col">Satıcı</th><th scope="col">Neden</th><th scope="col">Tutar</th><th scope="col">SLA</th><th scope="col">Durum</th></tr></thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td><strong>{row.id}</strong></td><td>{row.order}</td><td>{row.customer}</td><td>{row.seller}</td>
                <td>{row.reason}</td><td>{money(row.amount)}</td><td className="sla">{row.sla}</td><td><Status>{row.status}</Status></td>
              </tr>
            ))}
            {rows.length === 0 && <EmptyTable colSpan={8} title="Bu kapsamda iade talebi yok" />}
          </tbody>
        </table>
      </div>
    );
  }
  const rows = stockRiskRows.filter((row) => matchesStore(row, store));
  return (
    <div className="table-scroll table-scroll-hint" tabIndex="0" aria-label="Stok riskleri tablosu, yatay kaydırılabilir">
      <table className="data-table">
        <caption className="sr-only">Örnek stok riskleri</caption>
        <thead><tr><th scope="col">SKU</th><th scope="col">Ürün</th><th scope="col">Satıcı</th><th scope="col">Kullanılabilir</th><th scope="col">Rezerve</th><th scope="col">Stok süresi</th><th scope="col">Durum</th></tr></thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.sku}>
              <td><strong>{row.sku}</strong></td><td>{row.product}</td><td>{row.seller}</td><td>{row.available}</td>
              <td>{row.reserved}</td><td>{row.cover}</td><td><Status>{row.status}</Status></td>
            </tr>
          ))}
          {rows.length === 0 && <EmptyTable colSpan={7} title="Bu kapsamda stok riski yok" />}
        </tbody>
      </table>
    </div>
  );
}

function OrderInspectorContent({ order, notes, setNotes, notify, updateStatus, openDialog }) {
  return (
    <>
      <div className="inspector-body">
        <section>
          <span className="section-label">Satıcı / Mağaza</span>
          <div className="entity-line">
            <Icon name="storefront" />
            <div><strong>{order.seller}</strong><small>Örnek puan: 4,8 · 7.842 sipariş</small></div>
            <button className="link-button" onClick={() => openDialog("store-detail", { seller: order.seller })}>Mağazayı önizle</button>
          </div>
        </section>
        <section>
          <span className="section-label">Müşteri</span>
          <div className="entity-line">
            <span className="avatar avatar-small">{order.customer.split(" ").map((word) => word[0]).join("")}</span>
            <div><strong>{order.customer}</strong><small>{`siparis-${order.id.toLocaleLowerCase("tr-TR")}@example.invalid`}</small></div>
          </div>
        </section>
        <section>
          <span className="section-label">Örnek tahsilat özeti</span>
          <div className="split-line"><Status>Tamamlandı</Status><span>Örnek kart •••• 4242</span><strong>{money(order.amount)}</strong></div>
        </section>
        <section>
          <span className="section-label">Ürün</span>
          <div className="inspector-product"><img src={order.image} alt="" /><div><strong>{order.product}</strong><small>1 adet · örnek tutar</small></div><b>{money(order.amount)}</b></div>
        </section>
        <section>
          <span className="section-label">Örnek olay akışı</span>
          <ol className="timeline"><li><b>Sipariş oluşturuldu</b><time>09:12</time></li><li><b>Kontrol tamamlandı</b><time>09:18</time></li><li><b>{order.status}</b><time>10:03</time></li></ol>
        </section>
        <label className="note-field">
          <span>Yerel önizleme notu</span>
          <textarea
            value={notes[order.id] || ""}
            onChange={(event) => setNotes((current) => ({ ...current, [order.id]: event.target.value }))}
            onBlur={() => notify(order.id + " notu bu oturumda korundu.")}
            placeholder="Bu sipariş için bir not ekleyin…"
          />
          <small>Yalnız bu oturumda korunur.</small>
        </label>
      </div>
      <footer className="inspector-actions">
        <select aria-label="Sipariş durumu" value={order.status} onChange={(event) => updateStatus(order.id, event.target.value)} data-testid="inspector-status">
          <option>Yeni</option><option>Hazırlanıyor</option><option>Kargoya Verildi</option><option>Teslim Edildi</option><option>İptal Edildi</option>
        </select>
        <button className="primary-button" disabled={!nextOrderStatus[order.status]} onClick={() => nextOrderStatus[order.status] && updateStatus(order.id, nextOrderStatus[order.status])}>
          {nextOrderStatus[order.status] ? "Sonraki aşamayı önizle" : "Akış tamamlandı"}
        </button>
      </footer>
    </>
  );
}

function Operations({
  orders,
  setOrders,
  selected,
  setSelected,
  currentId,
  setCurrentId,
  filter,
  setFilter,
  tab,
  setTab,
  editingLayout,
  setEditingLayout,
  savedViews,
  activeView,
  onCustomFilter,
  onApplyView,
  onSaveView,
  store,
  setStore,
  dateRange,
  notify,
  openDialog,
  notes,
  setNotes,
  visiblePanels,
  setVisiblePanels,
  compact,
  contextItem,
  initialOrderId,
}) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const scopedOrders = useMemo(() => orders.filter((order) => matchesStore(order, store)), [orders, store]);
  const filtered = useMemo(
    () => scopedOrders.filter((order) => (
      (contextItem !== "Bugün" || order.today)
      && (filter.status === "Tümü" || order.status === filter.status)
      && matchesQuery(order, filter.query)
    )),
    [scopedOrders, filter, contextItem],
  );
  const pagination = paginateRows(filtered, page, pageSize);
  const current = currentId ? orders.find((order) => order.id === currentId) : null;
  const inspectorRef = useRef(null);
  const rowTriggerRef = useRef(null);
  const selectAllRef = useRef(null);
  const filtersMountedRef = useRef(false);
  const visibleSelected = pagination.rows.filter((order) => selected.includes(order.id));
  const allSelected = pagination.rows.length > 0 && visibleSelected.length === pagination.rows.length;
  const someSelected = visibleSelected.length > 0 && !allSelected;
  const profile = dateProfiles[dateRange];
  const storeRatio = orders.length > 0 ? scopedOrders.length / orders.length : 0;
  const allStores = store.startsWith("Tüm Mağazalar");
  const scopedScale = profile.scale * (allStores ? 1 : storeRatio);
  const scopedRevenue = allStores
    ? profile.revenue
    : money(Math.round(12800000 * scopedScale));
  const scopedOrderCount = allStores
    ? profile.orders
    : Math.round(6842 * scopedScale).toLocaleString("tr-TR");
  const scopedOpenOrderCount = scopedOrders.filter((order) => !["Teslim Edildi", "İptal Edildi"].includes(order.status)).length.toLocaleString("tr-TR");

  useEffect(() => {
    if (!filtersMountedRef.current) {
      filtersMountedRef.current = true;
      return;
    }
    setPage(1);
    setSelected([]);
    setCurrentId("");
  }, [filter.status, filter.query, store, tab, pageSize, contextItem]);

  useEffect(() => {
    setPage(pagination.page);
  }, [pagination.page]);

  useEffect(() => {
    if (!initialOrderId) return;
    const targetIndex = filtered.findIndex((order) => order.id === initialOrderId);
    if (targetIndex >= 0) setPage(Math.floor(targetIndex / pageSize) + 1);
    setCurrentId(initialOrderId);
  }, [initialOrderId]);

  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = someSelected;
  }, [someSelected]);

  useEffect(() => {
    if (!currentId || compact) return undefined;
    const frame = requestAnimationFrame(() => inspectorRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [compact, currentId]);

  const updateStatus = (id, status) => {
    setOrders((rows) => setOrderStatuses(rows, [id], status));
    notify(id + " durumu önizlemede “" + status + "” olarak güncellendi.");
  };

  const bulkStatus = (status) => {
    const visibleIds = new Set(visibleSelected.map((order) => order.id));
    setOrders((rows) => setOrderStatuses(rows, visibleIds, status));
    setSelected([]);
    notify(visibleIds.size + " görünür örnek sipariş güncellendi.");
  };

  const openInspector = (id, trigger) => {
    rowTriggerRef.current = trigger;
    setCurrentId(id);
    requestAnimationFrame(() => inspectorRef.current?.focus());
  };

  const closeInspector = () => {
    setCurrentId("");
    requestAnimationFrame(() => rowTriggerRef.current?.focus?.());
  };

  return (
    <div className={"workspace operations-workspace " + (editingLayout ? "is-editing" : "")}>
      <div className="workspace-heading operations-heading">
        <div>
          <span className="eyebrow">{profile.label} · örnek veri</span>
          <h2 tabIndex="-1">Sipariş Operasyonu Önizlemesi</h2>
        </div>
        <div className="heading-actions">
          <label className="heading-select">
            <Icon name="storefront" />
            <select aria-label="Mağaza kapsamı" value={store} onChange={(event) => setStore(event.target.value)} data-testid="store-scope">
              <option>Tüm Mağazalar · 24</option><option>NovaStore</option><option>Demo Teknoloji · 2 mağaza</option><option>Demo Ev</option>
            </select>
          </label>
          <label className="heading-select">
            <Icon name="bookmark" />
            <select aria-label="Görünüm" value={activeView} onChange={(event) => onApplyView(savedViews.find((view) => view.name === event.target.value))}>
              {activeView === "" && <option value="" disabled>Özel görünüm</option>}
              {savedViews.map((view) => <option key={view.name}>{view.name}</option>)}
            </select>
          </label>
          <button className={"secondary-button " + (editingLayout ? "active" : "")} onClick={() => setEditingLayout(!editingLayout)} data-testid="layout-edit">
            <Icon name="grid" />{editingLayout ? "Düzenlemeyi bitir" : "Düzeni düzenle"}
          </button>
          <button className="secondary-button" onClick={onSaveView}><Icon name="bookmark" />Görünümü kaydet</button>
        </div>
      </div>
      {editingLayout && (
        <div className="edit-banner">
          <Icon name="info" />
          <span>Bu oturumda görünür analiz modüllerini seçin. Sıralama ve kalıcı rol düzeni entegrasyon aşamasındadır.</span>
          <label><input type="checkbox" checked={visiblePanels.revenue} onChange={(event) => setVisiblePanels({ ...visiblePanels, revenue: event.target.checked })} /> Net Ciro</label>
          <label><input type="checkbox" checked={visiblePanels.distribution} onChange={(event) => setVisiblePanels({ ...visiblePanels, distribution: event.target.checked })} /> Dağılım</label>
          <button onClick={() => setEditingLayout(false)}>Bitti</button>
        </div>
      )}
      <section className="kpi-grid" aria-label="Temel performans göstergeleri">
        <Kpi label="Net Ciro" value={scopedRevenue} trend="↑ %14,6 · seçili mağaza ve dönem" />
        <Kpi label="Sipariş" value={scopedOrderCount} trend="↑ %12,3 · seçili mağaza ve dönem" />
        <Kpi label="Açık Sipariş" value={scopedOpenOrderCount} trend="Seçili mağazada tamamlanmamış" tone="warning" />
        <Kpi label="İade Oranı" value="%4,28" trend="↓ 0,56 puan · iyileşme" />
      </section>
      {(visiblePanels.revenue || visiblePanels.distribution) && (
        <section className="insight-grid">
          {visiblePanels.revenue && (
            <article className="module-card revenue-module">
              <header>
                <h3>Net Ciro</h3>
                <details className="module-menu">
                  <summary aria-label="Net ciro modülü açıklaması"><Icon name="menu" /></summary>
                  <p>Seçili tarih aralığına göre yerel örnek seri yeniden hesaplanır.</p>
                </details>
              </header>
              <div className="chart-legend" aria-hidden="true"><span className="current-line">Bu dönem</span><span className="previous-line">Önceki dönem</span></div>
              <RevenueChart scale={scopedScale} labels={profile.days} />
            </article>
          )}
          {visiblePanels.distribution && (
            <article className="module-card distribution-module">
              <header>
                <h3>Sipariş Durum Dağılımı</h3>
                <details className="module-menu">
                  <summary aria-label="Sipariş dağılımı açıklaması"><Icon name="menu" /></summary>
                  <p>Dağılım göstergeleri örnek dönem ölçeğini temsil eder.</p>
                </details>
              </header>
              {[["Yeni", 32, "blue"], ["Hazırlanıyor", 27, "orange"], ["Kargoya Verildi", 24, "green"], ["Teslim Edildi", 13, "gray"], ["İptal / İade", 4, "red"]].map(([label, percent, tone]) => (
                <div className={"distribution-row tone-" + tone} key={label}>
                  <span>{label}</span><progress max="100" value={percent} aria-label={label + " yüzde " + percent} />
                  <b>{Math.round(6842 * scopedScale * percent / 100).toLocaleString("tr-TR")}</b><small>%{percent}</small>
                </div>
              ))}
            </article>
          )}
        </section>
      )}
      <section className="ledger-card">
        <div className="ledger-tabs" role="tablist" aria-label="Operasyon kayıt türleri">
          {[["orders", "Siparişler", filtered.length], ["seller-orders", "Satıcı Siparişleri", sellerOrderRows.length], ["returns", "İadeler", returnRows.length], ["stock", "Stok", stockRiskRows.length]].map(([id, label, count]) => (
            <button
              role="tab"
              aria-selected={tab === id}
              className={tab === id ? "active" : ""}
              onClick={() => {
                setTab(id);
                if (id !== "orders") setCurrentId("");
              }}
              key={id}
              data-testid={"ledger-tab-" + id}
            >
              {label}<b>{count}</b>
            </button>
          ))}
        </div>
        {tab !== "orders" ? (
          <div role="tabpanel" aria-label={tab === "returns" ? "İadeler" : tab === "stock" ? "Stok" : "Satıcı Siparişleri"}>
            <OperationsPreviewTable tab={tab} store={store} />
          </div>
        ) : (
          <div role="tabpanel" aria-label="Siparişler">
            <div className="ledger-toolbar">
              {visibleSelected.length > 0 ? (
                <div className="bulk-toolbar" data-testid="bulk-actions">
                  <strong>{visibleSelected.length} görünür sipariş seçildi</strong>
                  <button onClick={() => setSelected([])}>Seçimi temizle</button>
                  <select aria-label="Toplu durum güncelle" defaultValue="" onChange={(event) => event.target.value && bulkStatus(event.target.value)}>
                    <option value="">Durumu güncelle</option><option>Hazırlanıyor</option><option>Kargoya Verildi</option><option>İptal Edildi</option>
                  </select>
                  <button onClick={() => openDialog("assign-owner", { ids: visibleSelected.map((item) => item.id) })}>Sahip ata</button>
                </div>
              ) : (
                <div className="filter-toolbar">
                  <label className="table-search">
                    <Icon name="search" />
                    <input
                      type="search"
                      value={filter.query}
                      onChange={(event) => {
                        onCustomFilter();
                        setFilter({ ...filter, query: event.target.value });
                      }}
                      placeholder="Sipariş, müşteri veya ürün ara"
                      aria-label="Siparişlerde ara"
                      data-testid="filter-search"
                    />
                  </label>
                  <select
                    aria-label="Sipariş durumu"
                    value={filter.status}
                    onChange={(event) => {
                      onCustomFilter();
                      setFilter({ ...filter, status: event.target.value });
                    }}
                    data-testid="status-filter"
                  >
                    <option>Tümü</option><option>Yeni</option><option>Hazırlanıyor</option><option>Kargoya Verildi</option><option>Teslim Edildi</option><option>İptal Edildi</option>
                  </select>
                  <button className="secondary-button" onClick={() => onApplyView(savedViews[0])}><Icon name="filter" />Filtreleri temizle</button>
                </div>
              )}
            </div>
            <div className="table-scroll table-scroll-hint" tabIndex="0" aria-label="Sipariş tablosu, yatay kaydırılabilir">
              <table className="data-table">
                <caption className="sr-only">Filtrelenmiş örnek siparişler</caption>
                <thead>
                  <tr>
                    <th scope="col">
                      <input
                        ref={selectAllRef}
                        type="checkbox"
                        aria-label="Bu sayfadaki tüm siparişleri seç"
                        checked={allSelected}
                        onChange={(event) => {
                          const pageIds = pagination.rows.map((order) => order.id);
                          setSelected(event.target.checked
                            ? Array.from(new Set(selected.concat(pageIds)))
                            : selected.filter((id) => !pageIds.includes(id)));
                        }}
                      />
                    </th>
                    <th scope="col">Sipariş ID</th><th scope="col">Satıcı / Mağaza</th><th scope="col">Müşteri</th><th scope="col">Ürün</th>
                    <th scope="col">Kanal</th><th scope="col">Tutar</th><th scope="col">Durum</th><th scope="col">SLA Yaşı</th><th scope="col">Sahip</th><th scope="col"><span className="sr-only">İşlem</span></th>
                  </tr>
                </thead>
                <tbody>
                  {pagination.rows.map((order) => (
                    <tr
                      key={order.id}
                      className={current?.id === order.id ? "selected-row" : ""}
                      onClick={(event) => openInspector(order.id, event.currentTarget.querySelector("button"))}
                      data-testid="table-row"
                      data-row-id={order.id}
                    >
                      <td onClick={(event) => event.stopPropagation()}>
                        <input
                          type="checkbox"
                          aria-label={order.id + " satırını seç"}
                          data-testid="row-select"
                          checked={selected.includes(order.id)}
                          onChange={(event) => setSelected(event.target.checked ? selected.concat(order.id) : selected.filter((id) => id !== order.id))}
                        />
                      </td>
                      <td><strong>{order.id}</strong></td>
                      <td><span className="seller-cell"><Icon name="storefront" />{order.seller}</span></td>
                      <td>{order.customer}</td>
                      <td><span className="product-cell"><img src={order.image} alt="" />{order.product}</span></td>
                      <td>{order.channel}</td><td><strong>{money(order.amount)}</strong></td><td><Status>{order.status}</Status></td>
                      <td className="sla">{order.age}</td><td>{order.owner}</td>
                      <td><button className="icon-button small" aria-label={order.id + " siparişini incele"} onClick={(event) => { event.stopPropagation(); openInspector(order.id, event.currentTarget); }}><Icon name="menu" /></button></td>
                    </tr>
                  ))}
                  {pagination.rows.length === 0 && (
                    <EmptyTable
                      colSpan={11}
                      title="Sipariş bulunamadı"
                      description="Arama, durum veya mağaza kapsamını değiştirin."
                      onReset={() => onApplyView(savedViews[0])}
                    />
                  )}
                </tbody>
              </table>
            </div>
            <footer className="table-footer">
              <span>Toplam {filtered.length} kayıttan {pagination.start}–{pagination.end} arası gösteriliyor</span>
              <nav aria-label="Sipariş sayfalama">
                {Array.from({ length: pagination.pageCount }, (_item, index) => index + 1).map((item) => (
                  <button key={item} aria-current={pagination.page === item ? "page" : undefined} onClick={() => { setPage(item); setSelected([]); setCurrentId(""); }}>{item}</button>
                ))}
              </nav>
              <label>Satır <select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))}><option>5</option><option>10</option><option>20</option></select></label>
            </footer>
          </div>
        )}
      </section>
      {current && compact && (
        <Modal title={"Sipariş #" + current.id} onClose={closeInspector} testId="row-inspector" cardClass="order-inspector-modal">
          <OrderInspectorContent order={current} notes={notes} setNotes={setNotes} notify={notify} updateStatus={updateStatus} openDialog={openDialog} />
        </Modal>
      )}
      {current && !compact && (
        <aside
          ref={inspectorRef}
          className="inspector"
          role="complementary"
          aria-labelledby={"inspector-title-" + current.id}
          tabIndex="-1"
          data-testid="row-inspector"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.stopPropagation();
              closeInspector();
            }
          }}
        >
          <header>
            <div><span className="eyebrow">Örnek sipariş ayrıntısı</span><h3 id={"inspector-title-" + current.id}>Sipariş #{current.id}</h3></div>
            <button className="icon-button" onClick={closeInspector} aria-label="Denetçiyi kapat"><Icon name="close" /></button>
          </header>
          <OrderInspectorContent order={current} notes={notes} setNotes={setNotes} notify={notify} updateStatus={updateStatus} openDialog={openDialog} />
        </aside>
      )}
    </div>
  );
}

function Dashboard({ orders, onOpenOrders, onHealth, dateRange }) {
  const urgent = orders.filter((order) => order.status === "Yeni" || order.status === "Hazırlanıyor");
  const profile = dateProfiles[dateRange];
  return (
    <div className="workspace page-workspace dashboard-page">
      <div className="workspace-heading">
        <div><span className="eyebrow">{profile.label} · yönetici özeti</span><h2 tabIndex="-1">Genel Bakış</h2><p>Satış sağlığını, açık operasyon işlerini ve risk kuyruklarını tek ekranda izleyin.</p></div>
        <button className="primary-button" onClick={onOpenOrders}><Icon name="orders" />Sipariş operasyonuna git</button>
      </div>
      <section className="kpi-grid">
        <Kpi label="Net satış" value={profile.revenue} trend="↑ %14,6 · önceki dönem" />
        <Kpi label="Açık operasyon işi" value={String(urgent.length + 21)} trend="12 kritik SLA" tone="warning" />
        <Kpi label="Mutabakat farkı" value="₺99.001" trend="3 örnek kayıt" tone="warning" />
        <Kpi label="Pazaryeri durumu" value="Hedef model" trend="Mevcut backend tek satıcılı" />
      </section>
      <section className="analytics-grid">
        <article className="module-card">
          <header><div><span className="eyebrow">Bugünün öncelikleri</span><h3>Operasyon kuyruğu</h3></div><button className="link-button" onClick={onOpenOrders}>Tümünü aç</button></header>
          {[["Geciken siparişler", 12, 76], ["Kritik stok", 14, 58], ["Satıcı başvuruları", 4, 42], ["İade SLA riski", 3, 30]].map(([label, value, progress]) => (
            <div className="metric-progress" key={label}><span>{label}</span><progress max="100" value={progress} aria-label={label + " yoğunluğu yüzde " + progress} /><strong>{value}</strong></div>
          ))}
        </article>
        <article className="module-card">
          <header><div><span className="eyebrow">Sistem durumu</span><h3>Bağlantı sözleşmesi</h3></div></header>
          {[["Katalog", "Yerel örnek"], ["Sipariş akışı", "Yerel örnek"], ["Bildirim kuyruğu", "Önizleme"], ["Canlı tahsilat", "Entegrasyonda"]].map(([label, state]) => (
            <div className="check-line" key={label}><Icon name={state === "Entegrasyonda" ? "warning" : "check"} /><span>{label}</span><small>{state}</small></div>
          ))}
          <button className="secondary-button small" onClick={onHealth}>Sağlık ayrıntısını önizle</button>
        </article>
      </section>
    </div>
  );
}

function Catalog({ products, store, contextItem, collectionDrafts, onCreate, onEdit }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("Tümü");
  const mode = contextItem === "Kategoriler" ? "categories" : contextItem === "Filtre Şablonları" ? "templates" : "products";
  const forcedStatus = contextItem === "Politika İstisnaları" ? "İstisna incelemesi" : status;
  const scopedProducts = products.filter((product) => matchesStore(product, store));
  const contextProducts = contextItem === "Satıcı Teklifleri"
    ? scopedProducts.filter((product) => !isFirstPartyOffer(product))
    : scopedProducts;
  const visible = contextProducts.filter((product) => (
    (forcedStatus === "Tümü" || product.publicationStatus === forcedStatus)
    && matchesQuery(product, query)
  ));
  const automaticCount = scopedProducts.filter((item) => item.publicationStatus === "Otomatik yayında").length;
  const exceptionCount = scopedProducts.filter((item) => item.publicationStatus === "İstisna incelemesi").length;
  const sellerActionCount = scopedProducts.filter((item) => item.publicationStatus === "Satıcı aksiyonu").length;
  const lowStockCount = scopedProducts.filter((item) => item.stock > 0 && item.stock < 10).length;

  if (mode === "categories") {
    return (
      <div className="workspace page-workspace">
        <div className="workspace-heading"><div><span className="eyebrow">Katalog yapısı · yerel örnek</span><h2 tabIndex="-1">Kategoriler</h2><p>Ürün taksonomisini ve yayın durumlarını entegrasyondan önce inceleyin.</p></div></div>
        <section className="table-card">
          <header className="card-header"><div><h3>Kategori ağacı önizlemesi</h3><p>Salt okunur örnek yapı</p></div></header>
          <div className="table-scroll table-scroll-hint" tabIndex="0" aria-label="Kategori tablosu, yatay kaydırılabilir"><table className="data-table"><caption className="sr-only">Örnek kategoriler</caption><thead><tr><th scope="col">Kategori</th><th scope="col">Yol</th><th scope="col">Seviye</th><th scope="col">Ürün</th><th scope="col">Durum</th></tr></thead><tbody>{categoryPreviewRows.map((row) => <tr key={row.id}><td><strong>{row.name}</strong></td><td>{row.path}</td><td>{row.depth}</td><td>{row.products.toLocaleString("tr-TR")}</td><td><Status>{row.state}</Status></td></tr>)}</tbody></table></div>
        </section>
      </div>
    );
  }

  if (mode === "templates") {
    return (
      <div className="workspace page-workspace">
        <div className="workspace-heading"><div><span className="eyebrow">Filtre anatomisi · yerel örnek</span><h2 tabIndex="-1">Filtre Şablonları</h2><p>Kategori özelliklerinin sayısal ve zorunlu alan sözleşmesini inceleyin.</p></div></div>
        <section className="table-card">
          <header className="card-header"><div><h3>Şablon önizlemeleri</h3><p>Düzenleme gerçek kategori servisiyle etkinleşecek</p></div></header>
          <div className="table-scroll table-scroll-hint" tabIndex="0" aria-label="Filtre şablonları tablosu, yatay kaydırılabilir"><table className="data-table"><caption className="sr-only">Örnek filtre şablonları</caption><thead><tr><th scope="col">Şablon</th><th scope="col">Kategori</th><th scope="col">Özellik</th><th scope="col">Zorunlu</th><th scope="col">Durum</th></tr></thead><tbody>{filterTemplateRows.map((row) => <tr key={row.id}><td><strong>{row.name}</strong><small className="block-note">{row.id}</small></td><td>{row.category}</td><td>{row.attributes}</td><td>{row.required}</td><td><Status>{row.state}</Status></td></tr>)}</tbody></table></div>
        </section>
      </div>
    );
  }

  return (
    <div className="workspace page-workspace">
      <div className="workspace-heading">
        <div><span className="eyebrow">Katalog sahipliği · hedef pazaryeri simülasyonu</span><h2 tabIndex="-1">Ürün ve Teklif Politikası</h2><p>Platform kanonik içeriği yönetir; satıcı fiyat, stok ve kendi SKU alanlarının sahibidir. Normal teklifler politika kontrolünden sonra otomatik yayınlanır.{collectionDrafts.length > 0 ? " " + collectionDrafts.length + " yerel koleksiyon taslağı bulunuyor." : ""}</p></div>
        <button className="primary-button" onClick={onCreate}><Icon name="plus" />NovaStore katalog kaydı</button>
      </div>
      <MarketplaceScopeNotice>Üçüncü taraf teklifleri gelecekteki pazaryeri sözleşmesini gösterir. Bu admin ekranı satıcı adına fiyat veya stok değiştirmez; satıcı portalı ve seller-scope henüz uygulanmamıştır.</MarketplaceScopeNotice>
      <section className="kpi-grid compact">
        <Kpi label="Otomatik yayında" value={String(automaticCount)} trend="İnsan onayı gerektirmedi" />
        <Kpi label="Politika istisnası" value={String(exceptionCount)} trend="Yalnız gerçek istisnalar" tone="warning" />
        <Kpi label="Satıcı aksiyonu" value={String(sellerActionCount)} trend="Eksik bilgiyi satıcı tamamlar" tone="warning" />
        <Kpi label="Düşük stok" value={String(lowStockCount)} trend="Yayın kararından bağımsız" tone="warning" />
      </section>
      <section className="policy-flow" aria-label="Teklif yayın politikası">
        <div><Status>Otomatik yayında</Status><strong>Kurallar geçti</strong><small>Aktif satıcı + izinli kategori/marka + tam zorunlu veri</small></div>
        <div><Status>Satıcı aksiyonu</Status><strong>Düzeltilebilir eksik</strong><small>Kayıt admin kuyruğuna değil, satıcıya geri döner</small></div>
        <div><Status>İstisna incelemesi</Status><strong>İnsan kararı gereken istisna</strong><small>Kısıt, yetki veya belirsiz eşleşme gerekçesi görünürdür</small></div>
      </section>
      <section className="table-card">
        <header className="card-header">
          <div><h3>{contextItem === "Politika İstisnaları" ? "Politika istisnaları" : contextItem === "Satıcı Teklifleri" ? "Satıcı teklifleri" : "Kanonik ürün ve bağlı teklifler"}</h3><p>Yayın, stok sağlığı ve politika sonucu birbirinden ayrı gösterilir</p></div>
          <div className="filter-toolbar">
            <label className="table-search"><Icon name="search" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ürün veya SKU ara" aria-label="Ürün veya SKU ara" data-testid="catalog-search" /></label>
            {contextItem !== "Politika İstisnaları" && (
              <select aria-label="Teklif yayın durumu" value={status} onChange={(event) => setStatus(event.target.value)} data-testid="catalog-filter">
                <option>Tümü</option><option>Otomatik yayında</option><option>Satıcı aksiyonu</option><option>İstisna incelemesi</option><option>Yayından kaldırıldı</option>
              </select>
            )}
          </div>
        </header>
        <div className="table-scroll table-scroll-hint" tabIndex="0" aria-label="Ürün tablosu, yatay kaydırılabilir">
          <table className="data-table">
            <caption className="sr-only">Filtrelenmiş örnek ürünler</caption>
            <thead><tr><th scope="col">Kanonik ürün</th><th scope="col">Satıcı teklifi</th><th scope="col">Kategori</th><th scope="col">Fiyat</th><th scope="col">Stok sağlığı</th><th scope="col">Yayın</th><th scope="col">Politika sonucu</th><th scope="col">İşlem</th></tr></thead>
            <tbody>
              {visible.map((product) => (
                <tr key={product.offerId} data-testid={"catalog-row-" + product.offerId}>
                  <td><span className="product-cell"><img src={product.image} alt="" /><span><strong>{product.name}</strong><small className="block-note">{product.canonicalId}</small></span></span></td>
                  <td><strong>{product.seller}</strong><small className="block-note">{product.offerId} · {product.sku}</small></td><td>{product.category}</td>
                  <td>{money(product.price)}</td>
                  <td><strong className={product.stock < 10 ? "negative" : ""}>{product.stock}</strong><small className="block-note"><Status>{product.inventoryStatus}</Status></small></td>
                  <td><Status>{product.publicationStatus}</Status></td>
                  <td>{product.reasons.length ? <><strong>{product.reasons[0].label}</strong><small className="block-note">{product.reasons[0].code}</small></> : <><strong>Kurallar geçti</strong><small className="block-note">{product.policyVersion}</small></>}</td>
                  <td><button className="secondary-button small" onClick={() => onEdit(product)}>{product.publicationStatus === "İstisna incelemesi" ? "İstisnayı incele" : isFirstPartyOffer(product) ? "Katalog içeriğini düzenle" : "Teklifi incele"}</button></td>
                </tr>
              ))}
              {visible.length === 0 && <EmptyTable colSpan={8} title="Ürün bulunamadı" onReset={() => { setQuery(""); setStatus("Tümü"); }} />}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function CustomerDetail({ customer, onClose, onSegment }) {
  return (
    <Modal title={customer.name} onClose={onClose} wide testId="customer-detail">
      <div className="detail-modal-body">
        <div className="detail-hero"><span className="avatar">{customer.name.split(" ").map((word) => word[0]).join("")}</span><div><strong>{customer.email}</strong><small>{customer.id} · {customer.city}</small></div></div>
        <dl className="detail-list detail-grid"><div><dt>Sipariş</dt><dd>{customer.orders}</dd></div><div><dt>Yaşam boyu değer</dt><dd>{money(customer.lifetimeValue)}</dd></div><div><dt>İzin</dt><dd>{customer.consent}</dd></div><div><dt>Son aktivite</dt><dd>{customer.lastActivity}</dd></div></dl>
        <section className="notice-card"><Icon name="info" /><div><strong>Destek özeti</strong><p>{customer.support}</p></div></section>
        <label className="form-field"><span>Yerel segment</span><select value={customer.segment} onChange={(event) => onSegment(event.target.value)}><option>Yeni</option><option>Sadık</option><option>VIP</option></select></label>
      </div>
      <footer className="modal-actions"><button className="primary-button" onClick={onClose}>Tamam</button></footer>
    </Modal>
  );
}

function Customers({ customers, setCustomers, contextItem, initialCustomerId, notify }) {
  const [query, setQuery] = useState("");
  const [segment, setSegment] = useState("Tümü");
  const [activeId, setActiveId] = useState(initialCustomerId || "");
  const visible = customers.filter((customer) => (
    (segment === "Tümü" || customer.segment === segment)
    && matchesQuery(customer, query)
  ));
  const active = customers.find((customer) => customer.id === activeId);
  const segmentSummaries = ["Yeni", "Sadık", "VIP"].map((name) => {
    const members = customers.filter((customer) => customer.segment === name);
    return {
      name,
      count: members.length,
      value: members.reduce((sum, customer) => sum + customer.lifetimeValue, 0),
    };
  });

  useEffect(() => {
    if (initialCustomerId) setActiveId(initialCustomerId);
  }, [initialCustomerId]);

  const exportRows = () => {
    downloadCsv("novastore-musteri-onizleme.csv", [
      { label: "Müşteri", value: "name" },
      { label: "E-posta", value: "email" },
      { label: "Sipariş", value: "orders" },
      { label: "Yaşam boyu değer", value: "lifetimeValue" },
      { label: "Segment", value: "segment" },
    ], visible);
    notify(visible.length + " örnek müşteri CSV olarak indirildi.");
  };

  return (
    <div className="workspace page-workspace">
      <div className="workspace-heading">
        <div><span className="eyebrow">Müşteri merkezi · örnek veri</span><h2 tabIndex="-1">{contextItem === "Segmentler" ? "Müşteri Segmentleri" : "Müşteriler"}</h2><p>Arama, segment, müşteri ayrıntısı ve güvenli CSV önizlemesini inceleyin.</p></div>
        <button className="secondary-button" onClick={exportRows}><Icon name="download" />CSV indir</button>
      </div>
      <section className="kpi-grid compact"><Kpi label="Örnek müşteri" value={String(customers.length)} trend="Yerel kayıt" /><Kpi label="Tekrar satın alma" value="%31,8" trend="Örnek gösterge" /><Kpi label="Açık soru" value="9" trend="Entegrasyonda" tone="warning" /><Kpi label="Ortalama değer" value={money(Math.round(customers.reduce((sum, item) => sum + item.lifetimeValue, 0) / customers.length))} trend="Örnek ortalama" /></section>
      {contextItem === "Segmentler" && (
        <section className="segment-grid" aria-label="Yerel müşteri segmentleri">
          {segmentSummaries.map((item) => (
            <button key={item.name} className={segment === item.name ? "active" : ""} aria-pressed={segment === item.name} onClick={() => setSegment(segment === item.name ? "Tümü" : item.name)}>
              <span className="eyebrow">Yerel segment</span>
              <strong>{item.name}</strong>
              <span>{item.count} müşteri · {money(item.value)}</span>
            </button>
          ))}
        </section>
      )}
      <section className="table-card">
        <header className="card-header">
          <div><h3>Örnek müşteri listesi</h3><p>Detay ve segment değişiklikleri bu oturumda korunur</p></div>
          <div className="filter-toolbar">
            <label className="table-search"><Icon name="search" /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Müşteri veya e-posta ara" aria-label="Müşterilerde ara" /></label>
            <select aria-label="Müşteri segmenti" value={segment} onChange={(event) => setSegment(event.target.value)}><option>Tümü</option><option>Yeni</option><option>Sadık</option><option>VIP</option></select>
          </div>
        </header>
        <div className="table-scroll table-scroll-hint" tabIndex="0" aria-label="Müşteri tablosu, yatay kaydırılabilir">
          <table className="data-table">
            <caption className="sr-only">Filtrelenmiş örnek müşteriler</caption>
            <thead><tr><th scope="col">Müşteri</th><th scope="col">E-posta</th><th scope="col">Sipariş</th><th scope="col">Yaşam boyu değer</th><th scope="col">Segment</th><th scope="col">Son aktivite</th><th scope="col">İşlem</th></tr></thead>
            <tbody>
              {visible.map((customer) => <tr key={customer.id}><td><strong>{customer.name}</strong><small className="block-note">{customer.id}</small></td><td>{customer.email}</td><td>{customer.orders}</td><td><strong>{money(customer.lifetimeValue)}</strong></td><td><Status>{customer.segment}</Status></td><td>{customer.lastActivity}</td><td><button className="secondary-button small" onClick={() => setActiveId(customer.id)}>İncele</button></td></tr>)}
              {visible.length === 0 && <EmptyTable colSpan={7} title="Müşteri bulunamadı" onReset={() => { setQuery(""); setSegment("Tümü"); }} />}
            </tbody>
          </table>
        </div>
      </section>
      {active && <CustomerDetail customer={active} onClose={() => setActiveId("")} onSegment={(value) => { setCustomers((rows) => setCustomerSegment(rows, active.id, value)); notify(active.name + " segmenti bu oturumda güncellendi."); }} />}
    </div>
  );
}

function SellerDetailContent({ seller, note, setNote, onDecision, onClose }) {
  const review = calculateSellerReviewPriority(seller);
  const verification = seller.verification && typeof seller.verification === "object" ? seller.verification : {};
  const documents = verification.documents && typeof verification.documents === "object" ? verification.documents : {};
  const approvalHelpId = `seller-approval-help-${seller.id}`;
  const documentLabels = { tax: "Vergi levhası", signature: "İmza sirküleri", agreement: "Mesafeli satış sözleşmesi", license: "Kategori / marka belgesi" };
  const verificationLabels = { verified: "Örnek doğrulandı", missing: "Eksik", expired: "Süresi geçmiş", "not-required": "Gerekmiyor" };
  return (
    <>
      <header className="detail-panel-header">
        <div><span className="eyebrow">{seller.id}</span><h3>{seller.name}</h3></div>
        <div className="detail-heading-actions"><Status>{seller.status}</Status>{onClose && <button className="icon-button" onClick={onClose} aria-label="Satıcı ayrıntısını kapat"><Icon name="close" /></button>}</div>
      </header>
      <div className="detail-panel-body">
        <div className="detail-hero"><span className="avatar">{seller.name.split(" ").map((word) => word[0]).join("")}</span><div><strong>{seller.owner}</strong><small>Örnek şirket yetkilisi · doğrulama simülasyonu</small></div></div>
        <dl className="detail-list"><div><dt>Kategori</dt><dd>{seller.category}</dd></div><div><dt>Planlanan ürün</dt><dd>{seller.products}</dd></div><div><dt>Komisyon teklifi</dt><dd>{seller.commission}</dd></div><div><dt>İnceleme önceliği</dt><dd><Status>{review.level}</Status> <strong>{review.score}/100</strong></dd></div></dl>
        <section className="review-disclosure" aria-label="Örnek inceleme önceliği açıklaması">
          <header><div><span className="eyebrow">Otomatik karar değildir</span><h4>Neden {review.level.toLocaleLowerCase("tr-TR")}?</h4></div><span className="ruleset-badge">{review.ruleset}</span></header>
          <p>Bu deterministik demo skoru yalnız başvuru inceleme sırasını açıklar; dolandırıcılık tespiti, otomatik onay veya otomatik red üretmez. İsim, yetkili, komisyon ve ürün sayısı puana girmez.</p>
          <div className="review-reasons">
            {review.reasons.map((reason) => <div key={reason.code}><span><strong>{reason.label}</strong><small>{reason.status}</small></span><b>{reason.points > 0 ? `+${reason.points}` : "0"} / {reason.maxPoints}</b></div>)}
          </div>
          <footer><span>Veri tamlığı %{review.completeness}</span><strong>Toplam {review.score}/100</strong></footer>
          <p className="review-thresholds">Bantlar: 0–19 Rutin · 20–49 İnceleme gerekli · 50–100 Öncelikli. Şirket 30, banka 25, belgeler 20, izin 15 ve yinelenen başvuru 10 puana kadar katkı verir.</p>
        </section>
        {review.approvalBlockers.length > 0 && <section className="notice-card warning-card"><Icon name="warning" /><div><strong>Onboarding onayı için tamamlanmalı</strong><ul>{review.approvalBlockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul></div></section>}
        {review.hardStops.length > 0 && <section className="notice-card danger-card"><Icon name="shield" /><div><strong>Kritik doğrulama engeli</strong><ul>{review.hardStops.map((stop) => <li key={stop}>{stop}</li>)}</ul></div></section>}
        {seller.decisionReason && <section className="notice-card"><Icon name="info" /><div><strong>Son karar gerekçesi</strong><p>{seller.decisionReason}</p></div></section>}
        <section><h4>Kaynak doğrulamalar</h4>{sellerRequiredDocumentKeys.map((key) => { const value = documents[key]; const complete = isSellerDocumentComplete(key, value); const valid = isSellerDocumentStateValid(key, value); return <div className="check-line" key={key}><Icon name={complete ? "check" : "warning"} /><span>{documentLabels[key] || key}</span><small>{valid ? verificationLabels[value] : value === "not-required" ? "Geçersiz muafiyet" : "Kaynak verisi eksik"}</small></div>; })}<div className="check-line"><Icon name={verification.bank === "verified" ? "check" : "warning"} /><span>Banka hesabı sahipliği</span><small>{verification.bank === "verified" ? "Örnek doğrulandı" : verification.bank === "pending" ? "Doğrulama bekliyor" : verification.bank === "mismatch" ? "Uyuşmazlık" : "Kaynak verisi eksik"}</small></div></section>
        <label className="note-field"><span>İnceleme notu</span><textarea value={note || ""} onChange={(event) => setNote(event.target.value)} placeholder="Önizleme için bir not ekleyin…" /><small>Yalnız bu oturumda korunur.</small></label>
      </div>
      <footer className="seller-decision-footer">
        {!review.approvalEligible && <p id={approvalHelpId}>Şirket onboarding onayı, yukarıdaki doğrulamalar tamamlanana kadar kapalıdır.</p>}
        <button className="danger-button" onClick={() => onDecision("Reddedildi")} disabled={seller.status === "Reddedildi"} data-testid="seller-reject">Red akışı</button>
        <button className="primary-button" onClick={() => review.approvalEligible && seller.status !== "Onaylandı" && onDecision("Onaylandı")} aria-disabled={seller.status === "Onaylandı" || !review.approvalEligible} aria-describedby={!review.approvalEligible ? approvalHelpId : undefined} data-testid="seller-approve">Şirket onboarding onayı</button>
      </footer>
    </>
  );
}

function Sellers({ sellers, setSellers, notes, setNotes, mobile, initialSellerId, draftInvites, notify }) {
  const [activeId, setActiveId] = useState(initialSellerId || (mobile ? "" : sellers[0]?.id || ""));
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState({ priority: "Tümü", category: "Tümü", status: "Tümü" });
  const [pendingDecision, setPendingDecision] = useState(null);
  const [reason, setReason] = useState("");
  const [decisionError, setDecisionError] = useState("");
  const seller = sellers.find((item) => item.id === activeId);
  const decisionSeller = sellers.find((item) => item.id === pendingDecision?.sellerId);
  const decisionReview = decisionSeller ? calculateSellerReviewPriority(decisionSeller) : null;
  const visible = sellers.filter((item) => (
    (filters.priority === "Tümü" || calculateSellerReviewPriority(item).level === filters.priority)
    && (filters.category === "Tümü" || item.category === filters.category)
    && (filters.status === "Tümü" || item.status === filters.status)
  ));

  useEffect(() => {
    setActiveId(initialSellerId || (mobile ? "" : sellerApplicationRecords[0]?.id || ""));
  }, [mobile, initialSellerId]);

  useEffect(() => {
    if (activeId && !visible.some((item) => item.id === activeId)) {
      setActiveId(mobile ? "" : visible[0]?.id || "");
    }
  }, [activeId, filters.priority, filters.category, filters.status, mobile, sellers]);

  const decide = () => {
    if (!pendingDecision || !decisionSeller) {
      setPendingDecision(null);
      return;
    }
    if (pendingDecision.status === "Onaylandı" && !decisionReview?.approvalEligible) {
      setDecisionError("Onboarding onayı için tüm zorunlu doğrulamalar tamamlanmalıdır.");
      return;
    }
    if (pendingDecision.status === "Reddedildi" && reason.trim().length < 5) {
      setDecisionError("Red gerekçesi en az 5 karakter olmalıdır.");
      return;
    }
    setSellers((rows) => setSellerDecision(rows, decisionSeller.id, pendingDecision.status, reason));
    notify(decisionSeller.name + " durumu önizlemede “" + pendingDecision.status + "” oldu.");
    setPendingDecision(null);
    setReason("");
    setDecisionError("");
  };

  const detailContent = seller && (
    <SellerDetailContent
      seller={seller}
      note={notes[seller.id]}
      setNote={(value) => setNotes({ ...notes, [seller.id]: value })}
      onDecision={(value) => { setPendingDecision({ sellerId: seller.id, status: value }); setReason(""); setDecisionError(""); }}
      onClose={null}
    />
  );

  return (
    <div className="workspace split-workspace">
      <div className="split-main">
        <div className="workspace-heading">
          <div><span className="eyebrow">Şirket onboarding · hedef pazaryeri simülasyonu</span><h2 tabIndex="-1">Satıcı Başvuruları</h2><p>Bu karar şirket, KYC, sözleşme ve banka hesabı onboarding'i içindir; satıcının her ürünü için izin değildir.{draftInvites.length > 0 ? " " + draftInvites.length + " gönderilmemiş yerel davet taslağı bulunuyor." : ""}</p></div>
          <button className="secondary-button" aria-expanded={filtersOpen} onClick={() => setFiltersOpen(!filtersOpen)}><Icon name="filter" />Gelişmiş filtre</button>
        </div>
        <MarketplaceScopeNotice>Satıcı başvurusu ve inceleme önceliği hedef iş akışıdır. Gerçek KYC, seller organization, üyelik/RBAC ve belge servisi mevcut backend'e henüz uygulanmamıştır.</MarketplaceScopeNotice>
        {filtersOpen && (
          <section className="filter-panel" aria-label="Satıcı filtreleri">
            <label>İnceleme önceliği<select value={filters.priority} onChange={(event) => setFilters({ ...filters, priority: event.target.value })}><option>Tümü</option><option>Rutin</option><option>İnceleme gerekli</option><option>Öncelikli</option><option>Eksik veri</option></select></label>
            <label>Kategori<select value={filters.category} onChange={(event) => setFilters({ ...filters, category: event.target.value })}><option>Tümü</option>{Array.from(new Set(sellers.map((item) => item.category))).map((item) => <option key={item}>{item}</option>)}</select></label>
            <label>Durum<select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}><option>Tümü</option>{Array.from(new Set(sellers.map((item) => item.status))).map((item) => <option key={item}>{item}</option>)}</select></label>
            <button className="secondary-button small" onClick={() => setFilters({ priority: "Tümü", category: "Tümü", status: "Tümü" })}>Temizle</button>
          </section>
        )}
        <section className="table-card">
          <header className="card-header"><div><h3>Örnek şirket onboarding kuyruğu</h3><p>Şeffaf sinyaller yalnız inceleme sırasını önerir; otomatik karar vermez</p></div></header>
          <div className="table-scroll table-scroll-hint" tabIndex="0" aria-label="Satıcı başvuruları tablosu, yatay kaydırılabilir">
            <table className="data-table">
              <caption className="sr-only">Filtrelenmiş örnek satıcı başvuruları</caption>
              <thead><tr><th scope="col">Başvuru</th><th scope="col">Yetkili</th><th scope="col">Kategori</th><th scope="col">Ürün</th><th scope="col">Komisyon</th><th scope="col">İnceleme önceliği</th><th scope="col">Durum</th></tr></thead>
              <tbody>
                {visible.map((item) => {
                  const itemReview = calculateSellerReviewPriority(item);
                  return (
                  <tr key={item.id} className={activeId === item.id ? "selected-row" : ""} onClick={() => setActiveId(item.id)} data-testid={"seller-row-" + item.id}>
                    <td><button className="row-entity-button" onClick={(event) => { event.stopPropagation(); setActiveId(item.id); }} aria-label={item.name + " başvurusunu incele"}><strong>{item.name}</strong><small>{item.id}</small></button></td>
                    <td>{item.owner}</td><td>{item.category}</td><td>{item.products}</td><td>{item.commission}</td><td><Status>{itemReview.level}</Status><small className="block-note">{itemReview.score}/100 · %{itemReview.completeness} tam</small></td><td><Status>{item.status}</Status></td>
                  </tr>
                  );
                })}
                {visible.length === 0 && <EmptyTable colSpan={7} title="Satıcı başvurusu bulunamadı" onReset={() => setFilters({ priority: "Tümü", category: "Tümü", status: "Tümü" })} />}
              </tbody>
            </table>
          </div>
        </section>
      </div>
      {!mobile && seller && <aside className="detail-panel" role="complementary" aria-label={seller.name + " ayrıntısı"} data-testid="seller-detail">{detailContent}</aside>}
      {mobile && seller && <Modal title="Satıcı başvurusu" onClose={() => setActiveId("")} wide testId="seller-detail" cardClass="seller-detail-modal">{detailContent}</Modal>}
      {pendingDecision && decisionSeller && (
        <Modal title={pendingDecision.status === "Onaylandı" ? "Onay etkisini doğrula" : "Red etkisini doğrula"} onClose={() => setPendingDecision(null)} testId="confirmation-dialog">
          <div className="confirmation-body"><Icon name={pendingDecision.status === "Onaylandı" ? "check" : "warning"} /><p><strong>{decisionSeller.name}</strong> şirket onboarding kaydı “{pendingDecision.status}” olacak. Bu, ürün bazlı yayın izni değildir ve yalnız yerel örnek kaydı değiştirir; canlı satıcı erişimi açılmaz.</p></div>
          {pendingDecision.status === "Reddedildi" && <label className="form-field"><span>Red gerekçesi</span><textarea value={reason} onChange={(event) => { setReason(event.target.value); setDecisionError(""); }} aria-invalid={decisionError ? "true" : undefined} aria-describedby={decisionError ? "seller-decision-error" : undefined} data-autofocus />{decisionError && <small className="modal-error" id="seller-decision-error" role="alert">{decisionError}</small>}</label>}
          {pendingDecision.status === "Onaylandı" && <p className="form-hint modal-hint">Kural seti: {decisionReview.ruleset} · bu skor karar vermez; zorunlu doğrulamalar ayrı kapıdır.</p>}
          <footer className="modal-actions"><button className="secondary-button" onClick={() => setPendingDecision(null)}>İptal</button><button className={pendingDecision.status === "Onaylandı" ? "primary-button" : "danger-button"} onClick={decide}>Önizlemede uygula</button></footer>
        </Modal>
      )}
    </div>
  );
}

function SettlementDetail({ row, onClose, onPreview }) {
  return (
    <Modal title={"Hakediş " + row.id} onClose={onClose} wide testId="settlement-detail">
      <div className="detail-modal-body">
        <div className="detail-hero"><span className="avatar">{row.seller.split(" ").map((word) => word[0]).join("")}</span><div><strong>{row.seller}</strong><small>{row.period} · yerel örnek ledger</small></div></div>
        <dl className="detail-list detail-grid"><div><dt>Brüt satış</dt><dd>{money(row.gross)}</dd></div><div><dt>Komisyon</dt><dd>−{money(row.commission)}</dd></div><div><dt>İade</dt><dd>−{money(row.returns)}</dd></div><div><dt>Net hakediş</dt><dd><strong>{money(row.net)}</strong></dd></div></dl>
        <section className="notice-card"><Icon name="shield" /><div><strong>Güvenli önizleme sınırı</strong><p>Bu yüzey para transferi, banka talimatı veya canlı muhasebe kaydı üretmez.</p></div></section>
      </div>
      <footer className="modal-actions"><button className="secondary-button" onClick={onClose}>Kapat</button>{row.status === "Ödemeye hazır" && <button className="primary-button" onClick={onPreview}>Akışı önizle</button>}</footer>
    </Modal>
  );
}

function Finance({ rows, setRows, store, contextItem, notify }) {
  const [status, setStatus] = useState("Tüm durumlar");
  const [detailId, setDetailId] = useState("");
  const [confirmId, setConfirmId] = useState("");
  const scopedRows = rows.filter((row) => matchesStore(row, store));
  const visible = scopedRows.filter((row) => status === "Tüm durumlar" || row.status === status);
  const detail = rows.find((row) => row.id === detailId);
  const confirming = rows.find((row) => row.id === confirmId);

  const exportRows = () => {
    downloadCsv("novastore-hakedis-onizleme.csv", [
      { label: "Hakediş", value: "id" }, { label: "Satıcı", value: "seller" }, { label: "Dönem", value: "period" },
      { label: "Brüt", value: "gross" }, { label: "Komisyon", value: "commission" }, { label: "İade", value: "returns" },
      { label: "Net", value: "net" }, { label: "Durum", value: "status" },
    ], visible);
    notify(visible.length + " örnek hakediş CSV olarak indirildi.");
  };

  const previewSettlement = () => {
    setRows((all) => all.map((row) => row.id === confirmId ? { ...row, status: "Akış önizlendi" } : row));
    notify(confirmId + " için yalnız arayüz durumu değişti; finansal talep gönderilmedi.");
    setConfirmId("");
    setDetailId("");
  };

  return (
    <div className="workspace page-workspace">
      <div className="workspace-heading">
        <div><span className="eyebrow">Finans ve mutabakat · güvenli örnek</span><h2 tabIndex="-1">{contextItem === "Genel Bakış" ? "Finans Genel Bakış" : "Satıcı Hakedişleri"}</h2><p>Komisyon, iade ve durum anatomisini finansal işlem üretmeden inceleyin.</p></div>
        <button className="secondary-button" onClick={exportRows}><Icon name="download" />CSV indir</button>
      </div>
      <section className="kpi-grid compact"><Kpi label="Ödenecek net tutar" value={money(scopedRows.filter((row) => row.status === "Ödemeye hazır").reduce((sum, row) => sum + row.net, 0))} trend="Kapsamdaki örnek" /><Kpi label="Platform komisyonu" value={money(scopedRows.reduce((sum, row) => sum + row.commission, 0))} trend="Kapsamdaki toplam" /><Kpi label="Blokeli tutar" value={money(scopedRows.filter((row) => row.status === "Blokeli").reduce((sum, row) => sum + row.net, 0))} trend="İnceleme gerekli" tone="warning" /><Kpi label="Ödenmiş örnek" value={String(scopedRows.filter((row) => row.status === "Ödendi").length)} trend="Canlı veri değil" /></section>
      <section className="table-card" data-testid="finance-ledger">
        <header className="card-header"><div><h3>Hakediş takvimi</h3><p>Hiçbir finansal işlem kaydedilmez</p></div><div className="filter-toolbar"><select aria-label="Hakediş durumu" value={status} data-testid="finance-filter" onChange={(event) => setStatus(event.target.value)}><option>Tüm durumlar</option><option>Ödemeye hazır</option><option>Kontrol ediliyor</option><option>Blokeli</option><option>Ödendi</option><option>Akış önizlendi</option></select></div></header>
        <div className="table-scroll table-scroll-hint" tabIndex="0" aria-label="Hakediş tablosu, yatay kaydırılabilir">
          <table className="data-table">
            <caption className="sr-only">Filtrelenmiş örnek hakedişler</caption>
            <thead><tr><th scope="col">Hakediş</th><th scope="col">Satıcı</th><th scope="col">Dönem</th><th scope="col">Brüt satış</th><th scope="col">Komisyon</th><th scope="col">İade</th><th scope="col">Net hakediş</th><th scope="col">Durum</th><th scope="col">İşlem</th></tr></thead>
            <tbody>
              {visible.map((row) => <tr key={row.id} data-testid={"finance-row-" + row.id}><td><strong>{row.id}</strong></td><td>{row.seller}</td><td>{row.period}</td><td>{money(row.gross)}</td><td className="negative">−{money(row.commission)}</td><td className="negative">−{money(row.returns)}</td><td><strong>{money(row.net)}</strong></td><td><Status>{row.status}</Status></td><td><button className={row.status === "Ödemeye hazır" ? "primary-button small" : "secondary-button small"} onClick={() => row.status === "Ödemeye hazır" ? setConfirmId(row.id) : setDetailId(row.id)} data-testid={row.status === "Ödemeye hazır" ? "finance-settle" : undefined}>{row.status === "Ödemeye hazır" ? "Akışı önizle" : "İncele"}</button></td></tr>)}
              {visible.length === 0 && <EmptyTable colSpan={9} title="Bu filtrede hakediş yok" onReset={() => setStatus("Tüm durumlar")} />}
            </tbody>
          </table>
        </div>
      </section>
      {detail && <SettlementDetail row={detail} onClose={() => setDetailId("")} onPreview={() => { setDetailId(""); setConfirmId(detail.id); }} />}
      {confirming && (
        <Modal title="Hakediş akışını doğrula" onClose={() => setConfirmId("")} testId="confirmation-dialog">
          <div className="confirmation-body"><Icon name="warning" /><p><strong>{confirming.id}</strong> yalnız “Akış önizlendi” durumuna geçecek. Para transferi veya dış sistem çağrısı yapılmayacak.</p></div>
          <footer className="modal-actions"><button className="secondary-button" onClick={() => setConfirmId("")}>İptal</button><button className="primary-button" onClick={previewSettlement}>Yerelde uygula</button></footer>
        </Modal>
      )}
    </div>
  );
}

function Analytics({ contextItem, notify }) {
  const [period, setPeriod] = useState("Son 30 gün");
  const metrics = analyticsPeriods[period];
  const top = [["Apple iPhone 15 128 GB", 1248, 64884000, 82], ["NovaTech AeroBook 14", 864, 16415136, 64], ["NovaHome S10 Robot Süpürge", 622, 4975378, 48], ["Smartix Watch 2", 518, 1812482, 38]];
  const scaled = top.map(([name, orders, revenue, score]) => [name, Math.round(orders * metrics.multiplier), Math.round(revenue * metrics.multiplier), score]);
  const channelRows = [["NovaStore Web", 48, 6200000], ["NovaStore Mobil", 28, 3600000], ["Trendyol", 14, 1800000], ["Hepsiburada", 10, 1200000]];
  const funnelRows = [["Ürün görüntüleme", 412840, 100], ["Sepete ekleme", 46218, 68], ["Ödeme başlangıcı", 18664, 44], ["Sipariş", 15782, 36]];
  const exportRows = () => {
    downloadCsv("novastore-rapor-" + period.toLocaleLowerCase("tr-TR").replaceAll(" ", "-") + ".csv", [
      { label: "Ürün", value: (row) => row[0] }, { label: "Sipariş", value: (row) => row[1] },
      { label: "Net ciro", value: (row) => row[2] }, { label: "Katalog skoru", value: (row) => row[3] },
    ], scaled);
    notify(period + " örnek raporu CSV olarak indirildi.");
  };
  return (
    <div className="workspace page-workspace">
      <div className="workspace-heading">
        <div><span className="eyebrow">{contextItem} · örnek veri</span><h2 tabIndex="-1">Satış ve Dönüşüm</h2><p>Mağaza, satıcı ve ürün performansını seçili dönemle yeniden hesaplayın.</p></div>
        <div className="heading-actions"><select aria-label="Rapor dönemi" value={period} onChange={(event) => setPeriod(event.target.value)}>{Object.keys(analyticsPeriods).map((item) => <option key={item}>{item}</option>)}</select><button className="secondary-button" onClick={exportRows}><Icon name="download" />CSV indir</button></div>
      </div>
      <section className="kpi-grid"><Kpi label="Brüt ürün hacmi" value={metrics.gross} trend={period + " · örnek"} /><Kpi label="Net ciro" value={metrics.net} trend="Yerel hesaplama" /><Kpi label="Dönüşüm" value={metrics.conversion} trend="Örnek oran" /><Kpi label="Ort. sepet" value={metrics.basket} trend="Örnek değer" /></section>
      <section className="analytics-grid">
        <article className="module-card analytics-main"><header><div><span className="eyebrow">Kanal karşılaştırması</span><h3>Gelir katkısı</h3></div></header>{channelRows.map(([label, value, amount]) => <div className="metric-progress" key={label}><span>{label}</span><progress max="100" value={value} aria-label={label + " katkısı yüzde " + value} /><strong>{money(Math.round(amount * metrics.multiplier))}</strong></div>)}</article>
        <article className="module-card"><header><h3>Dönüşüm hunisi</h3></header>{funnelRows.map(([label, value, progress]) => <div className="funnel-row" key={label}><span>{label}</span><progress max="100" value={progress} aria-label={label + " yüzde " + progress} /><strong>{Math.round(value * metrics.multiplier).toLocaleString("tr-TR")}</strong></div>)}</article>
      </section>
      <section className="table-card">
        <header className="card-header"><div><h3>Ürün performansı</h3><p>{period} · ölçeklenmiş örnek veriler</p></div></header>
        <div className="table-scroll table-scroll-hint" tabIndex="0" aria-label="Ürün performansı tablosu, yatay kaydırılabilir"><table className="data-table"><caption className="sr-only">Örnek ürün performansı</caption><thead><tr><th scope="col">Ürün</th><th scope="col">Sipariş</th><th scope="col">Net ciro</th><th scope="col">Katalog skoru</th></tr></thead><tbody>{scaled.map(([name, orders, revenue, score]) => <tr key={name}><td><strong>{name}</strong></td><td>{orders.toLocaleString("tr-TR")}</td><td>{money(revenue)}</td><td><span className="score"><progress max="100" value={score} aria-label={name + " katalog skoru yüzde " + score} />%{score}</span></td></tr>)}</tbody></table></div>
      </section>
    </div>
  );
}

function Modules({ modules, setModules, roles, setRoles, contextItem, notify }) {
  const [activeRole, setActiveRole] = useState(roles[0]?.id || "");
  const [pendingModule, setPendingModule] = useState("");
  const [creatingRole, setCreatingRole] = useState(false);
  const currentRole = roles.find((role) => role.id === activeRole) || roles[0];
  const visibleModules = modules.filter((item) => contextItem !== "Etkin Modüller" || item.enabled);
  const roleModules = modules.filter((item) => currentRole?.moduleIds.includes(item.id));
  const target = modules.find((item) => item.id === pendingModule);

  const createRole = (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const label = String(new FormData(form).get("label") || "").trim();
    if (!label) return;
    const id = "role-" + Date.now();
    const initials = label.split(" ").map((part) => part[0]).join("").slice(0, 2).toLocaleUpperCase("tr-TR");
    const role = { id, initials, label, detail: "Yeni · oturum içi", moduleIds: modules.filter((item) => item.enabled).map((item) => item.id) };
    setRoles(roles.concat(role));
    setActiveRole(id);
    setCreatingRole(false);
    notify("“" + label + "” rol düzeni bu oturumda oluşturuldu.");
  };

  const applyToggle = () => {
    setModules((all) => toggleModuleAvailability(all, pendingModule));
    notify(target.name + " önizleme durumu değiştirildi.");
    setPendingModule("");
  };

  return (
    <div className="workspace page-workspace">
      <div className="workspace-heading">
        <div><span className="eyebrow">Kişiselleştirilebilir çalışma alanı · önizleme</span><h2 tabIndex="-1">{contextItem}</h2><p>{contextItem === "Rol Düzenleri" ? "Rol bazında görünür modül bileşimini inceleyin ve oturum içi bir düzen oluşturun." : "Modül bağımlılıklarını ve çalışma alanı genelindeki yerel kullanılabilirlik durumunu inceleyin."}</p></div>
        {contextItem === "Rol Düzenleri" && <button className="primary-button" onClick={() => setCreatingRole(true)}><Icon name="plus" />Rol düzeni oluştur</button>}
      </div>
      {contextItem === "Rol Düzenleri" ? (
        <>
          <section className="role-layouts" aria-label="Rol düzenleri">
            {roles.map((role) => <button key={role.id} className={activeRole === role.id ? "active" : ""} aria-pressed={activeRole === role.id} onClick={() => setActiveRole(role.id)}><span className="avatar">{role.initials}</span><span><strong>{role.label}</strong><small>{role.detail}</small></span></button>)}
          </section>
          <section className="table-card role-module-summary">
            <header className="card-header"><div><h3>{currentRole?.label} modül görünürlüğü</h3><p>Bu sözleşme rol bileşimini gösterir; gerçek RBAC yetkisi veya özellik bayrağı uygulanmaz.</p></div></header>
            <div className="role-module-list">
              {roleModules.map((item) => <div key={item.id}><span><strong>{item.name}</strong><small>{item.description}</small></span><Status>{item.enabled ? "Kullanılabilir" : "Genel olarak kapalı"}</Status></div>)}
            </div>
          </section>
        </>
      ) : (
        <>
          <section className="notice-card workspace-notice"><Icon name="info" /><div><strong>Çalışma alanı genelinde yerel durum</strong><p>Aşağıdaki anahtarlar seçili role üyelik eklemez; yalnız modülün bu önizleme oturumundaki genel kullanılabilirliğini değiştirir.</p></div></section>
          <section className="module-grid">
            {visibleModules.map((item) => (
              <article className={"module-option " + (item.enabled ? "enabled" : "")} key={item.id} data-testid={"module-" + item.id}>
                <div className="module-preview" data-testid="module-card"><Icon name={item.id.includes("seller") ? "user" : item.id.includes("settlement") ? "card" : "chart"} /></div>
                <div><h3>{item.name}</h3><p>{item.description}</p><dl className="module-meta"><div><dt>Demo sürümü</dt><dd>{item.version}</dd></div><div><dt>Bağımlılık</dt><dd>{item.dependency}</dd></div><div><dt>Önizleme durumu</dt><dd>{item.health}</dd></div></dl></div>
                <label className="switch" data-testid="module-toggle"><input type="checkbox" checked={item.enabled} onChange={() => setPendingModule(item.id)} aria-label={item.name + " modülünün genel önizleme durumunu " + (item.enabled ? "devre dışı bırak" : "etkinleştir")} data-testid={"module-toggle-" + item.id} /><span>{item.enabled ? "Etkin" : "Devre dışı"}</span></label>
              </article>
            ))}
            {visibleModules.length === 0 && <EmptyState title="Bu görünümde etkin modül yok" description="Modül Merkezi görünümünden bir modülü etkinleştirin." />}
          </section>
        </>
      )}
      {target && <Modal title="Modül etkisini doğrula" onClose={() => setPendingModule("")} testId="confirmation-dialog"><div className="confirmation-body"><Icon name="warning" /><p><strong>{target.name}</strong> yalnız bu önizleme oturumunda çalışma alanı genelinde {target.enabled ? "devre dışı" : "etkin"} görünecek. Rol üyeliği, gerçek özellik bayrağı veya veri dönüşümü değişmez.</p></div><dl className="detail-list"><div><dt>Bağımlılık</dt><dd>{target.dependency}</dd></div><div><dt>Sürüm</dt><dd>{target.version}</dd></div></dl><footer className="modal-actions"><button className="secondary-button" onClick={() => setPendingModule("")}>İptal</button><button className="primary-button" onClick={applyToggle}>Yerelde uygula</button></footer></Modal>}
      {creatingRole && <Modal title="Rol düzeni oluştur" onClose={() => setCreatingRole(false)}><form className="modal-form" onSubmit={createRole}><label><span>Rol adı</span><input name="label" required minLength="3" data-autofocus placeholder="Örn. Müşteri Deneyimi" /></label><p className="form-hint">Yeni düzen, şu anda etkin modüllerle yalnız bu oturumda oluşturulur.</p><footer><button type="button" className="secondary-button" onClick={() => setCreatingRole(false)}>İptal</button><button className="primary-button">Önizlemede oluştur</button></footer></form></Modal>}
    </div>
  );
}

function Audit({ contextItem, notify }) {
  const [query, setQuery] = useState("");
  const [source, setSource] = useState("Tümü");
  const visible = auditRecords.filter((row) => (source === "Tümü" || row.source === source) && matchesQuery(row, query));
  const exportRows = () => {
    downloadCsv("novastore-denetim-onizleme.csv", [
      { label: "Saat", value: "time" }, { label: "Aktör", value: "actor" }, { label: "İşlem", value: "action" },
      { label: "Hedef", value: "target" }, { label: "Kaynak", value: "source" },
    ], visible);
    notify(visible.length + " örnek denetim kaydı CSV olarak indirildi.");
  };

  if (contextItem === "Dışa Aktarımlar") {
    return (
      <div className="workspace page-workspace">
        <div className="workspace-heading"><div><span className="eyebrow">Yerel çıktı geçmişi</span><h2 tabIndex="-1">Dışa Aktarım Önizlemeleri</h2><p>Bu liste örnek çıktı sözleşmesini gösterir; sunucuda dosya tutulmaz.</p></div></div>
        <section className="table-card"><header className="card-header"><div><h3>Örnek çıktılar</h3><p>Gerçek arşiv entegrasyonda etkinleşir</p></div></header><div className="table-scroll table-scroll-hint" tabIndex="0" aria-label="Dışa aktarım tablosu, yatay kaydırılabilir"><table className="data-table"><caption className="sr-only">Örnek dışa aktarımlar</caption><thead><tr><th scope="col">Dosya</th><th scope="col">Alan</th><th scope="col">Kayıt</th><th scope="col">Oluşturan</th><th scope="col">Durum</th></tr></thead><tbody><tr><td><strong>siparis-onizleme.csv</strong></td><td>Operasyon</td><td>28</td><td>Demo Operatör A</td><td><Status>Örnek</Status></td></tr><tr><td><strong>musteri-onizleme.csv</strong></td><td>Müşteri</td><td>5</td><td>Demo Operatör B</td><td><Status>Örnek</Status></td></tr></tbody></table></div></section>
      </div>
    );
  }

  return (
    <div className="workspace page-workspace">
      <div className="workspace-heading"><div><span className="eyebrow">İzlenebilirlik · örnek veri</span><h2 tabIndex="-1">Denetim Kayıtları</h2><p>Gelecekteki yönetici ve sistem işlemlerinin kayıt anatomisini inceleyin.</p></div><button className="secondary-button" onClick={exportRows}><Icon name="download" />CSV indir</button></div>
      <section className="notice-card"><Icon name="shield" /><div><strong>Denetim tasarım sözleşmesi hazır</strong><p>Bu kayıtlar örnektir; canlı bütünlük veya entegrasyon durumu bildirmez.</p></div></section>
      <section className="table-card">
        <header className="card-header"><div><h3>Örnek işlem geçmişi</h3><p>Arama ve kaynak filtresi etkileşimlidir</p></div><div className="filter-toolbar"><label className="table-search"><Icon name="search" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Kullanıcı, kayıt veya işlem ara" aria-label="Denetim kayıtlarında ara" /></label><select aria-label="Denetim kaynağı" value={source} onChange={(event) => setSource(event.target.value)}><option>Tümü</option>{Array.from(new Set(auditRecords.map((row) => row.source))).map((item) => <option key={item}>{item}</option>)}</select></div></header>
        <div className="table-scroll table-scroll-hint" tabIndex="0" aria-label="Denetim kayıtları tablosu, yatay kaydırılabilir"><table className="data-table"><caption className="sr-only">Filtrelenmiş örnek denetim kayıtları</caption><thead><tr><th scope="col">Saat</th><th scope="col">Aktör</th><th scope="col">İşlem</th><th scope="col">Hedef</th><th scope="col">Kaynak</th><th scope="col">Sonuç</th></tr></thead><tbody>{visible.map((row) => <tr key={row.time + row.target}><td>{row.time}</td><td><strong>{row.actor}</strong></td><td>{row.action}</td><td>{row.target}</td><td>{row.source}</td><td><Status>Örnek</Status></td></tr>)}{visible.length === 0 && <EmptyTable colSpan={6} title="Denetim kaydı bulunamadı" onReset={() => { setQuery(""); setSource("Tümü"); }} />}</tbody></table></div>
      </section>
    </div>
  );
}

function Settings({ saved, setSaved, contextItem, notify }) {
  const [form, setForm] = useState(saved);
  const [error, setError] = useState("");
  const notificationRef = useRef(null);
  const dirty = JSON.stringify(form) !== JSON.stringify(saved);
  const field = (key, value) => setForm({ ...form, [key]: value });

  useEffect(() => {
    setForm(saved);
  }, [saved]);

  useEffect(() => {
    if (contextItem === "Bildirimler") notificationRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [contextItem]);

  const submit = (event) => {
    event.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      setError("Geçerli bir operasyon e-postası girin.");
      return;
    }
    setSaved(form);
    setError("");
    notify("Ayar snapshot’ı yalnız bu önizleme oturumunda kaydedildi.");
  };

  return (
    <div className="workspace page-workspace settings-page">
      <div className="workspace-heading"><div><span className="eyebrow">Çalışma alanı ayarları · önizleme</span><h2 tabIndex="-1">Genel Ayarlar</h2><p>Marka, kapsam ve bildirim varsayılanlarının kontrollü form davranışını inceleyin.</p></div>{dirty && <Status>Kaydedilmemiş</Status>}</div>
      <form onSubmit={submit}>
        <section className="form-card">
          <header><h3>Mağaza bilgileri</h3><p>Bu alanlar canlı sisteme gönderilmez.</p></header>
          <div className="form-grid">
            <label><span>Çalışma alanı adı</span><input value={form.name} onChange={(event) => field("name", event.target.value)} required minLength="3" /></label>
            <label><span>Operasyon e-postası</span><input type="email" value={form.email} onChange={(event) => { field("email", event.target.value); setError(""); }} aria-invalid={error ? "true" : undefined} aria-describedby={error ? "settings-email-error" : undefined} />{error && <small className="modal-error" id="settings-email-error" role="alert">{error}</small>}</label>
            <label><span>Saat dilimi</span><select value={form.timezone} onChange={(event) => field("timezone", event.target.value)}><option>Europe/Istanbul</option><option>Europe/Berlin</option></select></label>
            <label><span>Varsayılan mağaza kapsamı</span><select value={form.store} onChange={(event) => field("store", event.target.value)}><option>Tüm Mağazalar · 24</option><option>NovaStore</option><option>Demo Teknoloji · 2 mağaza</option><option>Demo Ev</option></select></label>
          </div>
        </section>
        <section className="form-card" ref={notificationRef}>
          <header><h3>İş akışı bildirimleri</h3><p>Yalnızca yerel form durumu değişir.</p></header>
          {[["approval", "Yeni satıcı başvuruları", "Başvuru ve belge değişikliklerini bildir"], ["settlement", "Hakediş riskleri", "Bloke ve mutabakat kayıtlarını bildir"], ["digest", "Günlük yönetici özeti", "Her gün saat 09:00’da özet göster"]].map(([key, title, description]) => <label className="setting-toggle" key={key}><span><strong>{title}</strong><small>{description}</small></span><input type="checkbox" checked={form[key]} onChange={(event) => field(key, event.target.checked)} /></label>)}
        </section>
        <footer className="form-actions"><span className="form-hint">{dirty ? "Yerel değişiklikler henüz kaydedilmedi." : "Kaydedilen yerel snapshot gösteriliyor."}</span><button type="button" className="secondary-button" disabled={!dirty} onClick={() => { setForm(saved); setError(""); notify("Değişiklikler son kaydedilen snapshot’a döndürüldü."); }}>Değişiklikleri iptal et</button><button className="primary-button" disabled={!dirty}>Önizlemede kaydet</button></footer>
      </form>
    </div>
  );
}

function CommandPalette({ onClose, run, orders, products, sellers, customers }) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const listId = useId();
  const commands = useMemo(() => [
    ...domains.map((item) => ({ id: "domain-" + item.id, label: item.label + " çalışma alanına git", section: item.id, icon: item.icon, kind: "navigate" })),
    { id: "create-product", label: "NovaStore katalog kaydı oluştur", section: "catalog", icon: "plus", kind: "product-create" },
    ...orders.map((item) => ({ id: "order-" + item.id, label: item.id + " · " + item.customer, section: "operations", icon: "orders", kind: "order", entityId: item.id })),
    ...products.map((item) => ({ id: "product-" + item.offerId, label: item.offerId + " · " + item.seller + " · " + item.sku + " · " + item.name, section: "catalog", icon: "package", kind: "product", entityId: item.offerId })),
    ...sellers.map((item) => ({ id: "seller-" + item.id, label: item.id + " · " + item.name, section: "sellers", icon: "user", kind: "seller", entityId: item.id })),
    ...customers.map((item) => ({ id: "customer-" + item.id, label: item.id + " · " + item.name, section: "customers", icon: "user", kind: "customer", entityId: item.id })),
  ], [orders, products, sellers, customers]);
  const filtered = commands.filter((item) => matchesQuery(item, query)).slice(0, 12);
  const safeIndex = Math.min(activeIndex, Math.max(0, filtered.length - 1));

  const execute = (item) => {
    if (!item) return;
    run(item);
  };

  return (
    <Modal title="Komut paleti" onClose={onClose} wide>
      <div className="command-input">
        <Icon name="search" />
        <label className="sr-only" htmlFor={listId + "-input"}>Sayfa, kayıt veya komut ara</label>
        <input
          id={listId + "-input"}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded="true"
          aria-controls={listId}
          aria-activedescendant={filtered[safeIndex] ? listId + "-" + filtered[safeIndex].id : undefined}
          value={query}
          onChange={(event) => { setQuery(event.target.value); setActiveIndex(0); }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") { event.preventDefault(); setActiveIndex(Math.min(safeIndex + 1, filtered.length - 1)); }
            if (event.key === "ArrowUp") { event.preventDefault(); setActiveIndex(Math.max(safeIndex - 1, 0)); }
            if (event.key === "Enter") { event.preventDefault(); execute(filtered[safeIndex]); }
          }}
          placeholder="Sayfa, kayıt veya komut ara…"
          data-autofocus
        />
      </div>
      <div className="command-count" role="status">{filtered.length} sonuç</div>
      <div className="command-results" id={listId} role="listbox">
        {filtered.map((item, index) => <button id={listId + "-" + item.id} role="option" aria-selected={safeIndex === index} className={safeIndex === index ? "active" : ""} key={item.id} onMouseEnter={() => setActiveIndex(index)} onClick={() => execute(item)}><Icon name={item.icon} /><span>{item.label}</span><kbd>↵</kbd></button>)}
        {filtered.length === 0 && <div className="empty-inline">Eşleşen komut bulunamadı.</div>}
      </div>
    </Modal>
  );
}

function ProductDialog({ product, products, onClose, onSave }) {
  const [draft, setDraft] = useState(product || { name: "", seller: "NovaStore", category: "Elektronik", sku: "NVS-", price: "", stock: "", policyContext: { sellerStatus: "active", categoryAllowed: true, requiredFieldsComplete: true, brandAuthorizationStatus: "not_required", canonicalMatchConfidence: 1, prohibitedContent: false, priceAnomaly: false } });
  const [error, setError] = useState("");
  const externalOffer = Boolean(product && !isFirstPartyOffer(product));
  const policyPreview = evaluateProductPublication(draft);
  const inventoryPreview = getInventoryStatus(draft.stock);
  const field = (key, value) => setDraft({ ...draft, [key]: value });
  const submit = (event) => {
    event.preventDefault();
    const issue = validateProductDraft(draft, products, product?.offerId || "");
    if (issue) {
      setError(issue);
      return;
    }
    onSave(productFromDraft(draft, product), product?.offerId || "");
  };
  return (
    <Modal title={externalOffer ? "Satıcı teklifini incele" : product ? "NovaStore katalog kaydını düzenle" : "NovaStore katalog kaydı"} onClose={onClose} wide testId="product-dialog">
      <form className="modal-form two-column" onSubmit={submit}>
        <section className="form-span ownership-notice" role="note">
          <Icon name={externalOffer ? "shield" : "info"} />
          <div><strong>{externalOffer ? "Satıcıya ait teklif alanları korunur" : "Birinci taraf NovaStore kaydı"}</strong><p>{externalOffer ? "Platform yöneticisi kanonik ad ve kategoriyi inceleyebilir; satıcı SKU, fiyat ve stok alanlarını sessizce değiştiremez. Gerçek override ayrı gerekçe ve audit ister." : "Bu hızlı form yalnız NovaStore'un kendi katalog kaydını oluşturur. Haricî satıcı ürünleri gelecekte satıcı portalından gelir ve normal şartlarda otomatik politika kontrolünden geçer."}</p></div>
        </section>
        <label><span>Ürün adı</span><input value={draft.name} onChange={(event) => { field("name", event.target.value); setError(""); }} required minLength="3" data-autofocus /></label>
        <label><span>Teklif sahibi</span><input value={draft.seller || "NovaStore"} readOnly aria-readonly="true" /></label>
        <label><span>Kategori</span><select value={draft.category} onChange={(event) => field("category", event.target.value)}><option>Elektronik</option><option>Cep Telefonu</option><option>Dizüstü Bilgisayar</option><option>Elektrikli Ev Aleti</option><option>Akıllı Saat</option><option>Ev & Yaşam</option><option>Ev Tekstili</option></select></label>
        <label><span>Satıcı SKU</span><input value={draft.sku} onChange={(event) => { field("sku", event.target.value); setError(""); }} required readOnly={externalOffer} aria-readonly={externalOffer ? "true" : undefined} aria-invalid={error ? "true" : undefined} aria-describedby={error ? "product-error" : undefined} /></label>
        <label><span>Satış fiyatı</span><input type="number" min="1" value={draft.price} onChange={(event) => { field("price", event.target.value); setError(""); }} required readOnly={externalOffer} aria-readonly={externalOffer ? "true" : undefined} /></label>
        <label><span>Stok</span><input type="number" min="0" step="1" value={draft.stock} onChange={(event) => { field("stock", event.target.value); setError(""); }} required readOnly={externalOffer} aria-readonly={externalOffer ? "true" : undefined} /></label>
        <section className="form-span policy-result" aria-label="Otomatik politika sonucu">
          <div><span>Yayın sonucu</span><Status>{policyPreview.publicationStatus}</Status></div>
          <div><span>Stok sağlığı</span><Status>{inventoryPreview}</Status></div>
          <div><span>Kural sürümü</span><strong>{policyPreview.policyVersion}</strong></div>
          <div><span>Örnek değerlendirme</span><strong>{new Date(policyPreview.evaluatedAt).toLocaleString("tr-TR")}</strong></div>
          {policyPreview.reasons.length > 0 && <ul>{policyPreview.reasons.map((reason) => <li key={reason.code}><strong>{reason.label}</strong><small>{reason.action} · {reason.code}</small></li>)}</ul>}
          {policyPreview.reasons.length === 0 && <p>Aktif ve uygun teklif varsayımında insan onayı olmadan otomatik yayınlanır.</p>}
        </section>
        {error && <p className="modal-error form-span" id="product-error" role="alert">{error}</p>}
        <footer><button type="button" className="secondary-button" onClick={onClose}>İptal</button><button className="primary-button">{externalOffer ? "Kanonik içeriği uygula" : product ? "Değişiklikleri uygula" : "Önizlemede oluştur"}</button></footer>
      </form>
    </Modal>
  );
}

function SimpleFormDialog({ type, onClose, onSave }) {
  const isInvite = type === "seller-invite";
  return (
    <Modal title={isInvite ? "Satıcı daveti taslağı" : "Koleksiyon taslağı"} onClose={onClose}>
      <form className="modal-form" onSubmit={(event) => {
        event.preventDefault();
        const values = Object.fromEntries(new FormData(event.currentTarget).entries());
        onSave(values);
      }}>
        {isInvite ? (
          <>
            <label><span>Mağaza adı</span><input name="store" required minLength="3" data-autofocus /></label>
            <label><span>Yetkili e-postası</span><input name="email" type="email" required /></label>
            <p className="form-hint">Gerçek davet e-postası entegrasyon aşamasında etkinleşir.</p>
          </>
        ) : (
          <>
            <label><span>Koleksiyon adı</span><input name="name" required minLength="3" data-autofocus /></label>
            <label><span>Vitrin konumu</span><select name="placement"><option>Ana sayfa</option><option>Kategori vitrini</option></select></label>
            <p className="form-hint">Taslak bu sayfa yenilendiğinde sıfırlanır.</p>
          </>
        )}
        <footer><button type="button" className="secondary-button" onClick={onClose}>İptal</button><button className="primary-button">Yerel taslak oluştur</button></footer>
      </form>
    </Modal>
  );
}

export function App() {
  const [generation, setGeneration] = useState(0);
  const [mobile, setMobile] = useState(() => window.innerWidth <= 760);
  const [compact, setCompact] = useState(() => window.innerWidth <= 1279);
  const [domain, setDomain] = useState("operations");
  const [contextOpen, setContextOpen] = useState(() => window.innerWidth > 760);
  const [store, setStore] = useState("Tüm Mağazalar · 24");
  const [dateRange, setDateRange] = useState("7 Tem 2026 – 13 Tem 2026");
  const [orders, setOrders] = useState(() => orderRecords.map((item) => ({ ...item })));
  const [products, setProducts] = useState(() => productRecords.map((item) => ({ ...item })));
  const [customers, setCustomers] = useState(() => customerRecords.map((item) => ({ ...item })));
  const [sellers, setSellers] = useState(() => sellerApplicationRecords.map((item) => ({ ...item })));
  const [sellerNotes, setSellerNotes] = useState({});
  const [settlements, setSettlements] = useState(() => settlementRecords.map((item) => ({ ...item })));
  const [modules, setModules] = useState(() => moduleRecords.map((item) => ({ ...item })));
  const [roles, setRoles] = useState(() => roleSeed.map((item) => ({ ...item, moduleIds: item.moduleIds.slice() })));
  const [settings, setSettings] = useState({ ...initialWorkspaceSettings });
  const [notifications, setNotifications] = useState(() => notificationRows.map((item) => ({ ...item })));
  const [quickDrafts, setQuickDrafts] = useState({ sellerInvites: [], collections: [] });
  const [selected, setSelected] = useState([]);
  const [currentId, setCurrentId] = useState("");
  const [filter, setFilter] = useState({ status: "Tümü", query: "" });
  const [tab, setTab] = useState("orders");
  const [editingLayout, setEditingLayout] = useState(false);
  const [orderNotes, setOrderNotes] = useState({});
  const [operationPanels, setOperationPanels] = useState({ revenue: true, distribution: true });
  const [savedViews, setSavedViews] = useState(() => savedViewSeed.map((item) => ({ ...item })));
  const [activeView, setActiveView] = useState("Tüm siparişler");
  const [contextItem, setContextItem] = useState("Siparişler");
  const [entityFocus, setEntityFocus] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [saveViewError, setSaveViewError] = useState("");
  const [toast, setToast] = useState("");
  const toastTimerRef = useRef(null);
  const returnFocus = useRef(null);
  const contextPanelRef = useRef(null);
  const contextToggleRef = useRef(null);
  const headingRef = useRef(null);

  const notify = (message) => {
    setToast(message);
    window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(""), 5500);
  };

  const openDialog = (type, data = {}) => {
    returnFocus.current = document.activeElement;
    if (type === "save-view") setSaveViewError("");
    setDialog({ type, data });
  };

  const closeDialog = () => {
    setDialog(null);
    setSaveViewError("");
    requestAnimationFrame(() => returnFocus.current?.focus?.());
  };

  const navigate = (next, requestedItem) => {
    setDomain(next);
    const defaultItem = requestedItem || (next === "operations" ? "Siparişler" : contextByDomain[next]?.find((item) => !item.disabled)?.label || "");
    setContextItem(defaultItem);
    setEntityFocus(null);
    setSelected([]);
    setCurrentId("");
    if (next === "operations") setTab(defaultItem === "İadeler" ? "returns" : "orders");
    if (mobile) setContextOpen(false);
    requestAnimationFrame(() => headingRef.current?.querySelector("h2")?.focus());
  };

  const closeContext = () => {
    setContextOpen(false);
    requestAnimationFrame(() => contextToggleRef.current?.focus?.());
  };

  const toggleContext = () => {
    if (contextOpen) {
      closeContext();
    } else {
      setCurrentId("");
      setContextOpen(true);
      requestAnimationFrame(() => contextPanelRef.current?.focus?.());
    }
  };

  const setStoreScope = (next) => {
    setStore(next);
    setSelected([]);
    setCurrentId("");
    notify("“" + next + "” mağaza kapsamı yerel veriye uygulandı.");
  };

  const applyView = (view) => {
    if (!view) return;
    setActiveView(view.name);
    setFilter({ status: view.status, query: view.query || "" });
    setTab("orders");
    setDomain("operations");
    setContextItem("Siparişler");
    setCurrentId("");
    setSelected([]);
    if (mobile) {
      setContextOpen(false);
      requestAnimationFrame(() => headingRef.current?.querySelector("h2")?.focus());
    }
    notify("“" + view.name + "” örnek görünümü uygulandı.");
  };

  const saveView = (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const name = String(formData.get("name") || "").trim();
    const scope = String(formData.get("scope") || "Yalnızca ben");
    const nameInput = form.elements.namedItem("name");
    if (!name) {
      setSaveViewError("Görünüm adı boş bırakılamaz.");
      nameInput?.focus();
      return;
    }
    const normalizedName = name.toLocaleLowerCase("tr-TR");
    if (savedViews.some((view) => view.name.toLocaleLowerCase("tr-TR") === normalizedName)) {
      setSaveViewError("Bu adla bir görünüm zaten var.");
      nameInput?.focus();
      return;
    }
    setSavedViews(savedViews.concat({ name, status: filter.status, query: filter.query, scope }));
    setActiveView(name);
    closeDialog();
    notify("“" + name + "” görünümü yalnız bu önizleme oturumunda kaydedildi.");
  };

  const selectContextItem = (item) => {
    if (item.disabled) return;
    if (item.route) {
      navigate(item.route, item.routeItem);
      return;
    }
    setContextItem(item.label);
    const opensHealth = domain === "dashboard" && item.label === "Mağaza Sağlığı";
    if (domain === "operations") {
      if (item.label === "Bugün") {
        setFilter({ status: "Tümü", query: "" });
        setActiveView("");
        setTab("orders");
        setSelected([]);
        setCurrentId("");
      } else if (item.label === "Siparişler") {
        setTab("orders");
      } else if (item.label === "İadeler") {
        setTab("returns");
      }
    }
    if (mobile) {
      setContextOpen(false);
      requestAnimationFrame(() => {
        headingRef.current?.querySelector("h2")?.focus();
        if (opensHealth) openDialog("health");
      });
    } else if (opensHealth) {
      openDialog("health");
    }
  };

  const runCommand = (command) => {
    closeDialog();
    if (["order", "seller", "customer"].includes(command.kind)) {
      setGeneration((value) => value + 1);
    }
    if (command.kind === "product-create") {
      navigate("catalog", "Kanonik Katalog");
      requestAnimationFrame(() => openDialog("product", {}));
      return;
    }
    navigate(command.section);
    if (command.kind === "order") {
      setStore("Tüm Mağazalar · 24");
      setFilter({ status: "Tümü", query: "" });
      setActiveView("");
      setContextItem("Siparişler");
      setTab("orders");
      setEntityFocus({ kind: "order", id: command.entityId });
    } else if (command.kind === "product") {
      setStore("Tüm Mağazalar · 24");
      const product = products.find((item) => item.offerId === command.entityId);
      requestAnimationFrame(() => openDialog("product", { product }));
    } else if (command.kind === "seller" || command.kind === "customer") {
      setEntityFocus({ kind: command.kind, id: command.entityId });
    }
  };

  const saveProduct = (nextProduct, editingOfferId) => {
    setProducts((rows) => upsertProductOffer(rows, nextProduct, editingOfferId));
    closeDialog();
    notify(nextProduct.name + (editingOfferId ? " kanonik içeriği güncellendi." : " yerel kataloğa eklendi."));
  };

  const assignOwner = (event) => {
    event.preventDefault();
    const owner = String(new FormData(event.currentTarget).get("owner") || "");
    const ids = new Set(dialog.data.ids || []);
    setOrders((rows) => setOrderOwner(rows, ids, owner));
    setSelected([]);
    closeDialog();
    notify(ids.size + " görünür sipariş “" + owner + "” sahibine atandı.");
  };

  const resetPreview = () => {
    setDomain("operations");
    setContextItem("Siparişler");
    setStore("Tüm Mağazalar · 24");
    setDateRange("7 Tem 2026 – 13 Tem 2026");
    setOrders(orderRecords.map((item) => ({ ...item })));
    setProducts(productRecords.map((item) => ({ ...item })));
    setCustomers(customerRecords.map((item) => ({ ...item })));
    setSellers(sellerApplicationRecords.map((item) => ({ ...item })));
    setSellerNotes({});
    setSettlements(settlementRecords.map((item) => ({ ...item })));
    setModules(moduleRecords.map((item) => ({ ...item })));
    setRoles(roleSeed.map((item) => ({ ...item, moduleIds: item.moduleIds.slice() })));
    setSettings({ ...initialWorkspaceSettings });
    setNotifications(notificationRows.map((item) => ({ ...item })));
    setQuickDrafts({ sellerInvites: [], collections: [] });
    setSelected([]);
    setCurrentId("");
    setFilter({ status: "Tümü", query: "" });
    setTab("orders");
    setEditingLayout(false);
    setOrderNotes({});
    setOperationPanels({ revenue: true, distribution: true });
    setSavedViews(savedViewSeed.map((item) => ({ ...item })));
    setActiveView("Tüm siparişler");
    setEntityFocus(null);
    setGeneration((value) => value + 1);
    closeDialog();
    notify("Tüm yerel örnek durumları başlangıç değerlerine döndürüldü.");
  };

  useEffect(() => {
    const onKey = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === "k") {
        event.preventDefault();
        if (!dialog && !document.querySelector("dialog[open]")) openDialog("command");
      }
      if (event.key === "Escape" && contextOpen && !dialog && !document.querySelector("dialog[open]")) closeContext();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [contextOpen, dialog]);

  useEffect(() => {
    const onResize = () => {
      const isMobile = window.innerWidth <= 760;
      setCompact(window.innerWidth <= 1279);
      setMobile(isMobile);
      if (isMobile) {
        setContextOpen(false);
        setCurrentId("");
      }
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => () => window.clearTimeout(toastTimerRef.current), []);

  const title = domains.find((item) => item.id === domain)?.label || "Operasyon";
  const section = { operations: "Operasyon", sellers: "Pazaryeri", finance: "Pazaryeri", modules: "Yönetim", audit: "Yönetim", settings: "Yönetim" }[domain];
  const pageKey = domain + "-" + generation;
  const body = {
    dashboard: <Dashboard key={pageKey} orders={orders} onOpenOrders={() => navigate("operations", "Siparişler")} onHealth={() => openDialog("health")} dateRange={dateRange} />,
    operations: <Operations key={pageKey} orders={orders} setOrders={setOrders} selected={selected} setSelected={setSelected} currentId={currentId} setCurrentId={setCurrentId} filter={filter} setFilter={setFilter} tab={tab} setTab={(next) => { setTab(next); setContextItem(next === "returns" ? "İadeler" : "Siparişler"); }} editingLayout={editingLayout} setEditingLayout={setEditingLayout} savedViews={savedViews} activeView={activeView} onCustomFilter={() => { setActiveView(""); setCurrentId(""); setSelected([]); }} onApplyView={applyView} onSaveView={() => openDialog("save-view")} store={store} setStore={setStoreScope} dateRange={dateRange} notify={notify} openDialog={openDialog} notes={orderNotes} setNotes={setOrderNotes} visiblePanels={operationPanels} setVisiblePanels={setOperationPanels} compact={compact} contextItem={contextItem} initialOrderId={entityFocus?.kind === "order" ? entityFocus.id : ""} />,
    catalog: <Catalog key={pageKey + contextItem} products={products} store={store} contextItem={contextItem} collectionDrafts={quickDrafts.collections} onCreate={() => openDialog("product")} onEdit={(product) => openDialog("product", { product })} />,
    customers: <Customers key={pageKey} customers={customers} setCustomers={setCustomers} contextItem={contextItem} initialCustomerId={entityFocus?.kind === "customer" ? entityFocus.id : ""} notify={notify} />,
    sellers: <Sellers key={pageKey} sellers={sellers} setSellers={setSellers} notes={sellerNotes} setNotes={setSellerNotes} mobile={mobile} initialSellerId={entityFocus?.kind === "seller" ? entityFocus.id : ""} draftInvites={quickDrafts.sellerInvites} notify={notify} />,
    finance: <Finance key={pageKey} rows={settlements} setRows={setSettlements} store={store} contextItem={contextItem} notify={notify} />,
    reports: <Analytics key={pageKey} contextItem={contextItem} notify={notify} />,
    modules: <Modules key={pageKey} modules={modules} setModules={setModules} roles={roles} setRoles={setRoles} contextItem={contextItem} notify={notify} />,
    audit: <Audit key={pageKey + contextItem} contextItem={contextItem} notify={notify} />,
    settings: <Settings key={pageKey} saved={settings} setSaved={setSettings} contextItem={contextItem} notify={notify} />,
  }[domain];

  return (
    <div className={"admin-shell " + (contextOpen ? "context-open" : "context-closed")} data-testid="admin-shell">
      <a className="skip-link" href="#main-content">Ana içeriğe geç</a>
      <IconRail active={domain} setActive={navigate} onProfile={() => openDialog("profile")} inactive={mobile && contextOpen} />
      <ContextRail domain={domain} open={contextOpen} mobile={mobile} savedViews={savedViews} activeItem={contextItem} onItem={selectContextItem} onView={applyView} onSaveView={() => openDialog("save-view")} onNavigate={navigate} onClose={closeContext} store={store} onStoreChange={setStoreScope} dateRange={dateRange} onDateRangeChange={(next) => { setDateRange(next); notify("“" + next + "” dönemi örnek göstergelere uygulandı."); }} panelRef={contextPanelRef} />
      {contextOpen && <button className="context-scrim" aria-label="Bağlamsal menüyü kapat" onClick={closeContext} data-testid="context-scrim" />}
      <div className="admin-main" inert={mobile && contextOpen ? true : undefined}>
        <AppHeader title={title} section={section} contextOpen={contextOpen} onToggleContext={toggleContext} contextToggleRef={contextToggleRef} onCommand={() => openDialog("command")} onQuickCreate={() => openDialog("quick-create")} onNotifications={() => openDialog("notifications")} onProfile={() => openDialog("profile")} notifications={notifications} dateRange={dateRange} setDateRange={(next) => { setDateRange(next); notify("“" + next + "” dönemi örnek göstergelere uygulandı."); }} showDate={domain === "dashboard" || domain === "operations"} toast={toast} clearToast={() => setToast("")} />
        <main className="content-area" id="main-content" ref={headingRef} tabIndex="-1">{body}</main>
        <footer className="statusbar"><PreviewBanner /><span>Hedef pazaryeri simülasyonu · backend tek satıcılı</span><span>API ve ödeme bağlantıları kapalı</span><button aria-label="Önizlemeyi başlangıç değerlerine döndür" onClick={() => openDialog("reset")}><Icon name="refresh" />Önizlemeyi yenile</button></footer>
      </div>

      {dialog?.type === "command" && <CommandPalette onClose={closeDialog} run={runCommand} orders={orders} products={products} sellers={sellers} customers={customers} />}
      {dialog?.type === "quick-create" && (
        <Modal title="Hızlı oluştur" onClose={closeDialog}>
          <div className="quick-grid">
            <button onClick={() => { closeDialog(); navigate("catalog", "Kanonik Katalog"); requestAnimationFrame(() => openDialog("product")); }}><Icon name="package" /><strong>NovaStore katalog kaydı</strong><small>Yalnız birinci taraf yerel kayıt oluştur</small></button>
            <button onClick={() => { closeDialog(); requestAnimationFrame(() => openDialog("seller-invite")); }}><Icon name="user" /><strong>Satıcı daveti</strong><small>Gönderimsiz taslak oluştur · {quickDrafts.sellerInvites.length} taslak</small></button>
            <button onClick={() => { closeDialog(); navigate("finance", "Hakedişler"); requestAnimationFrame(() => openDialog("settlement-summary")); }}><Icon name="card" /><strong>Mutabakat</strong><small>Finans özetini incele</small></button>
            <button onClick={() => { closeDialog(); requestAnimationFrame(() => openDialog("collection")); }}><Icon name="grid" /><strong>Koleksiyon</strong><small>Yerel vitrin taslağı oluştur · {quickDrafts.collections.length} taslak</small></button>
          </div>
        </Modal>
      )}
      {dialog?.type === "save-view" && (
        <Modal title="Görünümü kaydet" onClose={closeDialog}>
          <form className="modal-form" onSubmit={saveView}>
            <label><span>Görünüm adı</span><input name="name" required placeholder="Örn. Bugünkü öncelikler" data-autofocus aria-invalid={saveViewError ? "true" : undefined} aria-describedby={saveViewError ? "save-view-error" : undefined} onChange={() => saveViewError && setSaveViewError("")} /></label>
            {saveViewError && <p className="modal-error" id="save-view-error" role="alert">{saveViewError}</p>}
            <label><span>Örnek ekip erişimi</span><select name="scope"><option>Yalnızca ben</option><option>Operasyon ekibi</option><option>Tüm yöneticiler</option></select></label>
            <p className="form-hint">Erişim etiketi kayda eklenir; gerçek yetkilendirme entegrasyonda uygulanır.</p>
            <footer><button type="button" className="secondary-button" onClick={closeDialog}>İptal</button><button className="primary-button">Önizlemede kaydet</button></footer>
          </form>
        </Modal>
      )}
      {dialog?.type === "product" && <ProductDialog product={dialog.data.product} products={products} onClose={closeDialog} onSave={saveProduct} />}
      {(dialog?.type === "seller-invite" || dialog?.type === "collection") && <SimpleFormDialog type={dialog.type} onClose={closeDialog} onSave={(values) => {
        const isInvite = dialog.type === "seller-invite";
        const key = isInvite ? "sellerInvites" : "collections";
        setQuickDrafts((current) => ({ ...current, [key]: current[key].concat({ ...values, id: key + "-" + (current[key].length + 1) }) }));
        closeDialog();
        notify((isInvite ? "Satıcı daveti" : "Koleksiyon") + " yalnız bu oturumda taslak olarak kaydedildi; dış ileti gönderilmedi.");
      }} />}
      {dialog?.type === "assign-owner" && (
        <Modal title="Sipariş sahibi ata" onClose={closeDialog}>
          <form className="modal-form" onSubmit={assignOwner}><p>{dialog.data.ids.length} görünür sipariş için yerel sahiplik değişecek.</p><label><span>Operasyon sahibi</span><select name="owner" data-autofocus><option>Demo Operatör A</option><option>Demo Operatör B</option><option>Demo Operatör C</option></select></label><footer><button type="button" className="secondary-button" onClick={closeDialog}>İptal</button><button className="primary-button">Yerelde ata</button></footer></form>
        </Modal>
      )}
      {dialog?.type === "store-detail" && (
        <Modal title={dialog.data.seller + " mağaza özeti"} onClose={closeDialog} wide>
          <div className="detail-modal-body"><div className="detail-hero"><span className="avatar">{dialog.data.seller.split(" ").map((word) => word[0]).join("").slice(0, 2)}</span><div><strong>{dialog.data.seller}</strong><small>Yerel mağaza kartı · canlı satıcı profili değil</small></div></div><dl className="detail-list detail-grid"><div><dt>Örnek puan</dt><dd>4,8 / 5</dd></div><div><dt>SLA uyumu</dt><dd>%96,4</dd></div><div><dt>Açık sipariş</dt><dd>{orders.filter((row) => row.seller.includes(dialog.data.seller.split(" ")[0])).length}</dd></div><div><dt>Operasyon sağlığı</dt><dd><Status>Entegrasyonda</Status></dd></div></dl><p className="form-hint">Aktif satıcı sağlık skoru henüz hesaplanmıyor; onboarding inceleme önceliğiyle aynı kavram değildir.</p></div>
          <footer className="modal-actions"><button className="primary-button" onClick={closeDialog}>Tamam</button></footer>
        </Modal>
      )}
      {dialog?.type === "notifications" && (
        <Modal title="Örnek bildirimler" onClose={closeDialog} wide>
          <div className="notification-list">{notifications.map((item) => <article key={item.id} className={item.read ? "read" : ""}><span className={"notification-tone " + item.tone} /><div><strong>{item.title}</strong><small>{item.detail}</small></div><button className="secondary-button small" disabled={item.read} onClick={() => setNotifications((rows) => markNotificationsRead(rows, item.id))}>{item.read ? "Okundu" : "Okundu işaretle"}</button></article>)}</div>
          <footer className="modal-actions"><button className="secondary-button" onClick={() => setNotifications((rows) => markNotificationsRead(rows))}>Tümünü okundu işaretle</button><button className="primary-button" onClick={closeDialog}>Kapat</button></footer>
        </Modal>
      )}
      {dialog?.type === "profile" && (
        <Modal title="Profil ve rol önizlemesi" onClose={closeDialog}>
          <div className="profile-summary"><span className="avatar">DO</span><div><strong>Demo Operatör</strong><small>demo-operasyon@example.invalid</small></div></div><dl className="detail-list"><div><dt>Etkin rol</dt><dd>Operasyon Yöneticisi</dd></div><div><dt>Kapsam</dt><dd>{store}</dd></div><div><dt>Oturum</dt><dd>Yerel önizleme</dd></div></dl><p className="form-hint">Gerçek rol değişimi, oturum ve yetki denetimi entegrasyon aşamasında etkinleşir.</p>
          <footer className="modal-actions"><button className="primary-button" onClick={closeDialog}>Tamam</button></footer>
        </Modal>
      )}
      {dialog?.type === "health" && (
        <Modal title="Mağaza sağlığı önizlemesi" onClose={closeDialog} wide>
          <div className="health-grid">{[["Katalog örneği", "Yerel örnek", "14 Tem 2026 · 10:24"], ["Sipariş örneği", "Yerel örnek", "14 Tem 2026 · 10:22"], ["Bildirim örneği", "Önizleme", "Canlı kuyruk kapalı"], ["Tahsilat bağlantısı", "Entegrasyonda", "Hiçbir istek gönderilmez"]].map(([name, status, detail]) => <article key={name}><Icon name={status === "Entegrasyonda" ? "warning" : "check"} /><div><strong>{name}</strong><small>{detail}</small></div><Status>{status}</Status></article>)}</div>
          <footer className="modal-actions"><button className="primary-button" onClick={closeDialog}>Tamam</button></footer>
        </Modal>
      )}
      {dialog?.type === "settlement-summary" && (
        <Modal title="Mutabakat özeti" onClose={closeDialog} wide>
          <div className="detail-modal-body"><p>Yerel hakediş kayıtlarında <strong>{settlements.filter((row) => row.status === "Blokeli").length} blokeli</strong> ve <strong>{settlements.filter((row) => row.status === "Ödemeye hazır").length} hazır</strong> örnek bulunuyor.</p><section className="notice-card"><Icon name="shield" /><div><strong>Finansal işlem kapalı</strong><p>Bu özet yalnız arayüz akışını gösterir; transfer veya mutabakat kaydı üretmez.</p></div></section></div><footer className="modal-actions"><button className="secondary-button" onClick={closeDialog}>Kapat</button><button className="primary-button" onClick={() => { closeDialog(); navigate("finance", "Hakedişler"); }}>Hakedişlere git</button></footer>
        </Modal>
      )}
      {dialog?.type === "reset" && (
        <Modal title="Önizlemeyi başlangıca döndür" onClose={closeDialog} testId="confirmation-dialog">
          <div className="confirmation-body"><Icon name="warning" /><p>Ürün, sipariş, satıcı, müşteri, modül ve ayarlarda yaptığınız tüm yerel değişiklikler sıfırlanacak.</p></div><footer className="modal-actions"><button className="secondary-button" onClick={closeDialog}>Vazgeç</button><button className="danger-button" onClick={resetPreview}>Tüm yerel durumu sıfırla</button></footer>
        </Modal>
      )}
    </div>
  );
}
