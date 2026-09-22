import "./customer-returns.css";
import { useEffect, useState } from "react";
import { refundStatusLabel, returnDetailPath, returnErrorMessage } from "./adapters/customerReturnContract.js";

const paymentLabels = { PENDING: "Ödeme bekliyor", REQUIRES_ACTION: "Ödeme onayı gerekiyor", WAITING_TRANSFER: "Havale bekliyor", PAID: "Ödendi", FAILED: "Ödeme başarısız", REFUNDED: "Ödeme iade edildi" };
const date = (value) => new Date(value).toLocaleString("tr-TR");

export default function CustomerReturns({ account, session, returnId }) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState({ phase: "loading" });
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setState({ phase: "loading" });
    const options = { signal: controller.signal };
    Promise.all([
      returnId ? account.getReturn(session, returnId, options) : account.listReturns(session, options),
      account.listOrders(session, options).then((orders) => ({ orders }), () => ({ orders: [], unavailable: true })),
    ]).then(([data, context]) => {
      if (active) setState({ phase: "ready", data, ...context });
    }).catch((error) => {
      if (active) setState({ phase: "error", error });
    });
    return () => { active = false; controller.abort(); };
  }, [account, session, returnId, attempt]);

  const reload = () => setAttempt((value) => value + 1);
  return <div className="customer-returns">
    <nav aria-label="İade gezinmesi"><a href="#/hesabim/siparisler">Siparişlerim</a>{returnId && <a href="#/hesabim/iadeler">İade Taleplerim</a>}</nav>
    <div className="commerce-heading"><div><span className="section-kicker">Hesabım</span><h1>{returnId ? `İade Talebi #${returnId}` : "İade Taleplerim"}</h1><p>İade taleplerini ve güncel durumlarını buradan takip edebilirsin.</p></div><button type="button" onClick={reload} disabled={state.phase === "loading"}>Yenile</button></div>
    {state.phase === "loading" && <div role="status" className="connected-inline-state">İade bilgileri yükleniyor…</div>}
    {state.phase === "error" && <div role="alert" className="connected-inline-state is-error"><p>{returnErrorMessage(state.error)}</p>{state.error?.status === 401 ? <a href={`#/giris?return=${encodeURIComponent(returnId ? `/hesabim/iadeler/${returnId}` : "/hesabim/iadeler")}`}>Giriş yap</a> : <button type="button" onClick={reload}>Yeniden dene</button>}</div>}
    {state.phase === "ready" && <>
      {state.unavailable && <p role="status">Ürün özeti yüklenemedi. İade bilgileri günceldir; ürün özetini almak için Yenile seçeneğini kullanabilirsin.</p>}
      {returnId ? <ReturnDetail request={state.data} order={state.orders.find((order) => order.id === state.data.orderId)} /> : state.data.length === 0 ? <div className="connected-empty"><h2>Henüz iade talebin yok</h2><p>İade taleplerin oluşturulduktan sonra burada yer alır.</p></div> : <ol className="customer-return-list">{state.data.map((request) => <li key={request.id}>
        <article aria-label={`İade talebi ${request.id}`}><h2><a href={returnDetailPath(request.id)}>Talep #{request.id}</a></h2><p><a href={`#/hesabim/siparisler/${request.orderId}`}>Sipariş #{request.orderId}</a></p><p><strong>Talep tarihi:</strong> <time dateTime={request.createdAt}>{date(request.createdAt)}</time></p><p><strong>Neden:</strong> {request.reasonLabel}</p><p><strong>İade Talebi Durumu:</strong> {request.statusLabel}</p><OrderContext order={state.orders.find((order) => order.id === request.orderId)} /></article>
      </li>)}</ol>}
    </>}
  </div>;
}

function OrderContext({ order }) {
  return order?.items?.length ? <p className="return-product-context">{order.items.map((item) => `${item.name} (${item.quantity} adet)`).join(" · ")}</p> : null;
}

function ReturnDetail({ request, order }) {
  const amount = request.requestedAmount === null ? "Tutar bilgisi bulunmuyor" : `${request.requestedAmount.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${order?.currency ? ` ${order.currency}` : " (para birimi bilgisi alınamadı)"}`;
  return <article className="customer-return-detail" aria-label={`İade talebi ${request.id} detay`}>
    <dl><div><dt>Talep ID</dt><dd>#{request.id}</dd></div><div><dt>Sipariş</dt><dd><a href={`#/hesabim/siparisler/${request.orderId}`}>Sipariş #{request.orderId}</a></dd></div><div><dt>Talep tarihi</dt><dd><time dateTime={request.createdAt}>{date(request.createdAt)}</time></dd></div><div><dt>Neden</dt><dd>{request.reasonLabel}</dd></div><div><dt>Açıklaman</dt><dd>{request.note || "Açıklama eklenmemiş."}</dd></div><div><dt>İade Talebi Durumu</dt><dd>{request.statusLabel}</dd></div>{request.decisionNote && <div><dt>Karar notu</dt><dd>{request.decisionNote}</dd></div>}<div><dt>Talep edilen geri ödeme tutarı</dt><dd>{amount}</dd></div><div><dt>Sipariş ödeme durumu</dt><dd>{paymentLabels[request.paymentStatus]}</dd></div><div><dt>Geri Ödeme Durumu</dt><dd>{refundStatusLabel(request.orderRefundStatus)}</dd></div></dl>
    <p>Geri ödeme durumu siparişin güncel durumudur; yalnız bu talebe ait bir ödeme işlem geçmişi değildir. Talep edilen tutar, ödenmiş tutar anlamına gelmez.</p>
    <OrderContext order={order} />
  </article>;
}
