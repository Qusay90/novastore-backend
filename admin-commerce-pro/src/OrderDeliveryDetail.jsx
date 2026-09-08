import { useEffect, useId, useState } from "react";

export default function OrderDeliveryDetail({ orderId, loadDetail, Dialog, onClose }) {
  const labelId = useId();
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState({ phase: "loading", data: null });
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setState({ phase: "loading", data: null });
    loadDetail({ orderId, signal: controller.signal }).then((data) => {
      if (active) setState({ phase: "ready", data });
    }).catch(() => {
      // Show no server payload, stale recipient or exception text on failure.
      if (active) setState({ phase: "error", data: null });
    });
    return () => { active = false; controller.abort(); };
  }, [orderId, loadDetail, attempt]);
  const recipient = state.data?.deliveryRecipient;
  const field = (value) => value || "Belirtilmemiş";
  return <Dialog title={`Sipariş #${orderId}`} onClose={onClose} eyebrow="Sipariş detayı" testId="order-delivery-detail">
    <section className="live-delivery-detail" aria-labelledby={labelId} aria-busy={state.phase === "loading"}>
      <h3 id={labelId}>Teslimat Bilgileri</h3>
      {state.phase === "loading" && <p role="status">Sipariş detayı yükleniyor…</p>}
      {state.phase === "error" && <div role="alert"><p>Sipariş detayı alınamadı. Oturum veya sipariş yetkisi değişmiş olabilir.</p><button className="secondary-button" onClick={() => setAttempt((value) => value + 1)}>Tekrar dene</button></div>}
      {recipient && <>
        <p>Bu sipariş oluşturulurken kaydedilen teslimat bilgileri gösterilir.</p>
        {state.data.missingDeliveryFields.length > 0 && <p role="alert" className="warning-card">Gerekli alıcı, telefon veya adres bilgisi eksik. Sevkiyat öncesinde siparişin teslimat bilgileri operasyonel olarak doğrulanmalıdır.</p>}
        <dl>
          <dt>Alıcı</dt><dd data-recipient-field="name">{field(recipient.name)}</dd>
          <dt>Telefon</dt><dd data-recipient-field="phone">{field(recipient.phone)}</dd>
          <dt>Adres</dt><dd data-recipient-field="address">{field(recipient.addressLine)}</dd>
          <dt>İl / ilçe</dt><dd>Kaydedilen adres metninin içinde gösterilir; ayrı alan olarak saklanmamıştır.</dd>
          <dt>Posta kodu</dt><dd>{field(recipient.postalCode)}</dd>
          <dt>Teslimat notu</dt><dd>{field(recipient.note)}</dd>
        </dl>
      </>}
    </section>
  </Dialog>;
}
