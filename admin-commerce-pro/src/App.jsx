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
  = false }) {
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
         