import {readStudioWorkshopLaunch} from './theme-platform/studioWorkshopLaunch.js';
import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import OrderDeliveryDetail from "./OrderDeliveryDetail.jsx";
import productCardFraming from "../../shared/productCardFraming.js";
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
import {
  catalogAttributesToMutationMap,
  CATALOG_PRODUCT_PUBLICATION_STATUSES,
} from "./integration/catalogMutations.js";
import { createAdminHttp } from "./integration/adminHttp.js";
import {
  createMutationIdempotencyKey,
  MANUAL_DELIVERY_EXPECTED_SHIPMENT_STATUS,
  MANUAL_DELIVERY_EXPECTED_STATUS,
  MANUAL_SHIPMENT_EXPECTED_STATUS,
  ORDER_CANCEL_EXPECTED_STATUSES,
  ORDER_CANCEL_NOTE_MAX_LENGTH,
  ORDER_CANCEL_REASONS,
} from "./integration/orderMutations.js";
import { useResource } from "./integration/useResource.js";
import { AdminPresentationShell } from "./AdminPresentationShell.jsx";
import {
  integratedAdminPageHash,
  resolveIntegratedAdminPage,
} from "./integration/adminHistory.js";
import {
  createWebPushController,
  WEB_PUSH_STATE,
} from "../../web-notifications/notificationClient.js";

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

const refundStatusLabels = Object.freeze({
  NONE: "Başlatılmadı",
  REQUESTED: "Talep alındı",
  IN_REVIEW: "İnceleniyor",
  APPROVED: "Onaylandı",
  PENDING: "Bekliyor",
  COMPLETED: "Tamamlandı",
  FAILED: "Başarısız",
  REJECTED: "Reddedildi",
});

// The backend does not advertise transitions in its detail DTO. Keep this read-side map
// limited to the canonical return workflow; PATCH remains the final authorization source.
const adminReturnTransitions = Object.freeze({
  REQUESTED: Object.freeze(["IN_REVIEW", "REJECTED"]),
  IN_REVIEW: Object.freeze(["APPROVED", "REJECTED"]),
});

const shipmentStatusLabels = Object.freeze({
  NONE: "Gönderi yok",
  CREATED: "Kayıt oluşturuldu",
  IN_TRANSIT: "Taşımada",
  DELIVERED: "Teslim edildi",
  RETURNED: "Geri döndü",
});

const paymentProviderStatePresentation = Object.freeze({
  provider_not_configured: Object.freeze({ label: "Sağlayıcı seçilmedi", detail: "Ödeme başlatma capability'si kullanılamaz." }),
  credentials_required: Object.freeze({ label: "Sağlayıcı kimlik bilgileri eksik", detail: "Gizli değerler bu ekranda gösterilmez; yapılandırma tamamlanmadan ödeme başlatılamaz." }),
  client_ip_config_required: Object.freeze({ label: "Müşteri IP yapılandırması eksik", detail: "Sağlayıcı isteği için gerekli güvenli istemci IP sözleşmesi hazır değil." }),
  production_test_mode_forbidden: Object.freeze({ label: "Üretimde test modu yasak", detail: "Canlı ortam test modu ile ödeme başlatamaz." }),
  activation_required: Object.freeze({ label: "Canlı istek aktivasyonu gerekli", detail: "Sağlayıcı yapılandırılmış olsa da dış isteğe ayrıca açık izin verilmelidir." }),
  ready: Object.freeze({ label: "Sağlayıcı hazır", detail: "Bu yalnız yapılandırma readiness bilgisidir; ödeme veya para hareketi kanıtı değildir." }),
});

const unknownPaymentProviderPresentation = Object.freeze({
  label: "Ödeme sağlayıcısı durumu doğrulanamadı",
  detail: "Durum sözleşmesi bilinmediği için ödeme capability'si fail-closed kabul edilir.",
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

function OperationDialog({ title, busy, children, onClose, eyebrow = "Commerce Pro · kontrollü operasyon", testId = "order-operation-dialog", wide = false }) {
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
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      data-testid={testId}
      className={`modal${wide ? " modal-wide" : ""}`}
      onCancel={(event) => { event.preventDefault(); close(); }}
      onClick={(event) => { if (event.target === ref.current) close(); }}
      onKeyDown={(event) => trapDialogFocus(event, ref.current, close)}
    >
      <div className="modal-card live-operation-dialog" role="document" aria-busy={busy ? "true" : undefined}>
        <header className="modal-header">
          <div><span className="eyebrow">{eyebrow}</span><h2 id={titleId}>{title}</h2></div>
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

function PaymentProviderStatus({ paymentProvider }) {
  const state = String(paymentProvider?.state || "").trim().toLowerCase();
  const presentation = paymentProviderStatePresentation[state] || unknownPaymentProviderPresentation;
  const ready = state === "ready" && paymentProvider?.ready === true;
  const provider = String(paymentProvider?.provider || "").trim();
  return (
    <section
      className={`notice-card live-payment-provider-banner ${ready ? "is-ready" : "is-blocked"}`}
      role="status"
      aria-live="polite"
      data-payment-provider-state={state || "unknown"}
      data-payment-provider-ready={ready ? "true" : "false"}
    >
      <Icon name={ready ? "check" : "warning"} />
      <div>
        <strong>{presentation.label}</strong>
        <p>{presentation.detail}</p>
      </div>
      <span className="live-provider-identity">
        <b>{provider ? provider.toLocaleUpperCase("tr-TR") : "Sağlayıcı tanımsız"}</b>
        <small>{paymentProvider?.testMode === true ? "Test modu" : ready ? "Canlı moda uygun" : "Ödeme başlatma kapalı"}</small>
      </span>
    </section>
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
  && order.shipmentStatus === "NONE"
  && Array.isArray(order.sellerAllocations)
  && order.sellerAllocations.length === 0;

const manualShipmentUnavailableReason = (order) => {
  if (!Array.isArray(order.sellerAllocations)) {
    return "Seller sahiplik dağılımı doğrulanamadığı için Admin kargo devri kapalı";
  }
  if (order.sellerAllocations.length > 0) {
    return "Seller sahipli siparişte kargo devri Seller fulfillment otoritesindedir";
  }
  return "Sipariş hazırlık, ödeme, refund veya gönderi koşullarında değil";
};

const orderMayBeDelivered = (order) => order.backendStatus === MANUAL_DELIVERY_EXPECTED_STATUS
  && order.paymentStatus === "PAID"
  && order.refundStatus === "NONE"
  && order.shipmentStatus === MANUAL_DELIVERY_EXPECTED_SHIPMENT_STATUS
  && Boolean(order.shipmentProvider)
  && Boolean(order.trackingNo)
  && Array.isArray(order.sellerAllocations)
  && order.sellerAllocations.length <= 1;

function OrderSellerSummary({ order, compact }) {
  const allocations = Array.isArray(order.sellerAllocations) ? order.sellerAllocations : [];
  if (allocations.length === 0) {
    return <span className="live-customer-cell"><strong>Platform siparişi</strong><small>Seller organizasyon dağılımı yok</small></span>;
  }
  return (
    <span className="live-order-stack live-seller-allocation-list">
      {allocations.map((allocation, index) => (
        <span className="live-order-stack-item" key={`${allocation.sellerOrderId || "allocation"}-${allocation.storeId || index}`}>
          <strong>{allocation.organizationName || `Organizasyon #${allocation.organizationId}`}</strong>
          <small>{allocation.storeName || `Mağaza #${allocation.storeId}`} · {allocation.status}</small>
          {!compact && <small>Seller siparişi #{allocation.sellerOrderId} · {money(allocation.grossAmount, allocation.currency)}</small>}
        </span>
      ))}
    </span>
  );
}

function OrderItemSummary({ order, compact }) {
  const items = Array.isArray(order.items) ? order.items : [];
  if (items.length === 0) return <span className="live-customer-cell"><strong>{order.itemCount} satır</strong><small>Kalem detayı yok</small></span>;
  return (
    <span className="live-order-stack live-order-item-list">
      {items.map((item, index) => (
        <span className="live-order-stack-item" key={`${item.productId || "item"}-${item.storeId || "store"}-${index}`}>
          <strong>{item.name} × {item.quantity}</strong>
          {!compact && <small>{item.productId ? `Ürün #${item.productId}` : "Ürün bağı yok"} · {item.storeId ? `mağaza #${item.storeId}` : "mağaza bağı yok"} · {money(item.lineTotal, order.currency)}</small>}
        </span>
      ))}
    </span>
  );
}

function OrderPaymentSummary({ order, compact }) {
  return (
    <span className="live-order-stack live-payment-truth">
      <span className="live-order-stack-item">
        <strong className={order.paymentFailed ? "negative" : order.pendingPayment ? "live-payment-pending" : ""}>{order.paymentStatus}</strong>
        <small>Yerel refund: {order.refundStatus}</small>
      </span>
      {!compact && <>
        <span className="live-order-stack-item"><strong>{order.paymentProvider ? order.paymentProvider.toLocaleUpperCase("tr-TR") : "Sağlayıcı kaydı yok"}</strong><small>NovaStore ref: {order.paymentRef || "Yok"}</small>{order.paymentExternalRef && <small>Dış ref: {order.paymentExternalRef}</small>}</span>
        {order.paymentFailureReason && <small className="live-payment-failure">Başarısızlık: {order.paymentFailureReason}</small>}
        <small>{order.paymentUpdatedAt ? `Ödeme kaydı ${dateTime(order.paymentUpdatedAt)}` : "Ödeme güncelleme tarihi yok"}</small>
        <small className="live-refund-boundary">Refund durumu yerel kayıttır; sağlayıcı para hareketi ayrıca doğrulanmalıdır.</small>
      </>}
    </span>
  );
}

function OrdersTable({ orders, compact = false, mutationActions = {}, onOpenOperation, onOpenDetail }) {
  const cancelEnabled = typeof mutationActions.cancelOrder === "function";
  const shipmentEnabled = typeof mutationActions.createManualShipment === "function";
  const deliveryEnabled = typeof mutationActions.confirmManualDelivery === "function";
  const operationsEnabled = !compact && (cancelEnabled || shipmentEnabled || deliveryEnabled);
  return (
    <div className="table-scroll table-scroll-hint" tabIndex="0" role="region" aria-label="Sipariş özeti tablosu">
      <table className="data-table live-orders-table">
        <caption className="sr-only">Entegre backend’den okunan sipariş özetleri; izinli işlemler ayrıca capability kontrollüdür</caption>
        <thead>
          <tr>
            <th scope="col">Sipariş</th>
            <th scope="col">Müşteri</th>
            <th scope="col">Durum</th>
            <th scope="col">Satıcı / mağaza</th>
            <th scope="col">Kalem / adet</th>
            <th scope="col">Ödeme / refund</th>
            <th scope="col">Kargo</th>
            <th scope="col">Tutar</th>
            <th scope="col">Tarih</th>
            {operationsEnabled && <th scope="col">Kontrollü işlem</th>}
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => (
            <tr key={order.id}>
              <td>{!compact && onOpenDetail ? <button className="secondary-button" onClick={() => onOpenDetail(order.rawId)} aria-label={`${order.id} sipariş detayını aç`}>{order.id} · Detay</button> : <strong>{order.id}</strong>}</td>
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
              <td><OrderSellerSummary order={order} compact={compact} /></td>
              <td><OrderItemSummary order={order} compact={compact} /></td>
              <td><OrderPaymentSummary order={order} compact={compact} /></td>
              <td>
                <span className="live-customer-cell">
                  <strong>Yerel: {shipmentStatusLabels[order.shipmentStatus] || order.shipmentStatus}</strong>
                   {!compact && order.shipmentProvider && <small>{order.shipmentProvider}</small>}
                   {!compact && order.trackingNo && <small>Takip no: {order.trackingNo}</small>}
                   {!order.carrierConfirmed && <small>Taşıyıcı doğrulanmadı</small>}
                  {!compact && order.estimatedDeliveryAt && <small>Tahmini {dateOnly(order.estimatedDeliveryAt)}</small>}
                </span>
              </td>
              <td><strong>{money(order.total, order.currency)}</strong></td>
              <td><span className="live-customer-cell"><strong>{dateTime(order.createdAt)}</strong>{!compact && order.updatedAt && <small>Güncellendi {dateTime(order.updatedAt)}</small>}</span></td>
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
                        title={orderMayBeHandedOff(order) ? "Manuel kargo devrini doğrula" : manualShipmentUnavailableReason(order)}
                        aria-label={orderMayBeHandedOff(order) ? `${order.id} için manuel kargo devrini doğrula` : `${order.id} manuel kargo devri kullanılamıyor; ${manualShipmentUnavailableReason(order)}`}
                        onClick={() => onOpenOperation("shipment", order)}
                      >Kargoya devret</button>
                    )}
                    {deliveryEnabled && orderMayBeDelivered(order) && (
                      <button
                        type="button"
                        className="primary-button small"
                        title="Fiziksel teslimatı doğrula"
                        aria-label={`${order.id} için fiziksel teslimatı doğrula`}
                        onClick={() => onOpenOperation("delivery", order)}
                      >Teslimatı doğrula</button>
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
  const localReviewDataUnavailable = stats.dataScope === "local_review_no_finance_order_user_data";
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
        <Kpi label="Filtrelenmiş sipariş tutarı" value={localReviewDataUnavailable ? "Kullanılamıyor" : money(stats.totalRevenue)} note={localReviewDataUnavailable ? "Yerel inceleme finans verisi içermez" : "İptal, iade ve ödeme bekleyen hariç"} />
        <Kpi label="Filtrelenmiş sipariş sayısı" value={localReviewDataUnavailable ? "Kullanılamıyor" : String(stats.totalOrders)} note={localReviewDataUnavailable ? "Yerel inceleme sipariş verisi içermez" : "İptal ve ödeme bekleyen hariç"} />
        <Kpi label="Mevcut ürün kaydı" value={String(stats.totalProducts)} note="Products tablosu toplamı" />
        <Kpi label="Müşteri hesabı" value={localReviewDataUnavailable ? "Kullanılamıyor" : String(stats.totalUsers)} note={localReviewDataUnavailable ? "Yerel inceleme hesap verisi içermez" : "Admin rolü hariç"} />
      </section>

      <section className="notice-card live-boundary-notice" role="note">
        <Icon name="shield" />
        <div>
          <strong>Entegre çok mağazalı sipariş gerçeği</strong>
          <p>Seller organizasyonu, mağaza ve kalem dağılımı yalnız backend sözleşmesinden okunur; hakediş veya payout verisi üretilmez ve mock kayıt gösterilmez.</p>
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
      <div><dt>Sağlayıcı</dt><dd>{order.paymentProvider || "Sağlayıcı kaydı yok"}</dd></div>
      <div><dt>Ödeme referansı</dt><dd>{order.paymentRef || "Referans yok"}</dd></div>
      <div><dt>Tutar</dt><dd>{money(order.total, order.currency)}</dd></div>
    </dl>
  );
}

function OperationError({ error, id = "order-operation-error" }) {
  if (!error) return null;
  const message = typeof error === "string" ? error : error.message || "İşlem tamamlanamadı.";
  return (
    <p className="modal-error" id={id} role="alert">
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

function ManualDeliveryDialog({ operation, action, onClose, onConflict, onUnavailable, onComplete }) {
  const [deliveryConfirmed, setDeliveryConfirmed] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [attempted, setAttempted] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    if (busy) return;
    setError(null);
    if (!deliveryConfirmed) {
      setError("Siparişin fiziksel olarak teslim edildiğini açıkça doğrulamanız gerekir.");
      return;
    }
    setAttempted(true);
    setBusy(true);
    try {
      const result = await action({
        orderId: operation.order.rawId,
        expectedStatus: operation.order.backendStatus,
        expectedShipmentStatus: operation.order.shipmentStatus,
        deliveryConfirmed,
        provider: operation.order.shipmentProvider,
        trackingNo: operation.order.trackingNo,
        idempotencyKey: operation.idempotencyKey,
      });
      onComplete({ kind: "delivery", reused: result?.reused === true });
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
    <OperationDialog title={`${operation.order.id} teslimatını doğrula`} busy={busy} onClose={onClose} testId="manual-delivery-dialog">
      <div className="confirmation-body">
        <Icon name="check" />
        <p><strong>Sipariş ve mevcut gönderi “Teslim Edildi” durumuna geçirilecek.</strong> Bu kayıt taşıyıcıya veya ödeme sağlayıcısına istek göndermez; Admin’in açık teslim beyanıdır, harici sağlayıcı kanıtı değildir.</p>
      </div>
      <OrderOperationSummary order={operation.order} />
      <dl className="detail-list live-operation-summary">
        <div><dt>Kargo sağlayıcısı</dt><dd>{operation.order.shipmentProvider}</dd></div>
        <div><dt>Takip numarası</dt><dd>{operation.order.trackingNo}</dd></div>
        <div><dt>Beklenen gönderi</dt><dd>{operation.order.shipmentStatus}</dd></div>
      </dl>
      <form className="modal-form live-operation-form" onSubmit={submit} aria-describedby="manual-delivery-boundary manual-delivery-error">
        <label className="live-handoff-confirmation"><input type="checkbox" checked={deliveryConfirmed} onChange={(event) => { setDeliveryConfirmed(event.target.checked); setError(null); }} disabled={busy || attempted} data-autofocus /><span>Siparişin bu takip numarasıyla fiziksel olarak müşteriye teslim edildiğini doğruluyorum.</span></label>
        <p className="form-hint" id="manual-delivery-boundary">Bu işlem platform veya Seller sahipliğinden bağımsız olarak yalnız tek taraflı sipariş sözleşmesinde, PAID ödeme ve refund NONE durumunda çalışır. Sağlayıcı para hareketi, kargo API çağrısı veya teslim belgesi üretmez.</p>
        <OperationError error={error} id="manual-delivery-error" />
        {attempted && error && <p className="form-hint">Güvenli tekrar için ilk isteğin alanları ve idempotency anahtarı korundu. Güncel durumu değiştirmek için pencereyi kapatıp listeyi yenileyin.</p>}
        <footer><button type="button" className="secondary-button" onClick={onClose} disabled={busy}>Vazgeç</button><button type="submit" className="primary-button" disabled={busy || !deliveryConfirmed}>{busy ? "Doğrulanıyor…" : attempted ? "Aynı isteği tekrar dene" : "Teslim edildi olarak kaydet"}</button></footer>
      </form>
    </OperationDialog>
  );
}

function Orders({ orderPage, error, refreshing, onRefresh, onReloadCapabilities, mutationActions, paymentProvider, loadOrderDetail, notificationTarget = null }) {
  const orders = orderPage.items;
  const [detailOrderId, setDetailOrderId] = useState(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("Tümü");
  const [operation, setOperation] = useState(null);
  const [operationNotice, setOperationNotice] = useState(null);
  const [suppressedMutationActions, setSuppressedMutationActions] = useState(null);
  const writesSuppressed = suppressedMutationActions === mutationActions;
  const visibleMutationActions = writesSuppressed ? noMutationActions : mutationActions;
  const operationsEnabled = typeof visibleMutationActions.cancelOrder === "function"
    || typeof visibleMutationActions.createManualShipment === "function"
    || typeof visibleMutationActions.confirmManualDelivery === "function";
  const statuses = useMemo(() => ["Tümü", ...new Set(orders.map((order) => order.status))], [orders]);
  useEffect(() => {
    if (!notificationTarget?.entityId) return;
    setQuery(String(notificationTarget.entityId));
    setStatus("Tümü");
  }, [notificationTarget?.entityId]);
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("tr-TR");
    return orders.filter((order) => {
      const matchesStatus = status === "Tümü" || order.status === status;
      const itemSearch = (Array.isArray(order.items) ? order.items : [])
        .map((item) => `${item.productId} ${item.name} ${item.storeId}`)
        .join(" ");
      const sellerSearch = (Array.isArray(order.sellerAllocations) ? order.sellerAllocations : [])
        .map((allocation) => `${allocation.sellerOrderId} ${allocation.organizationId} ${allocation.organizationName} ${allocation.storeId} ${allocation.storeName}`)
        .join(" ");
      const haystack = `${order.id} ${order.rawId || ""} ${order.customerName} ${order.email} ${order.paymentProvider || ""} ${order.paymentRef || ""} ${order.paymentExternalRef || ""} ${order.trackingNo || ""} ${itemSearch} ${sellerSearch}`.toLocaleLowerCase("tr-TR");
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
    const message = kind === "cancel"
      ? `Sipariş iptali ${reused ? "aynı güvenli isteğin tekrarı olarak doğrulandı" : "kaydedildi"}. Sağlayıcı refund'u otomatik çalıştırılmadı; finans incelemesini tamamlayın.`
      : kind === "delivery"
        ? `Manuel teslim doğrulaması ${reused ? "aynı güvenli isteğin tekrarı olarak doğrulandı" : "kaydedildi"}. Taşıyıcı veya ödeme sağlayıcısı çağrılmadı.`
        : `Manuel kargo devri ${reused ? "aynı güvenli isteğin tekrarı olarak doğrulandı" : "kaydedildi"}. Taşıyıcı API/etiket işlemi yapılmadı.`;
    setOperationNotice({
      tone: "success",
      message,
    });
    onRefresh();
  };

  return (
    <section className="workspace live-workspace" data-testid="live-orders">
      <header className="workspace-heading operations-heading">
        <div>
          <span className="eyebrow">Entegre backend · {operationsEnabled ? "capability kontrollü" : "salt okunur"}</span>
          <h2 tabIndex="-1">Son sipariş özetleri</h2>
          <p>En fazla son {orderPage.limit} kayıt gösterilir. Genel durum/toplu yazma kapalıdır; iptal, manuel kargo devri ve uygun tek taraflı teslim doğrulaması yalnız açık sunucu capability'siyle sunulur.</p>
        </div>
        <button className="secondary-button" onClick={onRefresh} disabled={refreshing}>
          <Icon name="refresh" />{refreshing ? "Yenileniyor" : "Yenile"}
        </button>
      </header>

      <ResourceWarning error={error} onRetry={onRefresh} />
      <PaymentProviderStatus paymentProvider={paymentProvider} />
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
        {filtered.length > 0 ? <OrdersTable orders={filtered} mutationActions={visibleMutationActions} onOpenOperation={openOperation} onOpenDetail={setDetailOrderId} /> : (
          <div className="state-panel">
            <Icon name="search" />
            <h3>Eşleşen sipariş yok</h3>
            <p>Arama veya durum filtresini değiştirin.</p>
            <button className="secondary-button" onClick={() => { setQuery(""); setStatus("Tümü"); }}>Filtreleri temizle</button>
          </div>
        )}
      </section>
      {detailOrderId !== null && <OrderDeliveryDetail key={detailOrderId} orderId={detailOrderId} loadDetail={loadOrderDetail} Dialog={OperationDialog} onClose={() => setDetailOrderId(null)} />}
      {operation?.kind === "cancel" && typeof visibleMutationActions.cancelOrder === "function" && <CancelOrderDialog operation={operation} action={visibleMutationActions.cancelOrder} onClose={closeOperation} onConflict={handleConflict} onUnavailable={handleUnavailable} onComplete={handleComplete} />}
      {operation?.kind === "shipment" && typeof visibleMutationActions.createManualShipment === "function" && <ManualShipmentDialog operation={operation} action={visibleMutationActions.createManualShipment} onClose={closeOperation} onConflict={handleConflict} onUnavailable={handleUnavailable} onComplete={handleComplete} />}
      {operation?.kind === "delivery" && typeof visibleMutationActions.confirmManualDelivery === "function" && <ManualDeliveryDialog operation={operation} action={visibleMutationActions.confirmManualDelivery} onClose={closeOperation} onConflict={handleConflict} onUnavailable={handleUnavailable} onComplete={handleComplete} />}
    </section>
  );
}

const catalogEditablePublicationStatuses = CATALOG_PRODUCT_PUBLICATION_STATUSES
  .filter((status) => status !== "archived");

const emptyCatalogProductForm = Object.freeze({
  name: "",
  description: "",
  price: "0.00",
  oldPrice: "",
  stock: "0",
  publicationStatus: "draft",
  customerVisible: false,
  categoryIds: "",
  primaryCategoryId: "",
  attributes: "{}",
});

const catalogProductFormFromDetail = (product) => ({
  name: product.name,
  description: product.description,
  price: String(product.price),
  oldPrice: product.oldPrice === null ? "" : String(product.oldPrice),
  stock: String(product.stock),
  publicationStatus: product.publicationStatus,
  customerVisible: product.customerVisible,
  categoryIds: product.categoryIds.join(", "),
  primaryCategoryId: product.primaryCategoryId === null ? "" : String(product.primaryCategoryId),
  attributes: JSON.stringify(catalogAttributesToMutationMap(product.attributes), null, 2),
});

const parseCatalogCategoryIds = (value) => {
  const tokens = String(value || "").trim().split(/[\s,]+/).filter(Boolean);
  return tokens.map((token) => {
    const parsed = Number(token);
    if (!Number.isInteger(parsed) || parsed < 1) throw new TypeError("Kategori kimlikleri pozitif tam sayı olmalıdır.");
    return parsed;
  });
};

const parseCatalogAttributes = (value) => {
  let parsed;
  try {
    parsed = JSON.parse(String(value || "{}"));
  } catch (_error) {
    throw new TypeError("Özellik değerleri geçerli bir JSON nesnesi olmalıdır.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new TypeError("Özellik değerleri JSON nesnesi olmalıdır.");
  }
  return parsed;
};

const parseCatalogProductForm = (form) => ({
  name: form.name,
  description: form.description,
  price: Number(form.price),
  oldPrice: form.oldPrice === "" ? null : Number(form.oldPrice),
  stock: Number(form.stock),
  publicationStatus: form.publicationStatus,
  customerVisible: form.customerVisible,
  categoryIds: parseCatalogCategoryIds(form.categoryIds),
  primaryCategoryId: form.primaryCategoryId === "" ? null : Number(form.primaryCategoryId),
  attributes: parseCatalogAttributes(form.attributes),
});

const canonicalJson = (value) => {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
};

const buildCatalogProductChanges = (product, parsed) => {
  const changes = {};
  if (parsed.name.trim() !== product.name) changes.name = parsed.name;
  if (parsed.description.trim() !== product.description) changes.description = parsed.description;
  if (parsed.price !== product.price) changes.price = parsed.price;
  if (parsed.oldPrice !== product.oldPrice) changes.oldPrice = parsed.oldPrice;
  if (parsed.stock !== product.stock) changes.stock = parsed.stock;
  if (parsed.publicationStatus !== product.publicationStatus) changes.publicationStatus = parsed.publicationStatus;
  if (parsed.customerVisible !== product.customerVisible) changes.customerVisible = parsed.customerVisible;

  const currentCategoryIds = [...product.categoryIds].sort((left, right) => left - right);
  const nextCategoryIds = [...parsed.categoryIds].sort((left, right) => left - right);
  if (canonicalJson(nextCategoryIds) !== canonicalJson(currentCategoryIds)
    || parsed.primaryCategoryId !== product.primaryCategoryId) {
    changes.categoryIds = parsed.categoryIds;
    changes.primaryCategoryId = parsed.primaryCategoryId;
  }

  const currentAttributes = catalogAttributesToMutationMap(product.attributes);
  if (canonicalJson(parsed.attributes) !== canonicalJson(currentAttributes)) changes.attributes = parsed.attributes;
  return changes;
};

function CatalogProductFormDialog({ mode, product, action, onClose, onComplete, onRequestError }) {
  const [form, setForm] = useState(() => product
    ? catalogProductFormFromDetail(product)
    : { ...emptyCatalogProductForm });
  const [busy, setBusy] = useState(false);
  const [requestError, setRequestError] = useState(null);
  const editing = mode === "edit";
  const update = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
    setRequestError(null);
  };

  const submit = async (event) => {
    event.preventDefault();
    if (busy) return;
    setRequestError(null);
    setBusy(true);
    let parsed;
    let changes;
    try {
      parsed = parseCatalogProductForm(form);
      changes = editing ? buildCatalogProductChanges(product, parsed) : null;
    } catch (error) {
      setRequestError(error);
      setBusy(false);
      return;
    }
    try {
      const result = editing
        ? await action({
            productId: product.rawId,
            expectedRevision: product.revision,
            changes,
          })
        : await action(parsed);
      onComplete({ kind: editing ? "edit" : "create", product: result });
    } catch (error) {
      if (onRequestError(error)) return;
      setRequestError(error);
      setBusy(false);
    }
  };

  return (
    <OperationDialog
      title={editing ? `${product.id} ürününü düzenle` : "Yeni NovaStore ürünü"}
      busy={busy}
      onClose={onClose}
      eyebrow="Commerce Pro · medyasız ürün JSON CRUD"
      testId="catalog-product-form-dialog"
      wide
    >
      <form className="modal-form two-column live-catalog-product-form" onSubmit={submit} aria-describedby="catalog-product-form-boundary catalog-product-form-error">
        <label className="live-catalog-form-wide"><span>Ürün adı</span><input value={form.name} onChange={(event) => update("name", event.target.value)} minLength="1" maxLength="255" required disabled={busy} data-autofocus autoComplete="off" /></label>
        <label className="live-catalog-form-wide"><span>Açıklama</span><textarea value={form.description} onChange={(event) => update("description", event.target.value)} maxLength="20000" rows="5" disabled={busy} /></label>
        <label><span>Fiyat · TRY</span><input type="number" value={form.price} onChange={(event) => update("price", event.target.value)} min="0" max="99999999.99" step="0.01" required disabled={busy} inputMode="decimal" /></label>
        <label><span>Önceki fiyat · opsiyonel</span><input type="number" value={form.oldPrice} onChange={(event) => update("oldPrice", event.target.value)} min="0" max="99999999.99" step="0.01" disabled={busy} inputMode="decimal" /></label>
        <label><span>Stok</span><input type="number" value={form.stock} onChange={(event) => update("stock", event.target.value)} min="0" max="2147483647" step="1" required disabled={busy} inputMode="numeric" /></label>
        <label><span>Yayın durumu</span><select value={form.publicationStatus} onChange={(event) => update("publicationStatus", event.target.value)} disabled={busy}>{catalogEditablePublicationStatuses.map((status) => <option key={status} value={status}>{CATALOG_PUBLICATION_STATUS_LABELS[status]}</option>)}</select></label>
        <label className="live-catalog-visibility-toggle"><input type="checkbox" checked={form.customerVisible} onChange={(event) => update("customerVisible", event.target.checked)} disabled={busy} /><span>Müşteri görünürlük bayrağını aç</span></label>
        <span className="form-hint live-catalog-field-hint">Vitrinde etkin görünürlük için ürünün ayrıca “Yayında” olması gerekir.</span>
        <label><span>Kategori kimlikleri · virgülle</span><input value={form.categoryIds} onChange={(event) => update("categoryIds", event.target.value)} disabled={busy} autoComplete="off" placeholder="Örn. 12, 18" /></label>
        <label><span>Birincil kategori kimliği</span><input type="number" value={form.primaryCategoryId} onChange={(event) => update("primaryCategoryId", event.target.value)} min="1" step="1" disabled={busy} inputMode="numeric" placeholder="Kategori yoksa boş" /></label>
        <label className="live-catalog-form-wide"><span>Özellik değerleri · JSON nesnesi</span><textarea value={form.attributes} onChange={(event) => update("attributes", event.target.value)} rows="7" spellCheck="false" disabled={busy} className="live-json-field" /></label>
        <p className="form-hint live-catalog-form-wide" id="catalog-product-form-boundary">Yalnız ürün JSON alanları kaydedilir. Medya, görsel URL'si, dosya yükleme, Cloudinary, mağaza veya satıcı alanı bu sözleşmeye alınmaz.{editing ? ` Güncelleme revision ${product.revision} üzerinde karşılaştırmalı olarak yürütülür.` : " Yeni kayıt güvenli varsayılan olarak Taslak ve müşteri görünürlüğü kapalı başlar."}</p>
        {editing && product.hasMedia && <p className="form-hint live-catalog-form-wide">Bu üründe mevcut medya kaydı var; bu form medyayı göstermez, değiştirmez veya silmez.</p>}
        <OperationError error={requestError} id="catalog-product-form-error" />
        <footer><button type="button" className="secondary-button" onClick={onClose} disabled={busy}>Vazgeç</button><button type="submit" className="primary-button" disabled={busy}>{busy ? "Kaydediliyor…" : editing ? "Değişiklikleri kaydet" : "Ürünü oluştur"}</button></footer>
      </form>
    </OperationDialog>
  );
}

function CatalogProductArchiveDialog({ product, action, onClose, onComplete, onRequestError }) {
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [requestError, setRequestError] = useState(null);

  const submit = async (event) => {
    event.preventDefault();
    if (busy) return;
    setRequestError(null);
    if (!confirmed) {
      setRequestError("Ürünün vitrine kapatılıp arşivleneceğini doğrulayın.");
      return;
    }
    setBusy(true);
    try {
      const result = await action({ productId: product.rawId, expectedRevision: product.revision });
      onComplete({ kind: "archive", product: result });
    } catch (error) {
      if (onRequestError(error)) return;
      setRequestError(error);
      setBusy(false);
    }
  };

  return (
    <OperationDialog title={`${product.id} ürününü arşivle`} busy={busy} onClose={onClose} eyebrow="Commerce Pro · geri döndürülemez Tur 3D sınırı" testId="catalog-product-archive-dialog">
      <div className="confirmation-body"><Icon name="warning" /><p><strong>{product.name} yayından ve vitrinden kaldırılarak arşivlenecek.</strong> Bu işlem hard-delete yapmaz; mevcut medya kaydına, Cloudinary'ye veya başka bir dış sisteme dokunmaz.</p></div>
      <dl className="detail-list live-operation-summary"><div><dt>Ürün</dt><dd>{product.id}</dd></div><div><dt>Beklenen revision</dt><dd>{product.revision}</dd></div><div><dt>Mevcut yayın</dt><dd>{CATALOG_PUBLICATION_STATUS_LABELS[product.publicationStatus]}</dd></div></dl>
      <form className="modal-form live-operation-form" onSubmit={submit} aria-describedby="catalog-archive-boundary catalog-archive-error">
        <label className="live-handoff-confirmation"><input type="checkbox" checked={confirmed} onChange={(event) => { setConfirmed(event.target.checked); setRequestError(null); }} disabled={busy} data-autofocus /><span>Ürünün müşteri görünürlüğünün kapanacağını ve Tur 3D içinde geri yükleme aksiyonu olmadığını doğruluyorum.</span></label>
        <p className="form-hint" id="catalog-archive-boundary">Arşivleme yalnız adminEditable=true platform ürün kaydını değiştirir; Seller ürününe, hard-delete işlemine, medya varlığına veya dış servise dokunmaz.</p>
        <OperationError error={requestError} id="catalog-archive-error" />
        <footer><button type="button" className="secondary-button" onClick={onClose} disabled={busy}>Vazgeç</button><button type="submit" className="danger-button" disabled={busy || !confirmed}>{busy ? "Arşivleniyor…" : "Ürünü arşivle"}</button></footer>
      </form>
    </OperationDialog>
  );
}

function CatalogMediaDialog({ product: initialProduct, actions, onClose, onComplete, onRequestError }) {
  const [product, setProduct] = useState(initialProduct);
  const [mediaUrl, setMediaUrl] = useState("");
  const [mediaType, setMediaType] = useState("image");
  const [isCover, setIsCover] = useState(initialProduct.media.length === 0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const initialFramingMedia = initialProduct.media.find((entry) => entry.isCover && entry.mediaType === "image")
    || initialProduct.media.find((entry) => entry.mediaType === "image")
    || null;
  const [framingMediaId, setFramingMediaId] = useState(initialFramingMedia?.id || null);
  const [draftFraming, setDraftFraming] = useState(initialFramingMedia?.cardFraming || null);
  const [framingStatus, setFramingStatus] = useState("INITIAL_DEFAULT");
  const [framingDimensions, setFramingDimensions] = useState(null);
  const [framingEditorOpen, setFramingEditorOpen] = useState(Boolean(initialFramingMedia?.cardFraming));
  const framingPreviewRef = useRef(null);
  const framingMeasurementRef = useRef(null);
  const dragRef = useRef(null);
  const {
    CARD_FRAMING_LIMITS,
    CARD_FRAMING_STATES,
    CARD_VIEWPORT_ASPECT_RATIO,
    CARD_VIEWPORT_BORDER_RADIUS_PX,
    cardFramingPresentation,
    classifyCardFramingNeed,
    panCardFraming,
    resolveCardFraming,
  } = productCardFraming;
  const framingMedia = product.media.find((entry) => entry.id === framingMediaId && entry.mediaType === "image") || null;
  const resolvedFraming = resolveCardFraming(draftFraming);
  const framingAssessment = classifyCardFramingNeed({
    width: framingDimensions?.width,
    height: framingDimensions?.height,
    cardFraming: framingMedia?.cardFraming || null,
  });
  const framingState = framingAssessment.dimensionsKnown || framingMedia?.cardFraming
    ? framingAssessment.state
    : "ANALYZING_SOURCE";

  useEffect(() => {
    if (!framingMedia) return;
    setFramingDimensions(null);
    setDraftFraming(framingMedia.cardFraming || null);
    setFramingStatus((current) => current === "SAVED"
      ? current
      : framingMedia.cardFraming ? "RELOADED" : "INITIAL_DEFAULT");
  }, [framingMedia?.cardFraming, framingMedia?.id]);

  useEffect(() => {
    const image = framingMeasurementRef.current;
    if (!image) return undefined;
    const capture = () => {
      const width = Number(image.naturalWidth);
      const height = Number(image.naturalHeight);
      if (width > 0 && height > 0) setFramingDimensions({ width, height });
    };
    capture();
    image.addEventListener("load", capture);
    return () => image.removeEventListener("load", capture);
  }, [framingMedia?.id, framingMedia?.mediaUrl]);

  useEffect(() => {
    if (framingAssessment.dimensionsKnown
      && framingAssessment.state === CARD_FRAMING_STATES.FRAMING_RECOMMENDED) {
      setFramingEditorOpen(true);
    }
  }, [CARD_FRAMING_STATES.FRAMING_RECOMMENDED, framingAssessment.dimensionsKnown, framingAssessment.state]);

  const run = async (operation) => {
    setBusy(true);
    setError(null);
    try {
      const next = await operation();
      setProduct(next);
      onComplete?.(next, { keepOpen: true });
      return next;
    } catch (requestError) {
      if (!onRequestError(requestError)) setError(requestError);
      return null;
    } finally {
      setBusy(false);
    }
  };

  const register = async (event) => {
    event.preventDefault();
    const next = await run(() => actions.registerCatalogMedia({
      productId: product.rawId,
      expectedRevision: product.revision,
      mediaUrl,
      mediaType,
      isCover,
    }));
    if (next) {
      setMediaUrl("");
      setIsCover(false);
    }
  };

  const reorder = (mediaId, direction) => {
    const ids = product.media.map((entry) => entry.id);
    const index = ids.indexOf(mediaId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    const cover = product.media.find((entry) => entry.isCover && entry.mediaType === "image")?.id
      || product.media.find((entry) => entry.mediaType === "image")?.id
      || null;
    run(() => actions.reorderCatalogMedia({ productId: product.rawId, expectedRevision: product.revision, mediaIds: ids, coverMediaId: cover }));
  };

  const setCover = (mediaId) => run(() => actions.reorderCatalogMedia({
    productId: product.rawId,
    expectedRevision: product.revision,
    mediaIds: product.media.map((entry) => entry.id),
    coverMediaId: mediaId,
  }));

  const remove = (mediaId) => run(() => actions.deleteCatalogMedia({
    productId: product.rawId,
    mediaId,
    expectedRevision: product.revision,
  }));

  const selectFramingMedia = (entry) => {
    setFramingMediaId(entry.id);
    setFramingDimensions(null);
    setDraftFraming(entry.cardFraming || null);
    setFramingStatus(entry.cardFraming ? "RELOADED" : "INITIAL_DEFAULT");
    setFramingEditorOpen(true);
  };

  const startFramingDrag = (event) => {
    if (!framingPreviewRef.current || event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragRef.current = { x: event.clientX, y: event.clientY, framing: resolvedFraming };
  };

  const moveFramingDrag = (event) => {
    if (!dragRef.current || !framingPreviewRef.current) return;
    const bounds = framingPreviewRef.current.getBoundingClientRect();
    setDraftFraming(panCardFraming(
      dragRef.current.framing,
      event.clientX - dragRef.current.x,
      event.clientY - dragRef.current.y,
      bounds.width,
      bounds.height,
    ));
    setFramingStatus("DRAGGED");
  };

  const stopFramingDrag = (event) => {
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    dragRef.current = null;
  };

  const adjustFramingZoom = (amount) => {
    setDraftFraming({
      ...resolvedFraming,
      zoom: Math.min(CARD_FRAMING_LIMITS.zoomMax, Math.max(CARD_FRAMING_LIMITS.zoomMin, Number((resolvedFraming.zoom + amount).toFixed(2)))),
    });
    setFramingStatus(amount > 0 ? "ZOOMED_IN" : "ZOOMED_OUT");
  };

  const resetFraming = () => {
    setDraftFraming(null);
    setFramingStatus("RESET");
  };

  const closeFramingEditor = () => {
    setDraftFraming(framingMedia?.cardFraming || null);
    setFramingStatus(framingMedia?.cardFraming ? "RELOADED" : "INITIAL_DEFAULT");
    setFramingEditorOpen(false);
  };

  const handleFramingKeyDown = (event) => {
    const focalStep = event.shiftKey ? 0.05 : 0.015;
    if (["+", "="].includes(event.key)) adjustFramingZoom(0.1);
    else if (["-", "_"].includes(event.key)) adjustFramingZoom(-0.1);
    else if (event.key === "0") resetFraming();
    else if (event.key === "ArrowLeft") setDraftFraming({ ...resolvedFraming, focal_x: Math.max(0, resolvedFraming.focal_x - focalStep) });
    else if (event.key === "ArrowRight") setDraftFraming({ ...resolvedFraming, focal_x: Math.min(1, resolvedFraming.focal_x + focalStep) });
    else if (event.key === "ArrowUp") setDraftFraming({ ...resolvedFraming, focal_y: Math.max(0, resolvedFraming.focal_y - focalStep) });
    else if (event.key === "ArrowDown") setDraftFraming({ ...resolvedFraming, focal_y: Math.min(1, resolvedFraming.focal_y + focalStep) });
    else return;
    event.preventDefault();
    if (event.key.startsWith("Arrow")) setFramingStatus("KEYBOARD_PANNED");
  };

  const saveFraming = async () => {
    if (!framingMedia || typeof actions.updateCatalogMediaCardFraming !== "function") return;
    const next = await run(() => actions.updateCatalogMediaCardFraming({
      productId: product.rawId,
      mediaId: framingMedia.id,
      expectedRevision: product.revision,
      cardFraming: draftFraming,
    }));
    if (next) setFramingStatus("SAVED");
  };

  const captureFramingDimensions = (event) => {
    const width = Number(event.currentTarget.naturalWidth);
    const height = Number(event.currentTarget.naturalHeight);
    if (width > 0 && height > 0) setFramingDimensions({ width, height });
  };

  const framingStateCopy = framingState === CARD_FRAMING_STATES.CUSTOM_FRAMING_SAVED
    ? { label: "Özel kart kadrajı kayıtlı", tone: "saved" }
    : framingState === CARD_FRAMING_STATES.FRAMING_RECOMMENDED
      ? { label: "Kart kadrajı öneriliyor", tone: "recommended" }
      : framingState === CARD_FRAMING_STATES.NO_FRAMING_NEEDED
        ? { label: "Kadraj gerekmiyor", tone: "ready" }
        : { label: "Görsel oranı inceleniyor", tone: "analyzing" };

  return (
    <OperationDialog title={`${product.name} · medya kayıtları`} busy={busy} onClose={onClose} testId="catalog-media-dialog" wide>
      <section className="notice-card live-boundary-notice" role="note"><Icon name="shield" /><div><strong>Sağlayıcıya çağrı yapılmaz</strong><p>Bu ekran yalnız doğrulanmış HTTPS Cloudinary varlıklarını kataloğa kaydeder, sıralar ve kapak seçer. Silme yalnız katalog kaydını kaldırır; sağlayıcı varlığının silinmesi ayrı yayın kapısıdır.</p></div></section>
      {error && <OperationError error={error} id="catalog-media-error" />}
      <form className="connected-form live-catalog-form" onSubmit={register}>
        <label className="field field-wide"><span>Cloudinary HTTPS medya URL</span><input value={mediaUrl} onChange={(event) => setMediaUrl(event.target.value)} required maxLength="2048" placeholder="https://res.cloudinary.com/.../image/upload/..." /></label>
        <label className="field"><span>Medya türü</span><select value={mediaType} onChange={(event) => { const nextType = event.target.value; setMediaType(nextType); if (nextType === "video") setIsCover(false); }}><option value="image">Görsel</option><option value="video" disabled>Video — renderer handoff bekliyor</option></select></label>
        <label className="check-row"><input type="checkbox" checked={isCover} onChange={(event) => setIsCover(event.target.checked)} disabled={mediaType !== "image"} /><span>{mediaType === "image" ? "Kapak yap" : "Video kapak olamaz"}</span></label>
        <button className="primary-button" type="submit" disabled={busy || !mediaUrl.trim()}>Medya kaydını ekle</button>
      </form>
      {framingMedia && <section className="catalog-card-framing" aria-labelledby="catalog-card-framing-title" data-framing-state={framingState} data-editor-status={framingStatus}>
        <img ref={framingMeasurementRef} className="catalog-card-framing__measurement" src={framingMedia.mediaUrl} alt="" aria-hidden="true" onLoad={captureFramingDimensions} draggable="false" />
        <div className="catalog-card-framing__heading">
          <div className="catalog-card-framing__copy"><span className="section-kicker">Müşteri ürün kartı</span><h3 id="catalog-card-framing-title">Ürün kartı kadrajı</h3><p>Bu ayar yalnız ürün kartında görünümü değiştirir. Ürün detayında orijinal görselin tamamı gösterilir.</p></div>
          <span className={`catalog-card-framing__state is-${framingStateCopy.tone}`} role="status">{framingStateCopy.label}</span>
        </div>
        {framingState === CARD_FRAMING_STATES.FRAMING_RECOMMENDED && <p className="catalog-card-framing__recommendation" role="note"><Icon name="info" /><span><strong>Bu görsel ürün kartı oranından farklı.</strong> Kart görünümünü aşağıdaki gerçek kart alanında ayarlayın; orijinal görsel değişmez.</span></p>}
        {framingAssessment.lowResolution && <p className="catalog-card-framing__quality" role="alert"><Icon name="warning" /><span><strong>Kaynak çözünürlüğü düşük olabilir.</strong> Kadraj ayarı görüntü kalitesini artırmaz; daha yüksek çözünürlüklü kaynak önerilir.</span></p>}
        {!framingEditorOpen && <button className="secondary-button catalog-card-framing__customize" type="button" disabled={busy} onClick={() => setFramingEditorOpen(true)}><Icon name="sliders" /> Kart kadrajını özelleştir</button>}
        {framingEditorOpen && <div className="catalog-card-framing__editor">
          <div className="catalog-card-framing__workspace" style={{ "--card-viewport-aspect": CARD_VIEWPORT_ASPECT_RATIO, "--card-viewport-radius": `${CARD_VIEWPORT_BORDER_RADIUS_PX}px` }}>
            <img className="catalog-card-framing__source" src={framingMedia.mediaUrl} alt="" onLoad={captureFramingDimensions} draggable="false" />
            <div
              ref={framingPreviewRef}
              className="catalog-card-framing__preview"
              style={{ aspectRatio: CARD_VIEWPORT_ASPECT_RATIO, borderRadius: CARD_VIEWPORT_BORDER_RADIUS_PX }}
              onPointerDown={startFramingDrag}
              onPointerMove={moveFramingDrag}
              onPointerUp={stopFramingDrag}
              onPointerCancel={stopFramingDrag}
              onKeyDown={handleFramingKeyDown}
              role="group"
              tabIndex="0"
              aria-label={`${product.name} müşteri kartı kadrajı. Görseli sürükleyin veya ok tuşlarıyla konumlandırın.`}
            >
              <img src={framingMedia.mediaUrl} alt="" style={cardFramingPresentation(draftFraming)} draggable="false" />
              <span className="catalog-card-framing__drag-hint">Görseli sürükleyerek konumlandır</span>
            </div>
          </div>
          <div className="catalog-card-framing__controls">
            <div className="catalog-card-framing__zoom" role="group" aria-label="Kart kadrajı yakınlaştırma">
              <button type="button" disabled={busy || resolvedFraming.zoom <= CARD_FRAMING_LIMITS.zoomMin} onClick={() => adjustFramingZoom(-0.1)} aria-label="Kart görselini uzaklaştır"><Icon name="minus" /></button>
              <span aria-live="polite">Yakınlaştırma %{Math.round(resolvedFraming.zoom * 100)}</span>
              <button type="button" disabled={busy || resolvedFraming.zoom >= CARD_FRAMING_LIMITS.zoomMax} onClick={() => adjustFramingZoom(0.1)} aria-label="Kart görselini yakınlaştır"><Icon name="plus" /></button>
            </div>
            <p className="catalog-card-framing__interaction-help">Görseli doğrudan sürükleyin. Klavyede ok tuşlarıyla konumlandırabilir; +, − ve 0 ile yakınlaştırma görünümünü yönetebilirsiniz.</p>
            <div className="catalog-card-framing__actions">
              <button className="secondary-button" type="button" disabled={busy} onClick={resetFraming}><Icon name="refresh" /> Sıfırla</button>
              <button className="secondary-button" type="button" disabled={busy} onClick={closeFramingEditor}><Icon name="close" /> Vazgeç</button>
              <button className="primary-button" type="button" disabled={busy || typeof actions.updateCatalogMediaCardFraming !== "function"} onClick={saveFraming}><Icon name="save" /> {busy ? "Kaydediliyor…" : "Kart kadrajını kaydet"}</button>
            </div>
          </div>
        </div>}
      </section>}
      <div className="table-scroll" tabIndex="0" role="region" aria-label="Ürün medya sırası">
        <table className="data-table"><thead><tr><th>Medya</th><th>Tür</th><th>Kapak</th><th>Sıra</th><th>İşlem</th></tr></thead><tbody>
          {product.media.map((entry, index) => <tr key={entry.id}>
            <td><span className="catalog-media-cell">{entry.mediaType === "image" && <img src={entry.mediaUrl} alt="" />}<a href={entry.mediaUrl} target="_blank" rel="noreferrer">Medya #{entry.id}</a></span></td>
            <td>{entry.mediaType === "video" ? "Video" : "Görsel"}</td>
            <td><button className="secondary-button small" type="button" disabled={busy || entry.isCover || entry.mediaType !== "image"} onClick={() => setCover(entry.id)}>{entry.isCover ? "Kapak" : entry.mediaType === "image" ? "Kapak yap" : "Yalnız görsel"}</button></td>
            <td><span className="live-operation-buttons"><button className="secondary-button small" type="button" disabled={busy || index === 0} onClick={() => reorder(entry.id, -1)} aria-label={`Medya ${entry.id} yukarı taşı`}>↑</button><button className="secondary-button small" type="button" disabled={busy || index === product.media.length - 1} onClick={() => reorder(entry.id, 1)} aria-label={`Medya ${entry.id} aşağı taşı`}>↓</button></span></td>
            <td><span className="live-operation-buttons">{entry.mediaType === "image" && <button className="secondary-button small" type="button" disabled={busy} onClick={() => selectFramingMedia(entry)}>{entry.id === framingMediaId ? "Kadraj açık" : "Kadraj"}</button>}<button className="danger-button small" type="button" disabled={busy} onClick={() => remove(entry.id)}>Kaydı kaldır</button></span></td>
          </tr>)}
          {product.media.length === 0 && <tr><td colSpan="5">Henüz medya kaydı yok.</td></tr>}
        </tbody></table>
      </div>
    </OperationDialog>
  );
}

const catalogProductStoreTupleMissing = (product) => product.storeId == null
  && !product.storeName
  && !product.storeSlug;

const catalogProductOwnershipUnresolved = (product) => product.adminEditable !== true
  && !product.sellerOrganizationId
  && catalogProductStoreTupleMissing(product);

const catalogReadonlyPresentation = (product) => {
  if (product.sellerOrganizationId) {
    return {
      title: "Seller ürünü · salt okunur",
      detail: "Detay mutation, medya ve arşivleme Admin'de açılmaz.",
    };
  }
  if (catalogProductOwnershipUnresolved(product)) {
    return {
      title: "Sahiplik/store bağı doğrulanamadı · salt okunur",
      detail: "Mağaza ve organizasyon bağı authoritative olarak kurulmadan Admin mutation açılmaz.",
    };
  }
  return {
    title: "Ürün · salt okunur",
    detail: "Admin yazma sahipliği doğrulanmadığı için detay ve mutation açılmaz.",
  };
};

function Catalog({ catalogPage, error, refreshing, sessionRefreshing, onRefresh, onReloadCapabilities, mutationActions }) {
  const products = catalogPage.items;
  const [query, setQuery] = useState("");
  const [publication, setPublication] = useState("all");
  const [stock, setStock] = useState("all");
  const [visibility, setVisibility] = useState("all");
  const [operation, setOperation] = useState(null);
  const [openingProductId, setOpeningProductId] = useState(null);
  const [operationNotice, setOperationNotice] = useState(null);
  const [suppressedMutationActions, setSuppressedMutationActions] = useState(null);
  const pendingMediaFocusRef = useRef(null);
  const writesSuppressed = suppressedMutationActions === mutationActions;
  const platformStoreAuthority = catalogPage.platformStoreAuthority;
  const writeCapabilityEnabled = typeof mutationActions.getCatalogProduct === "function"
    && typeof mutationActions.createCatalogProduct === "function"
    && typeof mutationActions.updateCatalogProduct === "function"
    && typeof mutationActions.archiveCatalogProduct === "function";
  const platformStoreWritable = platformStoreAuthority.adminWritable === true;
  const productWriteEnabled = writeCapabilityEnabled && platformStoreWritable;
  const writesBlocked = !productWriteEnabled || writesSuppressed || Boolean(error) || refreshing || sessionRefreshing;
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("tr-TR");
    return filterFirstPartyCatalogProducts(products, {
      publication,
      query: "",
      stock,
      visibility,
    }).filter((product) => {
      const haystack = `${product.id} ${product.rawId} ${product.name} ${product.primaryCategoryName || ""} ${product.primaryCategoryPath || ""} ${product.storeId || ""} ${product.storeName || ""} ${product.storeSlug || ""} ${product.sellerOrganizationId || ""} ${product.sellerOrganizationName || ""}`
        .toLocaleLowerCase("tr-TR");
      return !normalized || haystack.includes(normalized);
    });
  }, [products, publication, query, stock, visibility]);

  useEffect(() => {
    if (!writesBlocked || !operation) return;
    setOperation(null);
    setOperationNotice((current) => current || {
      tone: "warning",
      message: "Katalog veya admin oturumu değiştiği için açık ürün işlemi kapatıldı. Güncel veri doğrulanmadan yazma yapılmadı.",
    });
  }, [operation, writesBlocked]);

  useEffect(() => {
    const pending = pendingMediaFocusRef.current;
    if (!pending || refreshing || sessionRefreshing || openingProductId !== null || operation) return undefined;
    const remainingDelay = Math.max(0, pending.earliestAt - Date.now());
    const timer = window.setTimeout(() => {
      const selector = `[data-catalog-operation="media"][data-product-id="${pending.productId}"]`;
      const target = document.querySelector(selector);
      if (target instanceof HTMLButtonElement && !target.disabled) {
        target.focus();
        pendingMediaFocusRef.current = null;
      }
    }, remainingDelay);
    return () => window.clearTimeout(timer);
  }, [openingProductId, operation, products, refreshing, sessionRefreshing]);

  const resetFilters = () => {
    setQuery("");
    setPublication("all");
    setStock("all");
    setVisibility("all");
  };

  const requestContext = (requestError) => `${requestError?.code ? ` Kod: ${requestError.code}.` : ""}${requestError?.requestId ? ` İstek kimliği: ${requestError.requestId}` : ""}`;
  const suppressCatalogWrites = (requestError) => {
    setOperation(null);
    setSuppressedMutationActions(mutationActions);
    setOperationNotice({
      tone: "warning",
      message: `Ürün yazma capability'si sunucu tarafından kapatıldı veya admin yetkisi değişti. Oturum ve katalog yeniden doğrulanıyor.${requestContext(requestError)}`,
    });
    onReloadCapabilities();
    onRefresh();
  };
  const handleMutationError = (requestError) => {
    if (requestError?.code === "CATALOG_PRODUCT_INPUT_INVALID" || requestError?.status === 400 || requestError?.status === 422) return false;
    if (requestError?.status === 403 || requestError?.status === 503) {
      suppressCatalogWrites(requestError);
      return true;
    }
    setOperation(null);
    const stale = requestError?.status === 409
      || requestError?.status === 428
      || requestError?.details?.refetchRequired === true;
    const missing = requestError?.status === 404;
    setOperationNotice({
      tone: "warning",
      message: stale
        ? `Ürün başka bir işlemle değişti veya revision önkoşulu geçersiz kaldı. Liste yenileniyor; güncel kaydı yeniden açın.${requestContext(requestError)}`
        : missing
          ? `Ürün artık bulunamadı. Liste güncel kayıtlarla yenileniyor.${requestContext(requestError)}`
          : `İsteğin sonucu güvenle doğrulanamadı. Yinelenen yazmayı önlemek için pencere kapatıldı ve katalog yenileniyor.${requestContext(requestError)}`,
    });
    onRefresh();
    return true;
  };
  const openCreate = () => {
    if (writesBlocked || openingProductId !== null) return;
    setOperationNotice(null);
    setOperation({ kind: "create" });
  };
  const openExactProductOperation = async (kind, summary) => {
    if (writesBlocked || openingProductId !== null) return;
    setOperationNotice(null);
    if (summary.adminEditable !== true) {
      const readonlyPresentation = catalogReadonlyPresentation(summary);
      setOperationNotice({
        tone: "warning",
        message: `${readonlyPresentation.title}. Commerce Pro kaydı görünür tutar ancak ${readonlyPresentation.detail}`,
      });
      return;
    }
    setOpeningProductId(summary.rawId);
    try {
      const product = await mutationActions.getCatalogProduct({ productId: summary.rawId });
      if (product.deletedAt || product.publicationStatus === "archived") {
        setOperationNotice({ tone: "warning", message: "Ürün bu sırada arşivlendi. Arşivli kayıtlar düzenlenemez veya yeniden arşivlenemez; liste yenileniyor." });
        onRefresh();
        return;
      }
      setOperation({ kind, product });
    } catch (requestError) {
      if (requestError?.status === 403 || requestError?.status === 503) {
        suppressCatalogWrites(requestError);
      } else {
        setOperationNotice({
          tone: "warning",
          message: requestError?.status === 404
            ? `Ürün artık bulunamadı; liste yenileniyor.${requestContext(requestError)}`
            : `Düzenleme için gerekli tam ürün DTO'su alınamadı; özet veriden alan tahmin edilmedi.${requestContext(requestError)}`,
        });
        if ([404, 409, 428].includes(requestError?.status) || requestError?.details?.refetchRequired === true) onRefresh();
      }
    } finally {
      setOpeningProductId(null);
    }
  };
  const handleComplete = ({ kind, product }) => {
    setOperation(null);
    setOperationNotice({
      tone: "success",
      message: kind === "create"
        ? `${product.id} ürünü ${CATALOG_PUBLICATION_STATUS_LABELS[product.publicationStatus]} durumunda oluşturuldu. Medya ayrı kontrollü kayıt ekranından eklenebilir; liste sunucudan yenileniyor.`
        : kind === "edit"
          ? `${product.id} ürün değişiklikleri revision ${product.revision} olarak kaydedildi. Liste sunucudan yenileniyor.`
          : `${product.id} hard-delete yapılmadan arşivlendi ve müşteri görünürlüğü kapatıldı.`,
    });
    onRefresh();
  };
  const handleMediaComplete = (product, { keepOpen = false } = {}) => {
    setOperationNotice({ tone: "success", message: `${product.id} medya kaydı revision ${product.revision} ile güncellendi. Sağlayıcıya yazma veya silme çağrısı yapılmadı.` });
    if (!keepOpen) {
      setOperation(null);
      onRefresh();
    }
  };
  const closeMediaOperation = () => {
    if (operation?.kind === "media") {
      pendingMediaFocusRef.current = {
        productId: operation.product.rawId,
        earliestAt: Date.now() + 250,
      };
    }
    setOperation(null);
    onRefresh();
  };
  const archivedProduct = (product) => Boolean(product.deletedAt) || product.publicationStatus === "archived";
  const writeBoundaryMessage = !writeCapabilityEnabled
    ? "Bu oturum bütün ürün özetlerini salt okunur gösterir; platform ürünü yazma capability'si sunulmadı. Seller ürünleri capability'den bağımsız olarak salt okunurdur."
    : platformStoreAuthority.reason === "unavailable"
      ? "Yazılabilir bir NovaStore platform mağazası bulunamadı. Yeni ürün oluşturma ve mevcut kayıtlara yazma güvenli biçimde kapalıdır."
      : platformStoreAuthority.reason === "seller_bound"
        ? `${platformStoreAuthority.storeName} şu anda bir Seller organizasyonuna bağlıdır. Ürünleri Seller portalından yönetilir; Admin sahiplik sınırını aşarak oluşturma, düzenleme, medya veya arşivleme yapmaz.`
    : writesSuppressed
      ? "Sunucu yazmayı reddettiği için bu görünümdeki ürün aksiyonları oturum yeniden doğrulanana kadar kapatıldı."
      : error
        ? "Son katalog yenilemesi başarısız olduğu için eski revision üzerinde yazma yapılmaz."
        : refreshing || sessionRefreshing
          ? "Katalog veya admin oturumu yenilenirken ürün yazmaları geçici olarak kapalıdır."
          : "Oluşturma, güncelleme ve arşivleme yalnız adminEditable=true platform ürününde ve güncel revision ile açıktır; Seller ürünleri salt okunur kalır.";

  return (
    <section className="workspace live-workspace" data-testid="live-catalog">
      <header className="workspace-heading operations-heading">
        <div>
          <span className="eyebrow">Entegre backend · paylaşımlı katalog · {productWriteEnabled ? "Admin mağazası yazmaya açık" : "sahiplik sınırıyla salt okunur"}</span>
          <h2 tabIndex="-1">Ürünler</h2>
          <p>En fazla son {catalogPage.limit} platform ve Seller ürün kaydı, sahiplik ve mağaza gerçeğiyle gösterilir.</p>
        </div>
        <div className="heading-actions live-catalog-heading-actions">
          {productWriteEnabled && <button className="primary-button" onClick={openCreate} disabled={writesBlocked || openingProductId !== null}><Icon name="package" />Yeni platform ürünü</button>}
          <button className="secondary-button" onClick={onRefresh} disabled={refreshing}><Icon name="refresh" />{refreshing ? "Yenileniyor" : "Yenile"}</button>
        </div>
      </header>

      <ResourceWarning error={error} onRetry={onRefresh} />
      {operationNotice && <section className={`notice-card live-operation-notice ${operationNotice.tone === "warning" ? "warning-card" : "success-card"}`} role="status"><Icon name={operationNotice.tone === "warning" ? "warning" : "check"} /><div><strong>{operationNotice.tone === "warning" ? "Güncel veri gerekli" : "Ürün işlemi kaydedildi"}</strong><p>{operationNotice.message}</p></div></section>}
      <section className={`notice-card live-boundary-notice ${platformStoreWritable ? "" : "warning-card"}`} role="note">
        <Icon name="shield" />
        <div>
          <strong>{platformStoreAuthority.reason === "seller_bound" ? `${platformStoreAuthority.storeName} · Seller yönetiminde` : platformStoreAuthority.reason === "unavailable" ? "Platform mağazası kullanılamıyor" : "Tek katalog gerçeği · sahiplik tabanlı yazma sınırı"}</strong>
          <p>{platformStoreWritable ? "Platform ve Seller ürünleri aynı listede görünür. Yalnız adminEditable=true platform kaydı düzenlenebilir; Seller ürününde detay mutation, medya yazması ve arşivleme açılmaz. Dosya yükleme/silme, hard-delete ve arşivden geri yükleme bu turda yoktur." : writeBoundaryMessage}</p>
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
            <p>Backend paylaşımlı katalog için boş bir liste döndürdü.</p>
            <button className="secondary-button" onClick={onRefresh} disabled={refreshing}>{refreshing ? "Yenileniyor" : "Yeniden dene"}</button>
          </div>
        ) : filtered.length > 0 ? (
          <div className="table-scroll table-scroll-hint" tabIndex="0" role="region" aria-label="Platform ve Seller ürün özeti tablosu">
            <table className="data-table live-catalog-table">
              <caption className="sr-only">Entegre backend'den okunan platform ve Seller ürün özetleri; Seller ürünleri salt okunurdur</caption>
              <thead><tr><th scope="col">Ürün</th><th scope="col">Mağaza / sahiplik</th><th scope="col">Birincil kategori</th><th scope="col">Fiyat</th><th scope="col">Stok</th><th scope="col">Yayın</th><th scope="col">Etkin vitrin</th><th scope="col">Medya</th><th scope="col">Güncellendi</th><th scope="col">Ürün işlemi</th></tr></thead>
              <tbody>{filtered.map((product) => {
                const publicationStatus = resolveCatalogPublicationStatus(product);
                const customerVisible = isCatalogProductEffectivelyVisible(product);
                const storeTupleMissing = catalogProductStoreTupleMissing(product);
                const ownershipUnresolved = catalogProductOwnershipUnresolved(product);
                const readonlyPresentation = catalogReadonlyPresentation(product);
                return (
                  <tr key={product.id}>
                    <td><span className="live-catalog-product"><Icon name="package" /><span><strong>{product.name}</strong><small>{product.id}</small></span></span></td>
                    <td><span className="live-order-stack live-product-owner"><span className="live-order-stack-item"><strong>{storeTupleMissing ? "Atanmamış mağaza" : product.storeName || `Mağaza #${product.storeId}`}</strong><small>{storeTupleMissing ? "Mağaza kimliği eksik" : `${product.storeSlug || "Mağaza slug bilgisi yok"} · ${product.storeOperationalStatus}`}</small></span><span className="live-order-stack-item"><strong>{ownershipUnresolved ? "Sahiplik/store bağı doğrulanamadı" : product.sellerOrganizationName || "NovaStore platform"}</strong><small>{product.sellerOrganizationId ? `Organizasyon #${product.sellerOrganizationId} · ${product.sellerOrganizationStatus}` : ownershipUnresolved ? "Organizasyon bağı yok · salt okunur" : "Platform sahipliği"}</small></span></span></td>
                    <td><span className="live-customer-cell"><strong>{product.primaryCategoryName || "Birincil kategori yok"}</strong><small>{product.primaryCategoryPath || `${product.categoryCount} kategori bağlantısı`}</small></span></td>
                    <td><span className="live-customer-cell"><strong>{money(product.price, product.currency)}</strong>{product.oldPrice !== null && <small>Önceki {money(product.oldPrice, product.currency)}</small>}</span></td>
                    <td><span className={`status ${product.stock > 0 ? "status-stokta" : "status-stokta-yok"}`}>{product.stock > 0 ? `${product.stock} adet` : "Tükendi"}</span></td>
                    <td><span className={`status status-${statusClass(CATALOG_PUBLICATION_STATUS_LABELS[publicationStatus])}`}>{CATALOG_PUBLICATION_STATUS_LABELS[publicationStatus]}</span>{product.deletedAt && <small className="live-status-note">Silinmiş kayıt vitrine açılamaz.</small>}</td>
                    <td><span className={`status ${customerVisible ? "status-yayında" : "status-yayından-kaldırıldı"}`}>{customerVisible ? "Görünür" : "Görünmez"}</span>{!customerVisible && product.customerVisible && <small className="live-status-note">Ham bayrak açık; yayın veya arşiv durumu vitrine kapatır.</small>}</td>
                    <td><span className={`live-media-presence ${product.hasMedia ? "has-media" : "no-media"}`}><Icon name={product.hasMedia ? "check" : "warning"} />{product.hasMedia ? "Mevcut" : "Yok"}</span></td>
                    <td><span className="live-customer-cell"><strong>{dateTime(product.updatedAt || product.createdAt)}</strong><small>{product.updatedAt ? "Son güncelleme" : product.createdAt ? "Oluşturulma" : "Tarih bilgisi yok"}</small></span></td>
                    <td>{product.adminEditable !== true ? <span className="live-seller-readonly-lock"><Icon name="shield" /><span><strong>{readonlyPresentation.title}</strong><small>{readonlyPresentation.detail}</small></span></span> : !writeCapabilityEnabled ? <span className="live-archived-lock"><Icon name="shield" />Platform yazması kapalı</span> : archivedProduct(product) ? <span className="live-archived-lock"><Icon name="shield" />Arşivli · kilitli</span> : <span className="live-operation-buttons"><button type="button" className="secondary-button small" disabled={writesBlocked || openingProductId !== null} onClick={() => openExactProductOperation("edit", product)}>{openingProductId === product.rawId ? "Tam DTO alınıyor…" : "Düzenle"}</button><button type="button" className="secondary-button small" data-catalog-operation="media" data-product-id={product.rawId} disabled={writesBlocked || openingProductId !== null} onClick={() => openExactProductOperation("media", product)}>Medya</button><button type="button" className="danger-button small" disabled={writesBlocked || openingProductId !== null} onClick={() => openExactProductOperation("archive", product)}>Arşivle</button></span>}</td>
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
        <footer className={`table-footer live-catalog-write-footer ${writesBlocked ? "is-blocked" : "is-ready"}`} role="note"><span><Icon name={writesBlocked ? "shield" : "check"} />{writeBoundaryMessage}</span><strong>{productWriteEnabled ? "Admin mağazası CRUD · Seller salt okunur" : "Sahiplik nedeniyle salt okunur"}</strong></footer>
      </section>
      {operation?.kind === "create" && typeof mutationActions.createCatalogProduct === "function" && <CatalogProductFormDialog mode="create" action={mutationActions.createCatalogProduct} onClose={() => setOperation(null)} onComplete={handleComplete} onRequestError={handleMutationError} />}
      {operation?.kind === "edit" && typeof mutationActions.updateCatalogProduct === "function" && <CatalogProductFormDialog mode="edit" product={operation.product} action={mutationActions.updateCatalogProduct} onClose={() => setOperation(null)} onComplete={handleComplete} onRequestError={handleMutationError} />}
      {operation?.kind === "archive" && typeof mutationActions.archiveCatalogProduct === "function" && <CatalogProductArchiveDialog product={operation.product} action={mutationActions.archiveCatalogProduct} onClose={() => setOperation(null)} onComplete={handleComplete} onRequestError={handleMutationError} />}
      {operation?.kind === "media" && typeof mutationActions.registerCatalogMedia === "function" && <CatalogMediaDialog product={operation.product} actions={mutationActions} onClose={closeMediaOperation} onComplete={handleMediaComplete} onRequestError={handleMutationError} />}
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

const catalogStructureEntityLabels = Object.freeze({
  categories: "kategori",
  attributes: "özellik",
  templates: "şablon",
  collections: "koleksiyon",
  menus: "menü",
});

const catalogStructureFormState = (view, item = null) => {
  if (view === "categories") return {
    name: item?.name || "", slug: item?.slug || "", parentId: item?.parentId || "", sortOrder: item?.sortOrder || 0,
    active: item?.active !== false, customerVisible: item?.customerVisible !== false, showInMenu: item?.showInMenu !== false,
    showOnHome: item?.showOnHome === true, hideWhenEmpty: item?.hideWhenEmpty !== false,
  };
  if (view === "attributes") return {
    code: item?.code || "", name: item?.name || "", type: item?.type || "text", unit: item?.unit || "", sortOrder: item?.sortOrder || 0,
    filterable: item?.filterable === true, required: item?.required === true, variantRelevant: item?.variantRelevant === true, active: item?.active !== false,
  };
  if (view === "templates") return {
    name: item?.name || "", categoryId: item?.categoryId || "", sortOrder: item?.sortOrder || 0, active: item?.active !== false,
  };
  if (view === "collections") return {
    name: item?.name || "", slug: item?.slug || "", type: item?.type || "manual", ruleCode: item?.ruleCode || "new_arrivals",
    sortOrder: item?.sortOrder || 0, showOnHome: item?.showOnHome === true, active: item?.active !== false,
  };
  return { code: item?.code || "main", name: item?.name || "", active: item?.active !== false };
};

function CatalogStructureRecordDialog({ view, operation, structure, actions, onClose, onComplete }) {
  const item = operation.item || null;
  const archive = operation.kind === "archive";
  const label = catalogStructureEntityLabels[view];
  const [form, setForm] = useState(() => catalogStructureFormState(view, item));
  const [busy, setBusy] = useState(false);
  const [requestError, setRequestError] = useState(null);
  const field = (name, value) => setForm((current) => ({ ...current, [name]: value }));
  const submit = async (event) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setRequestError(null);
    try {
      if (archive) {
        if (view === "categories") await actions.setCategoryArchived({ categoryId: item.id, archived: !item.deletedAt });
        if (view === "attributes") await actions.setAttributeArchived({ attributeId: item.id, archived: item.active });
        if (view === "collections") await actions.setCollectionArchived({ collectionId: item.id, archived: !item.deletedAt });
      } else if (view === "categories") {
        await actions.saveCategory({ category: item, body: {
          name: form.name.trim(), slug: form.slug.trim() || null, parent_id: form.parentId ? Number(form.parentId) : null,
          sort_order: Number(form.sortOrder) || 0, is_active: form.active, is_customer_visible: form.customerVisible,
          show_in_menu: form.showInMenu, show_on_home: form.showOnHome, hide_when_empty: form.hideWhenEmpty,
        } });
      } else if (view === "attributes") {
        await actions.saveAttribute({ attribute: item, body: {
          code: form.code.trim(), name: form.name.trim(), type: form.type, unit: form.unit.trim() || null,
          sort_order: Number(form.sortOrder) || 0, is_filterable: form.filterable, is_required: form.required,
          is_variant_relevant: form.variantRelevant, is_active: form.active,
        } });
      } else if (view === "templates") {
        await actions.saveTemplate({ template: item, body: {
          name: form.name.trim(), category_id: Number(form.categoryId), sort_order: Number(form.sortOrder) || 0, is_active: form.active,
        } });
      } else if (view === "collections") {
        await actions.saveCollection({ collection: item, body: {
          name: form.name.trim(), slug: form.slug.trim(), collection_type: form.type,
          rule_code: form.type === "dynamic" ? form.ruleCode : null, sort_order: Number(form.sortOrder) || 0,
          show_on_home: form.showOnHome, is_active: form.active,
        } });
      } else {
        await actions.saveMenu({ menu: item, body: { code: form.code, name: form.name.trim(), is_active: form.active } });
      }
      onComplete(`${item ? "Güncellenen" : "Oluşturulan"} ${label} kaydı sunucudan yeniden doğrulandı.`);
    } catch (error) {
      setRequestError(error);
      setBusy(false);
    }
  };

  if (archive) {
    const restoring = (view === "categories" || view === "collections") && Boolean(item.deletedAt);
    return <OperationDialog title={`${item.name} ${restoring ? "geri yüklensin mi?" : "arşivlensin mi?"}`} busy={busy} onClose={onClose} testId="catalog-structure-archive-dialog"><form className="modal-form live-operation-form" onSubmit={submit}><div className="confirmation-body"><Icon name="warning" /><p><strong>{restoring ? "Kayıt yeniden etkin yönetim alanına alınacak." : "Kayıt kalıcı olarak silinmeyecek."}</strong> {restoring ? "Görünürlük ayarlarını yayımlamadan önce yeniden kontrol edin." : "Bağlı ürün ve yapı ilişkileri korunur; müşteri yüzeyinden güvenli biçimde çekilir."}</p></div><OperationError error={requestError} /><footer><button type="button" className="secondary-button" onClick={onClose} disabled={busy}>Vazgeç</button><button type="submit" className={restoring ? "primary-button" : "danger-button"} disabled={busy}>{busy ? "Kaydediliyor…" : restoring ? "Geri yükle" : "Arşivle"}</button></footer></form></OperationDialog>;
  }

  return <OperationDialog title={`${item ? "Düzenle" : "Yeni"}: ${label}`} busy={busy} onClose={onClose} testId="catalog-structure-record-dialog" wide><form className="modal-form live-operation-form live-structure-form" onSubmit={submit}><OperationError error={requestError} />
    {(view === "categories" || view === "collections" || view === "templates" || view === "menus") && <label><span>Ad</span><input data-autofocus value={form.name} onChange={(event) => field("name", event.target.value)} required maxLength="200" /></label>}
    {(view === "categories" || view === "collections") && <label><span>Slug</span><input value={form.slug} onChange={(event) => field("slug", event.target.value)} maxLength="200" placeholder="otomatik-uretilebilir" /></label>}
    {view === "categories" && <label><span>Üst kategori</span><select value={form.parentId} onChange={(event) => field("parentId", event.target.value)}><option value="">Kök kategori</option>{structure.categories.items.filter((entry) => entry.id !== item?.id && !entry.deletedAt).map((entry) => <option value={entry.id} key={entry.id}>{entry.path || entry.name}</option>)}</select></label>}
    {view === "attributes" && <><label><span>Sistem kodu</span><input data-autofocus value={form.code} onChange={(event) => field("code", event.target.value)} required pattern="[a-z][a-z0-9_]{1,79}" maxLength="80" /></label><label><span>Özellik adı</span><input value={form.name} onChange={(event) => field("name", event.target.value)} required maxLength="200" /></label><label><span>Tür</span><select value={form.type} onChange={(event) => field("type", event.target.value)}>{Object.entries(attributeTypeLabels).map(([value, name]) => <option value={value} key={value}>{name}</option>)}</select></label><label><span>Birim</span><input value={form.unit} onChange={(event) => field("unit", event.target.value)} maxLength="80" placeholder="Örn. cm" /></label></>}
    {view === "templates" && <label><span>Kategori</span><select data-autofocus value={form.categoryId} onChange={(event) => field("categoryId", event.target.value)} required><option value="">Kategori seçin</option>{structure.categories.items.filter((entry) => !entry.deletedAt).map((entry) => <option value={entry.id} key={entry.id}>{entry.path || entry.name}</option>)}</select></label>}
    {view === "collections" && <><label><span>Koleksiyon türü</span><select value={form.type} onChange={(event) => field("type", event.target.value)}><option value="manual">Manuel</option><option value="dynamic">Dinamik</option></select></label>{form.type === "dynamic" && <label><span>Dinamik kural</span><select value={form.ruleCode} onChange={(event) => field("ruleCode", event.target.value)}>{Object.entries(collectionRuleLabels).map(([value, name]) => <option value={value} key={value}>{name}</option>)}</select></label>}</>}
    {view === "menus" && <label><span>Menü konumu</span><select data-autofocus value={form.code} onChange={(event) => field("code", event.target.value)} disabled={Boolean(item)}><option value="main">Ana menü</option><option value="footer">Alt bilgi</option><option value="mobile">Mobil</option><option value="home">Ana sayfa</option></select></label>}
    {view !== "menus" && <label><span>Sıra</span><input type="number" value={form.sortOrder} onChange={(event) => field("sortOrder", event.target.value)} /></label>}
    <fieldset className="live-structure-switches"><legend>Yayın ve kullanım</legend><label className="check-row"><input type="checkbox" checked={form.active} onChange={(event) => field("active", event.target.checked)} /><span>Etkin</span></label>{view === "categories" && <><label className="check-row"><input type="checkbox" checked={form.customerVisible} onChange={(event) => field("customerVisible", event.target.checked)} /><span>Müşteriye görünür</span></label><label className="check-row"><input type="checkbox" checked={form.showInMenu} onChange={(event) => field("showInMenu", event.target.checked)} /><span>Menüde göster</span></label><label className="check-row"><input type="checkbox" checked={form.showOnHome} onChange={(event) => field("showOnHome", event.target.checked)} /><span>Ana sayfada göster</span></label><label className="check-row"><input type="checkbox" checked={form.hideWhenEmpty} onChange={(event) => field("hideWhenEmpty", event.target.checked)} /><span>Boşken gizle</span></label></>}{view === "attributes" && <><label className="check-row"><input type="checkbox" checked={form.filterable} onChange={(event) => field("filterable", event.target.checked)} /><span>Filtrelenebilir</span></label><label className="check-row"><input type="checkbox" checked={form.required} onChange={(event) => field("required", event.target.checked)} /><span>Zorunlu</span></label><label className="check-row"><input type="checkbox" checked={form.variantRelevant} onChange={(event) => field("variantRelevant", event.target.checked)} /><span>Varyantla ilgili</span></label></>}{view === "collections" && <label className="check-row"><input type="checkbox" checked={form.showOnHome} onChange={(event) => field("showOnHome", event.target.checked)} /><span>Ana sayfada göster</span></label>}</fieldset>
    <footer><button type="button" className="secondary-button" onClick={onClose} disabled={busy}>Vazgeç</button><button type="submit" className="primary-button" disabled={busy}>{busy ? "Kaydediliyor…" : item ? "Değişiklikleri kaydet" : `${label[0].toLocaleUpperCase("tr-TR")}${label.slice(1)} oluştur`}</button></footer>
  </form></OperationDialog>;
}

function CatalogStructure({ structure, error, refreshing, onRefresh, mutationActions }) {
  const [view, setView] = useState("categories");
  const [query, setQuery] = useState("");
  const [activity, setActivity] = useState("all");
  const [operation, setOperation] = useState(null);
  const [operationNotice, setOperationNotice] = useState(null);
  const writeEnabled = typeof mutationActions.saveCategory === "function";
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

  const completeOperation = (message) => {
    setOperation(null);
    setOperationNotice(message);
    onRefresh();
  };
  const operationCell = (item) => <td>{writeEnabled ? <span className="live-operation-buttons"><button type="button" className="secondary-button small" onClick={() => setOperation({ kind: "edit", item })}>Düzenle</button>{["categories", "attributes", "collections"].includes(view) && <button type="button" className="danger-button small" onClick={() => setOperation({ kind: "archive", item })}>{item.deletedAt || item.active === false ? "Geri yükle" : "Arşivle"}</button>}</span> : <span className="live-archived-lock"><Icon name="shield" />Salt okunur</span>}</td>;

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
        <table className="data-table live-structure-table"><caption className="sr-only">Kategori yapı kayıtları ve yönetim işlemleri</caption>
          <thead><tr><th scope="col">Kategori</th><th scope="col">Hiyerarşi</th><th scope="col">NovaStore ürünü</th><th scope="col">Şablon</th><th scope="col">Yayın yüzeyleri</th><th scope="col">Durum</th><th scope="col">İşlem</th></tr></thead>
          <tbody>{filtered.map((item) => <tr key={item.id}>
            <td><span className="live-customer-cell"><strong>{item.name}</strong><small>#{item.id} · {item.slug || "slug bekliyor"}</small></span></td>
            <td><span className="live-customer-cell"><strong>{item.path || "Yol bekliyor"}</strong><small>Derinlik {item.depth ?? "?"} · üst #{item.parentId || "kök"} · {item.childCount} alt kategori</small></span></td>
            <td>{item.firstPartyProductCount}</td><td>{item.attributeTemplateCount}</td>
            <td><span className="live-flag-list"><small>Vitrin {item.customerVisible ? "açık" : "kapalı"}</small><small>Menü {item.showInMenu ? "açık" : "kapalı"}</small><small>Ana sayfa {item.showOnHome ? "açık" : "kapalı"}</small></span></td>
            <td><span className={`status ${isCatalogStructureItemActive(item) ? "status-yayında" : "status-yayından-kaldırıldı"}`}>{item.deletedAt ? "Arşivli" : item.active ? "Etkin" : "Pasif"}</span></td>{operationCell(item)}
          </tr>)}</tbody>
        </table>
      </div>
    ) : empty;
  } else if (view === "attributes") {
    table = filtered.length ? (
      <div className="table-scroll table-scroll-hint" tabIndex="0" role="region" aria-label="Özellik tanımı özeti tablosu">
        <table className="data-table live-structure-table"><caption className="sr-only">Özellik tanımı kayıtları ve yönetim işlemleri</caption>
          <thead><tr><th scope="col">Özellik</th><th scope="col">Tür</th><th scope="col">Seçenek</th><th scope="col">Şablon</th><th scope="col">NovaStore değeri</th><th scope="col">Davranış</th><th scope="col">Durum</th><th scope="col">İşlem</th></tr></thead>
          <tbody>{filtered.map((item) => <tr key={item.id}>
            <td><span className="live-customer-cell"><strong>{item.name}</strong><small>#{item.id} · {item.code}</small></span></td>
            <td>{attributeTypeLabels[item.type]}{item.unit && <small>{item.unit}</small>}</td><td>{item.optionCount}</td><td>{item.templateCount}</td><td>{item.firstPartyValueCount}</td>
            <td><span className="live-flag-list"><small>{item.filterable ? "Filtrelenir" : "Filtrelenmez"}</small><small>{item.required ? "Zorunlu" : "İsteğe bağlı"}</small><small>{item.variantRelevant ? "Varyantla ilgili" : "Varyant dışı"}</small></span></td>
            <td><span className={`status ${item.active ? "status-yayında" : "status-yayından-kaldırıldı"}`}>{item.active ? "Etkin" : "Pasif"}</span></td>{operationCell(item)}
          </tr>)}</tbody>
        </table>
      </div>
    ) : empty;
  } else if (view === "templates") {
    table = filtered.length ? (
      <div className="table-scroll table-scroll-hint" tabIndex="0" role="region" aria-label="Özellik şablonu özeti tablosu">
        <table className="data-table live-structure-table"><caption className="sr-only">Özellik şablonu kayıtları ve yönetim işlemleri</caption>
          <thead><tr><th scope="col">Şablon</th><th scope="col">Kategori</th><th scope="col">Özellik</th><th scope="col">Zorunlu</th><th scope="col">Filtrelenebilir</th><th scope="col">Durum</th><th scope="col">İşlem</th></tr></thead>
          <tbody>{filtered.map((item) => <tr key={item.id}>
            <td><span className="live-customer-cell"><strong>{item.name}</strong><small>#{item.id}</small></span></td>
            <td><span className="live-customer-cell"><strong>{item.categoryName}</strong><small>#{item.categoryId} · {item.categoryPath || "Yol bekliyor"}</small></span></td>
            <td>{item.attributeCount}</td><td>{item.requiredCount}</td><td>{item.filterableCount}</td>
            <td><span className={`status ${item.active ? "status-yayında" : "status-yayından-kaldırıldı"}`}>{item.active ? "Etkin" : "Pasif"}</span></td>{operationCell(item)}
          </tr>)}</tbody>
        </table>
      </div>
    ) : empty;
  } else if (view === "collections") {
    table = filtered.length ? (
      <div className="table-scroll table-scroll-hint" tabIndex="0" role="region" aria-label="Koleksiyon özeti tablosu">
        <table className="data-table live-structure-table"><caption className="sr-only">Koleksiyon kayıtları ve yönetim işlemleri</caption>
          <thead><tr><th scope="col">Koleksiyon</th><th scope="col">Tür</th><th scope="col">Kural</th><th scope="col">Manuel NovaStore ürünü</th><th scope="col">Ana sayfa</th><th scope="col">Durum</th><th scope="col">İşlem</th></tr></thead>
          <tbody>{filtered.map((item) => <tr key={item.id}>
            <td><span className="live-customer-cell"><strong>{item.name}</strong><small>#{item.id} · {item.slug}</small></span></td>
            <td>{item.type === "manual" ? "Manuel" : "Dinamik"}</td><td>{item.ruleCode ? collectionRuleLabels[item.ruleCode] : `${item.ruleCount} kural`}</td><td>{item.type === "manual" ? item.firstPartyManualProductCount : "Kural tabanlı"}</td><td>{item.showOnHome ? "Gösteriliyor" : "Gizli"}</td>
            <td><span className={`status ${isCatalogStructureItemActive(item) ? "status-yayında" : "status-yayından-kaldırıldı"}`}>{item.deletedAt ? "Arşivli" : item.active ? "Etkin" : "Pasif"}</span></td>{operationCell(item)}
          </tr>)}</tbody>
        </table>
      </div>
    ) : empty;
  } else {
    table = filtered.length || filteredMenuItems.length ? (
      <div className="live-structure-menu-stack">
        <div className="table-scroll table-scroll-hint" tabIndex="0" role="region" aria-label="Menü özeti tablosu">
          <table className="data-table live-structure-table"><caption className="sr-only">Menü kayıtları ve yönetim işlemleri</caption>
            <thead><tr><th scope="col">Menü</th><th scope="col">Toplam öğe</th><th scope="col">Etkin öğe</th><th scope="col">Kök öğe</th><th scope="col">Durum</th><th scope="col">İşlem</th></tr></thead>
            <tbody>{filtered.map((item) => <tr key={item.id}><td><span className="live-customer-cell"><strong>{item.name}</strong><small>#{item.id} · {item.code}</small></span></td><td>{item.itemCount}</td><td>{item.activeItemCount}</td><td>{item.rootItemCount}</td><td><span className={`status ${item.active ? "status-yayında" : "status-yayından-kaldırıldı"}`}>{item.active ? "Etkin" : "Pasif"}</span></td>{operationCell(item)}</tr>)}</tbody>
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
        <div><span className="eyebrow">Entegre backend · ortak yapı · {writeEnabled ? "kontrollü yönetim" : "salt okunur"}</span><h2 tabIndex="-1">Katalog yapısı</h2><p>Kategori, özellik, şablon, koleksiyon ve menü kayıtları aynı bounded yönetim sözleşmesinden okunur.</p></div>
        <div className="heading-actions">{writeEnabled && <button className="primary-button" onClick={() => setOperation({ kind: "create", item: null })}><Icon name="plus" />Yeni {catalogStructureEntityLabels[view]}</button>}<button className="secondary-button" onClick={onRefresh} disabled={refreshing}><Icon name="refresh" />{refreshing ? "Yenileniyor" : "Yenile"}</button></div>
      </header>
      <ResourceWarning error={error} onRetry={onRefresh} />
      {operationNotice && <section className="notice-card live-operation-notice success-card" role="status"><Icon name="check" /><div><strong>Katalog kaydı güncellendi</strong><p>{operationNotice}</p></div></section>}
      <section className="notice-card live-boundary-notice" role="note"><Icon name="shield" /><div><strong>{writeEnabled ? "Platform kataloğu · yetkili ve geri alınabilir işlemler" : "Satıcı portalı veya ürün izin kuyruğu değildir"}</strong><p>{writeEnabled ? "Bu oturumda platform kategori, özellik, şablon, koleksiyon ve menü kayıtları yönetilebilir. Silme yerine arşivleme kullanılır; Seller ürün sahipliği ve teklif yönetimi bu ekrana taşınmaz." : "Bu ekran platform ve Seller ürünlerinin paylaştığı ortak katalog yapısını okur. Seller sahipliği, teklif, risk puanı, onay aksiyonu, medya URL'si veya yazma isteği taşımaz; menülerin iç URL değerleri de DTO'ya alınmaz."}</p></div></section>
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
      {operation && writeEnabled && <CatalogStructureRecordDialog view={view} operation={operation} structure={structure} actions={mutationActions} onClose={() => setOperation(null)} onComplete={completeOperation} />}
    </section>
  );
}

function ReturnDecisionDialog({ operation, action, onClose, onComplete, onConflict, onUnavailable }) {
  const [decisionNote, setDecisionNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const terminalDecision = operation.targetStatus === "APPROVED" || operation.targetStatus === "REJECTED";

  const submit = async (event) => {
    event.preventDefault();
    if (busy) return;
    setError(null);
    if (terminalDecision && !decisionNote.trim()) {
      setError("Onay veya red kararı için açıklama gereklidir.");
      return;
    }
    setBusy(true);
    try {
      const result = await action({
        returnId: operation.item.rawId,
        expectedRevision: operation.item.revision,
        status: operation.targetStatus,
        decisionNote: decisionNote.trim() || null,
      });
      await onComplete(result);
    } catch (requestError) {
      if (requestError?.status === 409) return onConflict(requestError);
      if (requestError?.status === 403 || requestError?.status === 503) return onUnavailable(requestError);
      setError(requestError);
      setBusy(false);
    }
  };

  return <OperationDialog title={`${operation.item.id} · ${returnStatusLabels[operation.targetStatus]}`} busy={busy} onClose={onClose} testId="return-operation-dialog" eyebrow="İade kararı · güncel revizyon">
    <dl className="detail-list live-operation-summary"><div><dt>İade</dt><dd>{operation.item.id}</dd></div><div><dt>Sipariş</dt><dd>{operation.item.orderId}</dd></div><div><dt>Mevcut durum</dt><dd>{returnStatusLabels[operation.item.status] || operation.item.status}</dd></div><div><dt>Beklenen revizyon</dt><dd>{operation.item.revision}</dd></div><div><dt>Talep tutarı</dt><dd>{operation.item.refundAmount === null ? "Belirtilmedi" : money(operation.item.refundAmount, operation.item.currency)}</dd></div></dl>
    <form className="modal-form live-operation-form" onSubmit={submit}>
      <label><span>Karar notu{terminalDecision ? " (zorunlu)" : " (isteğe bağlı)"}</span><input type="text" value={decisionNote} onChange={(event) => { setDecisionNote(event.target.value); setError(null); }} maxLength="1000" required={terminalDecision} disabled={busy} data-autofocus aria-describedby="return-decision-note-hint return-decision-note-count" placeholder="Kararın gerekçesini kişisel veya gizli veri eklemeden yazın." /></label>
      <small className="live-character-count" id="return-decision-note-count">{decisionNote.length} / 1000</small>
      <p className="form-hint" id="return-decision-note-hint">Bu işlem yalnız NovaStore durumunu ve denetim kaydını günceller. Ödeme sağlayıcısında geri ödeme veya para hareketi çalıştırmaz.</p>
      <OperationError error={error} id="return-operation-error" />
      <footer><button type="button" className="secondary-button" onClick={onClose} disabled={busy}>Vazgeç</button><button type="submit" className={operation.targetStatus === "REJECTED" ? "danger-button" : "primary-button"} disabled={busy}>{busy ? "Kaydediliyor…" : `${returnStatusLabels[operation.targetStatus]} olarak kaydet`}</button></footer>
    </form>
  </OperationDialog>;
}

function ReturnDetailDialog({ state, feedback, writeEnabled, onClose, onRetry, onDecision }) {
  const detail = state.data;
  const transitions = detail ? adminReturnTransitions[detail.status] || [] : [];
  const refundLabel = detail ? refundStatusLabels[detail.refundStatus] || detail.refundStatus : "";
  const approvedAwaitingRefund = detail?.status === "APPROVED" && detail.refundStatus !== "COMPLETED";

  return <OperationDialog title={detail ? `${detail.id} · İade detayı` : "İade detayı yükleniyor"} busy={false} onClose={onClose} testId="return-detail-dialog" wide eyebrow="Güncel kayıt">
    <div className="return-detail-body" aria-live="polite">
      {state.phase === "loading" && !detail && <div className="return-detail-loading" role="status"><span className="live-loader" aria-hidden="true" /><p>İade kaydının güncel ayrıntıları okunuyor.</p></div>}
      {state.error && <section className="notice-card warning-card live-resource-warning" role="alert"><Icon name="warning" /><div><strong>İade detayı güncellenemedi</strong><p>{state.error.message}</p></div><button type="button" className="secondary-button small" onClick={onRetry}>Yeniden dene</button></section>}
      {feedback && <section className={`notice-card live-operation-notice ${feedback.type === "success" ? "success-card" : "warning-card"}`} role={feedback.type === "success" ? "status" : "alert"}><Icon name={feedback.type === "success" ? "check" : "warning"} /><div><strong>{feedback.title}</strong><p>{feedback.message}</p></div></section>}
      {detail && <>
        <section className="return-truth-grid" aria-label="İade ve ödeme durumları">
          <div><span>İade talebi</span><strong>{returnStatusLabels[detail.status] || detail.status}</strong><small>Talebin güncel durumu</small></div>
          <div><span>Geri ödeme</span><strong>{refundLabel}</strong><small>Siparişin güncel geri ödeme durumu</small></div>
          <div><span>Ödeme</span><strong>{detail.paymentStatus}</strong><small>Ödeme kaydı değişmeden gösterilir</small></div>
        </section>
        <p className="form-hint">Geri ödeme ve ödeme bilgileri siparişin güncel durumudur; geçmiş iade kararını değiştirmez.</p>
        {approvedAwaitingRefund && <section className="notice-card warning-card return-refund-truth" role="note"><Icon name="warning" /><div><strong>Onay para iadesinin tamamlandığı anlamına gelmez</strong><p>İade talebi onaylandı; geri ödeme durumu “{refundLabel}”. Sağlayıcı işlemi veya para hareketi bu ekranda çalıştırılmaz.</p></div></section>}
        <section className="return-note-card" aria-labelledby="return-customer-note-title">
          <span className="eyebrow">Müşteri beyanı</span>
          <h3 id="return-customer-note-title">Müşteri notu</h3>
          <p>{detail.note || "Müşteri not bırakmadı."}</p>
        </section>
        <dl className="detail-list return-authoritative-fields">
          <div><dt>İade ID</dt><dd>{detail.id}</dd></div>
          <div><dt>Sipariş ID</dt><dd>{detail.orderId}</dd></div>
          <div><dt>reason_code</dt><dd>{detail.reasonCode}</dd></div>
          <div><dt>Durum</dt><dd>{returnStatusLabels[detail.status] || detail.status}</dd></div>
          <div><dt>Revizyon</dt><dd>{detail.revision}</dd></div>
          <div><dt>Karar notu</dt><dd>{detail.decisionNote || "Henüz karar notu yok"}</dd></div>
          <div><dt>Karar zamanı</dt><dd>{dateTime(detail.decidedAt)}</dd></div>
          <div><dt>Oluşturulma</dt><dd>{dateTime(detail.createdAt)}</dd></div>
          <div><dt>Güncellenme</dt><dd>{dateTime(detail.updatedAt)}</dd></div>
          <div><dt>İade tutarı</dt><dd>{detail.refundAmount === null ? "Belirtilmedi" : money(detail.refundAmount, detail.currency)}</dd></div>
          <div><dt>Sipariş durumu</dt><dd>{detail.orderStatus}</dd></div>
          <div><dt>Ödeme durumu</dt><dd>{detail.paymentStatus}</dd></div>
          <div><dt>Geri ödeme durumu</dt><dd>{refundLabel}</dd></div>
        </dl>
        <footer className="return-detail-actions">
          <p>{writeEnabled ? (transitions.length > 0 ? "Yalnız desteklenen durum değişiklikleri kullanılabilir." : "Bu kayıt için desteklenen başka bir durum değişikliği yok.") : "Bu oturumda iade kararları salt okunur; değişiklik isteği gönderilemez."}</p>
          {writeEnabled && transitions.map((targetStatus) => <button type="button" key={targetStatus} className={targetStatus === "REJECTED" ? "danger-button" : "primary-button"} onClick={() => onDecision(detail, targetStatus)} disabled={state.phase !== "ready"}>{targetStatus === "IN_REVIEW" ? "İncelemeye al" : targetStatus === "APPROVED" ? "Onayla" : "Reddet"}</button>)}
        </footer>
      </>}
    </div>
  </OperationDialog>;
}

function Returns({ returnPage, error, refreshing, onRefresh, onReloadCapabilities, mutationActions, notificationTarget = null }) {
  const [pageState, setPageState] = useState(returnPage);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("Tümü");
  const [operation, setOperation] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [actionNotice, setActionNotice] = useState(null);
  const [writesSuppressed, setWritesSuppressed] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [paginationError, setPaginationError] = useState(null);
  const [detailState, setDetailState] = useState(null);
  const [detailFeedback, setDetailFeedback] = useState(null);
  const detailRequestRef = useRef(0);
  const returns = pageState.items;
  const updateAction = writesSuppressed ? null : mutationActions.updateReturnStatus;
  const writeEnabled = typeof updateAction === "function";
  const statuses = useMemo(() => ["Tümü", ...new Set(returns.map((item) => item.status))], [returns]);
  useEffect(() => {
    setPageState(returnPage);
    setPaginationError(null);
  }, [returnPage]);
  useEffect(() => {
    if (!notificationTarget?.entityId) return;
    setQuery(String(notificationTarget.entityId));
    setStatus("Tümü");
  }, [notificationTarget?.entityId]);
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("tr-TR");
    return returns.filter((item) => {
      const matchesStatus = status === "Tümü" || item.status === status;
      const haystack = `${item.id} ${item.rawId || ""} ${item.orderId} ${item.customerName} ${item.reasonCode}`.toLocaleLowerCase("tr-TR");
      return matchesStatus && (!normalized || haystack.includes(normalized));
    });
  }, [query, returns, status]);

  const fetchDetail = async (rawId, { preserveData = false } = {}) => {
    const requestId = detailRequestRef.current + 1;
    detailRequestRef.current = requestId;
    setDetailState((current) => ({
      rawId,
      phase: "loading",
      data: preserveData && current?.rawId === rawId ? current.data : null,
      error: null,
    }));
    try {
      const data = await mutationActions.getReturn({ returnId: rawId });
      if (detailRequestRef.current !== requestId) return false;
      setDetailState({ rawId, phase: "ready", data, error: null });
      return true;
    } catch (requestError) {
      if (detailRequestRef.current !== requestId) return false;
      setDetailState((current) => ({ rawId, phase: "error", data: preserveData ? current?.data || null : null, error: requestError }));
      return false;
    }
  };

  const openDetail = (rawId) => {
    setActionError(null);
    setDetailFeedback(null);
    fetchDetail(rawId);
  };

  const closeDetail = () => {
    detailRequestRef.current += 1;
    setDetailState(null);
    setDetailFeedback(null);
    setOperation(null);
  };

  const handleConflict = async (requestError) => {
    setOperation(null);
    setActionNotice(null);
    setDetailFeedback({
      type: "error",
      title: "Revizyon çakışması",
      message: "Güncel kayıt okunuyor…",
    });
    const refreshed = detailState?.rawId
      ? await fetchDetail(detailState.rawId, { preserveData: true })
      : false;
    setDetailFeedback({
      type: "error",
      title: "Revizyon çakışması",
      message: refreshed
        ? `Karar uygulanmadı. Sunucudaki güncel kayıt gösteriliyor; önce yeni durumu inceleyin.${requestError?.requestId ? ` İstek kimliği: ${requestError.requestId}` : ""}`
        : `Karar uygulanmadı ve güncel kayıt okunamadı. Yeniden denemeden yeni karar verilemez.${requestError?.requestId ? ` İstek kimliği: ${requestError.requestId}` : ""}`,
    });
    onRefresh();
  };
  const handleUnavailable = async (requestError) => {
    setOperation(null);
    setActionNotice(null);
    setWritesSuppressed(true);
    setDetailFeedback({
      type: "error",
      title: "İade kararları durduruldu",
      message: `Yazma yetkisi kapandı veya yönetici yetkisi değişti. Bu görünüm artık salt okunur.${requestError?.requestId ? ` İstek kimliği: ${requestError.requestId}` : ""}`,
    });
    onReloadCapabilities();
    if (detailState?.rawId) await fetchDetail(detailState.rawId, { preserveData: true });
    onRefresh();
  };
  const handleComplete = async () => {
    setOperation(null);
    setActionError(null);
    const refreshed = detailState?.rawId
      ? await fetchDetail(detailState.rawId, { preserveData: true })
      : false;
    setDetailFeedback(refreshed ? {
      type: "success",
      title: "İade durumu güncellendi",
      message: "Güncel detay yeniden okundu. Ödeme sağlayıcısında geri ödeme veya para hareketi çalıştırılmadı.",
    } : null);
    setActionNotice(refreshed ? "İade kararı kaydedildi ve güncel detay yeniden okundu." : null);
    onRefresh();
  };

  const loadMore = async () => {
    if (loadingMore || !pageState.hasMore || !pageState.nextCursor) return;
    setLoadingMore(true);
    setPaginationError(null);
    try {
      const next = await mutationActions.loadReturnPage({ cursor: pageState.nextCursor });
      setPageState((current) => {
        const known = new Set(current.items.map((item) => item.rawId));
        const appended = next.items.filter((item) => !known.has(item.rawId));
        return Object.freeze({ ...next, items: Object.freeze([...current.items, ...appended]) });
      });
    } catch (requestError) {
      setPaginationError(requestError);
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <section className="workspace live-workspace" data-testid="live-returns">
      <header className="workspace-heading operations-heading">
        <div>
          <span className="eyebrow">Entegre yönetim · {writeEnabled ? "yazma yetkisi açık" : "salt okunur"}</span>
          <h2 tabIndex="-1">İade özetleri</h2>
          <p>Kayıtlar sınırlı sayfalar halinde okunur. Karar yalnız güncel detayın revizyonuyla verilir; gerçek geri ödeme isteği gönderilmez.</p>
        </div>
        <button className="secondary-button" onClick={onRefresh} disabled={refreshing}><Icon name="refresh" />{refreshing ? "Yenileniyor" : "Yenile"}</button>
      </header>

      <ResourceWarning error={error || actionError} onRetry={onRefresh} />
      {paginationError && <ResourceWarning error={paginationError} onRetry={loadMore} />}
      {actionNotice && <section className="notice-card success-card live-operation-notice" role="status"><Icon name="check" /><div><strong>İade işlemi kaydedildi</strong><p>{actionNotice}</p></div></section>}
      <section className="notice-card live-boundary-notice" role="note">
        <Icon name="shield" />
        <div><strong>Platform yönetimi karar otoritesi · finansal işlem kapalı</strong><p>Platform yönetimi tüm iade taleplerinde karar otoritesidir; ekran sahiplik seçimi almaz. Hiçbir iade durumu ödeme sağlayıcısındaki geri ödemenin veya para hareketinin tamamlandığını tek başına kanıtlamaz.</p></div>
      </section>
      <section className="table-card">
        <div className="ledger-toolbar filter-toolbar live-filter-toolbar">
          <label className="table-search"><Icon name="search" /><span className="sr-only">İade ara</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="İade, sipariş, müşteri veya neden ara" /></label>
          <label className="heading-select"><span className="sr-only">İade durumuna göre filtrele</span><select value={status} onChange={(event) => setStatus(event.target.value)}>{statuses.map((value) => <option key={value} value={value}>{value === "Tümü" ? value : returnStatusLabels[value] || value}</option>)}</select></label>
          <span className="live-result-count">{filtered.length} / {returns.length} yüklenen kayıt{pageState.hasMore ? " · devamı sunucuda" : " · son sayfa"}</span>
        </div>
        {returns.length === 0 ? <div className="state-panel"><Icon name="refresh" /><h3>Henüz iade kaydı yok</h3><p>Backend boş bir iade özeti döndürdü.</p></div> : filtered.length > 0 ? (
          <div className="table-scroll table-scroll-hint" tabIndex="0" role="region" aria-label="İade özeti tablosu">
            <table className="data-table live-returns-table">
              <caption className="sr-only">Yönetim sisteminden okunan iade özetleri ve yetki kontrollü işlemler</caption>
              <thead><tr><th scope="col">İade</th><th scope="col">Sipariş</th><th scope="col">Müşteri</th><th scope="col">İade durumu</th><th scope="col">Geri ödeme</th><th scope="col">Neden</th><th scope="col">Talep tutarı</th><th scope="col">Sipariş durumu</th><th scope="col">Tarih</th><th scope="col">Detay</th></tr></thead>
              <tbody>{filtered.map((item) => <tr key={item.id}>
                <td><strong>{item.id}</strong></td><td>{item.orderId}</td><td>{item.customerName}</td>
                <td><span className={`status status-${statusClass(returnStatusLabels[item.status] || item.status)}`}>{returnStatusLabels[item.status] || item.status}</span></td>
                <td><span className="live-customer-cell"><strong>{refundStatusLabels[item.refundStatus] || item.refundStatus}</strong><small>Ödeme: {item.paymentStatus}</small></span></td>
                <td>{item.reasonCode}</td><td><span className="live-customer-cell"><strong>{item.refundAmount === null ? "Belirtilmedi" : money(item.refundAmount, item.currency)}</strong><small>{item.currency} · sağlayıcı/para hareketi doğrulanmadı</small></span></td>
                <td><span className={`status status-${statusClass(item.orderStatus)}`}>{item.orderStatus}</span></td><td>{dateTime(item.createdAt)}</td><td><button type="button" className="secondary-button small" onClick={() => openDetail(item.rawId)} aria-label={`${item.id} iade detayını aç`}>Detayı aç</button></td>
              </tr>)}</tbody>
            </table>
          </div>
        ) : <div className="state-panel"><Icon name="refresh" /><h3>Eşleşen iade yok</h3><p>Arama veya durum filtresini değiştirin.</p><button className="secondary-button" onClick={() => { setQuery(""); setStatus("Tümü"); }}>Filtreleri temizle</button></div>}
        {pageState.hasMore && <footer className="return-pagination"><button type="button" className="secondary-button" onClick={loadMore} disabled={loadingMore}>{loadingMore ? "Sonraki sayfa yükleniyor…" : "Daha fazla iade yükle"}</button><small>Her istek en fazla {pageState.limit} kayıt okur.</small></footer>}
      </section>
      {detailState && !operation && <ReturnDetailDialog state={detailState} feedback={detailFeedback} writeEnabled={writeEnabled} onClose={closeDetail} onRetry={() => fetchDetail(detailState.rawId, { preserveData: true })} onDecision={(item, targetStatus) => { setDetailFeedback(null); setOperation({ item, targetStatus }); }} />}
      {operation && writeEnabled && <ReturnDecisionDialog operation={operation} action={updateAction} onClose={() => setOperation(null)} onComplete={handleComplete} onConflict={handleConflict} onUnavailable={handleUnavailable} />}
    </section>
  );
}

const pushStateCopy = Object.freeze({
  [WEB_PUSH_STATE.NOT_SUPPORTED]: ["Desteklenmiyor", "Bu tarayıcı Web Push özelliğini desteklemiyor."],
  [WEB_PUSH_STATE.NOT_REQUESTED]: ["İzin bekleniyor", "Bildirim izni yalnız aşağıdaki düğmeye bastığınızda istenir."],
  [WEB_PUSH_STATE.ENABLED]: ["Açık", "Bu tarayıcı güvenli Web Push teslimatına bağlı."],
  [WEB_PUSH_STATE.DENIED]: ["Engellendi", "Tarayıcı bildirim izni engellenmiş. Site izinlerinden değiştirebilirsiniz."],
  [WEB_PUSH_STATE.ERROR]: ["Hazır değil", "Web Push durumu doğrulanamadı veya sunucu yapılandırması bekleniyor."],
  [WEB_PUSH_STATE.UNSUBSCRIBED]: ["Kapalı", "Bu tarayıcıda Web Push kapalı."],
});

function WebPushSettings({ api }) {
  const controller = useMemo(() => createWebPushController({ api }), [api]);
  const [status, setStatus] = useState({ state: WEB_PUSH_STATE.NOT_REQUESTED });
  const [busy, setBusy] = useState(true);
  const refresh = useCallback(async () => {
    setBusy(true);
    setStatus(await controller.getState());
    setBusy(false);
  }, [controller]);
  useEffect(() => { refresh(); }, [refresh]);
  const mutate = async (action) => {
    setBusy(true);
    setStatus(await action());
    setBusy(false);
  };
  const copy = pushStateCopy[status.state] || pushStateCopy[WEB_PUSH_STATE.ERROR];
  const enabled = status.state === WEB_PUSH_STATE.ENABLED;
  const unavailable = [WEB_PUSH_STATE.NOT_SUPPORTED, WEB_PUSH_STATE.DENIED].includes(status.state);
  return (
    <section className="live-push-settings" aria-labelledby="admin-web-push-title">
      <Icon name="bell" />
      <div>
        <span className="eyebrow">Masaüstü ve telefon tarayıcısı</span>
        <h3 id="admin-web-push-title">Web Push bildirimleri</h3>
        <p>{busy ? "Bildirim durumu doğrulanıyor…" : copy[1]}</p>
        {status.activeDeviceCount > 0 && <small>{status.activeDeviceCount} etkin tarayıcı/cihaz</small>}
      </div>
      <div className="live-push-actions">
        <span className={`status ${enabled ? "status-tamamlandı" : "status-inceleniyor"}`} role="status">{busy ? "Kontrol ediliyor" : copy[0]}</span>
        {enabled
          ? <button className="secondary-button" type="button" onClick={() => mutate(controller.disable)} disabled={busy}>Bu cihazda kapat</button>
          : <button className="primary-button" type="button" onClick={() => mutate(controller.enable)} disabled={busy || unavailable}>Bildirimleri Aç</button>}
        {status.state === WEB_PUSH_STATE.ERROR && <button className="secondary-button small" type="button" onClick={refresh} disabled={busy}>Tekrar dene</button>}
      </div>
    </section>
  );
}

function Notifications({ notificationPage, error, refreshing, onRefresh, onOpenTarget, onMarkOne, onMarkAll, webPushApi }) {
  const notifications = notificationPage.items;
  const [query, setQuery] = useState("");
  const [readFilter, setReadFilter] = useState("Tümü");
  const [actionError, setActionError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("tr-TR");
    return notifications.filter((item) => {
      const matchesRead = readFilter === "Tümü" || (readFilter === "Okunmadı" ? !item.isRead : item.isRead);
      const haystack = `${item.id} ${item.type} ${item.message}`.toLocaleLowerCase("tr-TR");
      return matchesRead && (!normalized || haystack.includes(normalized));
    });
  }, [notifications, query, readFilter]);

  const perform = async (id, action) => {
    setBusyId(id);
    setActionError("");
    try { await action(); }
    catch (requestError) { setActionError(requestError?.message || "Bildirim durumu güncellenemedi."); }
    finally { setBusyId(null); }
  };

  const openTarget = async (item) => {
    if (!item.targetPage) return;
    if (!item.isRead) await perform(item.rawId, () => onMarkOne(item.rawId));
    onOpenTarget(item);
  };

  return (
    <section className="workspace live-workspace" data-testid="live-notifications">
      <header className="workspace-heading operations-heading">
        <div><span className="eyebrow">Birleşik bildirim çekirdeği</span><h2 tabIndex="-1">Admin bildirimleri</h2><p>Son {notificationPage.limit} güvenli bildirimi, okunma durumunu ve ilgili kaydı tek yerde yönetin.</p></div>
        <div className="live-heading-actions">{notifications.some((item) => !item.isRead) && <button className="secondary-button" type="button" onClick={() => perform("all", onMarkAll)} disabled={busyId !== null}>Tümünü okundu yap</button>}<button className="secondary-button" onClick={onRefresh} disabled={refreshing}><Icon name="refresh" />{refreshing ? "Yenileniyor" : "Yenile"}</button></div>
      </header>
      <ResourceWarning error={error} onRetry={onRefresh} />
      {actionError && <div className="live-resource-warning notice-card warning-card" role="alert"><Icon name="warning" /><div><strong>Bildirim işlemi tamamlanamadı</strong><p>{actionError}</p></div></div>}
      <WebPushSettings api={webPushApi} />
      <section className="table-card">
        <div className="ledger-toolbar filter-toolbar live-filter-toolbar">
          <label className="table-search"><Icon name="search" /><span className="sr-only">Bildirim ara</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Bildirim türü veya içerik ara" /></label>
          <label className="heading-select"><span className="sr-only">Okunma durumuna göre filtrele</span><select value={readFilter} onChange={(event) => setReadFilter(event.target.value)}><option>Tümü</option><option>Okunmadı</option><option>Okundu</option></select></label>
          <span className="live-result-count">{filtered.length} / {notifications.length} kayıt{notificationPage.hasMore ? " · daha eski kayıtlar bu turda gösterilmiyor" : ""}</span>
        </div>
        {notifications.length === 0 ? <div className="state-panel"><Icon name="bell" /><h3>Henüz admin bildirimi yok</h3><p>Yeni operasyon bildirimleri burada görünecek.</p></div> : filtered.length > 0 ? <div className="live-notification-list">{filtered.map((item) => <article className={`live-notification-card ${item.isRead ? "is-read" : "is-unread"}`} key={item.id} aria-label={`${item.title}, ${item.isRead ? "okundu" : "okunmadı"}`}>
          <Icon name="bell" /><div><header><strong>{item.title}</strong><span>{item.isRead ? "Okundu" : "Okunmadı"}</span></header><p>{item.message}</p><small>{item.category} · {item.priority} · {item.id} · {dateTime(item.createdAt)}</small><div className="live-notification-actions">{!item.isRead && <button className="secondary-button small" type="button" onClick={() => perform(item.rawId, () => onMarkOne(item.rawId))} disabled={busyId !== null}>{busyId === item.rawId ? "İşleniyor" : "Okundu işaretle"}</button>}{item.targetPage && <button className="secondary-button small" type="button" onClick={() => openTarget(item)} disabled={busyId !== null}>İlgili kaydı aç</button>}</div></div>
        </article>)}</div> : <div className="state-panel"><Icon name="bell" /><h3>Eşleşen bildirim yok</h3><p>Arama veya okunma filtresini değiştirin.</p><button className="secondary-button" onClick={() => { setQuery(""); setReadFilter("Tümü"); }}>Filtreleri temizle</button></div>}
      </section>
    </section>
  );
}

function StoreDetailDialog({ resource, storeName, onClose }) {
  return (
    <OperationDialog
      title={storeName}
      eyebrow="Yetkili mağaza detayı"
      testId="seller-application-detail"
      onClose={onClose}
    >
      {resource.phase === "ready" ? (
        <div className="store-detail-content">
          <section className="detail-hero">
            <Icon name="storefront" />
            <div><small>Mağaza</small><strong>{resource.data.storeName}</strong></div>
            <span className={`status ${resource.data.operationalStatus === "active" ? "active" : "inactive"}`}>
              {resource.data.operationalStatus === "active" ? "Aktif" : "Pasif"}
            </span>
          </section>
          <dl className="store-private-detail-list">
            <div><dt>Seller organizasyonu</dt><dd>{resource.data.sellerOrganizationName || "Organizasyon bağı yok"}{resource.data.sellerOrganizationId ? ` · #${resource.data.sellerOrganizationId}` : ""}</dd></div>
            <div><dt>Organizasyon durumu</dt><dd>{resource.data.sellerOrganizationStatus || "Durum doğrulanamadı"}</dd></div>
            <div><dt>Seller Store kaydı</dt><dd>{resource.data.sellerStoreId ? `#${resource.data.sellerStoreId} · ${resource.data.sellerStoreStatus}` : "Seller Store bağı yok"}</dd></div>
            <div><dt>Sahiplik bağı</dt><dd><span className={`status ${resource.data.ownershipVerified === true ? "active" : "inactive"}`}>{resource.data.ownershipVerified === true ? "Doğrulandı" : "Doğrulanamadı"}</span></dd></div>
            <div><dt>Mağaza sahibi</dt><dd data-testid="store-owner-detail">{resource.data.ownerName || "Kayıtlı kişi adı yok"}</dd></div>
            <div><dt>Katalog kategorileri</dt><dd data-testid="store-category-detail">{resource.data.catalogCategories.length > 0 ? resource.data.catalogCategories.map((item) => item.name).join(", ") : "Henüz kategori ilişkisi yok"}</dd></div>
            <div><dt>Toplam ürün</dt><dd>{resource.data.productCount}</dd></div>
            <div><dt>Müşteriye görünür ürün</dt><dd>{resource.data.customerVisibleProductCount}</dd></div>
          </dl>
          {resource.data.ownershipVerified !== true && <section className="notice-card warning-card live-store-ownership-warning" role="alert"><Icon name="warning" /><div><strong>Seller sahiplik bağı doğrulanamadı</strong><p>Organizasyon ve Seller Store kimliği authoritative bağla eşleşmeden bu kayıt üzerinde operasyon yapılmamalıdır.</p></div></section>}
          <p className="form-hint">Kişi ve kategori bilgileri özet yanıtında taşınmaz; yalnız bu açık detay isteğiyle yüklenir.</p>
        </div>
      ) : <StatePanel phase={resource.phase} error={resource.error} onRetry={resource.reload} />}
    </OperationDialog>
  );
}

function SellerApplications({ storePage, detailResource, selectedStoreId, onSelect, onCloseDetail, error, refreshing, onRefresh }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const stores = storePage?.items || [];
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("tr-TR");
    return stores.filter((store) => {
      const haystack = `${store.storeName} ${store.id} ${store.sellerStoreId || ""} ${store.sellerOrganizationId || ""} ${store.sellerOrganizationName || ""}`.toLocaleLowerCase("tr-TR");
      return (!needle || haystack.includes(needle))
        && (status === "all" || store.operationalStatus === status);
    });
  }, [query, status, stores]);
  const selectedStore = stores.find((store) => store.id === selectedStoreId) || null;

  return (
    <section className="workspace live-store-records" data-testid="seller-application-summary">
      <div className="workspace-heading">
        <div><span className="eyebrow">Admin · authoritative Seller Store bağı</span><h2>Satıcı mağaza kayıtları</h2><p>Özet operasyonel mağazayı Seller organizasyonu ve Seller Store kimliğiyle eşler. Kişi ve kategori bilgileri açık detay isteğine ayrılmıştır.</p></div>
        <button className="secondary-button" onClick={onRefresh} disabled={refreshing}><Icon name="refresh" />{refreshing ? "Yenileniyor" : "Yenile"}</button>
      </div>
      <ResourceWarning error={error} onRetry={onRefresh} />
      <section className="table-card">
        <div className="ledger-toolbar filter-toolbar live-filter-toolbar">
          <label className="table-search"><Icon name="search" /><span className="sr-only">Mağaza veya Seller organizasyonu ara</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Mağaza veya organizasyon ara" /></label>
          <label className="heading-select"><span className="sr-only">Operasyon durumuna göre filtrele</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">Tüm durumlar</option><option value="active">Aktif</option><option value="inactive">Pasif</option></select></label>
          <span className="live-result-count">{filtered.length} / {stores.length} mağaza</span>
        </div>
        {stores.length === 0 ? <div className="state-panel"><Icon name="storefront" /><h3>Mağaza kaydı yok</h3><p>Backend bu platform yöneticisi için boş bir mağaza özeti döndürdü.</p></div> : filtered.length === 0 ? <div className="state-panel"><Icon name="search" /><h3>Eşleşen mağaza yok</h3><p>Arama veya durum filtresini değiştirin.</p></div> : (
          <div className="table-scroll table-scroll-hint" tabIndex="0" role="region" aria-label="Satıcı mağaza özeti tablosu">
            <table className="data-table store-summary-table">
              <thead><tr><th>Mağaza</th><th>Seller organizasyonu</th><th>Seller Store</th><th>Sahiplik bağı</th><th>Operasyon durumu</th><th>Ürün</th><th>Görünür ürün</th><th>Güncellendi</th><th><span className="sr-only">Detay</span></th></tr></thead>
              <tbody>{filtered.map((store) => <tr key={store.id}>
                <td><strong>{store.storeName}</strong><small>Mağaza #{store.id}</small></td>
                <td><span className="live-customer-cell"><strong>{store.sellerOrganizationName || "Organizasyon bağı yok"}</strong><small>{store.sellerOrganizationId ? `#${store.sellerOrganizationId} · ${store.sellerOrganizationStatus}` : "Kimlik doğrulanamadı"}</small></span></td>
                <td><span className="live-customer-cell"><strong>{store.sellerStoreId ? `#${store.sellerStoreId}` : "Bağ yok"}</strong><small>{store.sellerStoreStatus || "Durum doğrulanamadı"}</small></span></td>
                <td><span className={`status ${store.ownershipVerified === true ? "active" : "inactive"}`}>{store.ownershipVerified === true ? "Doğrulandı" : "Doğrulanamadı"}</span></td>
                <td><span className={`status ${store.operationalStatus === "active" ? "active" : "inactive"}`}>{store.operationalStatus === "active" ? "Aktif" : "Pasif"}</span></td>
                <td>{store.productCount}</td>
                <td>{store.customerVisibleProductCount}</td>
                <td>{dateOnly(store.updatedAt || store.createdAt)}</td>
                <td><button type="button" className="secondary-button store-detail-trigger" onClick={() => onSelect(store.id)} aria-label={`${store.storeName} yetkili detayını aç`}>Detayı aç <Icon name="right" /></button></td>
              </tr>)}</tbody>
            </table>
          </div>
        )}
      </section>
      <section className="notice-card workspace-notice" role="note"><Icon name="shield" /><div><strong>Özet mahremiyet korumalı ve sahiplik doğrulamalıdır</strong><p>Seller organizasyonu ile Seller Store kimliği operasyonel bağ için görünürdür; kişi adı ve katalog kategorileri özet API yanıtına, liste durumuna veya gizli DOM’a alınmaz. Finansal metrik üretilmez.</p></div></section>
      {selectedStore && <StoreDetailDialog resource={detailResource} storeName={selectedStore.storeName} onClose={onCloseDetail} />}
    </section>
  );
}

function ReviewModerationDialog({ review, action, onClose, onComplete }) {
  const [status, setStatus] = useState(review.status === "PUBLISHED" ? "HIDDEN" : "PUBLISHED");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const submit = async (event) => {
    event.preventDefault(); setBusy(true); setError(null);
    try {
      await action({ reviewId: review.id, expectedRevision: review.revision, status, moderationNote: note.trim() || null });
      onComplete();
    } catch (requestError) { setError(requestError); } finally { setBusy(false); }
  };
  return <OperationDialog title={`Yorum #${review.id} moderasyonu`} busy={busy} onClose={onClose} testId="review-moderation-dialog"><form className="connected-form" onSubmit={submit}>{error && <OperationError error={error} id="review-moderation-error" />}<label className="field"><span>Karar</span><select value={status} onChange={(event) => setStatus(event.target.value)}>{review.status === "PENDING" && <option value="PUBLISHED">Yayınla</option>}<option value="HIDDEN">Gizle</option></select></label><label className="field field-wide"><span>Moderasyon notu</span><textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength="1000" rows="4" /></label><button className="primary-button" disabled={busy}>Kararı kaydet</button></form></OperationDialog>;
}

function ReviewsWorkspace({ page, error, refreshing, onRefresh, action }) {
  const [operation, setOperation] = useState(null);
  return <section className="workspace live-workspace" data-testid="live-reviews"><header className="workspace-heading operations-heading"><div><span className="eyebrow">Doğrulanmış müşteri değerlendirmeleri</span><h2 tabIndex="-1">Yorum moderasyonu</h2><p>Bekleyen yorumlar yayın kararı alır; yayınlanmış yorumlar gerektiğinde gizlenebilir.</p></div><button className="secondary-button" onClick={onRefresh} disabled={refreshing}><Icon name="refresh" />Yenile</button></header><ResourceWarning error={error} onRetry={onRefresh} /><section className="notice-card live-boundary-notice" role="note"><Icon name="shield" /><div><strong>Sunucu tarafı yayın kapısı</strong><p>Müşteri kimliği yalnız yönetici ekranında görünür; storefront yalnız yayınlanmış yorumları ve maskelenmiş adı alır.</p></div></section><div className="table-card"><div className="table-scroll" tabIndex="0" role="region" aria-label="Yorum moderasyon kuyruğu"><table className="data-table"><thead><tr><th>Ürün</th><th>Müşteri</th><th>Puan</th><th>Yorum</th><th>Durum</th><th>İşlem</th></tr></thead><tbody>{page.items.map((item) => <tr key={item.id}><td><strong>{item.productName}</strong><small> #{item.productId}</small></td><td>{item.userName}</td><td>{item.rating}/5</td><td>{item.comment || "Yorum metni yok"}</td><td><span className={`status status-${statusClass(item.status)}`}>{item.status}</span></td><td>{action && (item.status === "PENDING" || item.status === "PUBLISHED") ? <button className="primary-button small" onClick={() => setOperation(item)}>{item.status === "PUBLISHED" ? "Gizle" : "İncele"}</button> : <span>Revision {item.revision}</span>}</td></tr>)}{page.items.length === 0 && <tr><td colSpan="6">Bekleyen veya yayınlanmış yorum yok.</td></tr>}</tbody></table></div></div>{operation && action && <ReviewModerationDialog review={operation} action={action} onClose={() => setOperation(null)} onComplete={() => { setOperation(null); onRefresh(); }} />}</section>;
}

function QuestionAnswerDialog({ question, action, onClose, onComplete }) {
  const [answer, setAnswer] = useState(question.answer || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const submit = async (event) => { event.preventDefault(); setBusy(true); setError(null); try { await action({ questionId: question.id, expectedRevision: question.revision, answer }); onComplete(); } catch (requestError) { setError(requestError); } finally { setBusy(false); } };
  return <OperationDialog title="Ürün sorusunu yanıtla" eyebrow={`${question.storeName} · Soru #${question.id}`} busy={busy} onClose={onClose} testId="question-answer-dialog" wide><form className="modal-form live-operation-form question-answer-form" onSubmit={submit} aria-describedby="question-publication-note"><OperationError error={error} id="question-answer-error" /><section className="question-context-card"><div className="question-context-icon"><Icon name="help" /></div><div className="question-context-copy"><span className="question-context-kicker">{question.storeName} · {question.userName}</span><h3>{question.productName}</h3><blockquote>{question.question}</blockquote><small>{dateTime(question.createdAt)} · Mağaza #{question.storeId}</small></div></section><label className="field field-wide"><span>Herkese açık mağaza yanıtı</span><textarea data-autofocus value={answer} onChange={(event) => setAnswer(event.target.value)} minLength="1" maxLength="2000" required rows="6" placeholder="Müşterinin sorusunu açık, doğru ve yardımcı bir dille yanıtlayın." aria-describedby="question-answer-count question-publication-note" /></label><div className="question-composer-meta"><span id="question-publication-note">Yanıt ürün sayfasında yayımlanır ve müşteriye bildirilir.</span><strong id="question-answer-count">{answer.length}/2000</strong></div><footer><button type="button" className="secondary-button" onClick={onClose} disabled={busy}>Vazgeç</button><button className="primary-button" disabled={busy || !answer.trim()}>{busy ? "Yayımlanıyor…" : question.answer ? "Yanıtı güncelle" : "Yanıtla ve yayınla"}</button></footer></form></OperationDialog>;
}

function QuestionsWorkspace({ items, error, refreshing, onRefresh, action }) {
  const [operation, setOperation] = useState(null);
  const adminPending = items.filter((item) => item.adminAnswerable && !item.answer).length;
  const sellerOwned = items.filter((item) => !item.adminAnswerable).length;
  const answered = items.filter((item) => item.answer).length;
  return <section className="workspace live-workspace" data-testid="live-questions"><header className="workspace-heading operations-heading"><div><span className="eyebrow">Mağaza sahipliği doğrulanmış ürün soruları</span><h2 tabIndex="-1">Müşteri soruları</h2><p>Admin yalnız Admin yönetimindeki mağaza sorularını yanıtlar. Seller mağazalarının soruları burada denetlenebilir, ancak yanıt yetkisi ilgili Seller organizasyonunda kalır.</p></div><button className="secondary-button" onClick={onRefresh} disabled={refreshing}><Icon name="refresh" />Yenile</button></header><ResourceWarning error={error} onRetry={onRefresh} /><section className="question-summary-strip" aria-label="Soru operasyon özeti"><div><span>Admin yanıtı bekleyen</span><strong>{adminPending}</strong></div><div><span>Seller sorusu</span><strong>{sellerOwned}</strong></div><div><span>Yanıtlanan</span><strong>{answered}</strong></div><div><span>Toplam</span><strong>{items.length}</strong></div></section><div className="table-card"><div className="table-scroll" tabIndex="0" role="region" aria-label="Müşteri soruları"><table className="data-table question-operations-table"><thead><tr><th>Mağaza / ürün</th><th>Müşteri</th><th>Soru</th><th>Durum</th><th>İşlem</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td><span className="live-customer-cell"><strong>{item.productName}</strong><small>{item.storeName} · Soru #{item.id}</small><small>{item.adminAnswerable ? "Admin yönetiminde" : `${item.sellerOrganizationName || "Seller organizasyonu"} yönetiminde`}</small></span></td><td>{item.userName}</td><td><p className="question-cell-copy">{item.question}</p><small>{dateTime(item.createdAt)}</small></td><td><span className={`status ${item.answer ? "status-yayında" : "status-ödeme-bekliyor"}`}>{item.answer ? "Yanıtlandı" : "Yanıt bekliyor"}</span></td><td>{action && item.adminAnswerable ? <button className={item.answer ? "secondary-button small" : "primary-button small"} onClick={() => setOperation(item)}>{item.answer ? "Yanıtı güncelle" : "Yanıtla"}</button> : <span className="live-archived-lock"><Icon name="shield" />{item.adminAnswerable ? "Salt okunur" : "Seller yanıtlar"}</span>}</td></tr>)}{items.length === 0 && <tr><td colSpan="5">Henüz müşteri sorusu yok.</td></tr>}</tbody></table></div></div>{operation && action && operation.adminAnswerable && <QuestionAnswerDialog question={operation} action={action} onClose={() => setOperation(null)} onComplete={() => { setOperation(null); onRefresh(); }} />}</section>;
}

const toLocalInput = (value) => value instanceof Date ? new Date(value.getTime() - value.getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "";

function CouponDialog({ coupon, actions, onClose, onComplete }) {
  const editing = Boolean(coupon);
  const [form, setForm] = useState(() => ({ code: coupon?.code || "", type: coupon?.discountType || "PERCENT", value: coupon?.discountValue ?? 10, min: coupon?.minOrderAmount ?? 0, max: coupon?.maxDiscountAmount ?? "", limit: coupon?.usageLimit ?? "", starts: toLocalInput(coupon?.startsAt), ends: toLocalInput(coupon?.endsAt), active: coupon?.active ?? false }));
  const [busy, setBusy] = useState(false); const [error, setError] = useState(null);
  const field = (name, value) => setForm((current) => ({ ...current, [name]: value }));
  const submit = async (event) => { event.preventDefault(); setBusy(true); setError(null); const body = { discount_value: Number(form.value), min_order_amount: Number(form.min), max_discount_amount: form.max === "" ? null : Number(form.max), usage_limit: form.limit === "" ? null : Number(form.limit), starts_at: form.starts ? new Date(form.starts).toISOString() : null, ends_at: form.ends ? new Date(form.ends).toISOString() : null }; try { if (editing) await actions.updateCoupon({ couponId: coupon.id, body: { expected_revision: coupon.revision, ...body } }); else await actions.createCoupon({ body: { code: form.code, discount_type: form.type, is_active: form.active, ...body } }); onComplete(); } catch (requestError) { setError(requestError); } finally { setBusy(false); } };
  return <OperationDialog title={editing ? `${coupon.code} kuponunu düzenle` : "Yeni kupon"} busy={busy} onClose={onClose} testId="coupon-operation-dialog"><form className="connected-form" onSubmit={submit}>{error && <OperationError error={error} id="coupon-operation-error" />}<label className="field"><span>Kod</span><input value={form.code} onChange={(event) => field("code", event.target.value)} disabled={editing} required maxLength="64" /></label><label className="field"><span>Tür</span><select value={form.type} onChange={(event) => field("type", event.target.value)} disabled={editing}><option value="PERCENT">Yüzde</option><option value="FIXED">Sabit</option></select></label><label className="field"><span>İndirim değeri</span><input type="number" min="0.01" step="0.01" value={form.value} onChange={(event) => field("value", event.target.value)} required /></label><label className="field"><span>Minimum sepet</span><input type="number" min="0" step="0.01" value={form.min} onChange={(event) => field("min", event.target.value)} /></label><label className="field"><span>Maksimum indirim</span><input type="number" min="0.01" step="0.01" value={form.max} onChange={(event) => field("max", event.target.value)} /></label><label className="field"><span>Kullanım limiti</span><input type="number" min="1" step="1" value={form.limit} onChange={(event) => field("limit", event.target.value)} /></label><label className="field"><span>Başlangıç</span><input type="datetime-local" value={form.starts} onChange={(event) => field("starts", event.target.value)} /></label><label className="field"><span>Bitiş</span><input type="datetime-local" value={form.ends} onChange={(event) => field("ends", event.target.value)} /></label>{!editing && <label className="check-row"><input type="checkbox" checked={form.active} onChange={(event) => field("active", event.target.checked)} /><span>Etkin oluştur</span></label>}<button className="primary-button" disabled={busy}>Kaydet</button></form></OperationDialog>;
}

function CouponsWorkspace({ items, error, refreshing, onRefresh, actions }) {
  const [operation, setOperation] = useState(null); const [actionError, setActionError] = useState(null); const write = typeof actions.createCoupon === "function";
  const toggle = async (coupon) => { setActionError(null); try { await actions.setCouponStatus({ couponId: coupon.id, expectedRevision: coupon.revision, active: !coupon.active }); onRefresh(); } catch (requestError) { setActionError(requestError); } };
  return <section className="workspace live-workspace" data-testid="live-coupons"><header className="workspace-heading operations-heading"><div><span className="eyebrow">Sunucu otoriteli fiyatlandırma</span><h2 tabIndex="-1">Kuponlar</h2><p>Geçerlilik, limit ve etkinlik durumu checkout fiyatlandırmasında sunucudan doğrulanır.</p></div><div className="heading-actions">{write && <button className="primary-button" onClick={() => setOperation({ kind: "create" })}>Yeni kupon</button>}<button className="secondary-button" onClick={onRefresh} disabled={refreshing}><Icon name="refresh" />Yenile</button></div></header><ResourceWarning error={error || actionError} onRetry={onRefresh} /><div className="table-card"><div className="table-scroll" tabIndex="0" role="region" aria-label="Kupon operasyonları"><table className="data-table"><thead><tr><th>Kod</th><th>İndirim</th><th>Kullanım</th><th>Durum</th><th>Geçerlilik</th><th>İşlem</th></tr></thead><tbody>{items.map((coupon) => <tr key={coupon.id}><td><strong>{coupon.code}</strong></td><td>{coupon.discountType === "PERCENT" ? `%${coupon.discountValue}` : money(coupon.discountValue)}</td><td>{coupon.usedCount}/{coupon.usageLimit ?? "∞"}</td><td>{coupon.operationalStatus}</td><td>{coupon.startsAt ? dateTime(coupon.startsAt) : "Hemen"} – {coupon.endsAt ? dateTime(coupon.endsAt) : "Süresiz"}</td><td>{write ? <span className="live-operation-buttons"><button className="secondary-button small" onClick={() => setOperation({ kind: "edit", coupon })}>Düzenle</button><button className={coupon.active ? "danger-button small" : "primary-button small"} onClick={() => toggle(coupon)}>{coupon.active ? "Devre dışı bırak" : "Etkinleştir"}</button></span> : "Salt okunur"}</td></tr>)}{items.length === 0 && <tr><td colSpan="6">Kupon kaydı yok.</td></tr>}</tbody></table></div></div>{operation && write && <CouponDialog coupon={operation.coupon || null} actions={actions} onClose={() => setOperation(null)} onComplete={() => { setOperation(null); onRefresh(); }} />}</section>;
}

function SupportDialog({ thread, loadHistory, actions, onClose, onComplete }) {
  const [messages, setMessages] = useState([]); const [phase, setPhase] = useState("loading"); const [reply, setReply] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState(null); const [status, setStatus] = useState(thread.status);
  const refresh = useCallback(async () => { setPhase("loading"); setError(null); try { setMessages(await loadHistory(thread.customerId)); setPhase("ready"); } catch (requestError) { setError(requestError); setPhase("error"); } }, [loadHistory, thread.customerId]);
  useEffect(() => { refresh(); }, [refresh]);
  const mutate = async (callback) => { setBusy(true); setError(null); try { await callback(); await refresh(); onComplete(); return true; } catch (requestError) { setError(requestError); return false; } finally { setBusy(false); } };
  const send = async (event) => { event.preventDefault(); if (await mutate(() => actions.sendSupportReply({ customerId: thread.customerId, message: reply }))) { setReply(""); setStatus("TAKEN_OVER"); } };
  const mutateAndClose = async (callback) => { if (await mutate(callback)) onClose(); };
  return <OperationDialog title={`${thread.name} · destek görüşmesi`} busy={busy} onClose={onClose} testId="support-thread-dialog" wide>
    <div className="support-dialog-shell">
      {error && <OperationError error={error} id="support-thread-error" />}
      <header className="support-thread-header">
        <div className="support-thread-avatar" aria-hidden="true"><Icon name="user" /></div>
        <div className="support-thread-identity"><span className="eyebrow">Müşteri destek görüşmesi</span><strong>{thread.name}</strong><p>{thread.email} · Thread #{thread.threadId}</p></div>
        <span className={`status-pill ${String(status).toLowerCase()}`}>{status === "TAKEN_OVER" ? "Admin devraldı" : status === "CLOSED" ? "Kapalı" : "Açık"}</span>
      </header>
      {phase === "loading" && <div className="support-thread-loading" role="status"><Icon name="refresh" /><span>Görüşme yükleniyor…</span></div>}
      {phase === "error" && <div className="support-thread-empty"><strong>Görüşme yüklenemedi.</strong><p>Bağlantıyı kontrol edip yeniden deneyin.</p><button className="secondary-button small" onClick={refresh}>Yeniden dene</button></div>}
      {phase === "ready" && <div className="support-message-list" role="log" aria-label={`${thread.name} destek mesajları`}>
        {messages.map((message) => {
          const fromCustomer = message.senderId === thread.customerId;
          return <article className={`support-message ${fromCustomer ? "is-customer" : "is-admin"}`} key={message.id}>
            <div className="support-message-meta"><strong>{fromCustomer ? thread.name : "NovaStore Destek"}</strong><time dateTime={message.createdAt}>{dateTime(message.createdAt)}</time></div>
            <p>{message.message}</p>
          </article>;
        })}
        {messages.length === 0 && <div className="support-thread-empty"><Icon name="help" /><strong>Henüz mesaj yok.</strong><p>Müşteri ilk mesajı gönderdiğinde görüşme burada görünecek.</p></div>}
      </div>}
      <div className="support-thread-actions">
        {status !== "TAKEN_OVER" && status !== "CLOSED" && actions.takeoverSupport && <button className="secondary-button" onClick={() => mutateAndClose(() => actions.takeoverSupport({ threadId: thread.threadId }))} disabled={busy}><Icon name="shield" />Görüşmeyi devral</button>}
        {status !== "CLOSED" && actions.setSupportStatus && <button className="danger-button" onClick={() => mutateAndClose(() => actions.setSupportStatus({ threadId: thread.threadId, status: "CLOSED" }))} disabled={busy}>Görüşmeyi kapat</button>}
      </div>
      {actions.sendSupportReply && status !== "CLOSED" ? <form className="modal-form live-operation-form support-composer" onSubmit={send}>
        <label className="field field-wide"><span>Müşteriye yanıtınız</span><textarea value={reply} onChange={(event) => setReply(event.target.value)} required maxLength="2000" rows="4" placeholder="Açık, yardımcı ve sonraki adımı belirten bir yanıt yazın." /></label>
        <div className="support-composer-meta"><p>Yanıt, bu ortak görüşme kimliğine kaydedilir ve müşterinin aynı konuşmasında görünür.</p><span>{reply.length} / 2000</span></div>
        <footer className="modal-actions"><button type="button" className="secondary-button" onClick={onClose} disabled={busy}>Vazgeç</button><button className="primary-button" disabled={busy || !reply.trim()}>{busy ? "Gönderiliyor…" : "Yanıtı gönder"}</button></footer>
      </form> : status !== "CLOSED" && <section className="operation-boundary"><Icon name="shield" /><div><strong>Yanıt yetkisi bu oturumda kapalı</strong><p>Görüşme salt okunur gösteriliyor. Destek yazma yetkisi etkin bir Admin oturumu gerekir.</p></div></section>}
    </div>
  </OperationDialog>;
}

function SupportWorkspace({ items, error, refreshing, onRefresh, loadHistory, actions }) {
  const [selected, setSelected] = useState(null);
  const openCount = items.filter((thread) => thread.status === "OPEN").length;
  const takenOverCount = items.filter((thread) => thread.status === "TAKEN_OVER").length;
  const closedCount = items.filter((thread) => thread.status === "CLOSED").length;
  return <section className="workspace live-workspace" data-testid="live-support">
    <header className="workspace-heading operations-heading"><div><span className="eyebrow">Müşteri · NovaBot · Admin ortak görüşmesi</span><h2 tabIndex="-1">Destek gelen kutusu</h2><p>Müşteri mesajlarını tek görüşmede takip edin, devralın ve yanıtlayın.</p></div><button className="secondary-button" onClick={onRefresh} disabled={refreshing}><Icon name="refresh" />Yenile</button></header>
    <div className="support-summary-strip" aria-label="Destek görüşmesi özeti"><div><strong>{openCount}</strong><span>Yanıt bekliyor</span></div><div><strong>{takenOverCount}</strong><span>Admin devraldı</span></div><div><strong>{closedCount}</strong><span>Kapalı</span></div></div>
    <ResourceWarning error={error} onRetry={onRefresh} />
    <div className="table-card"><div className="table-scroll" tabIndex="0" role="region" aria-label="Destek görüşmeleri"><table className="data-table support-operations-table"><thead><tr><th>Müşteri</th><th>Kaynak</th><th>Durum</th><th>Son mesaj</th><th>İşlem</th></tr></thead><tbody>{items.map((thread) => <tr key={thread.threadId}><td><div className="question-cell-copy"><strong>{thread.name}</strong><small>{thread.email}</small></div></td><td>{thread.source}</td><td><span className={`status-pill ${String(thread.status).toLowerCase()}`}>{thread.status === "TAKEN_OVER" ? "Admin devraldı" : thread.status === "CLOSED" ? "Kapalı" : "Açık"}</span></td><td>{thread.lastMessageAt ? dateTime(thread.lastMessageAt) : "Mesaj yok"}</td><td><button className="primary-button small" onClick={() => setSelected(thread)}>Görüşmeyi aç</button></td></tr>)}{items.length === 0 && <tr><td colSpan="5"><div className="table-empty-state"><strong>Destek görüşmesi yok.</strong><p>Yeni müşteri görüşmeleri burada listelenecek.</p></div></td></tr>}</tbody></table></div></div>
    {selected && <SupportDialog thread={selected} loadHistory={loadHistory} actions={actions} onClose={() => setSelected(null)} onComplete={onRefresh} />}
  </section>;
}

const railItems = [
  { id: "dashboard", label: "Pano", icon: "house", capability: "dashboardRead", implemented: true },
  { id: "orders", label: "Siparişler", icon: "orders", capability: "ordersRead", implemented: true },
  { id: "returns", label: "İadeler", icon: "refresh", capability: "returnsRead", implemented: true },
  { id: "notifications", label: "Bildirimler", icon: "bell", capability: "notificationsRead", implemented: true },
  { id: "reviews", label: "Yorumlar", icon: "check", capability: "reviewsRead", implemented: true },
  { id: "questions", label: "Sorular", icon: "help", capability: "questionsRead", implemented: true },
  { id: "coupons", label: "Kuponlar", icon: "card", capability: "couponsRead", implemented: true },
  { id: "support", label: "Destek", icon: "user", capability: "supportRead", implemented: true },
  { id: "catalog", label: "Ürünler", icon: "package", capability: "firstPartyCatalogRead", implemented: true },
  { id: "catalogStructure", label: "Katalog yapısı", icon: "grid", capability: "catalogStructureRead", implemented: true },
  { id: "customers", label: "Müşteriler · endpoint yok", icon: "user", capability: "customerAdmin", implemented: false },
  { id: "sellerApplications", label: "Satıcı mağazaları", icon: "storefront", capability: "storesRead", implemented: true },
  { id: "finance", label: "Finans · ledger yok", icon: "card", capability: "settlements", implemented: false },
];

const pageCapabilities = Object.freeze({
  dashboard: "dashboardRead",
  orders: "ordersRead",
  returns: "returnsRead",
  notifications: "notificationsRead",
  catalog: "firstPartyCatalogRead",
  catalogStructure: "catalogStructureRead",
  sellerApplications: "storesRead",
  reviews: "reviewsRead",
  questions: "questionsRead",
  coupons: "couponsRead",
  support: "supportRead",
});
const pageLabels = Object.freeze({ themePlatform: "Studio Pro", dashboard: "Pano", orders: "Siparişler", returns: "İadeler", notifications: "Bildirimler", catalog: "Ürünler", catalogStructure: "Katalog yapısı", sellerApplications: "Satıcı mağazaları", reviews: "Yorumlar", questions: "Sorular", coupons: "Kuponlar", support: "Destek" });
const notificationTargetPages = Object.freeze({
  order: "orders",
  payment: "orders",
  shipment: "orders",
  product: "catalog",
  product_question: "questions",
  return_request: "returns",
  review: "reviews",
  seller_application: "sellerApplications",
  store: "sellerApplications",
  support_thread: "support",
});
const notificationTargetUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const notificationTargetFromHash = (hash = window.location.hash) => {
  const query = String(hash).split("?", 2)[1] || "";
  const params = new URLSearchParams(query);
  const entityType = String(params.get("notificationTarget") || "").trim().toLowerCase();
  const page = notificationTargetPages[entityType];
  if (!page || resolveIntegratedAdminPage(hash) !== page) return null;
  if (entityType === "seller_application") {
    const entityKey = String(params.get("notificationTargetKey") || "").trim().toLowerCase();
    return notificationTargetUuid.test(entityKey) ? Object.freeze({ page, entityType, entityKey }) : null;
  }
  const entityId = Number(params.get("notificationTargetId"));
  return Number.isSafeInteger(entityId) && entityId > 0 ? Object.freeze({ page, entityType, entityId }) : null;
};
const readIntegratedPageFromLocation = () => resolveIntegratedAdminPage(window.location.hash);
const writeIntegratedPageToHistory = (page, { replace = false } = {}) => {
  const nextHash = integratedAdminPageHash(page);
  if (window.location.hash === nextHash) return;
  const method = replace ? "replaceState" : "pushState";
  window.history[method]({ novastoreAdminPage: page }, "", nextHash);
};
const writeNotificationTargetToHistory = (target) => {
  const params = new URLSearchParams({ notificationTarget: target.entityType });
  if (target.entityKey) params.set("notificationTargetKey", target.entityKey);
  else params.set("notificationTargetId", String(target.entityId));
  const nextHash = `${integratedAdminPageHash(target.page)}?${params.toString()}`;
  window.history.pushState({ novastoreAdminPage: target.page, notificationTarget: target.entityType }, "", nextHash);
};
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
  message: "Paylaşımlı katalog okuma yeteneği bu admin oturumunda açık değil.",
});
const catalogStructureUnavailableError = Object.freeze({
  message: "Katalog yapısı okuma yeteneği bu admin oturumunda açık değil.",
});
const storesUnavailableError = Object.freeze({
  message: "Mağaza özeti okuma yeteneği bu admin oturumunda açık değil.",
});

export function IntegratedApp() {
  const [page, setPage] = useState(readIntegratedPageFromLocation);
  const [notificationTarget, setNotificationTarget] = useState(notificationTargetFromHash);
  const [mobile, setMobile] = useState(() => window.innerWidth <= 760);
  const [contextOpen, setContextOpen] = useState(() => window.innerWidth > 760);
  const [selectedStoreId, setSelectedStoreId] = useState(null);
  const contextRef = useRef(null);
  const contextToggleRef = useRef(null);
  const contentRef = useRef(null);
  const http = useMemo(() => createAdminHttp(), []);
  const adapter = useMemo(() => createSameOriginAdapter(http), [http]);
  const loadSession = useCallback(({ signal }) => adapter.session({ signal }), [adapter]);
  const loadStats = useCallback(({ signal }) => adapter.dashboard({ signal }), [adapter]);
  const loadNotifications = useCallback(({ signal }) => adapter.notifications({ signal }), [adapter]);
  const loadNotificationUnread = useCallback(({ signal }) => adapter.notificationUnreadCount({ signal }), [adapter]);
  const loadOrders = useCallback(({ signal }) => adapter.orders({ signal }), [adapter]);
  const loadReturns = useCallback(({ signal }) => adapter.returns({ signal }), [adapter]);
  const loadCatalog = useCallback(({ signal }) => adapter.catalog({ signal }), [adapter]);
  const loadCatalogStructure = useCallback(({ signal }) => adapter.catalogStructure({ signal }), [adapter]);
  const loadStores = useCallback(({ signal }) => adapter.stores({ signal }), [adapter]);
  const loadStoreDetail = useCallback(({ signal }) => adapter.storeDetail({ storeId: selectedStoreId, signal }), [adapter, selectedStoreId]);
  const loadReviews = useCallback(async ({ signal }) => {
    const [pending, published] = await Promise.all([
      adapter.reviews({ status: "PENDING", signal }),
      adapter.reviews({ status: "PUBLISHED", signal }),
    ]);
    const items = Object.freeze([...pending.items, ...published.items]);
    return Object.freeze({ items, count: items.length });
  }, [adapter]);
  const loadQuestions = useCallback(({ signal }) => adapter.questions({ signal }), [adapter]);
  const loadCoupons = useCallback(({ signal }) => adapter.coupons({ signal }), [adapter]);
  const loadSupportThreads = useCallback(({ signal }) => adapter.supportThreads({ signal }), [adapter]);
  const loadSupportHistory = useCallback((customerId) => adapter.supportHistory({ customerId }), [adapter]);
  const sessionResource = useResource(loadSession, { preserveDataOnError: false });
  const sessionLoaded = sessionResource.phase === "ready";
  const capabilities = sessionResource.data?.capabilities || {};
  const loadThemeAccess = useCallback(({signal}) => http.request('/api/admin/theme-platform/experience/catalog', {signal}), [http]);
  const themeAccessResource = useResource(loadThemeAccess, {enabled: sessionLoaded, preserveDataOnError: false});
  const themeEnabled = ['ready','empty'].includes(themeAccessResource.phase);
  const loadStudioWorkshop = useCallback(async({signal}) => readStudioWorkshopLaunch(await http.request('/api/admin/theme-platform/workshop-launch', {signal})), [http]);
  const studioWorkshopResource = useResource(loadStudioWorkshop, {enabled: sessionLoaded && themeEnabled, preserveDataOnError: false});
  const studioWorkshop = studioWorkshopResource.phase === 'ready' ? studioWorkshopResource.data : null;
  const statsEnabled = sessionLoaded && hasCapability(capabilities, "dashboardRead");
  const ordersEnabled = sessionLoaded && hasCapability(capabilities, "ordersRead");
  const returnsEnabled = sessionLoaded && hasCapability(capabilities, "returnsRead");
  const notificationsEnabled = sessionLoaded && hasCapability(capabilities, "notificationsRead");
  const catalogEnabled = sessionLoaded && hasCapability(capabilities, "firstPartyCatalogRead");
  const catalogStructureEnabled = sessionLoaded && hasCapability(capabilities, "catalogStructureRead");
  const storesEnabled = sessionLoaded && hasCapability(capabilities, "storesRead");
  const reviewsEnabled = sessionLoaded && hasCapability(capabilities, "reviewsRead");
  const questionsEnabled = sessionLoaded && hasCapability(capabilities, "questionsRead");
  const couponsEnabled = sessionLoaded && hasCapability(capabilities, "couponsRead");
  const supportEnabled = sessionLoaded && hasCapability(capabilities, "supportRead");
  const mutationActions = useMemo(() => adapter.mutationActions(capabilities), [adapter, capabilities]);
  const cancelWriteEnabled = typeof mutationActions.cancelOrder === "function";
  const shipmentWriteEnabled = typeof mutationActions.createManualShipment === "function";
  const returnWriteEnabled = typeof mutationActions.updateReturnStatus === "function";
  const catalogWriteEnabled = catalogEnabled
    && typeof mutationActions.createCatalogProduct === "function"
    && typeof mutationActions.updateCatalogProduct === "function"
    && typeof mutationActions.archiveCatalogProduct === "function";
  const statsResource = useResource(loadStats, { enabled: statsEnabled });
  const notificationsResource = useResource(loadNotifications, { enabled: notificationsEnabled });
  const notificationUnreadResource = useResource(loadNotificationUnread, { enabled: notificationsEnabled });
  const ordersResource = useResource(loadOrders, { enabled: ordersEnabled });
  const returnsResource = useResource(loadReturns, { enabled: returnsEnabled });
  const catalogResource = useResource(loadCatalog, { enabled: catalogEnabled });
  const catalogStructureResource = useResource(loadCatalogStructure, { enabled: catalogStructureEnabled });
  const storesResource = useResource(loadStores, { enabled: storesEnabled });
  const reviewsResource = useResource(loadReviews, { enabled: reviewsEnabled });
  const questionsResource = useResource(loadQuestions, { enabled: questionsEnabled });
  const couponsResource = useResource(loadCoupons, { enabled: couponsEnabled });
  const supportResource = useResource(loadSupportThreads, { enabled: supportEnabled });
  const storeDetailResource = useResource(loadStoreDetail, { enabled: storesEnabled && selectedStoreId !== null, preserveDataOnError: false });
  const statsLoaded = statsResource.phase === "ready";
  const ordersLoaded = ordersResource.phase === "ready" || ordersResource.phase === "empty";
  const returnsLoaded = returnsResource.phase === "ready" || returnsResource.phase === "empty";
  const notificationsLoaded = notificationsResource.phase === "ready" || notificationsResource.phase === "empty";
  const catalogLoaded = catalogResource.phase === "ready" || catalogResource.phase === "empty";
  const catalogStructureLoaded = catalogStructureResource.phase === "ready" || catalogStructureResource.phase === "empty";
  const storesLoaded = storesResource.phase === "ready" || storesResource.phase === "empty";
  const reviewsLoaded = reviewsResource.phase === "ready" || reviewsResource.phase === "empty";
  const questionsLoaded = questionsResource.phase === "ready" || questionsResource.phase === "empty";
  const couponsLoaded = couponsResource.phase === "ready" || couponsResource.phase === "empty";
  const supportLoaded = supportResource.phase === "ready" || supportResource.phase === "empty";
  const enabledPages = useMemo(() => Object.keys(pageCapabilities).filter((pageId) => (
    hasCapability(capabilities, pageCapabilities[pageId])
  )).concat(themeEnabled ? ["themePlatform"] : []), [capabilities, themeEnabled]);
  const lastUpdatedAt = [ordersResource.updatedAt, returnsResource.updatedAt, notificationsResource.updatedAt, catalogResource.updatedAt, catalogStructureResource.updatedAt, storesResource.updatedAt, reviewsResource.updatedAt, questionsResource.updatedAt, couponsResource.updatedAt, supportResource.updatedAt]
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
    const synchronizePage = () => {
      const nextPage = readIntegratedPageFromLocation();
      setPage(nextPage);
      setNotificationTarget(notificationTargetFromHash());
    };
    window.addEventListener("popstate", synchronizePage);
    window.addEventListener("hashchange", synchronizePage);
    return () => {
      window.removeEventListener("popstate", synchronizePage);
      window.removeEventListener("hashchange", synchronizePage);
    };
  }, []);

  useEffect(() => {
    if (!sessionLoaded || (page === "themePlatform" && ["idle", "loading"].includes(themeAccessResource.phase))) return;
    if (!enabledPages.includes(page) && enabledPages[0]) setPage(enabledPages[0]);
    if (!enabledPages.includes(page) && enabledPages[0]) {
      writeIntegratedPageToHistory(enabledPages[0], { replace: true });
    }
  }, [enabledPages, page, sessionLoaded, themeAccessResource.phase]);

  useEffect(() => {
    if (page !== "sellerApplications") setSelectedStoreId(null);
  }, [page]);

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
    if (next === "themePlatform" ? !themeEnabled : (!capability || !hasCapability(capabilities, capability))) return;
    writeIntegratedPageToHistory(next);
    setPage(next);
    setNotificationTarget(null);
    if (mobile) setContextOpen(false);
  };
  const openNotificationTarget = (item) => {
    const pageForTarget = notificationTargetPages[item?.entityType];
    const entityId = Number(item?.entityId);
    const entityKey = String(item?.entityKey || "").trim().toLowerCase();
    const validIdentity = item?.entityType === "seller_application"
      ? notificationTargetUuid.test(entityKey)
      : Number.isSafeInteger(entityId) && entityId > 0 && !entityKey;
    if (!pageForTarget || pageForTarget !== item?.targetPage || !validIdentity) return;
    const capability = pageCapabilities[pageForTarget];
    if (!capability || !hasCapability(capabilities, capability)) return;
    const target = Object.freeze({
      page: pageForTarget,
      entityType: item.entityType,
      ...(item.entityType === "seller_application" ? { entityKey } : { entityId }),
    });
    writeNotificationTargetToHistory(target);
    setNotificationTarget(target);
    setPage(pageForTarget);
    if (mobile) setContextOpen(false);
  };
  const markNotificationRead = async (id) => {
    await adapter.markNotificationRead({ id });
    notificationsResource.reload();
    notificationUnreadResource.reload();
  };
  const markAllNotificationsRead = async () => {
    await adapter.markAllNotificationsRead();
    notificationsResource.reload();
    notificationUnreadResource.reload();
  };
  const reloadAll = () => {
    sessionResource.reload();
    if (sessionLoaded) themeAccessResource.reload();
    if (themeEnabled) studioWorkshopResource.reload();
    if (statsEnabled) statsResource.reload();
    if (notificationsEnabled) notificationsResource.reload();
    if (notificationsEnabled) notificationUnreadResource.reload();
    if (ordersEnabled) ordersResource.reload();
    if (returnsEnabled) returnsResource.reload();
    if (catalogEnabled) catalogResource.reload();
    if (catalogStructureEnabled) catalogStructureResource.reload();
    if (storesEnabled) storesResource.reload();
    if (reviewsEnabled) reviewsResource.reload();
    if (questionsEnabled) questionsResource.reload();
    if (couponsEnabled) couponsResource.reload();
    if (supportEnabled) supportResource.reload();
  };
  const logout = async () => {
    await adapter.webPush.revokeSession().catch(() => null);
    await http.logout();
    window.location.href = "admin-login.html?next=admin-commerce-pro-live.html";
  };

  let pageContent;
  if (!sessionLoaded) {
    pageContent = <StatePanel phase={sessionResource.phase} error={sessionResource.error} onRetry={sessionResource.reload} />;
  } else if (page === "themePlatform") {
    pageContent = studioWorkshop ? <section className="notice-card"><Icon name="grid" /><div><h2>Studio Pro</h2><p>Özgün tasarım atölyesi ve sunucuya bağlı mağaza sunumları aynı Studio Pro içinde açılır.</p><a className="primary-button" href={studioWorkshop.url} target="_blank" rel="noopener noreferrer">Studio Pro'yu yeni sekmede aç</a><p>Tasarım araçları yerel taslakları korur. Mağaza sunumları Studio içindeki mevcut bölümde sunucu kayıtlarıyla yönetilir; bu bağlantı canlı yayın yapmaz.</p></div></section> : <StatePanel phase={studioWorkshopResource.phase} error={studioWorkshopResource.error} onRetry={studioWorkshopResource.reload} />;
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
        ? <Orders orderPage={ordersResource.data} error={ordersResource.error} refreshing={ordersResource.refreshing} onRefresh={ordersResource.reload} onReloadCapabilities={sessionResource.reload} mutationActions={mutationActions} paymentProvider={sessionResource.data?.paymentProvider} loadOrderDetail={adapter.orderDetail} notificationTarget={notificationTarget} />
        : <StatePanel phase={ordersResource.phase} error={ordersResource.error} onRetry={ordersResource.reload} />;
  } else if (page === "returns") {
    pageContent = !returnsEnabled
      ? <StatePanel phase="forbidden" error={returnsUnavailableError} onRetry={returnsResource.reload} />
      : returnsLoaded
        ? <Returns returnPage={returnsResource.data} error={returnsResource.error} refreshing={returnsResource.refreshing} onRefresh={returnsResource.reload} onReloadCapabilities={sessionResource.reload} mutationActions={mutationActions} notificationTarget={notificationTarget} />
        : <StatePanel phase={returnsResource.phase} error={returnsResource.error} onRetry={returnsResource.reload} />;
  } else if (page === "notifications") {
    pageContent = !notificationsEnabled
      ? <StatePanel phase="forbidden" error={notificationsUnavailableError} onRetry={notificationsResource.reload} />
      : notificationsLoaded
        ? <Notifications notificationPage={notificationsResource.data} error={notificationsResource.error} refreshing={notificationsResource.refreshing} onRefresh={notificationsResource.reload} onOpenTarget={openNotificationTarget} onMarkOne={markNotificationRead} onMarkAll={markAllNotificationsRead} webPushApi={adapter.webPush} />
        : <StatePanel phase={notificationsResource.phase} error={notificationsResource.error} onRetry={notificationsResource.reload} />;
  } else if (page === "catalog") {
    pageContent = !catalogEnabled
      ? <StatePanel phase="forbidden" error={catalogUnavailableError} onRetry={catalogResource.reload} />
      : catalogLoaded
        ? <Catalog catalogPage={catalogResource.data} error={catalogResource.error} refreshing={catalogResource.refreshing} sessionRefreshing={sessionResource.refreshing} onRefresh={catalogResource.reload} onReloadCapabilities={sessionResource.reload} mutationActions={mutationActions} />
        : <StatePanel phase={catalogResource.phase} error={catalogResource.error} onRetry={catalogResource.reload} />;
  } else if (page === "catalogStructure") {
    pageContent = !catalogStructureEnabled
      ? <StatePanel phase="forbidden" error={catalogStructureUnavailableError} onRetry={catalogStructureResource.reload} />
      : catalogStructureLoaded
        ? <CatalogStructure structure={catalogStructureResource.data} error={catalogStructureResource.error} refreshing={catalogStructureResource.refreshing} onRefresh={catalogStructureResource.reload} mutationActions={mutationActions} />
        : <StatePanel phase={catalogStructureResource.phase} error={catalogStructureResource.error} onRetry={catalogStructureResource.reload} />;
  } else if (page === "sellerApplications") {
    pageContent = !storesEnabled
      ? <StatePanel phase="forbidden" error={storesUnavailableError} onRetry={storesResource.reload} />
      : storesLoaded
        ? <SellerApplications storePage={storesResource.data} detailResource={storeDetailResource} selectedStoreId={selectedStoreId} onSelect={setSelectedStoreId} onCloseDetail={() => setSelectedStoreId(null)} error={storesResource.error} refreshing={storesResource.refreshing} onRefresh={storesResource.reload} />
        : <StatePanel phase={storesResource.phase} error={storesResource.error} onRetry={storesResource.reload} />;
  } else if (page === "reviews") {
    pageContent = !reviewsEnabled ? <StatePanel phase="forbidden" error={noSupportedModuleError} onRetry={reviewsResource.reload} /> : reviewsLoaded
      ? <ReviewsWorkspace page={reviewsResource.data || { items: [], count: 0 }} error={reviewsResource.error} refreshing={reviewsResource.refreshing} onRefresh={reviewsResource.reload} action={mutationActions.moderateReview} />
      : <StatePanel phase={reviewsResource.phase} error={reviewsResource.error} onRetry={reviewsResource.reload} />;
  } else if (page === "questions") {
    pageContent = !questionsEnabled ? <StatePanel phase="forbidden" error={noSupportedModuleError} onRetry={questionsResource.reload} /> : questionsLoaded
      ? <QuestionsWorkspace items={questionsResource.data || []} error={questionsResource.error} refreshing={questionsResource.refreshing} onRefresh={questionsResource.reload} action={mutationActions.answerQuestion} />
      : <StatePanel phase={questionsResource.phase} error={questionsResource.error} onRetry={questionsResource.reload} />;
  } else if (page === "coupons") {
    pageContent = !couponsEnabled ? <StatePanel phase="forbidden" error={noSupportedModuleError} onRetry={couponsResource.reload} /> : couponsLoaded
      ? <CouponsWorkspace items={couponsResource.data || []} error={couponsResource.error} refreshing={couponsResource.refreshing} onRefresh={couponsResource.reload} actions={mutationActions} />
      : <StatePanel phase={couponsResource.phase} error={couponsResource.error} onRetry={couponsResource.reload} />;
  } else if (page === "support") {
    pageContent = !supportEnabled ? <StatePanel phase="forbidden" error={noSupportedModuleError} onRetry={supportResource.reload} /> : supportLoaded
      ? <SupportWorkspace items={supportResource.data || []} error={supportResource.error} refreshing={supportResource.refreshing} onRefresh={supportResource.reload} loadHistory={loadSupportHistory} actions={mutationActions} />
      : <StatePanel phase={supportResource.phase} error={supportResource.error} onRetry={supportResource.reload} />;
  } else {
    pageContent = <StatePanel phase="forbidden" error={noSupportedModuleError} onRetry={sessionResource.reload} />;
  }

  return (
    <AdminPresentationShell
      testId="integrated-admin-shell"
      contextOpen={contextOpen}
      mobile={mobile}
      contentRef={contentRef}
      iconRail={(
        <aside className="icon-rail" aria-label="Ana yönetim alanları">
          <div className="rail-logo"><Icon name="storefront" /><span>NOVA</span></div>
          <nav className="rail-nav">
            {studioWorkshop ? <a className="studio-workshop-link" href={studioWorkshop.url} target="_blank" rel="noopener noreferrer" aria-label="Studio Pro · yeni sekmede aç" title="Studio Pro · özgün tasarım atölyesi · yeni sekme"><Icon name="grid" /></a> : <button disabled aria-label="Studio Pro" title={['idle','loading'].includes(studioWorkshopResource.phase)?'Studio Pro bağlantısı doğrulanıyor':'Özgün Studio atölyesi bu ortamda yapılandırılmamış veya erişim izni bulunmuyor'}><Icon name="grid" /></button>}
            {railItems.map((item) => {
              const enabled = item.implemented && (item.id === "themePlatform" ? themeEnabled : hasCapability(capabilities, item.capability));
              if (["catalog", "catalogStructure", "sellerApplications"].includes(item.id) && !enabled) return null;
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
      )}
      contextRail={contextOpen ? (
        <aside ref={contextRef} className="context-rail" id="context-navigation" aria-label="Entegre yönetim menüsü" tabIndex="-1">
          <header className="context-title"><h1>Commerce Pro</h1><span className="live-mode-chip">ENTEGRE</span></header>
          <section className="context-nav">

            <button className={page === "dashboard" ? "active" : ""} onClick={() => navigate("dashboard")} disabled={!hasCapability(capabilities, "dashboardRead")}><Icon name="house" /><span>Genel Bakış</span></button>
            <button className={page === "orders" ? "active" : ""} onClick={() => navigate("orders")} disabled={!hasCapability(capabilities, "ordersRead")}><Icon name="orders" /><span>Siparişler</span><b>{ordersResource.data?.items.length || 0}</b></button>
            <button className={page === "returns" ? "active" : ""} onClick={() => navigate("returns")} disabled={!hasCapability(capabilities, "returnsRead")}><Icon name="refresh" /><span>İadeler</span><b>{returnsResource.data?.items.length || 0}</b></button>
            <button className={page === "notifications" ? "active" : ""} onClick={() => navigate("notifications")} disabled={!hasCapability(capabilities, "notificationsRead")}><Icon name="bell" /><span>Bildirimler</span><b>{notificationUnreadResource.data || 0}</b></button>
            {reviewsEnabled && <button className={page === "reviews" ? "active" : ""} onClick={() => navigate("reviews")}><Icon name="check" /><span>Yorumlar</span><b>{reviewsResource.data?.items.length || 0}</b></button>}
            {questionsEnabled && <button className={page === "questions" ? "active" : ""} onClick={() => navigate("questions")}><Icon name="help" /><span>Sorular</span><b>{questionsResource.data?.filter((item) => !item.answer).length || 0}</b></button>}
            {couponsEnabled && <button className={page === "coupons" ? "active" : ""} onClick={() => navigate("coupons")}><Icon name="card" /><span>Kuponlar</span><b>{couponsResource.data?.length || 0}</b></button>}
            {supportEnabled && <button className={page === "support" ? "active" : ""} onClick={() => navigate("support")}><Icon name="user" /><span>Destek</span><b>{supportResource.data?.filter((item) => item.status !== "CLOSED").length || 0}</b></button>}
            {catalogEnabled && <button className={page === "catalog" ? "active" : ""} onClick={() => navigate("catalog")}><Icon name="package" /><span>Ürünler</span><b>{catalogResource.data?.items.length || 0}</b></button>}
            {catalogStructureEnabled && <button className={page === "catalogStructure" ? "active" : ""} onClick={() => navigate("catalogStructure")}><Icon name="grid" /><span>Katalog yapısı</span><b>{catalogStructureResource.data?.categories.items.length || 0}</b></button>}
            {storesEnabled && <button className={page === "sellerApplications" ? "active" : ""} onClick={() => navigate("sellerApplications")}><Icon name="storefront" /><span>Satıcı mağazaları</span><b>{storesResource.data?.items.length || 0}</b></button>}
          </section>
          <section className="marketplace-links">
            <strong>Planlanan modüller</strong>
            <button disabled><Icon name="card" /><span>Hakedişler</span><small>Tur 8</small></button>
          </section>
          <button className="collapse-caption" onClick={() => setContextOpen(false)}><Icon name="back" />Menüyü daralt</button>
        </aside>
      ) : null}
      contextScrim={contextOpen && mobile ? <button className="context-scrim" aria-label="Menüyü kapat" onClick={() => setContextOpen(false)} /> : null}
      header={(
        <header className="topbar">
          <h1 className="mobile-admin-heading">Commerce Pro — {pageLabels[page] || "Modül"}</h1>
          <div className="topbar-leading">
            <button ref={contextToggleRef} className="icon-button rail-toggle" onClick={() => setContextOpen((value) => !value)} aria-label={contextOpen ? "Menüyü daralt" : "Menüyü aç"} aria-expanded={contextOpen}><Icon name={contextOpen ? "back" : "menu"} /></button>
            <div className="breadcrumb"><span>Entegre yönetim</span><Icon name="right" /><strong>{pageLabels[page] || "Modül"}</strong></div>
          </div>
          <div className="command-trigger live-command-status" role="status"><Icon name="shield" /><span>{sessionLoaded ? "Admin oturumu doğrulandı" : "Admin oturumu doğrulanıyor"}</span></div>
          <button className="icon-button live-notification-bell" type="button" aria-label={`${notificationUnreadResource.data || 0} okunmamış bildirim`} onClick={() => navigate("notifications")} disabled={!notificationsEnabled}><Icon name="bell" />{notificationUnreadResource.data > 0 && <b aria-hidden="true">{notificationUnreadResource.data > 99 ? "99+" : notificationUnreadResource.data}</b>}</button>
          <button className="secondary-button live-refresh" aria-label={sessionResource.refreshing || sessionResource.phase === "loading" ? "Veri yenileniyor" : "Veriyi yenile"} onClick={reloadAll} disabled={sessionResource.refreshing || sessionResource.phase === "loading"}><Icon name="refresh" /><span>Veriyi yenile</span></button>
          <button className="profile-button" onClick={logout}><span className="avatar avatar-small">A</span><span>Çıkış</span></button>
        </header>
      )}
      statusbar={(
        <footer className="statusbar">
          <div className="preview-banner live-banner" role="note" data-testid="live-banner"><Icon name="shield" /><strong>Entegre çok mağazalı operasyon</strong><span>Mock fallback yok · Seller ürünleri salt okunur · {cancelWriteEnabled || shipmentWriteEnabled || catalogWriteEnabled || returnWriteEnabled ? "izinli yazmalar yetki ve doğrulamayla sınırlı" : "bu oturumda sipariş, ürün ve iade değişiklikleri kapalı"}</span></div>
          <span className={sessionLoaded ? "healthy" : ""}>{sessionLoaded ? "Oturum doğrulandı" : sessionResource.phase === "error" ? "Bağlantı hatası" : "Bağlantı bekleniyor"}</span>
          <span>{lastUpdatedAt ? `Son veri okuması ${dateTime(lastUpdatedAt)}` : "Entegre veri bekleniyor"}</span>
          <button onClick={reloadAll} disabled={sessionResource.refreshing || statsResource.refreshing || ordersResource.refreshing || returnsResource.refreshing || notificationsResource.refreshing || catalogResource.refreshing || catalogStructureResource.refreshing || storesResource.refreshing}><Icon name="refresh" />Yenile</button>
        </footer>
      )}
    >
      {notificationTarget?.page === page && (
        <section className="notice-card live-notification-target-context" role="status" data-testid="notification-target-context">
          <Icon name="bell" />
          <div>
            <strong>Bildirim hedefi açıldı</strong>
            <p>{notificationTarget.entityType} · {notificationTarget.entityKey || `#${notificationTarget.entityId}`}. Kayıt verisi yalnız mevcut Admin yetkileriyle yüklenir.</p>
          </div>
          <button className="secondary-button small" type="button" onClick={() => navigate(page)}>Hedef görünümünü kapat</button>
        </section>
      )}
      {pageContent}
    </AdminPresentationShell>
  );
}
