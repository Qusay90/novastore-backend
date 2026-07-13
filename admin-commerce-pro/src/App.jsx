import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";

const money = (value) => new Intl.NumberFormat("tr-TR", {
  style: "currency", currency: "TRY", maximumFractionDigits: 0,
}).format(value);

const nextOrderStatus = {
  Yeni: "Hazırlanıyor",
  Hazırlanıyor: "Kargoya Verildi",
  "Kargoya Verildi": "Teslim Edildi",
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

function Icon({ name, className = "icon" }) {
  const markup = window.NovaIcons?.icon?.(name, className) || "";
  return <span className="icon-wrap" aria-hidden="true" dangerouslySetInnerHTML={{ __html: markup }} />;
}

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
  dashboard: [["Genel Bakış", ""], ["Bugünkü Öncelikler", "12"], ["Mağaza Sağlığı", ""], ["Ekip Aktivitesi", ""]],
  operations: [
    ["Bugün", "12"], ["Siparişler", "28"], ["İadeler", "7"], ["Müşteri Soruları", "9"],
  ],
  catalog: [["Tüm Ürünler", "2.416"], ["Onay Bekleyen", "18"], ["Kategoriler", "42"], ["Filtre Şablonları", "12"]],
  customers: [["Tüm Müşteriler", "86B"], ["Segmentler", "8"], ["Müşteri Soruları", "9"], ["İade Davranışı", ""]],
  sellers: [["Satıcı Başvuruları", "7"], ["Aktif Satıcılar", "24"], ["Ürün Onayları", "18"], ["Performans", ""]],
  finance: [["Genel Bakış", ""], ["Hakedişler", "14"], ["Komisyonlar", ""], ["Mutabakat", "3"]],
  reports: [["Satış Raporları", ""], ["Dönüşüm", ""], ["Ürün İçgörüleri", ""], ["Müşteri Davranışı", ""]],
  modules: [["Modül Merkezi", ""], ["Etkin Modüller", "8"], ["Rol Düzenleri", "3"]],
  audit: [["İşlem Geçmişi", ""], ["Güvenlik", ""], ["Dışa Aktarımlar", ""]],
  settings: [["Genel", ""], ["Ekip ve Roller", "12"], ["Bildirimler", ""], ["Entegrasyonlar", "4"]],
};

const initialOrders = [
  { id: "NS-10482", seller: "TeknoPark Mağazası", customer: "Seda Arslan", product: "Apple iPhone 15 128 GB", channel: "Web", amount: 51999, status: "Hazırlanıyor", age: "1 sa 18 dk", owner: "Mehmet A.", image: "/assets/phone-iphone.webp" },
  { id: "NS-10483", seller: "NovaStore", customer: "Ahmet Demir", product: "NovaTech AeroBook 14", channel: "Web", amount: 18999, status: "Kargoya Verildi", age: "1 sa 07 dk", owner: "Ece T.", image: "/assets/product-laptop.webp" },
  { id: "NS-10481", seller: "Eviva Home", customer: "Mustafa Çelik", product: "NovaHome S10 Robot Süpürge", channel: "Hepsiburada", amount: 7999, status: "Yeni", age: "1 sa 35 dk", owner: "Ece T.", image: "/assets/product-vacuum.webp" },
  { id: "NS-10480", seller: "TeknoPark", customer: "Elif Nazlı", product: "Samsung Galaxy S24 256 GB", channel: "Trendyol", amount: 38999, status: "Kargoya Verildi", age: "1 sa 52 dk", owner: "Mehmet A.", image: "/assets/phone-samsung.webp" },
  { id: "NS-10479", seller: "Eviva Home", customer: "Burak Güneş", product: "NovaSound Bar 600", channel: "Web", amount: 4999, status: "Teslim Edildi", age: "2 sa 11 dk", owner: "Ece T.", image: "/assets/product-headphones.webp" },
  { id: "NS-10478", seller: "NovaStore", customer: "Gamze İnce", product: "Nova Cook Airfryer 5.5L", channel: "Mobil", amount: 2899, status: "Hazırlanıyor", age: "2 sa 37 dk", owner: "Mehmet A.", image: "/assets/category-home.webp" },
  { id: "NS-10477", seller: "TeknoPark", customer: "Buse Yıldız", product: "Logitech MX Master 3S", channel: "Web", amount: 2199, status: "Yeni", age: "3 sa 05 dk", owner: "Ece T.", image: "/assets/product-laptop.webp" },
];

const products = [
  { sku: "NVS-IP15-128", name: "Apple iPhone 15 128 GB", seller: "TeknoPark", category: "Cep Telefonu", stock: 42, price: 51999, status: "Yayında", image: "/assets/phone-iphone.webp" },
  { sku: "NVS-AB14-512", name: "NovaTech AeroBook 14", seller: "NovaStore", category: "Dizüstü Bilgisayar", stock: 18, price: 18999, status: "Yayında", image: "/assets/product-laptop.webp" },
  { sku: "NVS-S10-RBT", name: "NovaHome S10 Robot Süpürge", seller: "Eviva Home", category: "Elektrikli Ev Aleti", stock: 7, price: 7999, status: "Düşük stok", image: "/assets/product-vacuum.webp" },
  { sku: "NVS-WCH-02", name: "Smartix Watch 2", seller: "TeknoPark", category: "Akıllı Saat", stock: 0, price: 3499, status: "Stokta yok", image: "/assets/product-watch.webp" },
  { sku: "NVS-BDS-04", name: "Soft Touch Nevresim Seti", seller: "Eviva Home", category: "Ev Tekstili", stock: 84, price: 1299, status: "Onay bekliyor", image: "/assets/product-bedding.webp" },
];

const sellerApplications = [
  { id: "SLR-208", name: "Dora Kozmetik", owner: "Derya Aydın", category: "Kozmetik", products: 126, commission: "%14", risk: "Düşük", status: "İncelemede" },
  { id: "SLR-207", name: "Atlas Outdoor", owner: "Can Öztürk", category: "Spor & Outdoor", products: 84, commission: "%12", risk: "Düşük", status: "Belge bekleniyor" },
  { id: "SLR-206", name: "Minika Dünyası", owner: "Selin Kaya", category: "Anne & Çocuk", products: 218, commission: "%16", risk: "Orta", status: "İncelemede" },
  { id: "SLR-205", name: "MobilPlus", owner: "Okan Şen", category: "Elektronik", products: 342, commission: "%10", risk: "Yüksek", status: "İncelemede" },
];

const settlements = [
  { id: "HKD-0726", seller: "TeknoPark", period: "01–07 Tem 2026", gross: 482140, commission: 48214, returns: 12490, net: 421436, status: "Ödemeye hazır" },
  { id: "HKD-0725", seller: "Eviva Home", period: "01–07 Tem 2026", gross: 214890, commission: 30085, returns: 7999, net: 176806, status: "Kontrol ediliyor" },
  { id: "HKD-0724", seller: "Dora Kozmetik", period: "01–07 Tem 2026", gross: 118420, commission: 16579, returns: 2840, net: 99001, status: "Blokeli" },
  { id: "HKD-0719", seller: "Atlas Outdoor", period: "24–30 Haz 2026", gross: 97220, commission: 11666, returns: 0, net: 85554, status: "Ödendi" },
];

const auditRows = [
  ["10:24", "Mehmet Akın", "Sipariş durumunu güncelledi", "NS-10482 · Hazırlanıyor", "Web"],
  ["10:18", "Ece Tan", "Satıcı başvurusunu inceledi", "SLR-208 · Dora Kozmetik", "Web"],
  ["09:56", "Sistem", "Hakediş raporu oluşturdu", "HKD-0726 · TeknoPark", "Otomasyon"],
  ["09:41", "Ayşe Kara", "Ürün yayına alındı", "NVS-IP15-128", "Web"],
  ["09:12", "Sistem", "Sipariş oluşturuldu", "NS-10482", "API"],
];

const moduleCatalog = [
  { id: "live-orders", name: "Canlı Sipariş Akışı", description: "Sipariş SLA ve sahiplik takibi", version: "v2.4.1", dependency: "Sipariş çekirdeği", health: "Sağlıklı", enabled: true },
  { id: "seller-approvals", name: "Satıcı Onayları", description: "Yeni başvuru ve belge kontrolü", version: "v1.8.0", dependency: "KYC ve roller", health: "Sağlıklı", enabled: true },
  { id: "catalog-health", name: "Katalog Sağlığı", description: "Stok, medya ve içerik tamlığı", version: "v3.1.2", dependency: "Kanonik katalog", health: "Sağlıklı", enabled: true },
  { id: "settlement-radar", name: "Hakediş Radarı", description: "Ödeme ve mutabakat riskleri", version: "v1.6.4", dependency: "Finansal ledger", health: "Sağlıklı", enabled: true },
  { id: "customer-voice", name: "Müşteri Sesi", description: "Soru, iade ve memnuniyet özeti", version: "v1.2.0", dependency: "Müşteriler", health: "Hazır", enabled: false },
  { id: "conversion-lab", name: "Dönüşüm Laboratuvarı", description: "Ürün bazlı davranış içgörüleri", version: "v2.0.3", dependency: "Raporlar", health: "Hazır", enabled: false },
];

const initialSettings = {
  name: "NovaStore Pazaryeri",
  email: "operasyon@novastore.tr",
  timezone: "Europe/İstanbul",
  approval: true,
  settlement: true,
  digest: false,
};

function Modal({ title, children, onClose, wide = false, testId }) {
  const ref = useRef(null);
  const titleId = useId();
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    node.showModal();
    requestAnimationFrame(() => {
      const preferred = node.querySelector("[data-autofocus], .command-input input, .modal-form input, .modal-form select, .quick-grid button, .modal-actions button");
      (preferred || node.querySelector("button"))?.focus();
    });
  }, []);
  return (
    <dialog ref={ref} className={`modal ${wide ? "modal-wide" : ""}`} role="dialog" aria-modal="true" aria-labelledby={titleId} data-testid={testId} onCancel={(e) => { e.preventDefault(); onClose(); }} onClick={(e) => { if (e.target === ref.current) onClose(); }}>
      <div className="modal-card" role="document">
        <header className="modal-header"><div><span className="eyebrow">NovaStore Yönetim</span><h2 id={titleId}>{title}</h2></div><button className="icon-button" onClick={onClose} aria-label="Pencereyi kapat"><Icon name="close" /></button></header>
        {children}
      </div>
    </dialog>
  );
}

function Status({ children }) {
  const key = String(children).toLocaleLowerCase("tr-TR").replaceAll("\u0307", "").replaceAll(" ", "-");
  return <span className={`status status-${key}`}>{children}</span>;
}

function Kpi({ label, value, trend, tone = "positive" }) {
  return <article className="kpi-card"><span>{label}</span><strong>{value}</strong><small className={tone}>{trend}</small></article>;
}

function PreviewBanner() {
  return <div className="preview-banner" role="note" data-testid="preview-banner">
    <Icon name="info" />
    <strong>Commerce Pro önizlemesi</strong>
    <span>Örnek veriler kullanılır; hiçbir işlem kaydedilmez ve ödeme isteği gönderilmez.</span>
  </div>;
}

function RevenueChart() {
  const mountRef = useRef(null);
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;
    const chart = new uPlot({
      width: Math.max(1, Math.floor(mount.clientWidth || 640)),
      height: 142,
      padding: [8, 10, 0, 0],
      scales: { x: { time: false }, y: { range: [0, 2200000] } },
      axes: [
        { stroke: "#69798e", grid: { show: false }, ticks: { show: false }, font: "10px Inter", size: 24, values: (_chart, values) => values.map((value) => revenueSeries[Math.round(value)]?.day || "") },
        { stroke: "#69798e", grid: { stroke: "#dfe5ec", width: 1 }, ticks: { show: false }, font: "10px Inter", size: 42, values: (_chart, values) => values.map((value) => `${String(value / 1000000).replace(".", ",")}M`) },
      ],
      series: [
        {},
        { label: "Bu dönem", stroke: "#d95a1a", width: 3, points: { show: true, size: 6, width: 2, stroke: "#d95a1a", fill: "#fff" } },
        { label: "Önceki dönem", stroke: "#91a0b2", width: 2, dash: [8, 7], points: { show: false } },
      ],
      legend: { show: false },
      cursor: { show: false },
      select: { show: false },
    }, [
      revenueSeries.map((_item, index) => index),
      revenueSeries.map((item) => item.current),
      revenueSeries.map((item) => item.previous),
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
  }, []);
  return <div className="revenue-chart" role="img" aria-label="Son yedi gün net ciro eğilimi. Bu dönem 410 bin liradan 2 milyon liraya yükselmiştir; önceki dönem kesikli çizgiyle gösterilir."><div ref={mountRef} aria-hidden="true" /> <ul className="sr-only">{revenueSeries.map((item) => <li key={item.day}>{item.day}: bu dönem {money(item.current)}, önceki dönem {money(item.previous)}</li>)}</ul></div>;
}

function AppHeader({ title, section, contextOpen, onToggleContext, contextToggleRef, onCommand, onQuickCreate, onNotify, toast }) {
  return <>
    <header className="topbar">
      <div className="topbar-leading"><button ref={contextToggleRef} className="icon-button rail-toggle" onClick={onToggleContext} aria-label={contextOpen ? "Bağlamsal menüyü daralt" : "Bağlamsal menüyü aç"} aria-expanded={contextOpen} aria-controls="context-navigation"><Icon name={contextOpen ? "back" : "menu"} /></button><div className="breadcrumb"><span>Çalışma Alanları</span><Icon name="right" />{section && <><span>{section}</span><Icon name="right" /></>}<strong>{title}</strong></div></div>
      <button className="command-trigger" onClick={onCommand} data-testid="command-open"><Icon name="search" /><span>Ara veya komut çalıştır…</span><kbd>⌘ K</kbd></button>
      <label className="date-select"><span className="sr-only">Tarih aralığı</span><Icon name="calendar" /><select aria-label="Tarih aralığı" defaultValue="7 Tem 2026 – 13 Tem 2026" onChange={(event) => onNotify(`“${event.target.value}” örnek tarih aralığı seçildi.`)}><option>7 Tem 2026 – 13 Tem 2026</option><option>30 Haz 2026 – 6 Tem 2026</option><option>Son 30 gün</option></select></label>
      <button className="icon-button notification-button" aria-label="Örnek bildirimleri göster" onClick={() => onNotify("8 örnek bildirim bulunuyor; canlı bildirim bağlantısı bu önizlemede kapalıdır.")}><Icon name="bell" /><span className="notification-dot">8</span></button>
      <button className="profile-button" onClick={() => onNotify("Profil ve rol yönetimi sonraki API entegrasyon turuna hazırdır.")}><span className="avatar avatar-small">AK</span><span>Operasyon Yöneticisi</span><Icon name="sort" /></button>
      <button className="primary-button quick-create" onClick={onQuickCreate}><Icon name="plus" />Hızlı oluştur</button>
    </header>
    {toast && <div className="toast" role="status" style={{ pointerEvents: "none" }}>{toast}</div>}
  </>;
}

function IconRail({ active, setActive }) {
  return <nav className="icon-rail" aria-label="Ana çalışma alanları" data-testid="admin-sidebar">
    <div className="rail-logo" aria-label="NovaStore"><span className="nova-mark"><Icon name="star" /></span><span>NovaStore</span></div>
    <div className="rail-nav">
      <button className={active === "dashboard" ? "active" : ""} aria-current={active === "dashboard" ? "page" : undefined} aria-label="Pano" title="Pano" onClick={() => setActive("dashboard")} data-testid="nav-dashboard"><Icon name="house" /></button>
      <button className={active === "operations" ? "active" : ""} aria-current={active === "operations" ? "page" : undefined} aria-label="Siparişler" title="Siparişler" onClick={() => setActive("operations")} data-testid="nav-orders"><Icon name="orders" /></button>
      <button className={active === "catalog" ? "active" : ""} aria-current={active === "catalog" ? "page" : undefined} aria-label="Ürünler" title="Ürünler" onClick={() => setActive("catalog")} data-testid="nav-products"><Icon name="package" /></button>
      <button className={active === "customers" ? "active" : ""} aria-current={active === "customers" ? "page" : undefined} aria-label="Müşteriler" title="Müşteriler" onClick={() => setActive("customers")} data-testid="nav-customers"><Icon name="user" /></button>
      <button className={active === "sellers" ? "active" : ""} aria-current={active === "sellers" ? "page" : undefined} aria-label="Satıcılar" title="Satıcılar" onClick={() => setActive("sellers")} data-testid="nav-sellers"><Icon name="storefront" /></button>
      <button className={active === "finance" ? "active" : ""} aria-current={active === "finance" ? "page" : undefined} aria-label="Finans" title="Finans" onClick={() => setActive("finance")} data-testid="nav-finance"><Icon name="card" /></button>
      <button className={active === "reports" ? "active" : ""} aria-current={active === "reports" ? "page" : undefined} aria-label="Raporlar" title="Raporlar" onClick={() => setActive("reports")} data-testid="nav-reports"><Icon name="chart" /></button>
      <button className={active === "modules" ? "active" : ""} aria-current={active === "modules" ? "page" : undefined} aria-label="Modüller" title="Modüller" onClick={() => setActive("modules")} data-testid="nav-modules"><Icon name="grid" /></button>
    </div>
    <div className="rail-bottom"><button className={active === "audit" ? "active" : ""} aria-current={active === "audit" ? "page" : undefined} aria-label="Denetim" title="Denetim" onClick={() => setActive("audit")} data-testid="nav-audit"><Icon name="shield" /></button><button className={active === "settings" ? "active" : ""} aria-current={active === "settings" ? "page" : undefined} aria-label="Ayarlar" title="Ayarlar" onClick={() => setActive("settings")} data-testid="nav-settings"><Icon name="settings" /></button><span className="avatar">AK</span></div>
  </nav>;
}

function ContextRail({ domain, open, savedViews, activeItem, onItem, onView, onSaveView, onNavigate, onClose, store, onStoreChange, panelRef }) {
  if (!open) return null;
  const title = domains.find((item) => item.id === domain)?.label;
  return <aside ref={panelRef} className="context-rail" id="context-navigation" data-testid="context-navigation" tabIndex="-1">
    <div className="context-title"><h1>{title}</h1><Icon name="back" /></div>
    <label className="context-store"><Icon name="storefront" /><select aria-label="Örnek kapsam" value={store} onChange={(event) => onStoreChange(event.target.value)}><option>Tüm Mağazalar · 24</option><option>NovaStore</option><option>TeknoPark · 2 mağaza</option><option>Eviva Home</option></select></label>
    <nav className="context-nav" aria-label={`${title} bölümleri`}>{contextByDomain[domain].map(([label, count], index) => <button key={label} className={activeItem === label ? "active" : ""} aria-current={activeItem === label ? "page" : undefined} onClick={() => onItem(label)}><Icon name={index === 0 ? "house" : index === 1 ? "orders" : "right"} /><span>{label}</span>{count && <b>{count}</b>}</button>)}</nav>
    {domain === "operations" && <section className="saved-views"><header><strong>Kaydedilmiş Görünümler</strong><button className="icon-button small" onClick={onSaveView} aria-label="Görünüm kaydet"><Icon name="plus" /></button></header>{savedViews.map((view) => <button key={view.name} onClick={() => onView(view)}><Icon name="bookmark" /><span>{view.name}</span></button>)}</section>}
    {domain === "operations" && <section className="marketplace-links"><strong>Pazaryeri</strong><button onClick={() => onNavigate("sellers")}><Icon name="user" />Satıcı Başvuruları<b>7</b></button><button onClick={() => onNavigate("catalog")}><Icon name="package" />Ürün Onayları<b>18</b></button></section>}
    <button className="collapse-caption" onClick={onClose}><Icon name="back" />Menüyü daralt</button>
  </aside>;
}

function Operations({ orders, setOrders, selected, setSelected, currentId, setCurrentId, filter, setFilter, tab, setTab, editingLayout, setEditingLayout, savedViews, activeView, onCustomFilter, onApplyView, onSaveView, store, setStore, notify }) {
  const [page, setPage] = useState(1);
  const visible = useMemo(() => orders.filter((order) => (filter.status === "Tümü" || order.status === filter.status) && (filter.query === "" || Object.values(order).some((v) => String(v).toLocaleLowerCase("tr-TR").includes(filter.query.toLocaleLowerCase("tr-TR"))))), [orders, filter]);
  const current = currentId ? orders.find((order) => order.id === currentId) : null;
  const inspectorRef = useRef(null);
  const rowTriggerRef = useRef(null);
  const allSelected = visible.length > 0 && visible.every((order) => selected.includes(order.id));
  const visibleSelected = visible.filter((order) => selected.includes(order.id));
  const updateStatus = (id, status) => { setOrders((rows) => rows.map((row) => row.id === id ? { ...row, status } : row)); notify(`${id} durumu önizlemede “${status}” olarak güncellendi.`); };
  const bulkStatus = (status) => { const visibleIds = new Set(visibleSelected.map((order) => order.id)); setOrders((rows) => rows.map((row) => visibleIds.has(row.id) ? { ...row, status } : row)); notify(`${visibleIds.size} örnek sipariş önizlemede güncellendi.`); setSelected([]); };
  const openInspector = (id, trigger) => { rowTriggerRef.current = trigger; setCurrentId(id); requestAnimationFrame(() => inspectorRef.current?.focus()); };
  const closeInspector = () => { setCurrentId(""); requestAnimationFrame(() => rowTriggerRef.current?.focus?.()); };
  return <div className={`workspace operations-workspace ${editingLayout ? "is-editing" : ""}`}>
    <div className="workspace-heading operations-heading"><div><h2>Canlı Sipariş Operasyonu</h2></div><div className="heading-actions"><label className="heading-select"><Icon name="storefront" /><select aria-label="Mağaza kapsamı" value={store} onChange={(event) => setStore(event.target.value)} data-testid="store-scope"><option>Tüm Mağazalar · 24</option><option>NovaStore</option><option>TeknoPark · 2 mağaza</option><option>Eviva Home</option></select></label><label className="heading-select"><Icon name="bookmark" /><select aria-label="Görünüm" value={activeView} onChange={(event) => onApplyView(savedViews.find((view) => view.name === event.target.value))}>{activeView === "" && <option value="" disabled>Özel görünüm</option>}{savedViews.map((view) => <option key={view.name}>{view.name}</option>)}</select></label><button className={editingLayout ? "secondary-button active" : "secondary-button"} onClick={() => setEditingLayout(!editingLayout)} data-testid="layout-edit"><Icon name="grid" />{editingLayout ? "Düzenlemeyi bitir" : "Düzeni düzenle"}</button><button className="secondary-button" onClick={onSaveView}><Icon name="bookmark" />Görünümü kaydet</button></div></div>
    {editingLayout && <div className="edit-banner"><Icon name="info" /><span>Bileşen yerleşimi düzenleme durumu önizleniyor; sürükleme ve kalıcı yerleşim bu izole sürümde kapalıdır.</span><button onClick={() => setEditingLayout(false)}>Bitti</button></div>}
    <section className="kpi-grid" aria-label="Temel performans göstergeleri"><Kpi label="Net Ciro" value="₺12.845.230" trend="↑ %14,6 · önceki döneme göre" /><Kpi label="Sipariş" value="6.842" trend="↑ %12,3 · önceki döneme göre" /><Kpi label="Bekleyen Satıcı Onayı" value="2.214" trend="↑ %18,7 · aksiyon gerekli" tone="warning" /><Kpi label="İade Oranı" value="%4,28" trend="↓ 0,56 puan · iyileşme" /></section>
    <section className="insight-grid">
      <article className="module-card revenue-module"><header><h3>Net Ciro</h3><button className="icon-button small" aria-label="Net ciro modülü seçeneklerini önizle" onClick={() => notify("Net ciro modülü seçenekleri bu önizlemede bilgilendirme amaçlıdır.")}><Icon name="menu" /></button></header><div className="chart-legend" aria-hidden="true"><span className="current-line">Bu dönem</span><span className="previous-line">Önceki dönem</span></div><RevenueChart /></article>
      <article className="module-card distribution-module"><header><h3>Sipariş Durum Dağılımı</h3><button className="icon-button small" aria-label="Sipariş dağılımı modülü seçeneklerini önizle" onClick={() => notify("Sipariş dağılımı modülü seçenekleri bu önizlemede bilgilendirme amaçlıdır.")}><Icon name="menu" /></button></header>{[["Yeni", 2214, 32, "blue"], ["Hazırlanıyor", 1876, 27, "orange"], ["Kargoya Verildi", 1642, 24, "green"], ["Teslim Edildi", 876, 13, "gray"], ["İptal / İade", 234, 4, "red"]].map(([label, value, percent, tone]) => <div className={`distribution-row tone-${tone}`} key={label}><span>{label}</span><progress max="100" value={percent} /><b>{value.toLocaleString("tr-TR")}</b><small>%{percent}</small></div>)}</article>
    </section>
    <section className="ledger-card">
      <nav className="ledger-tabs" aria-label="Operasyon kayıt türleri">{[["orders", "Siparişler", 28], ["seller-orders", "Satıcı Siparişleri", 42], ["returns", "İadeler", 7], ["stock", "Stok", 14]].map(([id, label, count]) => <button className={tab === id ? "active" : ""} aria-current={tab === id ? "page" : undefined} onClick={() => { setTab(id); if (id !== "orders") setCurrentId(""); }} key={id} data-testid={`ledger-tab-${id}`}>{label}<b>{count}</b></button>)}</nav>
      {tab !== "orders" ? <div className="state-panel"><Icon name={tab === "returns" ? "back" : "package"} /><h3>{tab === "returns" ? "İade talepleri" : tab === "stock" ? "Stok riskleri" : "Satıcı siparişleri"}</h3><p>Bu görünüm seçili mağaza kapsamına göre hazırlandı. Örnek kayıtlar operasyon tasarımının bir parçasıdır.</p><button className="primary-button" onClick={() => setTab("orders")}>Siparişlere dön</button></div> : <>
        <div className="ledger-toolbar">
          {visibleSelected.length > 0 ? <div className="bulk-toolbar" data-testid="bulk-actions"><strong>{visibleSelected.length} sipariş seçildi</strong><button onClick={() => setSelected([])}>Seçimi temizle</button><select aria-label="Toplu durum güncelle" defaultValue="" onChange={(e) => e.target.value && bulkStatus(e.target.value)}><option value="">Durumu güncelle</option><option>Hazırlanıyor</option><option>Kargoya Verildi</option><option>İptal Edildi</option></select><button onClick={() => notify(`${visibleSelected.length} örnek sipariş için satıcı atama akışı önizlendi.`)}>Satıcı atamayı önizle</button></div> : <div className="filter-toolbar"><label className="table-search"><Icon name="search" /><input type="search" value={filter.query} onChange={(e) => { onCustomFilter(); setFilter({ ...filter, query: e.target.value }); }} placeholder="Sipariş, müşteri veya ürün ara" aria-label="Siparişlerde ara" data-testid="filter-search" /></label><select aria-label="Sipariş durumu" value={filter.status} onChange={(e) => { onCustomFilter(); setFilter({ ...filter, status: e.target.value }); }} data-testid="status-filter"><option>Tümü</option><option>Yeni</option><option>Hazırlanıyor</option><option>Kargoya Verildi</option><option>Teslim Edildi</option></select><button className="secondary-button" onClick={() => onApplyView(savedViews[0])}><Icon name="filter" />Filtreleri temizle</button></div>}
        </div>
        <div className="table-scroll"><table className="data-table"><thead><tr><th><input type="checkbox" aria-label="Tüm siparişleri seç" checked={allSelected} onChange={(e) => setSelected(e.target.checked ? visible.map((order) => order.id) : [])} /></th><th>Sipariş ID</th><th>Satıcı / Mağaza</th><th>Müşteri</th><th>Ürün</th><th>Kanal</th><th>Tutar</th><th>Durum</th><th>SLA Yaşı</th><th>Sahip</th><th><span className="sr-only">İşlem</span></th></tr></thead><tbody>{visible.map((order) => <tr key={order.id} className={current?.id === order.id ? "selected-row" : ""} onClick={(event) => openInspector(order.id, event.currentTarget.querySelector("button"))} data-testid="table-row" data-row-id={order.id}><td onClick={(e) => e.stopPropagation()}><input type="checkbox" aria-label={`${order.id} satırını seç`} data-testid="row-select" checked={selected.includes(order.id)} onChange={(e) => setSelected(e.target.checked ? [...selected, order.id] : selected.filter((id) => id !== order.id))} /></td><td><strong>{order.id}</strong></td><td><span className="seller-cell"><Icon name="storefront" />{order.seller}</span></td><td>{order.customer}</td><td><span className="product-cell"><img src={order.image} alt="" />{order.product}</span></td><td>{order.channel}</td><td><strong>{money(order.amount)}</strong></td><td><Status>{order.status}</Status></td><td className="sla">{order.age}</td><td>{order.owner}</td><td><button className="icon-button small" aria-label={`${order.id} siparişini incele`} onClick={(event) => { event.stopPropagation(); openInspector(order.id, event.currentTarget); }}><Icon name="menu" /></button></td></tr>)}</tbody></table></div>
        <footer className="table-footer"><span>Toplam 28 örnek kayıttan 1–{visible.length} arası gösteriliyor</span><nav aria-label="Örnek sayfalama">{[1, 2, 3, 4].map((item) => <button key={item} aria-current={page === item ? "page" : undefined} onClick={() => { setPage(item); notify(`${item}. örnek sayfa seçildi.`); }}>{item}</button>)}</nav><label>Satır <select onChange={(event) => notify(`Sayfa başına ${event.target.value} satır seçildi.`)}><option>20</option><option>50</option></select></label></footer>
      </>}
    </section>
    {current && <aside ref={inspectorRef} className="inspector" role="complementary" aria-labelledby={`inspector-title-${current.id}`} tabIndex="-1" data-testid="row-inspector" onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); closeInspector(); } }}><header><div><span className="eyebrow">Örnek sipariş ayrıntısı</span><h3 id={`inspector-title-${current.id}`}>Sipariş #{current.id}</h3></div><button className="icon-button" onClick={closeInspector} aria-label="Denetçiyi kapat"><Icon name="close" /></button></header><section><span className="section-label">Satıcı / Mağaza</span><div className="entity-line"><Icon name="storefront" /><div><strong>{current.seller}</strong><small>Örnek puan: 4,8 · 7.842 sipariş</small></div><button className="link-button" onClick={() => notify(`${current.seller} örnek mağaza görünümü açıldı.`)}>Mağazayı önizle</button></div></section><section><span className="section-label">Müşteri</span><div className="entity-line"><span className="avatar avatar-small">{current.customer.split(" ").map((word) => word[0]).join("")}</span><div><strong>{current.customer}</strong><small>{current.customer.toLocaleLowerCase("tr-TR").replace(" ", ".")}@email.com</small></div></div></section><section><span className="section-label">Örnek ödeme</span><div className="split-line"><Status>Ödendi</Status><span>Örnek kart •••• 4242</span><strong>{money(current.amount)}</strong></div></section><section><span className="section-label">Örnek teslimat adresi</span><p>{current.customer}<br />Kozyatağı Mah. Değirmen Sk. No:12 D:7<br />34742 Kadıköy / İstanbul</p></section><section><span className="section-label">Ürün ve hizmet (2)</span><div className="inspector-product"><img src={current.image} alt="" /><div><strong>{current.product}</strong><small>1 adet · örnek tutar</small></div><b>{money(current.amount)}</b></div><div className="inspector-product"><Icon name="shield" /><div><strong>2 Yıl Ek Garanti</strong><small>Örnek hizmet · toplam fiyata dahil</small></div><b>Dahil</b></div></section><section className="inspector-totals" aria-label="Örnek sipariş toplamı"><div><span>Ara toplam</span><strong>{money(current.amount)}</strong></div><div><span>Platform komisyonu</span><strong>−{money(Math.round(current.amount * 0.09))}</strong></div><div><span>Toplam</span><strong>{money(current.amount)}</strong></div></section><section><span className="section-label">Örnek olay akışı</span><ol className="timeline"><li><b>Sipariş oluşturuldu</b><time>09:12</time></li><li><b>Ödeme doğrulandı</b><time>09:12</time></li><li><b>{current.status}</b><time>10:03</time></li><li><b>Son kontrol</b><time>10:24</time></li></ol></section><label className="note-field"><span>Yerel önizleme notu</span><textarea defaultValue="Müşteri hediye paketi talep etti." /></label><footer><select aria-label="Sipariş durumu" value={current.status} onChange={(e) => updateStatus(current.id, e.target.value)} data-testid="inspector-status"><option>Yeni</option><option>Hazırlanıyor</option><option>Kargoya Verildi</option><option>Teslim Edildi</option><option>İptal Edildi</option></select><button className="primary-button" disabled={!nextOrderStatus[current.status]} onClick={() => nextOrderStatus[current.status] && updateStatus(current.id, nextOrderStatus[current.status])}>{nextOrderStatus[current.status] ? "Sonraki aşamayı önizle" : "Akış tamamlandı"}</button></footer></aside>}
  </div>;
}

function Dashboard({ orders, onOpenOrders, notify }) {
  const urgent = orders.filter((order) => order.status === "Yeni" || order.status === "Hazırlanıyor");
  return <div className="workspace page-workspace dashboard-page"><div className="workspace-heading"><div><span className="eyebrow">Yönetici özeti · örnek veri</span><h2>Genel Bakış</h2><p>Satış sağlığını, açık operasyon işlerini ve risk kuyruklarını tek ekranda izleyin.</p></div><button className="primary-button" onClick={onOpenOrders}><Icon name="orders" />Sipariş operasyonuna git</button></div><section className="kpi-grid"><Kpi label="Net satış" value="₺12,8 Mn" trend="↑ %14,6 · önceki dönem" /><Kpi label="Açık operasyon işi" value={String(urgent.length + 21)} trend="12 kritik SLA" tone="warning" /><Kpi label="Mutabakat farkı" value="₺99.001" trend="3 örnek kayıt" tone="warning" /><Kpi label="Satıcı sağlığı" value="%96,4" trend="24 aktif mağaza" /></section><section className="analytics-grid"><article className="module-card"><header><div><span className="eyebrow">Bugünün öncelikleri</span><h3>Operasyon kuyruğu</h3></div><button className="link-button" onClick={onOpenOrders}>Tümünü aç</button></header>{[["Geciken siparişler", 12, 76], ["Kritik stok", 14, 58], ["Satıcı başvuruları", 7, 42], ["İade SLA riski", 5, 30]].map(([label, value, progress]) => <div className="metric-progress" key={label}><span>{label}</span><progress max="100" value={progress} /><strong>{value}</strong></div>)}</article><article className="module-card"><header><div><span className="eyebrow">Sistem durumu</span><h3>Bağlantı sağlığı</h3></div></header>{[["Katalog", "Sağlıklı"], ["Sipariş akışı", "Sağlıklı"], ["Bildirim kuyruğu", "Önizleme"], ["Ödeme bağlantısı", "Kapalı"]].map(([label, state]) => <div className="check-line" key={label}><Icon name={state === "Kapalı" ? "warning" : "check"} /><span>{label}</span><small>{state}</small></div>)}<button className="secondary-button small" onClick={() => notify("Sistem sağlık ayrıntıları yalnız örnek durumlarla gösteriliyor.")}>Sağlık ayrıntısını önizle</button></article></section></div>;
}

function Catalog({ notify, onCreate }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("Tümü");
  const visible = products.filter((p) => (status === "Tümü" || p.status === status) && `${p.name} ${p.sku}`.toLocaleLowerCase("tr-TR").includes(query.toLocaleLowerCase("tr-TR")));
  return <div className="workspace page-workspace"><div className="workspace-heading"><div><span className="eyebrow">Çoklu satıcı kataloğu</span><h2>Ürün ve Katalog Yönetimi</h2><p>Kanonik katalog ve satıcı teklifleri: ürün içeriğini tek kayıtta, satıcıya özgü fiyat ve stok tekliflerini ayrı yönetin.</p></div><button className="primary-button" onClick={onCreate}><Icon name="plus" />Yeni ürün</button></div><section className="kpi-grid compact"><Kpi label="Yayındaki ürün" value="2.416" trend="↑ 84 · bu ay" /><Kpi label="Onay bekleyen" value="18" trend="7 satıcıdan" tone="warning" /><Kpi label="Düşük stok" value="42" trend="Aksiyon gerekli" tone="warning" /><Kpi label="İçerik tamlığı" value="%94" trend="↑ 3 puan" /></section><section className="table-card"><header className="card-header"><div><h3>Tüm ürünler</h3><p>Kanonik ürün, satıcı teklifi, varyant, stok ve yayın durumları</p></div><div className="filter-toolbar"><label className="table-search"><Icon name="search" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Ürün veya SKU ara" aria-label="Ürün veya SKU ara" data-testid="catalog-search" /></label><select aria-label="Ürün durumu" value={status} onChange={(e) => setStatus(e.target.value)} data-testid="catalog-filter"><option>Tümü</option><option>Yayında</option><option>Düşük stok</option><option>Stokta yok</option><option>Onay bekliyor</option></select></div></header><div className="table-scroll"><table className="data-table"><thead><tr><th>Ürün</th><th>SKU</th><th>Satıcı teklifi</th><th>Kategori</th><th>Stok</th><th>Fiyat</th><th>Durum</th><th>İşlem</th></tr></thead><tbody>{visible.map((product) => <tr key={product.sku} data-testid={`catalog-row-${product.sku}`}><td><span className="product-cell"><img src={product.image} alt="" /><strong>{product.name}</strong></span></td><td>{product.sku}</td><td>{product.seller}</td><td>{product.category}</td><td><strong className={product.stock < 10 ? "negative" : ""}>{product.stock}</strong></td><td>{money(product.price)}</td><td><Status>{product.status}</Status></td><td><button className="secondary-button small" onClick={() => notify(`${product.name} düzenleme paneli açıldı.`)}>Düzenle</button></td></tr>)}</tbody></table></div></section></div>;
}

function Sellers({ notify }) {
  const [items, setItems] = useState(sellerApplications);
  const [active, setActive] = useState(items[0]?.id);
  const [pendingDecision, setPendingDecision] = useState("");
  const decisionTriggerRef = useRef(null);
  const seller = items.find((item) => item.id === active);
  const closeDecision = () => { setPendingDecision(""); requestAnimationFrame(() => decisionTriggerRef.current?.focus?.()); };
  const openDecision = (status, trigger) => { decisionTriggerRef.current = trigger; setPendingDecision(status); };
  const decide = (status) => { setItems((rows) => rows.map((row) => row.id === active ? { ...row, status: `${status} · örnek` } : row)); notify(`${seller.name} için “${status}” akışı yalnız önizlemede uygulandı.`); closeDecision(); };
  return <div className="workspace page-workspace with-side-detail"><main><div className="workspace-heading"><div><span className="eyebrow">Pazaryeri büyümesi · örnek veri</span><h2>Satıcı Başvuruları</h2><p>Örnek belgeleri, risk sinyallerini ve ticari koşulları karşılaştırın.</p></div><button className="secondary-button" onClick={() => notify("Gelişmiş satıcı filtresi API bağlama turuna hazırdır.")}><Icon name="filter" />Gelişmiş filtre</button></div><section className="kpi-grid compact"><Kpi label="Aktif satıcı" value="24" trend="Örnek kapsam" /><Kpi label="Başvuru" value="7" trend="4 örnek belge" tone="warning" /><Kpi label="Ürün onayı" value="18" trend="Örnek kuyruk" /><Kpi label="Satıcı SLA" value="%96,4" trend="Örnek gösterge" /></section><section className="table-card"><header className="card-header"><div><h3>Örnek inceleme kuyruğu</h3><p>Risk ve belge durumuna göre sıralandı</p></div></header><div className="table-scroll"><table className="data-table"><thead><tr><th>Başvuru</th><th>Yetkili</th><th>Kategori</th><th>Ürün</th><th>Komisyon</th><th>Risk</th><th>Durum</th></tr></thead><tbody>{items.map((item) => <tr key={item.id} className={active === item.id ? "selected-row" : ""} onClick={() => setActive(item.id)} data-testid={`seller-row-${item.id}`}><td><button className="row-entity-button" onClick={(event) => { event.stopPropagation(); setActive(item.id); }} aria-label={`${item.name} başvurusunu incele`}><strong>{item.name}</strong><small>{item.id}</small></button></td><td>{item.owner}</td><td>{item.category}</td><td>{item.products}</td><td>{item.commission}</td><td><Status>{item.risk}</Status></td><td><Status>{item.status}</Status></td></tr>)}</tbody></table></div></section></main>{seller && <aside className="detail-panel" role="complementary" aria-labelledby="seller-detail-title" data-testid="seller-detail"><header><div><span className="eyebrow">{seller.id}</span><h3 id="seller-detail-title">{seller.name}</h3></div><Status>{seller.status}</Status></header><div className="detail-hero"><span className="avatar">{seller.name.split(" ").map((w) => w[0]).join("")}</span><div><strong>{seller.owner}</strong><small>Örnek şirket yetkilisi · doğrulama simülasyonu</small></div></div><dl className="detail-list"><div><dt>Kategori</dt><dd>{seller.category}</dd></div><div><dt>Planlanan ürün</dt><dd>{seller.products}</dd></div><div><dt>Komisyon teklifi</dt><dd>{seller.commission}</dd></div><div><dt>Risk seviyesi</dt><dd><Status>{seller.risk}</Status></dd></div></dl><section><h4>Örnek belge kontrolü</h4>{["Vergi levhası", "İmza sirküleri", "Banka hesabı", "Mesafeli satış sözleşmesi"].map((label, index) => <div className="check-line" key={label}><Icon name={index === 2 && seller.risk === "Yüksek" ? "warning" : "check"} /><span>{label}</span><small>{index === 2 && seller.risk === "Yüksek" ? "İncelenmeli" : "Örnek doğrulandı"}</small></div>)}</section><label className="note-field"><span>İnceleme notu</span><textarea placeholder="Önizleme için bir not ekleyin…" /></label><footer><button className="danger-button" onClick={(event) => openDecision("Reddedildi", event.currentTarget)} data-testid="seller-reject">Red akışını önizle</button><button className="primary-button" onClick={(event) => openDecision("Onaylandı", event.currentTarget)} data-testid="seller-approve">Onay akışını önizle</button></footer></aside>}{pendingDecision && <Modal title={pendingDecision === "Onaylandı" ? "Onay akışını önizle" : "Red akışını önizle"} onClose={closeDecision} testId="confirmation-dialog"><div className="confirmation-body"><Icon name={pendingDecision === "Onaylandı" ? "check" : "warning"} /><p><strong>{seller.name}</strong> için “{pendingDecision}” durumunun arayüz etkisini önizliyorsunuz. Canlı satıcı erişimi veya teklif akışı değişmez.</p></div><footer className="modal-actions"><button className="secondary-button" onClick={closeDecision}>İptal</button><button className={pendingDecision === "Onaylandı" ? "primary-button" : "danger-button"} onClick={() => decide(pendingDecision)}>Önizlemede uygula</button></footer></Modal>}</div>;
}

function Finance({ notify }) {
  const [rows, setRows] = useState(settlements);
  const [status, setStatus] = useState("Tüm durumlar");
  const visible = rows.filter((row) => status === "Tüm durumlar" || row.status === status);
  const previewSettlement = (id) => { setRows((all) => all.map((row) => row.id === id ? { ...row, status: "Akış önizlendi" } : row)); notify(`${id} için ödeme akışı yalnız arayüzde önizlendi; hiçbir talep gönderilmedi.`); };
  return <div className="workspace page-workspace"><div className="workspace-heading"><div><span className="eyebrow">Finans ve mutabakat · örnek veri</span><h2>Satıcı Hakedişleri</h2><p>Komisyon, iade ve ödeme durumlarının gelecekteki ledger deneyimini güvenli örneklerle inceleyin.</p></div><button className="secondary-button" onClick={() => notify("Örnek hakediş raporu dışa aktarma akışı önizlendi.")}><Icon name="download" />Raporu önizle</button></div><section className="kpi-grid compact"><Kpi label="Ödenecek net tutar" value="₺598.242" trend="14 örnek hakediş" /><Kpi label="Platform komisyonu" value="₺96.544" trend="Örnek ort. %13,4" /><Kpi label="Blokeli tutar" value="₺99.001" trend="3 örnek mutabakat" tone="warning" /><Kpi label="Bu ay ödenen" value="₺2.184.640" trend="Örnek dönem" /></section><section className="table-card" data-testid="finance-ledger"><header className="card-header"><div><h3>Hakediş takvimi</h3><p>Örnek dönem · hiçbir finansal işlem kaydedilmez</p></div><div className="filter-toolbar"><select aria-label="Hakediş durumu" value={status} data-testid="finance-filter" onChange={(event) => { setStatus(event.target.value); notify(`“${event.target.value}” örnek hakediş filtresi uygulandı.`); }}><option>Tüm durumlar</option><option>Ödemeye hazır</option><option>Kontrol ediliyor</option><option>Blokeli</option><option>Ödendi</option></select></div></header><div className="table-scroll"><table className="data-table"><thead><tr><th>Hakediş</th><th>Satıcı</th><th>Dönem</th><th>Brüt satış</th><th>Komisyon</th><th>İade</th><th>Net hakediş</th><th>Durum</th><th>İşlem</th></tr></thead><tbody>{visible.map((row) => <tr key={row.id} data-testid={`finance-row-${row.id}`}><td><strong>{row.id}</strong></td><td>{row.seller}</td><td>{row.period}</td><td>{money(row.gross)}</td><td className="negative">−{money(row.commission)}</td><td className="negative">−{money(row.returns)}</td><td><strong>{money(row.net)}</strong></td><td><Status>{row.status}</Status></td><td>{row.status === "Ödemeye hazır" ? <button className="primary-button small" onClick={() => previewSettlement(row.id)} data-testid="finance-settle">Akışı önizle</button> : <button className="secondary-button small" onClick={() => notify(`${row.id} örnek mutabakat detayı açıldı.`)}>İncele</button>}</td></tr>)}</tbody></table></div></section></div>;
}

function Customers({ notify }) {
  const [query, setQuery] = useState("");
  const customers = [
    ["Seda Arslan", "seda.arslan@email.com", "7", "₺86.240", "VIP", "2 gün önce"],
    ["Ahmet Demir", "ahmet.demir@email.com", "4", "₺32.680", "Sadık", "Bugün"],
    ["Mustafa Çelik", "mustafa.celik@email.com", "11", "₺118.940", "VIP", "Dün"],
    ["Elif Nazlı", "elif.nazli@email.com", "2", "₺12.480", "Yeni", "3 gün önce"],
    ["Burak Güneş", "burak.gunes@email.com", "6", "₺44.120", "Sadık", "Bugün"],
  ].filter((row) => row.join(" ").toLocaleLowerCase("tr-TR").includes(query.toLocaleLowerCase("tr-TR")));
  return <div className="workspace page-workspace"><div className="workspace-heading"><div><span className="eyebrow">Müşteri merkezi · örnek veri</span><h2>Müşteriler</h2><p>Örnek sipariş değeri, destek geçmişi ve izinli segmentleri tek müşteri görünümünde inceleyin.</p></div><button className="secondary-button" onClick={() => notify("Örnek müşteri segmenti dışa aktarma akışı önizlendi.")}><Icon name="download" />Dışa aktarmayı önizle</button></div><section className="kpi-grid compact"><Kpi label="Toplam müşteri" value="86.420" trend="Örnek gösterge" /><Kpi label="Tekrar satın alma" value="%31,8" trend="Örnek gösterge" /><Kpi label="Açık soru" value="9" trend="Örnek kuyruk" tone="warning" /><Kpi label="Müşteri değeri" value="₺4.860" trend="Örnek 12 aylık ortalama" /></section><section className="table-card"><header className="card-header"><div><h3>Örnek müşteri listesi</h3><p>Arama ve tablo davranışı etkileşimlidir</p></div><label className="table-search"><Icon name="search" /><input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Müşteri veya e-posta ara" aria-label="Müşterilerde ara" /></label></header><div className="table-scroll"><table className="data-table"><thead><tr><th>Müşteri</th><th>E-posta</th><th>Sipariş</th><th>Yaşam boyu değer</th><th>Segment</th><th>Son aktivite</th><th>İşlem</th></tr></thead><tbody>{customers.map((row) => <tr key={row[1]}><td><strong>{row[0]}</strong></td><td>{row[1]}</td><td>{row[2]}</td><td><strong>{row[3]}</strong></td><td><Status>{row[4]}</Status></td><td>{row[5]}</td><td><button className="secondary-button small" onClick={() => notify(`${row[0]} örnek müşteri görünümü açıldı.`)}>İncele</button></td></tr>)}</tbody></table></div></section></div>;
}

function Analytics({ notify }) {
  const top = [["Apple iPhone 15 128 GB", 1248, 64884000, 82], ["NovaTech AeroBook 14", 864, 16415136, 64], ["NovaHome S10 Robot Süpürge", 622, 4975378, 48], ["Smartix Watch 2", 518, 1812482, 38]];
  return <div className="workspace page-workspace"><div className="workspace-heading"><div><span className="eyebrow">Büyüme analizi · örnek veri</span><h2>Satış ve Dönüşüm</h2><p>Mağaza, satıcı ve ürün performansını aynı ölçüm çerçevesinde karşılaştırın.</p></div><div className="heading-actions"><select aria-label="Rapor dönemi" onChange={(event) => notify(`“${event.target.value}” örnek rapor dönemi seçildi.`)}><option>Son 30 gün</option><option>Son 7 gün</option><option>Bu yıl</option></select><button className="secondary-button" onClick={() => notify("Örnek analiz dışa aktarma akışı önizlendi.")}><Icon name="download" />Dışa aktarmayı önizle</button></div></div><section className="kpi-grid"><Kpi label="Brüt ürün hacmi" value="₺18,4 Mn" trend="Örnek dönem · ↑ %16,8" /><Kpi label="Net ciro" value="₺12,8 Mn" trend="Örnek dönem · ↑ %14,6" /><Kpi label="Dönüşüm" value="%3,82" trend="Örnek dönem · ↑ 0,42 puan" /><Kpi label="Ort. sepet" value="₺1.877" trend="Örnek dönem · ↑ %4,1" /></section><section className="analytics-grid"><article className="module-card analytics-main"><header><div><span className="eyebrow">Kanal karşılaştırması</span><h3>Gelir katkısı</h3></div></header>{[["NovaStore Web", 48, "₺6,2 Mn"], ["NovaStore Mobil", 28, "₺3,6 Mn"], ["Trendyol", 14, "₺1,8 Mn"], ["Hepsiburada", 10, "₺1,2 Mn"]].map(([label, value, amount]) => <div className="metric-progress" key={label}><span>{label}</span><progress max="100" value={value} /><strong>{amount}</strong></div>)}</article><article className="module-card"><header><h3>Dönüşüm hunisi</h3></header>{[["Ürün görüntüleme", "412.840", 100], ["Sepete ekleme", "46.218", 68], ["Ödeme başlangıcı", "18.664", 44], ["Sipariş", "15.782", 36]].map(([label, value, progress]) => <div className="funnel-row" key={label}><span>{label}</span><progress max="100" value={progress} /><strong>{value}</strong></div>)}</article></section><section className="table-card"><header className="card-header"><div><h3>Ürün performansı</h3><p>Örnek satış, ciro ve içerik kalitesi birlikte</p></div></header><div className="table-scroll"><table className="data-table"><thead><tr><th>Ürün</th><th>Sipariş</th><th>Net ciro</th><th>Dönüşüm</th><th>Katalog skoru</th></tr></thead><tbody>{top.map(([name, order, revenue, score]) => <tr key={name}><td><strong>{name}</strong></td><td>{order.toLocaleString("tr-TR")}</td><td>{money(revenue)}</td><td>%{(score / 18).toFixed(2).replace(".", ",")}</td><td><span className="score"><progress max="100" value={score} />%{score}</span></td></tr>)}</tbody></table></div></section></div>;
}

function Modules({ modules, setModules, notify }) {
  const [activeRole, setActiveRole] = useState("operations");
  const toggle = (id) => { const target = modules.find((item) => item.id === id); setModules((all) => all.map((item) => item.id === id ? { ...item, enabled: !item.enabled } : item)); notify(`${target.name} önizlemede ${target.enabled ? "devre dışı" : "etkin"} görünecek şekilde değiştirildi.`); };
  const roles = [["operations", "OY", "Operasyon Yöneticisi", "8 modül · varsayılan"], ["catalog", "KE", "Katalog Editörü", "5 modül"], ["finance", "FY", "Finans Yöneticisi", "4 modül"]];
  const roleModules = {
    operations: ["live-orders", "seller-approvals", "catalog-health", "settlement-radar", "customer-voice", "conversion-lab"],
    catalog: ["catalog-health", "seller-approvals", "customer-voice", "conversion-lab"],
    finance: ["settlement-radar", "conversion-lab", "live-orders"],
  };
  const visibleModules = modules.filter((item) => roleModules[activeRole].includes(item.id));
  return <div className="workspace page-workspace"><div className="workspace-heading"><div><span className="eyebrow">Kişiselleştirilebilir çalışma alanı · önizleme</span><h2>Modül Merkezi</h2><p>Ekip rollerinin dashboard bileşimini, sürümünü, bağımlılıklarını ve sağlık durumunu yerel örnek durumlarla inceleyin.</p></div><button className="primary-button" onClick={() => notify("Örnek rol düzeni yalnız bu oturumda oluşturuldu.")}><Icon name="plus" />Rol düzenini önizle</button></div><section className="role-layouts" aria-label="Rol düzenleri">{roles.map(([id, initials, label, detail]) => <button key={id} className={activeRole === id ? "active" : ""} aria-pressed={activeRole === id} onClick={() => { setActiveRole(id); notify(`“${label}” örnek rol düzeni seçildi.`); }}><span className="avatar">{initials}</span><span><strong>{label}</strong><small>{detail}</small></span></button>)}</section><section className="module-grid">{visibleModules.map((item) => <article className={`module-option ${item.enabled ? "enabled" : ""}`} key={item.id} data-testid={`module-${item.id}`}><div className="module-preview" data-testid="module-card"><Icon name={item.id.includes("seller") ? "user" : item.id.includes("settlement") ? "card" : "chart"} /></div><div><h3>{item.name}</h3><p>{item.description}</p><dl className="module-meta"><div><dt>Sürüm</dt><dd>{item.version}</dd></div><div><dt>Bağımlılık</dt><dd>{item.dependency}</dd></div><div><dt>Durum</dt><dd>Önizleme</dd></div></dl></div><label className="switch" data-testid="module-toggle"><input type="checkbox" checked={item.enabled} onChange={() => toggle(item.id)} aria-label={`${item.name} modülünü ${item.enabled ? "devre dışı bırak" : "etkinleştir"}`} data-testid={`module-toggle-${item.id}`} /><span>{item.enabled ? "Etkin" : "Devre dışı"}</span></label></article>)}</section></div>;
}

function Audit({ notify }) {
  const [query, setQuery] = useState("");
  const visible = auditRows.filter((row) => row.join(" ").toLocaleLowerCase("tr-TR").includes(query.toLocaleLowerCase("tr-TR")));
  return <div className="workspace page-workspace"><div className="workspace-heading"><div><span className="eyebrow">İzlenebilirlik ve güvenlik · örnek veri</span><h2>Denetim Kayıtları</h2><p>Gelecekteki yönetici, sistem ve entegrasyon işlemlerinin değiştirilemez zaman çizgisini inceleyin.</p></div><button className="secondary-button" onClick={() => notify("Örnek denetim dışa aktarma akışı önizlendi.")}><Icon name="download" />CSV akışını önizle</button></div><section className="notice-card"><Icon name="shield" /><div><strong>Denetim tasarım sözleşmesi hazır</strong><p>Bu kayıtlar örnektir; canlı bütünlük veya entegrasyon durumu bildirmez.</p></div></section><section className="table-card"><header className="card-header"><div><h3>Örnek işlem geçmişi</h3><p>Arama ve kayıt anatomisi etkileşimlidir</p></div><label className="table-search"><Icon name="search" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Kullanıcı, kayıt veya işlem ara" aria-label="Denetim kayıtlarında ara" /></label></header><div className="table-scroll"><table className="data-table"><thead><tr><th>Saat</th><th>Aktör</th><th>İşlem</th><th>Hedef</th><th>Kaynak</th><th>Sonuç</th></tr></thead><tbody>{visible.map((row) => <tr key={row.join("-")}><td>{row[0]}</td><td><strong>{row[1]}</strong></td><td>{row[2]}</td><td>{row[3]}</td><td>{row[4]}</td><td><Status>Örnek</Status></td></tr>)}</tbody></table></div></section></div>;
}

function Settings({ notify }) {
  const [form, setForm] = useState(initialSettings);
  const field = (key, value) => setForm({ ...form, [key]: value });
  return <div className="workspace page-workspace settings-page"><div className="workspace-heading"><div><span className="eyebrow">Çalışma alanı ayarları · önizleme</span><h2>Genel Ayarlar</h2><p>Marka, bildirim ve operasyon varsayılanlarının örnek form davranışını inceleyin.</p></div></div><form onSubmit={(e) => { e.preventDefault(); notify("Ayarlar yalnız bu önizleme oturumunda kaydedildi."); }}><section className="form-card"><header><h3>Mağaza bilgileri</h3><p>Bu alanlar canlı sisteme gönderilmez.</p></header><div className="form-grid"><label><span>Çalışma alanı adı</span><input value={form.name} onChange={(e) => field("name", e.target.value)} /></label><label><span>Operasyon e-postası</span><input type="email" value={form.email} onChange={(e) => field("email", e.target.value)} /></label><label><span>Saat dilimi</span><select value={form.timezone} onChange={(e) => field("timezone", e.target.value)}><option>Europe/İstanbul</option><option>Europe/Berlin</option></select></label><label><span>Varsayılan mağaza kapsamı</span><select onChange={(e) => notify(`“${e.target.value}” örnek kapsamı seçildi.`)}><option>Tüm Mağazalar · 24</option><option>NovaStore</option></select></label></div></section><section className="form-card"><header><h3>İş akışı bildirimleri</h3><p>Yalnızca yerel form durumu değişir.</p></header>{[["approval", "Yeni satıcı başvuruları", "Başvuru ve belge değişikliklerini bildir"], ["settlement", "Hakediş riskleri", "Bloke ve mutabakat kayıtlarını bildir"], ["digest", "Günlük yönetici özeti", "Her gün saat 09:00’da özet gönder"]].map(([key, title, description]) => <label className="setting-toggle" key={key}><span><strong>{title}</strong><small>{description}</small></span><input type="checkbox" checked={form[key]} onChange={(e) => field(key, e.target.checked)} /></label>)}</section><footer className="form-actions"><button type="button" className="secondary-button" onClick={() => { setForm(initialSettings); notify("Örnek ayarlar başlangıç değerlerine döndürüldü."); }}>Değişiklikleri iptal et</button><button className="primary-button">Önizlemede kaydet</button></footer></form></div>;
}

function CommandPalette({ onClose, navigate }) {
  const [query, setQuery] = useState("");
  const commands = [...domains.map((item) => ({ label: `${item.label} çalışma alanına git`, section: item.id, icon: item.icon })), { label: "Yeni ürün oluştur", section: "catalog", icon: "plus" }, { label: "Satıcı başvurularını incele", section: "sellers", icon: "user" }, { label: "Hakedişleri kontrol et", section: "finance", icon: "card" }];
  const filtered = commands.filter((item) => item.label.toLocaleLowerCase("tr-TR").includes(query.toLocaleLowerCase("tr-TR")));
  return <Modal title="Komut paleti" onClose={onClose} wide><div className="command-input"><Icon name="search" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Sayfa, kayıt veya komut ara…" autoFocus /></div><div className="command-results">{filtered.map((item) => <button key={item.label} onClick={() => { navigate(item.section); onClose(); }}><Icon name={item.icon} /><span>{item.label}</span><kbd>↵</kbd></button>)}{filtered.length === 0 && <div className="empty-inline">Eşleşen komut bulunamadı.</div>}</div></Modal>;
}

export function App() {
  const [domain, setDomain] = useState("operations");
  const [contextOpen, setContextOpen] = useState(() => window.innerWidth > 760);
  const [store, setStore] = useState("Tüm Mağazalar · 24");
  const [orders, setOrders] = useState(initialOrders);
  const [selected, setSelected] = useState(["NS-10482", "NS-10483", "NS-10481"]);
  const [currentId, setCurrentId] = useState(() => window.innerWidth > 760 ? "NS-10482" : "");
  const [filter, setFilter] = useState({ status: "Tümü", query: "" });
  const [tab, setTab] = useState("orders");
  const [editingLayout, setEditingLayout] = useState(false);
  const [savedViews, setSavedViews] = useState([{ name: "Bugünkü operasyon", status: "Tümü" }, { name: "Bekleyen satıcı onayı", status: "Yeni" }, { name: "SLA riski yüksek", status: "Hazırlanıyor" }]);
  const [activeView, setActiveView] = useState("Bugünkü operasyon");
  const [contextItem, setContextItem] = useState("Siparişler");
  const [modules, setModules] = useState(moduleCatalog);
  const [dialog, setDialog] = useState(null);
  const [toast, setToast] = useState("");
  const toastTimerRef = useRef(null);
  const returnFocus = useRef(null);
  const contextPanelRef = useRef(null);
  const contextToggleRef = useRef(null);
  const notify = (message) => { setToast(message); window.clearTimeout(toastTimerRef.current); toastTimerRef.current = window.setTimeout(() => setToast(""), 2800); };
  const openDialog = (name) => { returnFocus.current = document.activeElement; setDialog(name); };
  const closeDialog = () => { setDialog(null); requestAnimationFrame(() => returnFocus.current?.focus?.()); };
  const navigate = (next) => {
    setDomain(next);
    setDialog(null);
    setContextItem(next === "operations" ? "Siparişler" : contextByDomain[next]?.[0]?.[0] || "");
    if (next === "operations") {
      const firstVisible = orders.find((order) => (filter.status === "Tümü" || order.status === filter.status) && (filter.query === "" || Object.values(order).some((value) => String(value).toLocaleLowerCase("tr-TR").includes(filter.query.toLocaleLowerCase("tr-TR")))));
      setTab("orders");
      setCurrentId(window.innerWidth > 760 ? firstVisible?.id || "" : "");
    } else setCurrentId("");
    if (window.innerWidth <= 760) setContextOpen(false);
  };
  const closeContext = () => { setContextOpen(false); requestAnimationFrame(() => contextToggleRef.current?.focus?.()); };
  const toggleContext = () => {
    if (contextOpen) closeContext();
    else { setContextOpen(true); requestAnimationFrame(() => contextPanelRef.current?.focus?.()); }
  };
  const applyView = (view) => {
    if (!view) return;
    setActiveView(view.name);
    setFilter({ status: view.status, query: "" });
    setTab("orders");
    setDomain("operations");
    setContextItem("Siparişler");
    setCurrentId("");
    setSelected([]);
    if (window.innerWidth <= 760) setContextOpen(false);
    notify(`“${view.name}” örnek görünümü uygulandı.`);
  };
  const selectContextItem = (label) => {
    setContextItem(label);
    if (domain !== "operations") {
      notify(`“${label}” alt görünümü önizleme kapsamında seçildi.`);
      return;
    }
    if (label === "Bugün") {
      applyView(savedViews[0]);
      setContextItem("Bugün");
    } else if (label === "Siparişler") {
      const firstVisible = orders.find((order) => (filter.status === "Tümü" || order.status === filter.status) && (filter.query === "" || Object.values(order).some((value) => String(value).toLocaleLowerCase("tr-TR").includes(filter.query.toLocaleLowerCase("tr-TR")))));
      setTab("orders");
      setCurrentId(window.innerWidth > 760 ? firstVisible?.id || "" : "");
    } else if (label === "İadeler") {
      setTab("returns");
      setCurrentId("");
    } else if (label === "Müşteri Soruları") navigate("customers");
  };
  useEffect(() => {
    const onKey = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === "k") { event.preventDefault(); openDialog("command"); }
      if (event.key === "Escape" && contextOpen && !dialog && !document.querySelector("dialog[open]")) closeContext();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [contextOpen, dialog]);
  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth <= 760) {
        setContextOpen(false);
        setCurrentId("");
      }
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  useEffect(() => () => window.clearTimeout(toastTimerRef.current), []);
  const title = domains.find((item) => item.id === domain)?.label || "Operasyon";
  const section = { operations: "Operasyon", sellers: "Pazaryeri", modules: "Yönetim", audit: "Yönetim", settings: "Yönetim" }[domain];
  const body = {
    dashboard: <Dashboard orders={orders} onOpenOrders={() => navigate("operations")} notify={notify} />,
    operations: <Operations orders={orders} setOrders={setOrders} selected={selected} setSelected={setSelected} currentId={currentId} setCurrentId={setCurrentId} filter={filter} setFilter={setFilter} tab={tab} setTab={(next) => { setTab(next); setContextItem(next === "returns" ? "İadeler" : "Siparişler"); }} editingLayout={editingLayout} setEditingLayout={setEditingLayout} savedViews={savedViews} activeView={activeView} onCustomFilter={() => { setActiveView(""); setCurrentId(""); setSelected([]); }} onApplyView={applyView} onSaveView={() => openDialog("save-view")} store={store} setStore={(next) => { setStore(next); notify(`“${next}” örnek mağaza kapsamı seçildi.`); }} notify={notify} />,
    catalog: <Catalog notify={notify} onCreate={() => openDialog("new-product")} />,
    customers: <Customers notify={notify} />,
    sellers: <Sellers notify={notify} />,
    finance: <Finance notify={notify} />,
    reports: <Analytics notify={notify} />,
    modules: <Modules modules={modules} setModules={setModules} notify={notify} />,
    audit: <Audit notify={notify} />,
    settings: <Settings notify={notify} />,
  }[domain];
  return <div className={`admin-shell ${contextOpen ? "context-open" : "context-closed"}`} data-testid="admin-shell">
    <IconRail active={domain} setActive={navigate} />
    <ContextRail domain={domain} open={contextOpen} savedViews={savedViews} activeItem={contextItem} onItem={selectContextItem} onView={applyView} onSaveView={() => openDialog("save-view")} onNavigate={navigate} onClose={closeContext} store={store} onStoreChange={(next) => { setStore(next); notify(`“${next}” örnek mağaza kapsamı seçildi.`); }} panelRef={contextPanelRef} />
    {contextOpen && <button className="context-scrim" aria-label="Bağlamsal menüyü kapat" onClick={closeContext} data-testid="context-scrim" />}
    <div className="admin-main"><AppHeader title={title} section={section} contextOpen={contextOpen} onToggleContext={toggleContext} contextToggleRef={contextToggleRef} onCommand={() => openDialog("command")} onQuickCreate={() => openDialog("quick-create")} onNotify={notify} toast={toast} /><main className="content-area">{body}</main><footer className="statusbar"><PreviewBanner /><span>Örnek veri · kalıcı kayıt yok</span><span>API ve ödeme bağlantıları kapalı</span><button onClick={() => notify("Örnek arayüz durumu yenilendi.")}><Icon name="refresh" />Önizlemeyi yenile</button></footer></div>
    {dialog === "command" && <CommandPalette onClose={closeDialog} navigate={navigate} />}
    {dialog === "quick-create" && <Modal title="Hızlı oluştur" onClose={closeDialog}><div className="quick-grid"><button onClick={() => { navigate("catalog"); closeDialog(); }}><Icon name="package" /><strong>Yeni ürün</strong><small>Ürün ve varyant akışını önizle</small></button><button onClick={() => { navigate("sellers"); closeDialog(); }}><Icon name="user" /><strong>Satıcı daveti</strong><small>Mağaza başlangıcını önizle</small></button><button onClick={() => { navigate("finance"); closeDialog(); }}><Icon name="card" /><strong>Mutabakat</strong><small>Finans akışını önizle</small></button><button onClick={() => { closeDialog(); notify("Koleksiyon taslağı yalnız önizleme oturumunda oluşturuldu."); }}><Icon name="grid" /><strong>Koleksiyon</strong><small>Vitrin akışını önizle</small></button></div></Modal>}
    {dialog === "save-view" && <Modal title="Görünümü kaydet" onClose={closeDialog}><form className="modal-form" onSubmit={(e) => { e.preventDefault(); const name = new FormData(e.currentTarget).get("name"); setSavedViews([...savedViews, { name, status: filter.status }]); setActiveView(name); closeDialog(); notify(`“${name}” görünümü yalnız bu önizleme oturumunda kaydedildi.`); }}><label><span>Görünüm adı</span><input name="name" required placeholder="Örn. Bugünkü öncelikler" data-autofocus /></label><label><span>Örnek ekip erişimi</span><select name="scope"><option>Yalnızca ben</option><option>Operasyon ekibi</option><option>Tüm yöneticiler</option></select></label><footer><button type="button" className="secondary-button" onClick={closeDialog}>İptal</button><button className="primary-button">Önizlemede kaydet</button></footer></form></Modal>}
    {dialog === "new-product" && <Modal title="Yeni ürün taslağı" onClose={closeDialog} wide><form className="modal-form two-column" onSubmit={(e) => { e.preventDefault(); closeDialog(); notify("Ürün taslağı yalnız bu önizleme oturumunda oluşturuldu."); }}><label><span>Ürün adı</span><input required placeholder="Ürün adını girin" data-autofocus /></label><label><span>Satıcı</span><select><option>NovaStore</option><option>TeknoPark</option><option>Eviva Home</option></select></label><label><span>Kategori</span><select><option>Elektronik</option><option>Ev & Yaşam</option><option>Moda</option></select></label><label><span>Stok kodu</span><input required placeholder="NVS-" /></label><label><span>Satış fiyatı</span><input type="number" min="0" required /></label><label><span>Başlangıç stoku</span><input type="number" min="0" required /></label><footer><button type="button" className="secondary-button" onClick={closeDialog}>İptal</button><button className="primary-button">Önizlemede oluştur</button></footer></form></Modal>}
  </div>;
}
