import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createSameOriginAdapter } from "./adapters/sameOriginAdapter.js";
import { hasCapability } from "./integration/capabilities.js";
import {
  CATALOG_PUBLICATION_FILTER_OPTIONS,
  CATALOG_PUBLICATION_STATUS_LABELS,
  filterFirstPartyCatalogProducts,
  isCatalogProductEffectivelyVisible,
  resolveCatalogPublicationStatus,
} from "./integration/catalogRead.js";
import {
  filterCatalogStructureItems,
  isCatalogStructureItemActive,
} from "./integration/catalogStructureRead.js";
import { ADMIN_TOKEN_KEY, createAdminHttp } from "./integration/adminHttp.js";
import {
  createMutationIdempotencyKey,
  MANUAL_SHIPMENT_EXPECTED_STATUS,
  ORDER_CANCEL_EXPECTED_STATUSES,
  ORDER_CANCEL_NOTE_MAX_LENGTH,
  ORDER_CANCEL_REASONS,
} from "./integration/orderMutations.js";
import { useResource } from "./integration/useResource.js";

const money = (value, currency = "TRY") => new Intl.NumberFormat("tr-TR", {
  style: "currency",
  currency,
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
}).format(value);

const dateTime = (value) => value instanceof Date
  ? new Intl.DateTimeFormat("tr-TR", { dateStyle: "short", timeStyle: "short" }).format(value)
  : "Tarih bilgisi yok";

const dateOnly = (value) => value instanceof Date
  ? new Intl.DateTimeFormat("tr-TR", { dateStyle: "short" }).format(value)
  : "Tarih bilgisi yok";

const returnStatusLabels = Object.freeze({
  REQUESTED: "Talep alındı",
  IN_REVIEW: "İnceleniyor",
  APPROVED: "Onaylandı",
  COMPLETED: "Tamamlandı",
  FAILED: "Başarısız",
  REJECTED: "Reddedildi",
});

const shipmentStatusLabels = Object.freeze({
  NONE: "Gönderi yok",
  CREATED: "Kayıt oluşturuldu",
  IN_TRANSIT: "Taşımada",
  DELIVERED: "Teslim edildi",
  RETURNED: "Geri döndü",
});

const statusClass = (value) => String(value || "")
  .toLocaleLowerCase("tr-TR")
  .replaceAll("\u0307", "")
  .replaceAll(" ", "-");

function Icon({ name }) {
  const markup = window.NovaIcons?.icon?.(name, "icon") || "";
  return <span className="icon-wrap" aria-hidden="true" dangerouslySetInnerHTML={{ __html: markup }} />;
}

const focusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

function trapDialogFocus(event, container, onClose) {
  if (event.key === "Escape") {
    event.preventDefault();
    onClose();
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

function OperationDialog({ title, busy, children, onClose }) {
  const ref = useRef(null);
  const triggerRef = useRef(null);
  const titleId = useId();

  useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;
    triggerRef.current = document.activeElement;
    if (!node.open) node.showModal();
    const frame = requestAnimationFrame(() => {
      (node.querySelector("[data-autofocus]") || node.querySelector("button:not([disabled])"))?.focus();
    });
    return () => {
      cancelAnimationFrame(frame);
      if (node.open) node.close();
      requestAnimationFrame(() => triggerRef.current?.focus?.());
    };
  }, []);

  const close = () => {
    if (!busy) onClose();
  };

  return (
    <dialog
      ref={ref}
      className="modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      data-testid="order-operation-dialog"
      onCancel={(event) => { event.preventDefault(); close(); }}
      onClick={(event) => { if (event.target === ref.current) close(); }}
      onKeyDown={(event) => trapDialogFocus(event, ref.current, close)}
    >
      <div className="modal-card live-operation-dialog" role="document" aria-busy={busy ? "true" : undefined}>
        <header className="modal-header">
          <div><span className="eyebrow">Commerce Pro · kontrollü operasyon</span><h2 id={titleId}>{title}</h2></div>
          <button type="button" className="icon-button" onClick={close} disabled={busy} aria-label="Pencereyi kapat"><Icon name="close" /></button>
        </header>
        {children}
      </div>
    </dialog>
  );
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

const cancellableOrderStatuses = new Set(ORDER_CANCEL_EXPECTED_STATUSES);
const noMutationActions = Object.freeze({});

const orderMayBeCancelled = (order) => cancellableOrderStatuses.has(order.backendStatus)
  && order.paymentStatus === "PAID"
  && order.refundStatus === "NONE";

const orderMayBeHandedOff = (order) => order.backendStatus === MANUAL_SHIPMENT_EXPECTED_STATUS
  && order.paymentStatus === "PAID"
  && order.refundStatus === "NONE"
  && order.shipmentStatus === "NONE";

function OrdersTable({ orders, compact = false, mutationActions = {}, onOpenOperation }) {
  const cancelEnabled = typeof mutationActions.cancelOrder === "function";
  const shipmentEnabled = typeof mutationActions.createManualShipment === "function";
  const operationsEnabled = !compact && (cancelEnabled || shipmentEnabled);
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
            <th scope="col">Kargo</th>
            <th scope="col">Satır</th>
            <th scope="col">Tutar</th>
            <th scope="col">Tarih</th>
            {operationsEnabled && <th scope="col">Kontrollü işlem</th>}
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
              <td>
                <span className="live-customer-cell">
                  <strong>Yerel: {shipmentStatusLabels[order.shipmentStatus] || order.shipmentStatus}</strong>
                  {!compact && order.shipmentProvider && <small>{order.shipmentProvider}</small>}
                  {!order.carrierConfirmed && <small>Taşıyıcı doğrulanmadı</small>}
                  {!compact && order.estimatedDeliveryAt && <small>Tahmini {dateOnly(order.estimatedDeliveryAt)}</small>}
                </span>
              </td>
              <td>{order.itemCount}</td>
              <td><strong>{money(order.total, order.currency)}</strong></td>
              <td>{dateTime(order.createdAt)}</td>
              {operationsEnabled && (
                <td>
                  <span className="live-operation-buttons">
                    {cancelEnabled && (
                      <button
                        type="button"
                        className="danger-button small"
                        disabled={!orderMayBeCancelled(order)}
                        title={orderMayBeCancelled(order) ? "İptal etkisini doğrula" : "Bu sipariş güvenli iptal koşullarında değil"}
                        aria-label={orderMayBeCancelled(order) ? `${order.id} siparişini iptal etmeyi doğrula` : `${order.id} iptal işlemi kullanılamıyor; sipariş durumu, ödeme veya refund koşulu uygun değil`}
                        onClick={() => onOpenOperation("cancel", order)}
                      >İptal</button>
                    )}
                    {shipmentEnabled && (
                      <button
                        type="button"
                        className="secondary-button small"
                        disabled={!orderMayBeHandedOff(order)}
                        title={orderMayBeHandedOff(order) ? "Manuel kargo devrini doğrula" : "Sipariş manuel kargo devri koşullarında değil"}
                        aria-label={orderMayBeHandedOff(order) ? `${order.id} için manuel kargo devrini doğrula` : `${order.id} manuel kargo devri kullanılamıyor; hazırlık, ödeme, refund veya gönderi koşulu uygun değil`}
                        onClick={() => onOpenOperation("shipment", order)}
                      >Kargoya devret</button>
                    )}
                  </span>
                </td>
              )}
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

function OrderOperationSummary({ order }) {
  return (
    <dl className="detail-list live-operation-summary">
      <div><dt>Sipariş</dt><dd>{order.id}</dd></div>
      <div><dt>Beklenen durum</dt><dd>{order.backendStatus}</dd></div>
      <div><dt>Ödeme</dt><dd>{order.paymentStatus}</dd></div>
      <div><dt>Yerel refund</dt><dd>{order.refundStatus}</dd></div>
      <div><dt>Tutar</dt><dd>{money(order.total, order.currency)}</dd></div>
    </dl>
  );
}

function OperationError({ error }) {
  if (!error) return null;
  const message = typeof error === "string" ? error : error.message || "İşlem tamamlanamadı.";
  return (
    <p className="modal-error" id="order-operation-error" role="alert">
      {message}{typeof error === "object" && error.requestId ? ` İstek kimliği: ${error.requestId}` : ""}
    </p>
  );
}

function CancelOrderDialog({ operation, action, onClose, onConflict, onUnavailable, onComplete }) {
  const [reasonCode, setReasonCode] = useState(ORDER_CANCEL_REASONS[0].code);
  const [note, setNote] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const reason = ORDER_CANCEL_REASONS.find((item) => item.code === reasonCode);

  const submit = async (event) => {
    event.preventDefault();
    if (busy) return;
    setError(null);
    if (reason?.noteRequired && !note.trim()) {
      setError("Politika veya dolandırıcılık incelemesi için kısa bir açıklama zorunludur.");
      return;
    }
    setAttempted(true);
    setBusy(true);
    try {
      const result = await action({
        orderId: operation.order.rawId,
        expectedStatus: operation.order.backendStatus,
        reasonCode,
        note,
        idempotencyKey: operation.idempotencyKey,
      });
      onComplete({ kind: "cancel", reused: result?.reused === true });
    } catch (requestError) {
      if (requestError?.status === 409) {
        onConflict(requestError);
        return;
      }
      if (requestError?.status === 403 || requestError?.status === 503) {
        onUnavailable(requestError);
        return;
      }
      setError(requestError);
      setBusy(false);
    }
  };

  return (
    <OperationDialog title={`${operation.order.id} iptalini doğrula`} busy={busy} onClose={onClose}>
      <div className="confirmation-body">
        <Icon name="warning" />
        <p><strong>Sipariş iptal edilecek ve uygun stok rezervasyonu serbest bırakılacak.</strong> Ödeme sağlayıcısında otomatik refund yapılmaz; ödenmiş tutar varsa manuel finans incelemesi gerekir.</p>
      </div>
      <OrderOperationSummary order={operation.order} />
      <form className="modal-form live-operation-form" onSubmit={submit} aria-describedby="order-operation-boundary">
        <label><span>İptal nedeni</span><select value={reasonCode} onChange={(event) => { setReasonCode(event.target.value); setError(null); }} disabled={busy || attempted} data-autofocus>{ORDER_CANCEL_REASONS.map((item) => <option value={item.code} key={item.code}>{item.label}</option>)}</select></label>
        <label>
          <span>Operasyon notu {reason?.noteRequired ? "· zorunlu" : "· opsiyonel"}</span>
          <textarea value={note} onChange={(event) => { setNote(event.target.value); setError(null); }} maxLength={ORDER_CANCEL_NOTE_MAX_LENGTH} required={reason?.noteRequired} disabled={busy || attempted} rows="4" />
          <small className="live-character-count">{note.length} / {ORDER_CANCEL_NOTE_MAX_LENGTH}</small>
        </label>
        <p className="form-hint" id="order-operation-boundary">Bu onay yalnız NovaStore sipariş kaydını değiştirir. Sağlayıcı refund'u, para transferi veya taşıyıcı çağrısı yürütmez.</p>
        <OperationError error={error} />
        {attempted && error && <p className="form-hint">Güvenli tekrar için ilk isteğin alanları ve idempotency anahtarı korundu. Alanları değiştirmek için pencereyi kapatıp işlemi yeniden açın.</p>}
        <footer><button type="button" className="secondary-button" onClick={onClose} disabled={busy}>Vazgeç</button><button type="submit" className="danger-button" disabled={busy}>{busy ? "İptal ediliyor…" : attempted ? "Aynı isteği tekrar dene" : "Siparişi iptal et"}</button></footer>
      </form>
    </OperationDialog>
  );
}

function ManualShipmentDialog({ operation, action, onClose, onConflict, onUnavailable, onComplete }) {
  const [provider, setProvider] = useState("");
  const [trackingNo, setTrackingNo] = useState("");
  const [handoffConfirmed, setHandoffConfirmed] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [attempted, setAttempted] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    if (busy) return;
    setError(null);
    if (!handoffConfirmed) {
      setError("Paketi fiziksel olarak taşıyıcıya teslim ettiğinizi doğrulamanız gerekir.");
      return;
    }
    setAttempted(true);
    setBusy(true);
    try {
      const result = await action({
        orderId: operation.order.rawId,
        expectedStatus: operation.order.backendStatus,
        provider,
        trackingNo,
        handoffConfirmed,
        idempotencyKey: operation.idempotencyKey,
      });
      onComplete({ kind: "shipment", reused: result?.reused === true });
    } catch (requestError) {
      if (requestError?.status === 409) {
        onConflict(requestError);
        return;
      }
      if (requestError?.status === 403 || requestError?.status === 503) {
        onUnavailable(requestError);
        return;
      }
      setError(requestError);
      setBusy(false);
    }
  };

  return (
    <OperationDialog title={`${operation.order.id} manuel kargo devrini doğrula`} busy={busy} onClose={onClose}>
      <div className="confirmation-body">
        <Icon name="package" />
        <p><strong>Sipariş “Kargoya Verildi” durumuna geçirilecek.</strong> Bu kayıt taşıyıcı API doğrulaması, etiket üretimi veya takip bağlantısı oluşturmaz.</p>
      </div>
      <OrderOperationSummary order={operation.order} />
      <form className="modal-form live-operation-form" onSubmit={submit} aria-describedby="order-operation-boundary">
        <label><span>Kargo sağlayıcısı</span><input value={provider} onChange={(event) => { setProvider(event.target.value); setError(null); }} minLength="2" maxLength="80" required disabled={busy || attempted} data-autofocus autoComplete="off" placeholder="Örn. Yurtiçi Kargo" /></label>
        <label><span>Takip numarası</span><input value={trackingNo} onChange={(event) => { setTrackingNo(event.target.value); setError(null); }} minLength="3" maxLength="120" required disabled={busy || attempted} autoComplete="off" placeholder="Taşıyıcının verdiği gerçek numara" /></label>
        <label className="live-handoff-confirmation"><input type="checkbox" checked={handoffConfirmed} onChange={(event) => { setHandoffConfirmed(event.target.checked); setError(null); }} disabled={busy || attempted} /><span>Paketi fiziksel olarak taşıyıcıya teslim ettiğimi doğruluyorum.</span></label>
        <p className="form-hint" id="order-operation-boundary">Girilen takip numarası doğrulanmış taşıyıcı verisi sayılmaz. Taşıyıcı onayı: hayır · etiket: yok · takip URL'si: yok.</p>
        <OperationError error={error} />
        {attempted && error && <p className="form-hint">Güvenli tekrar için ilk isteğin alanları ve idempotency anahtarı korundu. Alanları değiştirmek için pencereyi kapatıp işlemi yeniden açın.</p>}
        <footer><button type="button" className="secondary-button" onClick={onClose} disabled={busy}>Vazgeç</button><button type="submit" className="primary-button" disabled={busy}>{busy ? "Kaydediliyor…" : attempted ? "Aynı isteği tekrar dene" : "Kargo devrini kaydet"}</button></footer>
      </form>
    </OperationDialog>
  );
}

function Orders({ orderPage, error, refreshing, onRefresh, onReloadCapabilities, mutationActions }) {
  const orders = orderPage.items;
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("Tümü");
  const [operation, setOperation] = useState(null);
  const [operationNotice, setOperationNotice] = useState(null);
  const [suppressedMutationActions, setSuppressedMutationActions] = useState(null);
  const writesSuppressed = suppressedMutationActions === mutationActions;
  const visibleMutationActions = writesSuppressed ? noMutationActions : mutationActions;
  const operationsEnabled = typeof visibleMutationActions.cancelOrder === "function"
    || typeof visibleMutationActions.createManualShipment === "function";
  const statuses = useMemo(() => ["Tümü", ...new Set(orders.map((order) => order.status))], [orders]);
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("tr-TR");
    return orders.filter((order) => {
      const matchesStatus = status === "Tümü" || order.status === status;
      const haystack = `${order.id} ${order.customerName} ${order.email}`.toLocaleLowerCase("tr-TR");
      return matchesStatus && (!normalized || haystack.includes(normalized));
    });
  }, [orders, query, status]);

  const openOperation = (kind, order) => {
    setOperationNotice(null);
    setOperation({ kind, order, idempotencyKey: createMutationIdempotencyKey(kind) });
  };
  const closeOperation = () => setOperation(null);
  const handleConflict = (requestError) => {
    const refetchRequired = requestError?.details?.refetchRequired === true;
    setOperation(null);
    if (!refetchRequired) setSuppressedMutationActions(mutationActions);
    setOperationNotice({
      tone: "warning",
      message: refetchRequired
        ? `Sipariş başka bir işlemle değişti. Liste yenileniyor; güncel durumu kontrol edin.${requestError?.requestId ? ` İstek kimliği: ${requestError.requestId}` : ""}`
        : `İşlem güvenlik kontrolünde durduruldu: ${requestError?.message || "Sipariş bu işlem için güvenli durumda değil."} Kontrollü yazmalar bu görünümde kapatıldı.${requestError?.code ? ` Kod: ${requestError.code}.` : ""}${requestError?.requestId ? ` İstek kimliği: ${requestError.requestId}` : ""}`,
    });
    onRefresh();
  };
  const handleUnavailable = (requestError) => {
    setOperation(null);
    setSuppressedMutationActions(mutationActions);
    setOperationNotice({
      tone: "warning",
      message: `İşlem capability'si sunucu tarafından kapatıldı veya admin yetkisi değişti. Oturum yetenekleri yeniden doğrulanıyor.${requestError?.code ? ` Kod: ${requestError.code}.` : ""}${requestError?.requestId ? ` İstek kimliği: ${requestError.requestId}` : ""}`,
    });
    onReloadCapabilities();
    onRefresh();
  };
  const handleComplete = ({ kind, reused }) => {
    setOperation(null);
    setOperationNotice({
      tone: "success",
      message: kind === "cancel"
        ? `Sipariş iptali ${reused ? "aynı güvenli isteğin tekrarı olarak doğrulandı" : "kaydedildi"}. Sağlayıcı refund'u otomatik çalıştırılmadı; finans incelemesini tamamlayın.`
        : `Manuel kargo devri ${reused ? "aynı güvenli isteğin tekrarı olarak doğrulandı" : "kaydedildi"}. Taşıyıcı API/etiket işlemi yapılmadı.`,
    });
    onRefresh();
  };

  return (
    <section className="workspace live-workspace" data-testid="live-orders">
      <header className="workspace-heading operations-heading">
        <div>
          <span className="eyebrow">Entegre backend · {operationsEnabled ? "capability kontrollü" : "salt okunur"}</span>
          <h2 tabIndex="-1">Son sipariş özetleri</h2>
          <p>En fazla son {orderPage.limit} kayıt gösterilir. Genel durum/toplu yazma kapalıdır; iptal ve manuel kargo yalnız açık sunucu capability'si ve işlem doğrulamasıyla sunulur.</p>
        </div>
        <button className="secondary-button" onClick={onRefresh} disabled={refreshing}>
          <Icon name="refresh" />{refreshing ? "Yenileniyor" : "Yenile"}
        </button>
      </header>

      <ResourceWarning error={error} onRetry={onRefresh} />
      {operationNotice && <section className={`notice-card live-operation-notice ${operationNotice.tone === "warning" ? "warning-card" : "success-card"}`} role="status"><Icon name={operationNotice.tone === "warning" ? "warning" : "check"} /><div><strong>{operationNotice.tone === "warning" ? "Güncel veri gerekli" : "İşlem kaydedildi"}</strong><p>{operationNotice.message}</p></div></section>}
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
        {filtered.length > 0 ? <OrdersTable orders={filtered} mutationActions={visibleMutationActions} onOpenOperation={openOperation} /> : (
          <div className="state-panel">
            <Icon name="search" />
            <h3>Eşleşen sipariş yok</h3>
            <p>Arama veya durum filtresini değiştirin.</p>
            <button className="secondary-button" onClick={() => { setQuery(""); setStatus("Tümü"); }}>Filtreleri temizle</button>
          </div>
        )}
      </section>
      {operation?.kind === "cancel" && typeof visibleMutationActions.cancelOrder === "function" && <CancelOrderDialog operation={operation} action={visibleMutationActions.cancelOrder} onClose={closeOperation} onConflict={handleConflict} onUnavailable={handleUnavailable} onComplete={handleComplete} />}
      {operation?.kind === "shipment" && typeof visibleMutationActions.createManualShipment === "function" && <ManualShipmentDialog operation={operation} action={visibleMutationActions.createManualShipment} onClose={closeOperation} onConflict={handleConflict} onUnavailable={handleUnavailable} onComplete={handleComplete} />}
    </section>
  );
}

function Catalog({ catalogPage, error, refreshing, onRefresh }) {
  const products = catalogPage.items;
  const [query, setQuery] = useState("");
  const [publication, setPublication] = useState("all");
  const [stock, setStock] = useState("all");
  const [visibility, setVisibility] = useState("all");
  const filtered = useMemo(() => filterFirstPartyCatalogProducts(products, {
    publication,
    query,
    stock,
    visibility,
  }), [products, publication, query, stock, visibility]);

  const resetFilters = () => {
    setQuery("");
    setPublication("all");
    setStock("all");
    setVisibility("all");
  };

  return (
    <section className="workspace live-workspace" data-testid="live-catalog">
      <header className="workspace-heading operations-heading">
        <div>
          <span className="eyebrow">Entegre backend · birinci taraf · salt okunur</span>
          <h2 tabIndex="-1">Ürünler</h2>
          <p>En fazla son {catalogPage.limit} NovaStore ürün kaydı, ürün kimliği azalan sırada gösterilir.</p>
        </div>
        <button className="secondary-button" onClick={onRefresh} disabled={refreshing}>
          <Icon name="refresh" />{refreshing ? "Yenileniyor" : "Yenile"}
        </button>
      </header>

      <ResourceWarning error={error} onRetry={onRefresh} />
      <section className="notice-card live-boundary-notice" role="note">
        <Icon name="shield" />
        <div>
          <strong>Tek satıcılı, salt okunur katalog</strong>
          <p>Bu liste yalnız NovaStore'un mevcut birinci taraf ürün kayıtlarını gösterir. “İç yayın incelemesi” satıcı izni değildir; satıcı, teklif, risk veya manuel ürün onay kuyruğu oluşturulmaz. Ürün ve medya yazmaları bu turda kapalıdır.</p>
        </div>
      </section>

      <section className="table-card">
        <div className="ledger-toolbar filter-toolbar live-filter-toolbar live-catalog-filters">
          <label className="table-search">
            <Icon name="search" />
            <span className="sr-only">Ürün ara</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ürün, kayıt veya kategori ara" />
          </label>
          <label className="heading-select">
            <span className="sr-only">Yayın durumuna göre filtrele</span>
            <select value={publication} onChange={(event) => setPublication(event.target.value)}>
              {CATALOG_PUBLICATION_FILTER_OPTIONS.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
            </select>
          </label>
          <label className="heading-select">
            <span className="sr-only">Stok durumuna göre filtrele</span>
            <select value={stock} onChange={(event) => setStock(event.target.value)}>
              <option value="all">Tüm stok durumları</option>
              <option value="in_stock">Stokta</option>
              <option value="out_of_stock">Tükendi</option>
            </select>
          </label>
          <label className="heading-select">
            <span className="sr-only">Etkin vitrin görünürlüğüne göre filtrele</span>
            <select value={visibility} onChange={(event) => setVisibility(event.target.value)}>
              <option value="all">Tüm görünürlükler</option>
              <option value="visible">Vitrinde görünür</option>
              <option value="hidden">Vitrinde görünmez</option>
            </select>
          </label>
          <span className="live-result-count">{filtered.length} / {products.length} kayıt{catalogPage.hasMore ? " · daha eski ürünler bu turda gösterilmiyor" : ""}</span>
        </div>

        {products.length === 0 ? (
          <div className="state-panel">
            <Icon name="package" />
            <h3>Henüz ürün kaydı yok</h3>
            <p>Backend birinci taraf katalog için boş bir liste döndürdü.</p>
            <button className="secondary-button" onClick={onRefresh} disabled={refreshing}>{refreshing ? "Yenileniyor" : "Yeniden dene"}</button>
          </div>
        ) : filtered.length > 0 ? (
          <div className="table-scroll table-scroll-hint" tabIndex="0" role="region" aria-label="Birinci taraf ürün özeti tablosu">
            <table className="data-table live-catalog-table">
              <caption className="sr-only">Entegre backend'den okunan salt okunur birinci taraf ürün özetleri</caption>
              <thead><tr><th scope="col">Ürün</th><th scope="col">Birincil kategori</th><th scope="col">Fiyat</th><th scope="col">Stok</th><th scope="col">Yayın</th><th scope="col">Etkin vitrin</th><th scope="col">Medya</th><th scope="col">Güncellendi</th></tr></thead>
              <tbody>{filtered.map((product) => {
                const publicationStatus = resolveCatalogPublicationStatus(product);
                const customerVisible = isCatalogProductEffectivelyVisible(product);
                return (
                  <tr key={product.id}>
                    <td><span className="live-catalog-product"><Icon name="package" /><span><strong>{product.name}</strong><small>{product.id}</small></span></span></td>
                    <td><span className="live-customer-cell"><strong>{product.primaryCategoryName || "Birincil kategori yok"}</strong><small>{product.primaryCategoryPath || `${product.categoryCount} kategori bağlantısı`}</small></span></td>
                    <td><span className="live-customer-cell"><strong>{money(product.price, product.currency)}</strong>{product.oldPrice !== null && <small>Önceki {money(product.oldPrice, product.currency)}</small>}</span></td>
                    <td><span className={`status ${product.stock > 0 ? "status-stokta" : "status-stokta-yok"}`}>{product.stock > 0 ? `${product.stock} adet` : "Tükendi"}</span></td>
                    <td><span className={`status status-${statusClass(CATALOG_PUBLICATION_STATUS_LABELS[publicationStatus])}`}>{CATALOG_PUBLICATION_STATUS_LABELS[publicationStatus]}</span>{product.deletedAt && <small className="live-status-note">Silinmiş kayıt vitrine açılamaz.</small>}</td>
                    <td><span className={`status ${customerVisible ? "status-yayında" : "status-yayından-kaldırıldı"}`}>{customerVisible ? "Görünür" : "Görünmez"}</span>{!customerVisible && product.customerVisible && <small className="live-status-note">Ham bayrak açık; yayın veya arşiv durumu vitrine kapatır.</small>}</td>
                    <td><span className={`live-media-presence ${product.hasMedia ? "has-media" : "no-media"}`}><Icon name={product.hasMedia ? "check" : "warning"} />{product.hasMedia ? "Mevcut" : "Yok"}</span></td>
                    <td><span className="live-customer-cell"><strong>{dateTime(product.updatedAt || product.createdAt)}</strong><small>{product.updatedAt ? "Son güncelleme" : product.createdAt ? "Oluşturulma" : "Tarih bilgisi yok"}</small></span></td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        ) : (
          <div className="state-panel">
            <Icon name="search" />
            <h3>Eşleşen ürün yok</h3>
            <p>Arama, yayın, stok veya görünürlük filtresini değiştirin.</p>
            <button className="secondary-button" onClick={resetFilters}>Filtreleri temizle</button>
          </div>
        )}
      </section>
    </section>
  );
}

const catalogStructureTabs = Object.freeze([
  ["categories", "Kategoriler"],
  ["attributes", "Özellikler"],
  ["templates", "Şablonlar"],
  ["collections", "Koleksiyonlar"],
  ["menus", "Menüler"],
]);

const attributeTypeLabels = Object.freeze({
  text: "Metin",
  number: "Sayı",
  boolean: "Evet / hayır",
  option: "Tek seçenek",
  multi_option: "Çoklu seçenek",
  range: "Aralık",
});

const collectionRuleLabels = Object.freeze({
  new_arrivals: "Yeni gelenler",
  discount: "İndirim",
  best_sellers: "Çok satanlar",
});

const menuTargetLabels = Object.freeze({
  category: "Kategori",
  collection: "Koleksiyon",
  internal_url: "İç bağlantı",
});

const catalogStructureSearchFields = Object.freeze({
  categories: ["id", "name", "slug", "path", "parentId"],
  attributes: ["id", "name", "code", "type", "unit"],
  templates: ["id", "name", "categoryId", "categoryName", "categoryPath"],
  collections: ["id", "name", "slug", "type", "ruleCode"],
  menus: ["id", "name", "code"],
  menuItems: ["id", "title", "menuCode", "targetType", "categoryId", "collectionId"],
});

const filterStructureActivity = (items, activity) => items.filter((item) => {
  if (activity === "all") return true;
  const active = isCatalogStructureItemActive(item);
  return activity === "active" ? active : !active;
});

function CatalogStructure({ structure, error, refreshing, onRefresh }) {
  const [view, setView] = useState("categories");
  const [query, setQuery] = useState("");
  const [activity, setActivity] = useState("all");
  const sourceByView = {
    categories: structure.categories,
    attributes: structure.attributeDefinitions,
    templates: structure.attributeTemplates,
    collections: structure.collections,
    menus: structure.menus,
  };
  const currentPage = sourceByView[view];
  const filtered = useMemo(() => filterStructureActivity(
    filterCatalogStructureItems(currentPage.items, query, catalogStructureSearchFields[view]),
    activity,
  ), [activity, currentPage.items, query, view]);
  const filteredMenuItems = useMemo(() => filterStructureActivity(
    filterCatalogStructureItems(structure.menuItems.items, query, catalogStructureSearchFields.menuItems),
    activity,
  ), [activity, query, structure.menuItems.items]);
  const counts = {
    categories: structure.categories.items.length,
    attributes: structure.attributeDefinitions.items.length,
    templates: structure.attributeTemplates.items.length,
    collections: structure.collections.items.length,
    menus: structure.menus.items.length,
  };
  const currentHasMore = currentPage.hasMore || (view === "menus" && structure.menuItems.hasMore);

  const resetFilters = () => {
    setQuery("");
    setActivity("all");
  };

  const empty = (
    <div className="state-panel">
      <Icon name="search" />
      <h3>Eşleşen yapı kaydı yok</h3>
      <p>Arama veya etkinlik filtresini değiştirin.</p>
      <button className="secondary-button" onClick={resetFilters}>Filtreleri temizle</button>
    </div>
  );

  let table;
  if (view === "categories") {
    table = filtered.length ? (
      <div className="table-scroll table-scroll-hint" tabIndex="0" role="region" aria-label="Kategori yapı özeti tablosu">
        <table className="data-table live-structure-table"><caption className="sr-only">Salt okunur kategori yapı özetleri</caption>
          <thead><tr><th scope="col">Kategori</th><th scope="col">Hiyerarşi</th><th scope="col">NovaStore ürünü</th><th scope="col">Şablon</th><th scope="col">Yayın yüzeyleri</th><th scope="col">Durum</th></tr></thead>
          <tbody>{filtered.map((item) => <tr key={item.id}>
            <td><span className="live-customer-cell"><strong>{item.name}</strong><small>#{item.id} · {item.slug || "slug bekliyor"}</small></span></td>
            <td><span className="live-customer-cell"><strong>{item.path || "Yol bekliyor"}</strong><small>Derinlik {item.depth ?? "?"} · üst #{item.parentId || "kök"} · {item.childCount} alt kategori</small></span></td>
            <td>{item.firstPartyProductCount}</td><td>{item.attributeTemplateCount}</td>
            <td><span className="live-flag-list"><small>Vitrin {item.customerVisible ? "açık" : "kapalı"}</small><small>Menü {item.showInMenu ? "açık" : "kapalı"}</small><small>Ana sayfa {item.showOnHome ? "açık" : "kapalı"}</small></span></td>
            <td><span className={`status ${isCatalogStructureItemActive(item) ? "status-yayında" : "status-yayından-kaldırıldı"}`}>{item.deletedAt ? "Arşivli" : item.active ? "Etkin" : "Pasif"}</span></td>
          </tr>)}</tbody>
        </table>
      </div>
    ) : empty;
  } else if (view === "attributes") {
    table = filtered.length ? (
      <div className="table-scroll table-scroll-hint" tabIndex="0" role="region" aria-label="Özellik tanımı özeti tablosu">
        <table className="data-table live-structure-table"><caption className="sr-only">Salt okunur özellik tanımı özetleri</caption>
          <thead><tr><th scope="col">Özellik</th><th scope="col">Tür</th><th scope="col">Seçenek</th><th scope="col">Şablon</th><th scope="col">NovaStore değeri</th><th scope="col">Davranış</th><th scope="col">Durum</th></tr></thead>
          <tbody>{filtered.map((item) => <tr key={item.id}>
            <td><span className="live-customer-cell"><strong>{item.name}</strong><small>#{item.id} · {item.code}</small></span></td>
            <td>{attributeTypeLabels[item.type]}{item.unit && <small>{item.unit}</small>}</td><td>{item.optionCount}</td><td>{item.templateCount}</td><td>{item.firstPartyValueCount}</td>
            <td><span className="live-flag-list"><small>{item.filterable ? "Filtrelenir" : "Filtrelenmez"}</small><small>{item.required ? "Zorunlu" : "İsteğe bağlı"}</small><small>{item.variantRelevant ? "Varyantla ilgili" : "Varyant dışı"}</small></span></td>
            <td><span className={`status ${item.active ? "status-yayında" : "status-yayından-kaldırıldı"}`}>{item.active ? "Etkin" : "Pasif"}</span></td>
          </tr>)}</tbody>
        </table>
      </div>
    ) : empty;
  } else if (view === "templates") {
    table = filtered.length ? (
      <div className="table-scroll table-scroll-hint" tabIndex="0" role="region" aria-label="Özellik şablonu özeti tablosu">
        <table className="data-table live-structure-table"><caption className="sr-only">Salt okunur özellik şablonu özetleri</caption>
          <thead><tr><th scope="col">Şablon</th><th scope="col">Kategori</th><th scope="col">Özellik</th><th scope="col">Zorunlu</th><th scope="col">Filtrelenebilir</th><th scope="col">Durum</th></tr></thead>
          <tbody>{filtered.map((item) => <tr key={item.id}>
            <td><span className="live-customer-cell"><strong>{item.name}</strong><small>#{item.id}</small></span></td>
            <td><span className="live-customer-cell"><strong>{item.categoryName}</strong><small>#{item.categoryId} · {item.categoryPath || "Yol bekliyor"}</small></span></td>
            <td>{item.attributeCount}</td><td>{item.requiredCount}</td><td>{item.filterableCount}</td>
            <td><span className={`status ${item.active ? "status-yayında" : "status-yayından-kaldırıldı"}`}>{item.active ? "Etkin" : "Pasif"}</span></td>
          </tr>)}</tbody>
        </table>
      </div>
    ) : empty;
  } else if (view === "collections") {
    table = filtered.length ? (
      <div className="table-scroll table-scroll-hint" tabIndex="0" role="region" aria-label="Koleksiyon özeti tablosu">
        <table className="data-table live-structure-table"><caption className="sr-only">Salt okunur koleksiyon özetleri</caption>
          <thead><tr><th scope="col">Koleksiyon</th><th scope="col">Tür</th><th scope="col">Kural</th><th scope="col">Manuel NovaStore ürünü</th><th scope="col">Ana sayfa</th><th scope="col">Durum</th></tr></thead>
          <tbody>{filtered.map((item) => <tr key={item.id}>
            <td><span className="live-customer-cell"><strong>{item.name}</strong><small>#{item.id} · {item.slug}</small></span></td>
            <td>{item.type === "manual" ? "Manuel" : "Dinamik"}</td><td>{item.ruleCode ? collectionRuleLabels[item.ruleCode] : `${item.ruleCount} kural`}</td><td>{item.type === "manual" ? item.firstPartyManualProductCount : "Kural tabanlı"}</td><td>{item.showOnHome ? "Gösteriliyor" : "Gizli"}</td>
            <td><span className={`status ${isCatalogStructureItemActive(item) ? "status-yayında" : "status-yayından-kaldırıldı"}`}>{item.deletedAt ? "Arşivli" : item.active ? "Etkin" : "Pasif"}</span></td>
          </tr>)}</tbody>
        </table>
      </div>
    ) : empty;
  } else {
    table = filtered.length || filteredMenuItems.length ? (
      <div className="live-structure-menu-stack">
        <div className="table-scroll table-scroll-hint" tabIndex="0" role="region" aria-label="Menü özeti tablosu">
          <table className="data-table live-structure-table"><caption className="sr-only">Salt okunur menü özetleri</caption>
            <thead><tr><th scope="col">Menü</th><th scope="col">Toplam öğe</th><th scope="col">Etkin öğe</th><th scope="col">Kök öğe</th><th scope="col">Durum</th></tr></thead>
            <tbody>{filtered.map((item) => <tr key={item.id}><td><span className="live-customer-cell"><strong>{item.name}</strong><small>#{item.id} · {item.code}</small></span></td><td>{item.itemCount}</td><td>{item.activeItemCount}</td><td>{item.rootItemCount}</td><td><span className={`status ${item.active ? "status-yayında" : "status-yayından-kaldırıldı"}`}>{item.active ? "Etkin" : "Pasif"}</span></td></tr>)}</tbody>
          </table>
        </div>
        <div className="table-scroll table-scroll-hint" tabIndex="0" role="region" aria-label="Menü öğesi özeti tablosu">
          <table className="data-table live-structure-table"><caption className="sr-only">Salt okunur menü öğesi özetleri; iç URL değerleri gösterilmez</caption>
            <thead><tr><th scope="col">Öğe</th><th scope="col">Menü</th><th scope="col">Üst öğe</th><th scope="col">Hedef türü</th><th scope="col">Hedef kaydı</th><th scope="col">Durum</th></tr></thead>
            <tbody>{filteredMenuItems.map((item) => <tr key={item.id}><td><span className="live-customer-cell"><strong>{item.title}</strong><small>#{item.id} · sıra {item.sortOrder}</small></span></td><td>{item.menuCode}</td><td>{item.parentId ? `#${item.parentId}` : "Kök"}</td><td>{item.targetType ? menuTargetLabels[item.targetType] : "Başlık"}</td><td>{item.categoryId ? `Kategori #${item.categoryId}` : item.collectionId ? `Koleksiyon #${item.collectionId}` : item.hasInternalUrl ? "İç bağlantı mevcut" : "Hedef yok"}</td><td><span className={`status ${item.active ? "status-yayında" : "status-yayından-kaldırıldı"}`}>{item.active ? "Etkin" : "Pasif"}</span></td></tr>)}</tbody>
          </table>
        </div>
      </div>
    ) : empty;
  }

  return (
    <section className="workspace live-workspace" data-testid="live-catalog-structure">
      <header className="workspace-heading operations-heading">
        <div><span className="eyebrow">Entegre backend · ortak yapı · salt okunur</span><h2 tabIndex="-1">Katalog yapısı</h2><p>Kategori, özellik, şablon, koleksiyon ve menü kayıtları aynı bounded yönetim sözleşmesinden okunur.</p></div>
        <button className="secondary-button" onClick={onRefresh} disabled={refreshing}><Icon name="refresh" />{refreshing ? "Yenileniyor" : "Yenile"}</button>
      </header>
      <ResourceWarning error={error} onRetry={onRefresh} />
      <section className="notice-card live-boundary-notice" role="note"><Icon name="shield" /><div><strong>Satıcı portalı veya ürün izin kuyruğu değildir</strong><p>Bu ekran bugünkü tek satıcılı NovaStore'un ortak katalog yapısını okur. Satıcı, teklif, risk puanı, onay aksiyonu, medya URL'si veya yazma isteği taşımaz; menülerin iç URL değerleri de DTO'ya alınmaz.</p></div></section>
      <section className="table-card live-structure-card">
        <nav className="ledger-tabs live-structure-tabs" aria-label="Katalog yapı bölümleri">
          {catalogStructureTabs.map(([id, label]) => <button type="button" key={id} className={view === id ? "active" : ""} aria-current={view === id ? "page" : undefined} onClick={() => setView(id)}>{label} <b>{counts[id]}</b></button>)}
        </nav>
        <div className="ledger-toolbar filter-toolbar live-filter-toolbar live-structure-filters">
          <label className="table-search"><Icon name="search" /><span className="sr-only">Yapı kaydı ara</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ad, kod, yol veya kayıt ara" /></label>
          <label className="heading-select"><span className="sr-only">Etkinlik durumuna göre filtrele</span><select value={activity} onChange={(event) => setActivity(event.target.value)}><option value="all">Tüm durumlar</option><option value="active">Etkin</option><option value="inactive">Pasif / arşivli</option></select></label>
          <span className="live-result-count">{view === "menus" ? `${filtered.length} menü · ${filteredMenuItems.length} öğe` : `${filtered.length} / ${currentPage.items.length} kayıt`}{currentHasMore ? " · liste sınırının dışında kayıt var" : ""}</span>
        </div>
        {table}
      </section>
    </section>
  );
}

function Returns({ returnPage, error, refreshing, onRefresh }) {
  const returns = returnPage.items;
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("Tümü");
  const statuses = useMemo(() => ["Tümü", ...new Set(returns.map((item) => item.status))], [returns]);
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("tr-TR");
    return returns.filter((item) => {
      const matchesStatus = status === "Tümü" || item.status === status;
      const haystack = `${item.id} ${item.orderId} ${item.customerName} ${item.reasonCode}`.toLocaleLowerCase("tr-TR");
      return matchesStatus && (!normalized || haystack.includes(normalized));
    });
  }, [query, returns, status]);

  return (
    <section className="workspace live-workspace" data-testid="live-returns">
      <header className="workspace-heading operations-heading">
        <div>
          <span className="eyebrow">Entegre backend · salt okunur</span>
          <h2 tabIndex="-1">İade özetleri</h2>
          <p>En fazla {returnPage.limit} operasyon kaydı gösterilir; onay, red, durum güncelleme veya gerçek refund isteği gönderilmez.</p>
        </div>
        <button className="secondary-button" onClick={onRefresh} disabled={refreshing}><Icon name="refresh" />{refreshing ? "Yenileniyor" : "Yenile"}</button>
      </header>

      <ResourceWarning error={error} onRetry={onRefresh} />
      <section className="notice-card live-boundary-notice" role="note">
        <Icon name="shield" />
        <div><strong>Finansal işlem kapalı</strong><p>Bu görünüm mevcut yerel iade ve refund durumlarını okur. “Tamamlandı” durumu dahil hiçbir değer sağlayıcı refund'u veya para hareketini kanıtlamaz.</p></div>
      </section>
      <section className="table-card">
        <div className="ledger-toolbar filter-toolbar live-filter-toolbar">
          <label className="table-search"><Icon name="search" /><span className="sr-only">İade ara</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="İade, sipariş, müşteri veya neden ara" /></label>
          <label className="heading-select"><span className="sr-only">İade durumuna göre filtrele</span><select value={status} onChange={(event) => setStatus(event.target.value)}>{statuses.map((value) => <option key={value} value={value}>{value === "Tümü" ? value : returnStatusLabels[value] || value}</option>)}</select></label>
          <span className="live-result-count">{filtered.length} / {returns.length} kayıt{returnPage.hasMore ? " · liste sınırının dışındaki kayıtlar bu turda gösterilmiyor" : ""}</span>
        </div>
        {returns.length === 0 ? <div className="state-panel"><Icon name="refresh" /><h3>Henüz iade kaydı yok</h3><p>Backend boş bir iade özeti döndürdü.</p></div> : filtered.length > 0 ? (
          <div className="table-scroll table-scroll-hint" tabIndex="0" role="region" aria-label="İade özeti tablosu">
            <table className="data-table live-returns-table">
              <caption className="sr-only">Entegre backend’den okunan salt-okunur iade özetleri</caption>
              <thead><tr><th scope="col">İade</th><th scope="col">Sipariş</th><th scope="col">Müşteri</th><th scope="col">İade durumu</th><th scope="col">Neden</th><th scope="col">Talep tutarı</th><th scope="col">Sipariş durumu</th><th scope="col">Tarih</th></tr></thead>
              <tbody>{filtered.map((item) => <tr key={item.id}>
                <td><strong>{item.id}</strong></td><td>{item.orderId}</td><td>{item.customerName}</td>
                <td><span className={`status status-${statusClass(returnStatusLabels[item.status] || item.status)}`}>{returnStatusLabels[item.status] || item.status}</span></td>
                <td>{item.reasonCode}</td><td><span className="live-customer-cell"><strong>{item.refundAmount === null ? "Belirtilmedi" : money(item.refundAmount, item.currency)}</strong><small>{item.currency} · ödeme {item.paymentStatus}</small><small>Yerel refund: {item.refundStatus} · sağlayıcı/para hareketi doğrulanmadı</small></span></td>
                <td><span className={`status status-${statusClass(item.orderStatus)}`}>{item.orderStatus}</span></td><td>{dateTime(item.createdAt)}</td>
              </tr>)}</tbody>
            </table>
          </div>
        ) : <div className="state-panel"><Icon name="refresh" /><h3>Eşleşen iade yok</h3><p>Arama veya durum filtresini değiştirin.</p><button className="secondary-button" onClick={() => { setQuery(""); setStatus("Tümü"); }}>Filtreleri temizle</button></div>}
      </section>
    </section>
  );
}

function Notifications({ notificationPage, error, refreshing, onRefresh }) {
  const notifications = notificationPage.items;
  const [query, setQuery] = useState("");
  const [readFilter, setReadFilter] = useState("Tümü");
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("tr-TR");
    return notifications.filter((item) => {
      const matchesRead = readFilter === "Tümü" || (readFilter === "Okunmadı" ? !item.isRead : item.isRead);
      const haystack = `${item.id} ${item.type} ${item.message}`.toLocaleLowerCase("tr-TR");
      return matchesRead && (!normalized || haystack.includes(normalized));
    });
  }, [notifications, query, readFilter]);

  return (
    <section className="workspace live-workspace" data-testid="live-notifications">
      <header className="workspace-heading operations-heading">
        <div><span className="eyebrow">Entegre backend · salt okunur</span><h2 tabIndex="-1">Admin bildirimleri</h2><p>En fazla son {notificationPage.limit} admin bildirimi gösterilir; okundu durumu bu turda değiştirilmez.</p></div>
        <button className="secondary-button" onClick={onRefresh} disabled={refreshing}><Icon name="refresh" />{refreshing ? "Yenileniyor" : "Yenile"}</button>
      </header>
      <ResourceWarning error={error} onRetry={onRefresh} />
      <section className="table-card">
        <div className="ledger-toolbar filter-toolbar live-filter-toolbar">
          <label className="table-search"><Icon name="search" /><span className="sr-only">Bildirim ara</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Bildirim türü veya içerik ara" /></label>
          <label className="heading-select"><span className="sr-only">Okunma durumuna göre filtrele</span><select value={readFilter} onChange={(event) => setReadFilter(event.target.value)}><option>Tümü</option><option>Okunmadı</option><option>Okundu</option></select></label>
          <span className="live-result-count">{filtered.length} / {notifications.length} kayıt{notificationPage.hasMore ? " · daha eski kayıtlar bu turda gösterilmiyor" : ""}</span>
        </div>
        {notifications.length === 0 ? <div className="state-panel"><Icon name="bell" /><h3>Henüz admin bildirimi yok</h3><p>Backend boş bir admin bildirimi özeti döndürdü.</p></div> : filtered.length > 0 ? <div className="live-notification-list">{filtered.map((item) => <article className={`live-notification-card ${item.isRead ? "is-read" : "is-unread"}`} key={item.id}>
          <Icon name="bell" /><div><header><strong>{item.type.replaceAll("_", " ")}</strong><span>{item.isRead ? "Okundu" : "Okunmadı"}</span></header><p>{item.message}</p><small>{item.id} · {dateTime(item.createdAt)}</small></div>
        </article>)}</div> : <div className="state-panel"><Icon name="bell" /><h3>Eşleşen bildirim yok</h3><p>Arama veya okunma filtresini değiştirin.</p><button className="secondary-button" onClick={() => { setQuery(""); setReadFilter("Tümü"); }}>Filtreleri temizle</button></div>}
      </section>
    </section>
  );
}

const railItems = [
  { id: "dashboard", label: "Pano", icon: "house", capability: "dashboardRead", implemented: true },
  { id: "orders", label: "Siparişler", icon: "orders", capability: "ordersRead", implemented: true },
  { id: "returns", label: "İadeler", icon: "refresh", capability: "returnsRead", implemented: true },
  { id: "notifications", label: "Bildirimler", icon: "bell", capability: "notificationsRead", implemented: true },
  { id: "catalog", label: "Ürünler", icon: "package", capability: "firstPartyCatalogRead", implemented: true },
  { id: "catalogStructure", label: "Katalog yapısı", icon: "grid", capability: "catalogStructureRead", implemented: true },
  { id: "customers", label: "Müşteriler · endpoint yok", icon: "user", capability: "customerAdmin", implemented: false },
  { id: "sellers", label: "Satıcılar · altyapı yok", icon: "storefront", capability: "sellerAdmin", implemented: false },
  { id: "finance", label: "Finans · ledger yok", icon: "card", capability: "settlements", implemented: false },
];

const pageCapabilities = Object.freeze({
  dashboard: "dashboardRead",
  orders: "ordersRead",
  returns: "returnsRead",
  notifications: "notificationsRead",
  catalog: "firstPartyCatalogRead",
  catalogStructure: "catalogStructureRead",
});
const pageLabels = Object.freeze({ dashboard: "Pano", orders: "Siparişler", returns: "İadeler", notifications: "Bildirimler", catalog: "Ürünler", catalogStructure: "Katalog yapısı" });
const noSupportedModuleError = Object.freeze({
  message: "Bu admin oturumunda Commerce Pro'nun entegre salt-okunur modülleri açık değil.",
});
const ordersUnavailableError = Object.freeze({
  message: "Sipariş özeti okuma yeteneği bu admin oturumunda açık değil.",
});
const dashboardUnavailableError = Object.freeze({
  message: "Dashboard okuma yeteneği bu admin oturumunda açık değil.",
});
const returnsUnavailableError = Object.freeze({
  message: "İade özeti okuma yeteneği bu admin oturumunda açık değil.",
});
const notificationsUnavailableError = Object.freeze({
  message: "Bildirim özeti okuma yeteneği bu admin oturumunda açık değil.",
});
const catalogUnavailableError = Object.freeze({
  message: "Birinci taraf katalog okuma yeteneği bu admin oturumunda açık değil.",
});
const catalogStructureUnavailableError = Object.freeze({
  message: "Katalog yapısı okuma yeteneği bu admin oturumunda açık değil.",
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
  const loadNotifications = useCallback(({ signal }) => adapter.notifications({ signal }), [adapter]);
  const loadOrders = useCallback(({ signal }) => adapter.orders({ signal }), [adapter]);
  const loadReturns = useCallback(({ signal }) => adapter.returns({ signal }), [adapter]);
  const loadCatalog = useCallback(({ signal }) => adapter.catalog({ signal }), [adapter]);
  const loadCatalogStructure = useCallback(({ signal }) => adapter.catalogStructure({ signal }), [adapter]);
  const sessionResource = useResource(loadSession, { preserveDataOnError: false });
  const sessionLoaded = sessionResource.phase === "ready";
  const capabilities = sessionResource.data?.capabilities || {};
  const statsEnabled = sessionLoaded && hasCapability(capabilities, "dashboardRead");
  const ordersEnabled = sessionLoaded && hasCapability(capabilities, "ordersRead");
  const returnsEnabled = sessionLoaded && hasCapability(capabilities, "returnsRead");
  const notificationsEnabled = sessionLoaded && hasCapability(capabilities, "notificationsRead");
  const catalogEnabled = sessionLoaded && hasCapability(capabilities, "firstPartyCatalogRead");
  const catalogStructureEnabled = sessionLoaded && hasCapability(capabilities, "catalogStructureRead");
  const mutationActions = useMemo(() => adapter.mutationActions(capabilities), [adapter, capabilities]);
  const cancelWriteEnabled = typeof mutationActions.cancelOrder === "function";
  const shipmentWriteEnabled = typeof mutationActions.createManualShipment === "function";
  const statsResource = useResource(loadStats, { enabled: statsEnabled });
  const notificationsResource = useResource(loadNotifications, { enabled: notificationsEnabled });
  const ordersResource = useResource(loadOrders, { enabled: ordersEnabled });
  const returnsResource = useResource(loadReturns, { enabled: returnsEnabled });
  const catalogResource = useResource(loadCatalog, { enabled: catalogEnabled });
  const catalogStructureResource = useResource(loadCatalogStructure, { enabled: catalogStructureEnabled });
  const statsLoaded = statsResource.phase === "ready";
  const ordersLoaded = ordersResource.phase === "ready" || ordersResource.phase === "empty";
  const returnsLoaded = returnsResource.phase === "ready" || returnsResource.phase === "empty";
  const notificationsLoaded = notificationsResource.phase === "ready" || notificationsResource.phase === "empty";
  const catalogLoaded = catalogResource.phase === "ready" || catalogResource.phase === "empty";
  const catalogStructureLoaded = catalogStructureResource.phase === "ready" || catalogStructureResource.phase === "empty";
  const enabledPages = useMemo(() => Object.keys(pageCapabilities).filter((pageId) => (
    hasCapability(capabilities, pageCapabilities[pageId])
  )), [capabilities]);
  const lastUpdatedAt = [ordersResource.updatedAt, returnsResource.updatedAt, notificationsResource.updatedAt, catalogResource.updatedAt, catalogStructureResource.updatedAt]
    .filter(Boolean)
    .sort((left, right) => right.getTime() - left.getTime())[0] || null;

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
    if (!enabledPages.includes(page) && enabledPages[0]) setPage(enabledPages[0]);
  }, [enabledPages, page, sessionLoaded]);

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
    if (notificationsEnabled) notificationsResource.reload();
    if (ordersEnabled) ordersResource.reload();
    if (returnsEnabled) returnsResource.reload();
    if (catalogEnabled) catalogResource.reload();
    if (catalogStructureEnabled) catalogStructureResource.reload();
  };
  const logout = () => {
    localStorage.removeItem(ADMIN_TOKEN_KEY);
    window.location.href = "admin-login.html?next=admin-commerce-pro-live.html";
  };

  let pageContent;
  if (!sessionLoaded) {
    pageContent = <StatePanel phase={sessionResource.phase} error={sessionResource.error} onRetry={sessionResource.reload} />;
  } else if (enabledPages.length === 0) {
    pageContent = <StatePanel phase="forbidden" error={noSupportedModuleError} onRetry={sessionResource.reload} />;
  } else if (page === "dashboard") {
    pageContent = !statsEnabled
      ? <StatePanel phase="forbidden" error={dashboardUnavailableError} onRetry={statsResource.reload} />
      : statsLoaded
        ? <><ResourceWarning error={statsResource.error} onRetry={statsResource.reload} /><Dashboard stats={statsResource.data} orderPage={ordersResource.data} orderPhase={ordersResource.phase} orderError={ordersResource.error} ordersEnabled={ordersEnabled} onRetryOrders={ordersResource.reload} onOpenOrders={() => navigate("orders")} /></>
        : <StatePanel phase={statsResource.phase} error={statsResource.error} onRetry={statsResource.reload} />;
  } else if (page === "orders") {
    pageContent = !ordersEnabled
      ? <StatePanel phase="forbidden" error={ordersUnavailableError} onRetry={ordersResource.reload} />
      : ordersLoaded
        ? <Orders orderPage={ordersResource.data} error={ordersResource.error} refreshing={ordersResource.refreshing} onRefresh={ordersResource.reload} onReloadCapabilities={sessionResource.reload} mutationActions={mutationActions} />
        : <StatePanel phase={ordersResource.phase} error={ordersResource.error} onRetry={ordersResource.reload} />;
  } else if (page === "returns") {
    pageContent = !returnsEnabled
      ? <StatePanel phase="forbidden" error={returnsUnavailableError} onRetry={returnsResource.reload} />
      : returnsLoaded
        ? <Returns returnPage={returnsResource.data} error={returnsResource.error} refreshing={returnsResource.refreshing} onRefresh={returnsResource.reload} />
        : <StatePanel phase={returnsResource.phase} error={returnsResource.error} onRetry={returnsResource.reload} />;
  } else if (page === "notifications") {
    pageContent = !notificationsEnabled
      ? <StatePanel phase="forbidden" error={notificationsUnavailableError} onRetry={notificationsResource.reload} />
      : notificationsLoaded
        ? <Notifications notificationPage={notificationsResource.data} error={notificationsResource.error} refreshing={notificationsResource.refreshing} onRefresh={notificationsResource.reload} />
        : <StatePanel phase={notificationsResource.phase} error={notificationsResource.error} onRetry={notificationsResource.reload} />;
  } else if (page === "catalog") {
    pageContent = !catalogEnabled
      ? <StatePanel phase="forbidden" error={catalogUnavailableError} onRetry={catalogResource.reload} />
      : catalogLoaded
        ? <Catalog catalogPage={catalogResource.data} error={catalogResource.error} refreshing={catalogResource.refreshing} onRefresh={catalogResource.reload} />
        : <StatePanel phase={catalogResource.phase} error={catalogResource.error} onRetry={catalogResource.reload} />;
  } else if (page === "catalogStructure") {
    pageContent = !catalogStructureEnabled
      ? <StatePanel phase="forbidden" error={catalogStructureUnavailableError} onRetry={catalogStructureResource.reload} />
      : catalogStructureLoaded
        ? <CatalogStructure structure={catalogStructureResource.data} error={catalogStructureResource.error} refreshing={catalogStructureResource.refreshing} onRefresh={catalogStructureResource.reload} />
        : <StatePanel phase={catalogStructureResource.phase} error={catalogStructureResource.error} onRetry={catalogStructureResource.reload} />;
  } else {
    pageContent = <StatePanel phase="forbidden" error={noSupportedModuleError} onRetry={sessionResource.reload} />;
  }

  return (
    <div className={`admin-shell ${contextOpen ? "context-open" : "context-closed"}`} data-testid="integrated-admin-shell">
      <a className="skip-link" href="#main-content">Ana içeriğe geç</a>
      <aside className="icon-rail" aria-label="Ana yönetim alanları">
        <div className="rail-logo"><Icon name="storefront" /><span>NOVA</span></div>
        <nav className="rail-nav">
          {railItems.map((item) => {
            const enabled = item.implemented && hasCapability(capabilities, item.capability);
            if (["catalog", "catalogStructure"].includes(item.id) && !enabled) return null;
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
            <button className={page === "returns" ? "active" : ""} onClick={() => navigate("returns")} disabled={!hasCapability(capabilities, "returnsRead")}><Icon name="refresh" /><span>İadeler</span><b>{returnsResource.data?.items.length || 0}</b></button>
            <button className={page === "notifications" ? "active" : ""} onClick={() => navigate("notifications")} disabled={!hasCapability(capabilities, "notificationsRead")}><Icon name="bell" /><span>Bildirimler</span><b>{notificationsResource.data?.items.filter((item) => !item.isRead).length || 0}</b></button>
            {catalogEnabled && <button className={page === "catalog" ? "active" : ""} onClick={() => navigate("catalog")}><Icon name="package" /><span>Ürünler</span><b>{catalogResource.data?.items.length || 0}</b></button>}
            {catalogStructureEnabled && <button className={page === "catalogStructure" ? "active" : ""} onClick={() => navigate("catalogStructure")}><Icon name="grid" /><span>Katalog yapısı</span><b>{catalogStructureResource.data?.categories.items.length || 0}</b></button>}
          </section>
          <section className="marketplace-links">
            <strong>Planlanan modüller</strong>
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
            <div className="breadcrumb"><span>Entegre yönetim</span><Icon name="right" /><strong>{pageLabels[page] || "Modül"}</strong></div>
          </div>
          <div className="command-trigger live-command-status" role="status"><Icon name="shield" /><span>{sessionLoaded ? "Admin oturumu doğrulandı" : "Admin oturumu doğrulanıyor"}</span></div>
          <button className="secondary-button live-refresh" onClick={reloadAll} disabled={sessionResource.refreshing || sessionResource.phase === "loading"}><Icon name="refresh" /><span>Veriyi yenile</span></button>
          <button className="profile-button" onClick={logout}><span className="avatar avatar-small">A</span><span>Çıkış</span></button>
        </header>

        <main className="content-area" id="main-content">
          {pageContent}
        </main>

        <footer className="statusbar">
          <div className="preview-banner live-banner" role="note" data-testid="live-banner"><Icon name="shield" /><strong>Entegre tek-satıcı modu</strong><span>Mock fallback yok · {cancelWriteEnabled || shipmentWriteEnabled ? "yazmalar capability ve doğrulamayla sınırlı" : "bu oturum yazma isteği göndermez"}</span></div>
          <span className={sessionLoaded ? "healthy" : ""}>{sessionLoaded ? "Oturum doğrulandı" : sessionResource.phase === "error" ? "Bağlantı hatası" : "Bağlantı bekleniyor"}</span>
          <span>{lastUpdatedAt ? `Son veri okuması ${dateTime(lastUpdatedAt)}` : "Entegre veri bekleniyor"}</span>
          <button onClick={reloadAll} disabled={sessionResource.refreshing || statsResource.refreshing || ordersResource.refreshing || returnsResource.refreshing || notificationsResource.refreshing || catalogResource.refreshing || catalogStructureResource.refreshing}><Icon name="refresh" />Yenile</button>
        </footer>
      </div>
    </div>
  );
}
