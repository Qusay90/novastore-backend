import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Bell,
  CaretRight,
  ChatCircleText,
  Check,
  CheckCircle,
  Clock,
  Copy,
  CreditCard,
  EnvelopeSimple,
  Heart,
  Key,
  LockKey,
  MapPin,
  Package,
  PaperPlaneTilt,
  PencilSimple,
  Plus,
  Receipt,
  ShieldCheck,
  ShoppingBag,
  SignOut,
  Ticket,
  Trash,
  Truck,
  User,
  WarningCircle,
} from "@phosphor-icons/react";

const money = new Intl.NumberFormat("tr-TR", {
  style: "currency",
  currency: "TRY",
  maximumFractionDigits: 2,
});

const dateTime = new Intl.DateTimeFormat("tr-TR", {
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const dateOnly = new Intl.DateTimeFormat("tr-TR", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

const formatDate = (value, withTime = true) => {
  if (!value) return "Tarih bilgisi bekleniyor";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Tarih bilgisi bekleniyor";
  return (withTime ? dateTime : dateOnly).format(parsed);
};

const errorMessage = (error, fallback = "İşlem tamamlanamadı.") => (
  error?.message || error?.payload?.error || fallback
);

const safeReturnPath = (value, fallback = "/hesabim") => {
  const path = String(value || "").trim();
  if (!path.startsWith("/") || path.startsWith("//") || /[\\\u0000-\u001f\u007f]/.test(path)) return fallback;
  return path;
};

const safeTrackingUrl = (value) => {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
};

const PAYMENT_STATUS_LABELS = Object.freeze({
  REQUIRES_ACTION: "Ödeme işlemi bekleniyor",
  WAITING_TRANSFER: "Havale bekleniyor",
  PAID: "Ödendi",
  FAILED: "Başarısız",
  REFUNDED: "İade edildi",
});

const paymentStatusLabel = (value) => PAYMENT_STATUS_LABELS[String(value || "").trim().toUpperCase()]
  || String(value || "Durum bilgisi bekleniyor");

function useAsyncResource(loader, dependencies = []) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState({ phase: "loading", data: null, error: null });

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setState({ phase: "loading", data: null, error: null });
    Promise.resolve().then(() => loader({ signal: controller.signal })).then((data) => {
      if (active) setState({ phase: "ready", data, error: null });
    }).catch((error) => {
      if (!active || error?.code === "CUSTOMER_ABORTED") return;
      setState({ phase: "error", data: null, error });
    });
    return () => {
      active = false;
      controller.abort("effect-cleanup");
    };
  }, [...dependencies, attempt]);

  const reload = useCallback(() => setAttempt((value) => value + 1), []);
  return Object.freeze({ ...state, reload });
}

function InlineState({ phase, error, onRetry, empty = false, emptyTitle, emptyCopy }) {
  if (phase === "loading") {
    return <div className="connected-inline-state" role="status" aria-live="polite"><span className="integration-spinner" /><strong>Bilgiler yükleniyor</strong></div>;
  }
  if (phase === "error") {
    return <div className="connected-inline-state is-error" role="alert"><WarningCircle /><strong>{errorMessage(error)}</strong><button type="button" onClick={onRetry}>Yeniden dene</button></div>;
  }
  if (empty) {
    return <div className="connected-empty"><ShoppingBag /><h2>{emptyTitle}</h2><p>{emptyCopy}</p></div>;
  }
  return null;
}

function AuthHero({ kicker, title, copy }) {
  return <div className="auth-hero"><ShieldCheck weight="fill" /><span className="section-kicker">{kicker}</span><h1>{title}</h1><p>{copy}</p><div className="auth-trust-list"><span><CheckCircle weight="fill" /> Aynı-origin güvenli oturum</span><span><CheckCircle weight="fill" /> Sepet ve favoriler korunur</span><span><CheckCircle weight="fill" /> Şifren tarayıcıda saklanmaz</span></div></div>;
}

export function CustomerAuthPage({
  account,
  initialMode = "login",
  returnPath = "/hesabim",
  onAuthenticated,
}) {
  const [mode, setMode] = useState(initialMode === "register" ? "register" : "login");
  const [phase, setPhase] = useState("idle");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => setMode(initialMode === "register" ? "register" : "login"), [initialMode]);

  const submit = async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") || "").trim();
    const password = String(form.get("password") || "");
    setPhase("submitting");
    setError("");
    setMessage("");
    try {
      if (mode === "register") {
        const fullName = String(form.get("fullName") || "").trim();
        const confirmation = String(form.get("passwordConfirmation") || "");
        if (password !== confirmation) throw new Error("Şifre tekrarı eşleşmiyor.");
        if (password.length < 8 || !/[A-Za-zÇĞİÖŞÜçğıöşü]/.test(password) || !/\d/.test(password)) {
          throw new Error("Şifre en az 8 karakter, bir harf ve bir rakam içermelidir.");
        }
        await account.register({ fullName, email, password });
        setMode("login");
        setMessage("Hesabın oluşturuldu. Şimdi güvenle giriş yapabilirsin.");
        event.currentTarget.reset();
      } else {
        const session = await account.login({ email, password });
        await onAuthenticated(session, safeReturnPath(returnPath));
      }
    } catch (requestError) {
      setError(errorMessage(requestError, mode === "register" ? "Kayıt tamamlanamadı." : "Giriş tamamlanamadı."));
    } finally {
      setPhase("idle");
    }
  };

  return <main id="main-content" className="page auth-page"><div className="shell auth-layout">
    <AuthHero kicker="NovaStore hesabı" title={mode === "register" ? "Alışverişini tek hesapta yönet." : "Tekrar hoş geldin."} copy={mode === "register" ? "Siparişlerini, adreslerini, sepetini ve favorilerini Commerce Pro deneyiminde bir araya getir." : "Siparişlerine, adreslerine ve güvenli ödeme akışına kaldığın yerden devam et."} />
    <section className="auth-card" aria-labelledby="auth-title">
      <div className="auth-tabs" role="tablist" aria-label="Hesap işlemleri">
        <button role="tab" aria-selected={mode === "login"} className={mode === "login" ? "is-active" : ""} type="button" onClick={() => { setMode("login"); setError(""); setMessage(""); }}>Giriş yap</button>
        <button role="tab" aria-selected={mode === "register"} className={mode === "register" ? "is-active" : ""} type="button" onClick={() => { setMode("register"); setError(""); setMessage(""); }}>Hesap oluştur</button>
      </div>
      <span className="section-kicker">{mode === "login" ? "Güvenli giriş" : "Yeni üyelik"}</span>
      <h2 id="auth-title">{mode === "login" ? "Hesabına giriş yap" : "NovaStore’a katıl"}</h2>
      <p>{mode === "login" ? "E-posta adresin ve şifrenle devam et." : "Temel bilgilerini gir; ödeme bilgileri üyelik sırasında istenmez."}</p>
      {message && <div className="form-message is-success" role="status"><CheckCircle weight="fill" />{message}</div>}
      {error && <div className="form-message is-error" role="alert"><WarningCircle weight="fill" />{error}</div>}
      <form className="connected-form" onSubmit={submit}>
        {mode === "register" && <label>Ad soyad<input name="fullName" autoComplete="name" minLength="2" required /></label>}
        <label>E-posta<input name="email" type="email" autoComplete="email" required /></label>
        <label>Şifre<input name="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={mode === "register" ? 8 : undefined} required /></label>
        {mode === "register" && <label>Şifre tekrarı<input name="passwordConfirmation" type="password" autoComplete="new-password" minLength="8" required /></label>}
        {mode === "login" && <a className="form-link" href="#/sifremi-unuttum">Şifremi unuttum</a>}
        <button className="primary-button connected-submit" type="submit" disabled={phase === "submitting"}>{phase === "submitting" ? "İşlem yapılıyor…" : mode === "login" ? "Giriş yap" : "Hesap oluştur"}<CaretRight /></button>
      </form>
    </section>
  </div></main>;
}

export function CustomerPasswordPage({ account, mode, token = "" }) {
  const reset = mode === "reset";
  const [phase, setPhase] = useState("idle");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const submit = async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPhase("submitting");
    setMessage("");
    setError("");
    try {
      if (reset) {
        const password = String(form.get("password") || "");
        const confirmation = String(form.get("passwordConfirmation") || "");
        if (!token) throw new Error("Şifre sıfırlama bağlantısında güvenlik anahtarı eksik.");
        if (password !== confirmation) throw new Error("Şifre tekrarı eşleşmiyor.");
        if (password.length < 8 || !/[A-Za-zÇĞİÖŞÜçğıöşü]/.test(password) || !/\d/.test(password)) {
          throw new Error("Yeni şifre en az 8 karakter, bir harf ve bir rakam içermelidir.");
        }
        await account.resetPassword({ token, password });
        setMessage("Şifren güncellendi. Yeni şifrenle giriş yapabilirsin.");
      } else {
        const payload = await account.forgotPassword(String(form.get("email") || ""));
        setMessage(payload?.message || "E-posta adresin kayıtlıysa sıfırlama bağlantısı gönderildi.");
      }
      event.currentTarget.reset();
    } catch (requestError) {
      setError(errorMessage(requestError, "Şifre işlemi tamamlanamadı."));
    } finally {
      setPhase("idle");
    }
  };

  return <main id="main-content" className="page auth-page"><div className="shell auth-layout">
    <AuthHero kicker="Hesap güvenliği" title={reset ? "Yeni şifreni belirle." : "Hesabına yeniden eriş."} copy={reset ? "Güçlü ve daha önce kullanmadığın bir şifre seç." : "Kayıtlı e-posta adresine tek kullanımlık bağlantı göndereceğiz."} />
    <section className="auth-card">
      <span className="section-kicker">{reset ? "Şifre sıfırlama" : "Erişim desteği"}</span>
      <h2>{reset ? "Yeni şifre" : "Şifremi unuttum"}</h2>
      <p>{reset ? "Bağlantı geçerliyse şifren hemen güncellenecek." : "Güvenlik nedeniyle hesabın sistemde olup olmadığını açıklamayız."}</p>
      {message && <div className="form-message is-success" role="status"><CheckCircle weight="fill" />{message}</div>}
      {error && <div className="form-message is-error" role="alert"><WarningCircle weight="fill" />{error}</div>}
      <form className="connected-form" onSubmit={submit}>
        {reset ? <>
          <label>Yeni şifre<input name="password" type="password" autoComplete="new-password" minLength="8" required /></label>
          <label>Yeni şifre tekrarı<input name="passwordConfirmation" type="password" autoComplete="new-password" minLength="8" required /></label>
        </> : <label>E-posta<input name="email" type="email" autoComplete="email" required /></label>}
        <button className="primary-button connected-submit" type="submit" disabled={phase === "submitting"}>{phase === "submitting" ? "İşlem yapılıyor…" : reset ? "Şifremi güncelle" : "Sıfırlama bağlantısı gönder"}<CaretRight /></button>
        <a className="form-link" href="#/giris"><ArrowLeft /> Giriş ekranına dön</a>
      </form>
    </section>
  </div></main>;
}

const ACCOUNT_ITEMS = Object.freeze([
  [User, "Hesap özetim", "#/hesabim", "overview"],
  [MapPin, "Adreslerim", "#/hesabim/adresler", "addresses"],
  [Receipt, "Siparişlerim", "#/hesabim/siparisler", "orders"],
  [Heart, "Favorilerim", "#/favoriler", "favorites"],
  [Ticket, "Kuponlarım", "#/hesabim/kuponlar", "coupons"],
  [Bell, "Bildirimlerim", "#/hesabim/bildirimler", "notifications"],
  [LockKey, "Güvenlik", "#/hesabim/guvenlik", "security"],
]);

function ConnectedAccountSidebar({ section, onLogout }) {
  return <aside className="account-sidebar connected-account-sidebar"><h2>Hesabım</h2>{ACCOUNT_ITEMS.map(([Icon, label, href, id]) => <a key={id} className={section === id ? "is-active" : ""} aria-current={section === id ? "page" : undefined} href={href}><Icon />{label}<CaretRight /></a>)}<button className="account-logout" type="button" onClick={onLogout}><SignOut /> Güvenli çıkış</button></aside>;
}

const activeOrder = (order) => !["Teslim Edildi", "İptal Edildi", "İade Edildi", "Ödeme Başarısız"].includes(order.status);

function orderImage(item, productById, getProductImage) {
  if (item.image) return item.image;
  const product = item.id ? productById.get(Number(item.id)) : null;
  return product ? getProductImage(product) : null;
}

function CustomerOrderCard({ order, productById, getProductImage }) {
  const images = order.items.slice(0, 4).map((item) => ({
    key: `${item.id || item.name}-${item.quantity}`,
    name: item.name,
    src: orderImage(item, productById, getProductImage),
  }));
  return <article className="order-card connected-order-card"><div className="order-card__head"><span><strong>Sipariş No: {order.id}</strong><small>{formatDate(order.createdAt)}</small></span><span className={`status-pill is-${order.tone}`}>{order.status}</span><b>{money.format(order.total)}</b></div><div className="order-card__body"><div>{images.map((image) => image.src ? <img key={image.key} src={image.src} alt={image.name} /> : <span key={image.key} className="order-image-placeholder"><Package /></span>)}<span>{order.items.length} ürün</span></div><a href={`#/hesabim/siparisler/${order.id}`}>Sipariş detayları <CaretRight /></a></div>{order.statusNote && <p className="order-status-note">{order.statusNote}</p>}</article>;
}

function ProfileForm({ user, account, onUpdated, onNotice }) {
  const [phase, setPhase] = useState("idle");
  const [error, setError] = useState("");
  const submit = async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPhase("submitting");
    setError("");
    try {
      const updated = await account.updateProfile({
        fullName: form.get("fullName"),
        phone: form.get("phone"),
      });
      onUpdated(updated);
      onNotice("Profil bilgilerin güncellendi.");
    } catch (requestError) {
      setError(errorMessage(requestError, "Profil güncellenemedi."));
    } finally {
      setPhase("idle");
    }
  };
  return <form className="profile-editor connected-form" onSubmit={submit}><div className="profile-editor__head"><span><User /><strong>Profil bilgileri</strong><small>Ödeme ve teslimat iletişiminde kullanılacak temel bilgiler.</small></span></div>{error && <div className="form-message is-error" role="alert"><WarningCircle />{error}</div>}<div className="profile-editor__fields"><label>Ad soyad<input name="fullName" defaultValue={user.fullName} minLength="2" required /></label><label>E-posta<input value={user.email} readOnly aria-describedby="email-note" /><small id="email-note">E-posta bu ekrandan değiştirilemez.</small></label><label>Telefon<input name="phone" defaultValue={user.phone || ""} inputMode="tel" autoComplete="tel" placeholder="05xxxxxxxxx" /></label></div><button className="primary-button" type="submit" disabled={phase === "submitting"}>{phase === "submitting" ? "Kaydediliyor…" : "Bilgilerimi kaydet"}</button></form>;
}

function AccountOverview({ session, account, favoriteCount, onSessionUpdated, onNotice, productById, getProductImage }) {
  const resource = useAsyncResource((options) => account.loadDashboard(session, options), [account, session]);
  if (resource.phase !== "ready") return <InlineState phase={resource.phase} error={resource.error} onRetry={resource.reload} />;
  const dashboard = resource.data;
  const currentOrders = dashboard.orders.filter(activeOrder);
  return <>
    <div className="commerce-heading"><div><span className="section-kicker">Hoş geldin</span><h1>{session.user.fullName ? `${session.user.fullName.split(/\s+/)[0]}, hesabın hazır.` : "Hesabın hazır."}</h1><p>Siparişlerini, adreslerini ve favorilerini tek yerden yönet.</p></div></div>
    {dashboard.warnings.length > 0 && <div className="form-message is-warning" role="status"><WarningCircle />Bazı hesap bölümleri şu anda alınamadı; erişilebilen bilgiler gösteriliyor.</div>}
    <div className="account-stats"><a href="#/hesabim/siparisler"><Receipt /><span><strong>{currentOrders.length}</strong><small>Aktif sipariş</small></span></a><a href="#/favoriler"><Heart /><span><strong>{favoriteCount}</strong><small>Favori ürün</small></span></a><a href="#/hesabim/adresler"><MapPin /><span><strong>{dashboard.addresses.length}</strong><small>Kayıtlı adres</small></span></a><a href="#/hesabim/kuponlar"><Ticket /><span><strong>{dashboard.coupons.length}</strong><small>Aktif kupon</small></span></a></div>
    <ProfileForm user={session.user} account={account} onUpdated={onSessionUpdated} onNotice={onNotice} />
    <h2>Son siparişlerin</h2>
    {dashboard.orders.length ? <div className="order-list">{dashboard.orders.slice(0, 3).map((order) => <CustomerOrderCard key={order.id} order={order} productById={productById} getProductImage={getProductImage} />)}</div> : <div className="connected-empty is-compact"><ShoppingBag /><h3>Henüz siparişin yok</h3><p>Katalogdaki ürünleri keşfederek ilk siparişini oluşturabilirsin.</p><a className="primary-button" href="#/">Alışverişe başla</a></div>}
  </>;
}

function OrdersSection({ session, account, orderId, productById, getProductImage, onNotice }) {
  const resource = useAsyncResource((options) => account.listOrders(session, options), [account, session]);
  const [sort, setSort] = useState("date");
  const [cancelPhase, setCancelPhase] = useState("idle");
  const [cancelError, setCancelError] = useState("");
  if (resource.phase !== "ready") return <InlineState phase={resource.phase} error={resource.error} onRetry={resource.reload} />;
  const orders = resource.data;
  const selected = orderId ? orders.find((order) => String(order.id) === String(orderId)) : null;

  const cancel = async (order) => {
    if (!window.confirm(`${order.id} numaralı sipariş için iptal talebi göndermek istiyor musun?`)) return;
    setCancelPhase("submitting");
    setCancelError("");
    try {
      await account.cancelOrder(order, { reasonCode: "CUSTOMER_REQUEST", note: "Müşteri hesabından iptal talebi." });
      onNotice("Sipariş iptal işlemi tamamlandı.");
      resource.reload();
    } catch (requestError) {
      setCancelError(errorMessage(requestError, "Sipariş iptal edilemedi."));
    } finally {
      setCancelPhase("idle");
    }
  };

  if (orderId && !selected) return <div className="connected-empty"><Receipt /><h2>Sipariş bulunamadı</h2><p>Bu sipariş hesabına ait olmayabilir veya kayıt artık erişilebilir değildir.</p><a className="primary-button" href="#/hesabim/siparisler">Siparişlerime dön</a></div>;
  if (selected) {
    const trackingUrl = safeTrackingUrl(selected.trackingUrl);
    return <>
      <a className="back-link" href="#/hesabim/siparisler"><ArrowLeft /> Siparişlerime dön</a>
      <div className="commerce-heading"><div><span className="section-kicker">Sipariş detayı</span><h1>Sipariş #{selected.id}</h1><p>{formatDate(selected.createdAt)}</p></div><span className={`status-pill is-${selected.tone}`}>{selected.status}</span></div>
      {selected.statusNote && <div className="form-message is-warning"><WarningCircle />{selected.statusNote}</div>}
      {cancelError && <div className="form-message is-error" role="alert"><WarningCircle />{cancelError}</div>}
      <div className="order-detail-products">{selected.items.length ? selected.items.map((item, index) => { const image = orderImage(item, productById, getProductImage); return <div key={`${item.id || item.name}-${index}`}>{image ? <img src={image} alt={item.name} /> : <span className="order-detail-placeholder"><Package /></span>}<span><strong>{item.name}</strong><small>{item.quantity} adet</small></span><b>{money.format(item.price * item.quantity)}</b></div>; }) : <div className="order-items-unavailable"><Package /><span><strong>Ürün özeti alınamadı</strong><small>Sipariş toplamı ve durumu korunuyor.</small></span></div>}</div>
      <div className="order-detail-grid"><div><MapPin /><span><strong>Teslimat adresi</strong><p>{selected.address || "Adres özeti bu sipariş kaydında bulunmuyor."}</p></span></div><div><CreditCard /><span><strong>Ödeme</strong><p>{selected.paymentStatus ? paymentStatusLabel(selected.paymentStatus) : selected.paymentMethod || "Ödeme durumu sipariş kaydında gösterilecek."}</p></span></div>{selected.trackingNo || trackingUrl ? <div><Truck /><span><strong>Kargo takibi</strong><p>{selected.trackingNo ? `Takip no: ${selected.trackingNo}` : "Takip bağlantısı hazır."}{selected.etaDate ? ` · Tahmini teslimat ${formatDate(selected.etaDate, false)}` : ""}</p>{trackingUrl && <a href={trackingUrl} target="_blank" rel="noopener noreferrer">Taşıyıcı sayfasını aç <CaretRight /></a>}</span></div> : null}</div>
      {selected.cancellable && <div className="order-danger-zone"><span><strong>Sipariş iptali</strong><small>İptal ve olası iade koşulları güncel sipariş durumuna göre sunucu tarafından doğrulanır.</small></span><button type="button" disabled={cancelPhase === "submitting"} onClick={() => cancel(selected)}>{cancelPhase === "submitting" ? "İşleniyor…" : "İptal talebi gönder"}</button></div>}
    </>;
  }

  const displayed = sort === "status"
    ? [...orders].sort((left, right) => left.status.localeCompare(right.status, "tr"))
    : orders;
  return <>
    <div className="commerce-heading"><div><span className="section-kicker">Hesabım</span><h1>Siparişlerim</h1><p>{orders.length} sipariş bulundu.</p></div><select aria-label="Siparişleri sırala" value={sort} onChange={(event) => setSort(event.target.value)}><option value="date">Tarihe göre: yeni → eski</option><option value="status">Duruma göre</option></select></div>
    {orders.length ? <div className="order-list">{displayed.map((order) => <CustomerOrderCard key={order.id} order={order} productById={productById} getProductImage={getProductImage} />)}</div> : <div className="connected-empty"><ShoppingBag /><h2>Henüz siparişin yok</h2><p>İlk siparişinden sonra tüm süreçleri bu ekrandan takip edebilirsin.</p><a className="primary-button" href="#/">Ürünleri keşfet</a></div>}
  </>;
}

const EMPTY_ADDRESS = Object.freeze({
  title: "",
  fullName: "",
  phone: "",
  city: "",
  district: "",
  addressLine: "",
  isDefault: false,
});

function AddressEditor({ initial = EMPTY_ADDRESS, onSubmit, onCancel, busy }) {
  const submit = (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    onSubmit({
      title: form.get("title"),
      fullName: form.get("fullName"),
      phone: form.get("phone"),
      city: form.get("city"),
      district: form.get("district"),
      addressLine: form.get("addressLine"),
      isDefault: form.get("isDefault") === "on",
    });
  };
  return <form className="address-editor connected-form" onSubmit={submit}><div className="address-editor__grid"><label>Adres başlığı<input name="title" defaultValue={initial.title} placeholder="Ev, İş…" required /></label><label>Alıcı adı<input name="fullName" defaultValue={initial.fullName} autoComplete="name" required /></label><label>Telefon<input name="phone" defaultValue={initial.phone} inputMode="tel" autoComplete="tel" placeholder="05xxxxxxxxx" required /></label><label>İl<input name="city" defaultValue={initial.city} autoComplete="address-level1" required /></label><label>İlçe<input name="district" defaultValue={initial.district} autoComplete="address-level2" required /></label><label className="is-wide">Açık adres<textarea name="addressLine" defaultValue={initial.addressLine} rows="4" autoComplete="street-address" required /></label><label className="connected-check is-wide"><input name="isDefault" type="checkbox" defaultChecked={initial.isDefault} /> Bu adresi varsayılan yap</label></div><div className="form-actions"><button type="button" onClick={onCancel}>Vazgeç</button><button className="primary-button" type="submit" disabled={busy}>{busy ? "Kaydediliyor…" : "Adresi kaydet"}</button></div></form>;
}

function AddressesSection({ account, user, onNotice }) {
  const resource = useAsyncResource((options) => account.listAddresses(options), [account]);
  const [editing, setEditing] = useState(null);
  const [showEditor, setShowEditor] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (resource.phase !== "ready") return <InlineState phase={resource.phase} error={resource.error} onRetry={resource.reload} />;
  const addresses = resource.data;
  const startNew = () => { setEditing(null); setShowEditor(true); setError(""); };
  const save = async (value) => {
    setBusy(true); setError("");
    try {
      if (editing) await account.updateAddress(editing.id, value);
      else await account.createAddress(value);
      setShowEditor(false); setEditing(null); resource.reload();
      onNotice(editing ? "Adres güncellendi." : "Adres eklendi.");
    } catch (requestError) {
      setError(errorMessage(requestError, "Adres kaydedilemedi."));
    } finally { setBusy(false); }
  };
  const remove = async (address) => {
    if (!window.confirm(`“${address.title}” adresini silmek istiyor musun?`)) return;
    setBusy(true); setError("");
    try { await account.deleteAddress(address.id); resource.reload(); onNotice("Adres silindi."); }
    catch (requestError) { setError(errorMessage(requestError, "Adres silinemedi.")); }
    finally { setBusy(false); }
  };
  const makeDefault = async (address) => {
    setBusy(true); setError("");
    try { await account.setDefaultAddress(address.id); resource.reload(); onNotice("Varsayılan adres güncellendi."); }
    catch (requestError) { setError(errorMessage(requestError, "Varsayılan adres seçilemedi.")); }
    finally { setBusy(false); }
  };
  const editorInitial = editing || { ...EMPTY_ADDRESS, fullName: user.fullName, phone: user.phone || "" };
  return <>
    <div className="commerce-heading"><div><span className="section-kicker">Hesabım</span><h1>Adreslerim</h1><p>Teslimat bilgilerini güvenle ekle ve güncelle.</p></div><button className="primary-button" type="button" onClick={startNew}><Plus /> Yeni adres</button></div>
    {error && <div className="form-message is-error" role="alert"><WarningCircle />{error}</div>}
    {showEditor && <AddressEditor key={editing?.id || "new"} initial={editorInitial} busy={busy} onSubmit={save} onCancel={() => { setShowEditor(false); setEditing(null); }} />}
    <div className="connected-address-grid">{addresses.map((address) => <article key={address.id} className={address.isDefault ? "is-default" : ""}><div className="address-card__head"><MapPin /><span><strong>{address.title}</strong>{address.isDefault && <small>Varsayılan</small>}</span></div><p><strong>{address.fullName}</strong><br />{address.addressLine}<br />{address.district} / {address.city}<br />{address.phone}</p><div className="address-card__actions"><button type="button" onClick={() => { setEditing(address); setShowEditor(true); setError(""); }}><PencilSimple /> Düzenle</button>{!address.isDefault && <button type="button" onClick={() => makeDefault(address)} disabled={busy}><Check /> Varsayılan yap</button>}<button className="is-danger" type="button" onClick={() => remove(address)} disabled={busy}><Trash /> Sil</button></div></article>)}{!addresses.length && !showEditor && <button className="address-add-card" type="button" onClick={startNew}><Plus /><strong>İlk adresini ekle</strong><span>Ödeme sırasında seçebilmek için teslimat bilgilerini kaydet.</span></button>}</div>
  </>;
}

function CouponsSection({ account, onNotice }) {
  const resource = useAsyncResource((options) => account.listCoupons(options), [account]);
  if (resource.phase !== "ready") return <InlineState phase={resource.phase} error={resource.error} onRetry={resource.reload} />;
  const coupons = resource.data;
  const copy = async (code) => {
    try { await navigator.clipboard.writeText(code); onNotice(`${code} kupon kodu kopyalandı.`); }
    catch { onNotice(`Kupon kodu: ${code}`); }
  };
  return <><div className="commerce-heading"><div><span className="section-kicker">Hesabım</span><h1>Kuponlarım</h1><p>Yalnız şu anda aktif olan gerçek kuponlar gösterilir.</p></div></div>{coupons.length ? <div className="connected-coupon-grid">{coupons.map((coupon) => <article key={coupon.id || coupon.code}><Ticket /><div><span>Kupon kodu</span><h2>{coupon.code}</h2><p>{coupon.type === "PERCENT" ? `%${coupon.value} indirim` : `${money.format(coupon.value)} indirim`}{coupon.minOrderAmount > 0 ? ` · En az ${money.format(coupon.minOrderAmount)} sepet` : ""}</p>{coupon.endsAt && <small><Clock /> {formatDate(coupon.endsAt, false)} tarihine kadar</small>}</div><button type="button" onClick={() => copy(coupon.code)}><Copy /> Kopyala</button></article>)}</div> : <div className="connected-empty"><Ticket /><h2>Aktif kupon bulunmuyor</h2><p>Yeni bir kupon tanımlandığında burada görünecek.</p></div>}</>;
}

const notificationIcon = (type) => {
  if (type === "order_update") return Truck;
  if (type === "new_review" || type === "question_answered") return ChatCircleText;
  if (type === "welcome") return CheckCircle;
  return Bell;
};

function NotificationsSection({ session, account, onNotice }) {
  const resource = useAsyncResource((options) => account.listNotifications(session, options), [account, session]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (resource.phase !== "ready") return <InlineState phase={resource.phase} error={resource.error} onRetry={resource.reload} />;
  const notifications = resource.data;
  const markOne = async (item) => {
    if (item.isRead) return;
    setBusy(true); setError("");
    try { await account.markNotificationRead(item.id); resource.reload(); }
    catch (requestError) { setError(errorMessage(requestError, "Bildirim güncellenemedi.")); }
    finally { setBusy(false); }
  };
  const markAll = async () => {
    setBusy(true); setError("");
    try { await account.markAllNotificationsRead(session); resource.reload(); onNotice("Tüm bildirimler okundu olarak işaretlendi."); }
    catch (requestError) { setError(errorMessage(requestError, "Bildirimler güncellenemedi.")); }
    finally { setBusy(false); }
  };
  return <><div className="commerce-heading"><div><span className="section-kicker">Hesabım</span><h1>Bildirimlerim</h1><p>Sipariş ve hesap güncellemelerin.</p></div>{notifications.some((item) => !item.isRead) && <button className="secondary-action" type="button" onClick={markAll} disabled={busy}>Tümünü okundu yap</button>}</div>{error && <div className="form-message is-error"><WarningCircle />{error}</div>}{notifications.length ? <div className="notification-list connected-notifications">{notifications.map((item) => { const Icon = notificationIcon(item.type); return <button key={item.id} type="button" className={item.isRead ? "is-read" : "is-unread"} onClick={() => markOne(item)} disabled={busy}><Icon /><span><strong>{item.message}</strong><small>{formatDate(item.createdAt)}</small></span>{!item.isRead && <i aria-label="Okunmadı" />}</button>; })}</div> : <div className="connected-empty"><Bell /><h2>Henüz bildirimin yok</h2><p>Sipariş ve hesap güncellemeleri burada gösterilecek.</p></div>}</>;
}

function SecuritySection({ account, onNotice }) {
  const [phase, setPhase] = useState("idle");
  const [error, setError] = useState("");
  const submit = async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const currentPassword = String(form.get("currentPassword") || "");
    const newPassword = String(form.get("newPassword") || "");
    const confirmation = String(form.get("confirmation") || "");
    setError("");
    if (newPassword !== confirmation) { setError("Yeni şifre tekrarı eşleşmiyor."); return; }
    if (newPassword.length < 8 || !/[A-Za-zÇĞİÖŞÜçğıöşü]/.test(newPassword) || !/\d/.test(newPassword)) { setError("Yeni şifre en az 8 karakter, bir harf ve bir rakam içermelidir."); return; }
    setPhase("submitting");
    try { await account.changePassword({ currentPassword, newPassword }); event.currentTarget.reset(); onNotice("Şifren güvenle güncellendi."); }
    catch (requestError) { setError(errorMessage(requestError, "Şifre güncellenemedi.")); }
    finally { setPhase("idle"); }
  };
  return <><div className="commerce-heading"><div><span className="section-kicker">Hesap güvenliği</span><h1>Şifremi değiştir</h1><p>Yeni şifren en az 8 karakter, bir harf ve bir rakam içermelidir.</p></div></div><form className="security-form connected-form" onSubmit={submit}><Key />{error && <div className="form-message is-error"><WarningCircle />{error}</div>}<label>Mevcut şifre<input name="currentPassword" type="password" autoComplete="current-password" required /></label><label>Yeni şifre<input name="newPassword" type="password" autoComplete="new-password" minLength="8" required /></label><label>Yeni şifre tekrarı<input name="confirmation" type="password" autoComplete="new-password" minLength="8" required /></label><button className="primary-button" type="submit" disabled={phase === "submitting"}>{phase === "submitting" ? "Güncelleniyor…" : "Şifremi güncelle"}</button></form></>;
}

export function CustomerAccountPage({
  session,
  account,
  section = "overview",
  orderId = null,
  favoriteCount = 0,
  products = [],
  getProductImage,
  onSessionUpdated,
  onLogout,
  onNotice,
}) {
  const productById = useMemo(() => new Map(products.map((product) => [Number(product.id), product])), [products]);
  const activeSection = section === "order-detail" ? "orders" : section;
  let content;
  if (section === "overview") content = <AccountOverview session={session} account={account} favoriteCount={favoriteCount} onSessionUpdated={onSessionUpdated} onNotice={onNotice} productById={productById} getProductImage={getProductImage} />;
  else if (section === "orders" || section === "order-detail") content = <OrdersSection session={session} account={account} orderId={orderId} productById={productById} getProductImage={getProductImage} onNotice={onNotice} />;
  else if (section === "addresses") content = <AddressesSection account={account} user={session.user} onNotice={onNotice} />;
  else if (section === "coupons") content = <CouponsSection account={account} onNotice={onNotice} />;
  else if (section === "notifications") content = <NotificationsSection session={session} account={account} onNotice={onNotice} />;
  else if (section === "security") content = <SecuritySection account={account} onNotice={onNotice} />;
  else content = <div className="connected-empty"><WarningCircle /><h2>Hesap bölümü bulunamadı</h2><a className="primary-button" href="#/hesabim">Hesap özetine dön</a></div>;

  return <main id="main-content" className="page commerce-page"><div className="shell"><div className="account-layout"><ConnectedAccountSidebar section={activeSection} onLogout={onLogout} /><section className="account-content">{content}</section></div></div></main>;
}

function CheckoutStepper({ step }) {
  const steps = [["delivery", "Teslimat"], ["payment", "Ödeme"], ["review", "Onay"]];
  const current = steps.findIndex(([id]) => id === step);
  return <ol className="checkout-stepper" aria-label="Ödeme adımları">{steps.map(([id, label], index) => <li key={id} className={index <= current ? "is-active" : ""} aria-current={id === step ? "step" : undefined}><span>{index < current ? <Check /> : index + 1}</span><strong>{label}</strong></li>)}</ol>;
}

function CheckoutSummary({ quote, phase, error, couponInput, onCouponInput, onApplyCoupon, onClearCoupon, couponBusy }) {
  if (phase === "loading") return <aside className="order-summary checkout-summary"><div className="connected-inline-state"><span className="integration-spinner" /><strong>Fiyatlar doğrulanıyor</strong></div></aside>;
  if (phase === "error" || !quote) return <aside className="order-summary checkout-summary"><div className="connected-inline-state is-error"><WarningCircle /><strong>{errorMessage(error, "Güncel fiyatlar alınamadı.")}</strong></div></aside>;
  const totals = quote.totals;
  const couponApplied = quote.coupon?.applied === true;
  return <aside className="order-summary checkout-summary"><h2>Sipariş Özeti</h2><dl><div><dt>Ara toplam</dt><dd>{money.format(totals.subtotal)}</dd></div>{totals.bundleDiscount > 0 && <div className="discount-row"><dt>Sepet avantajı</dt><dd>−{money.format(totals.bundleDiscount)}</dd></div>}{totals.couponDiscount > 0 && <div className="discount-row"><dt>Kupon indirimi</dt><dd>−{money.format(totals.couponDiscount)}</dd></div>}<div><dt>Kargo</dt><dd>{totals.shippingFee > 0 ? money.format(totals.shippingFee) : "Ücretsiz"}</dd></div><div className="order-total"><dt>Toplam</dt><dd>{money.format(totals.total)}</dd></div></dl><form className="coupon-form connected-coupon-form" onSubmit={onApplyCoupon}><label htmlFor="connected-coupon">İndirim kodu</label><div><input id="connected-coupon" value={couponInput} onChange={(event) => onCouponInput(event.target.value)} placeholder="Kupon kodunu gir" disabled={couponBusy} /><button type="submit" disabled={couponBusy || !couponInput.trim()}>{couponBusy ? "Kontrol…" : "Uygula"}</button></div>{quote.coupon?.code && <small className={couponApplied ? "is-success" : "is-error"}>{couponApplied ? `${quote.coupon.code} uygulandı.` : quote.coupon.reason || "Kupon uygulanamadı."}{couponApplied && <button type="button" onClick={onClearCoupon}>Kaldır</button>}</small>}</form><small className="summary-security"><ShieldCheck /> Tutarlar NovaStore fiyatlandırma servisiyle doğrulandı.</small></aside>;
}

function CheckoutAddressCards({ addresses, selectedId, onSelect }) {
  return <div className="address-grid connected-checkout-addresses">{addresses.map((address) => <label key={address.id} className={Number(selectedId) === Number(address.id) ? "is-selected" : ""}><input type="radio" name="checkoutAddress" checked={Number(selectedId) === Number(address.id)} onChange={() => onSelect(address.id)} /><strong>{address.title}{address.isDefault ? " · Varsayılan" : ""}</strong><span>{address.fullName}</span><p>{address.addressLine}<br />{address.district} / {address.city}<br />{address.phone}</p></label>)}</div>;
}

export function CustomerCheckoutPage({
  step,
  session,
  account,
  checkout,
  items,
  getProductImage,
  onStepChange,
  onNotice,
}) {
  const addressesResource = useAsyncResource((options) => account.listAddresses(options), [account]);
  const [selectedAddressId, setSelectedAddressId] = useState(null);
  const [showAddressEditor, setShowAddressEditor] = useState(false);
  const [addressBusy, setAddressBusy] = useState(false);
  const [addressError, setAddressError] = useState("");
  const [quoteState, setQuoteState] = useState({ phase: "loading", data: null, error: null });
  const [couponInput, setCouponInput] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState(null);
  const [couponBusy, setCouponBusy] = useState(false);
  const [consent, setConsent] = useState(false);
  const [submitPhase, setSubmitPhase] = useState("idle");
  const [submitError, setSubmitError] = useState("");
  const hasStockIssues = items.some(({ product, quantity }) => product.stock <= 0 || quantity > product.stock);

  const loadQuote = useCallback(async (couponCode = null, signal = undefined) => {
    setQuoteState((current) => ({ phase: "loading", data: current.data, error: null }));
    try {
      const next = await checkout.quote(items, couponCode, { signal });
      setQuoteState({ phase: "ready", data: next, error: null });
      return next;
    } catch (error) {
      if (error?.code !== "CUSTOMER_ABORTED") setQuoteState({ phase: "error", data: null, error });
      throw error;
    }
  }, [checkout, items]);

  useEffect(() => {
    if (!items.length || hasStockIssues) return undefined;
    const controller = new AbortController();
    loadQuote(appliedCoupon, controller.signal).catch(() => {});
    return () => controller.abort("effect-cleanup");
  }, [loadQuote, appliedCoupon, items.length, hasStockIssues]);

  useEffect(() => {
    if (addressesResource.phase !== "ready" || selectedAddressId) return;
    const addresses = addressesResource.data;
    const preferred = addresses.find((address) => address.isDefault) || addresses[0];
    if (preferred) setSelectedAddressId(preferred.id);
  }, [addressesResource.phase, addressesResource.data, selectedAddressId]);

  if (!items.length) return <main id="main-content" className="page commerce-page"><div className="shell"><div className="large-empty"><ShoppingBag /><h1>Ödemeye devam etmek için sepetine ürün ekle</h1><p>Sepetin boş olduğu için ödeme işlemi başlatılmadı.</p><a className="primary-button" href="#/">Ürünleri keşfet</a></div></div></main>;
  if (hasStockIssues) return <main id="main-content" className="page commerce-page"><div className="shell"><div className="large-empty"><WarningCircle /><h1>Sepetindeki stok sorununu düzelt</h1><p>Stokta olmayan veya miktarı güncel stoğu aşan ürünler için ödeme başlatılmaz. Sepete dönüp miktarı azaltarak ya da ürünü kaldırarak devam edebilirsin.</p><a className="primary-button" href="#/sepet">Sepete dön</a></div></div></main>;

  const addresses = addressesResource.data || [];
  const selectedAddress = addresses.find((address) => Number(address.id) === Number(selectedAddressId)) || null;
  const quote = quoteState.data;

  const addAddress = async (value) => {
    setAddressBusy(true); setAddressError("");
    try {
      const saved = await account.createAddress(value);
      setShowAddressEditor(false);
      setSelectedAddressId(saved?.id || null);
      addressesResource.reload();
      onNotice("Teslimat adresi kaydedildi.");
    } catch (error) {
      setAddressError(errorMessage(error, "Adres kaydedilemedi."));
    } finally { setAddressBusy(false); }
  };

  const applyCoupon = async (event) => {
    event.preventDefault();
    const code = couponInput.trim().toLocaleUpperCase("tr-TR");
    if (!code) return;
    setCouponBusy(true);
    try {
      const next = await checkout.quote(items, code);
      setQuoteState({ phase: "ready", data: next, error: null });
      if (next.coupon?.applied) {
        setAppliedCoupon(code);
        setCouponInput(code);
        onNotice("Kupon güncel sepet toplamına uygulandı.");
      } else {
        setAppliedCoupon(null);
      }
    } catch (error) {
      setQuoteState({ phase: "error", data: null, error });
    } finally { setCouponBusy(false); }
  };

  const clearCoupon = () => {
    setAppliedCoupon(null);
    setCouponInput("");
  };

  const submitPayment = async () => {
    if (!selectedAddress) { setSubmitError("Teslimat adresi seçmelisin."); onStepChange("delivery"); return; }
    if (!consent) { setSubmitError("Ödeme yönlendirmesinden önce bilgilendirmeyi onaylamalısın."); onStepChange("payment"); return; }
    if (quoteState.phase !== "ready" || !quote) { setSubmitError("Güncel sipariş toplamı doğrulanmadan ödeme başlatılamaz."); return; }
    setSubmitPhase("submitting"); setSubmitError("");
    try {
      const result = await checkout.initialize({
        session,
        address: selectedAddress,
        items,
        couponCode: appliedCoupon,
      });
      checkout.handoff(result, items);
    } catch (error) {
      setSubmitError(errorMessage(error, "Güvenli ödeme başlatılamadı."));
      setSubmitPhase("idle");
    }
  };

  return <main id="main-content" className="page checkout-page"><div className="shell">
    <div className="checkout-title"><span className="section-kicker">NovaStore güvencesi</span><h1>Güvenli Ödeme</h1><p>Adres, fiyat ve ödeme yönlendirmesi gerçek NovaStore sözleşmeleriyle doğrulanır.</p></div>
    <CheckoutStepper step={step} />
    {submitError && <div className="form-message is-error checkout-global-error" role="alert"><WarningCircle />{submitError}</div>}
    <div className="checkout-layout"><section className="checkout-panel">
      {step === "delivery" && <>
        <div className="checkout-panel__head"><div><MapPin /><span><strong>Teslimat Bilgileri</strong><small>Kayıtlı adreslerinden birini seç veya yeni adres ekle.</small></span></div><button type="button" aria-expanded={showAddressEditor} onClick={() => setShowAddressEditor((value) => !value)}>Adres ekle</button></div>
        {addressError && <div className="form-message is-error"><WarningCircle />{addressError}</div>}
        {showAddressEditor && <AddressEditor initial={{ ...EMPTY_ADDRESS, fullName: session.user.fullName, phone: session.user.phone || "" }} busy={addressBusy} onSubmit={addAddress} onCancel={() => setShowAddressEditor(false)} />}
        {addressesResource.phase !== "ready" ? <InlineState phase={addressesResource.phase} error={addressesResource.error} onRetry={addressesResource.reload} /> : addresses.length ? <CheckoutAddressCards addresses={addresses} selectedId={selectedAddressId} onSelect={setSelectedAddressId} /> : !showAddressEditor && <div className="connected-empty is-compact"><MapPin /><h2>Teslimat adresi ekle</h2><p>Ödemeye devam edebilmek için geçerli bir adres gereklidir.</p><button className="primary-button" type="button" onClick={() => setShowAddressEditor(true)}>Adres ekle</button></div>}
        <div className="checkout-delivery-note"><Truck /><span><strong>Standart teslimat</strong><small>Kargo ücreti güncel sepet toplamına göre fiyatlandırma servisi tarafından hesaplanır.</small></span><b>{quoteState.phase === "ready" ? quote.totals.shippingFee > 0 ? money.format(quote.totals.shippingFee) : "Ücretsiz" : "Hesaplanıyor"}</b></div>
        <button className="primary-button checkout-next" type="button" disabled={!selectedAddress || quoteState.phase !== "ready"} onClick={() => onStepChange("payment")}>Ödemeye devam et <CaretRight /></button>
      </>}
      {step === "payment" && <>
        <div className="checkout-panel__head"><div><CreditCard /><span><strong>Ödeme Yöntemi</strong><small>Kart bilgileri NovaStore arayüzünde alınmaz veya saklanmaz.</small></span></div></div>
        <div className="payment-method is-selected connected-payment-method"><CreditCard /><span><strong>Kredi / Banka Kartı</strong><small>Devam ettiğinde yapılandırılmış güvenli ödeme sağlayıcısı ekranı açılır.</small></span><ShieldCheck weight="fill" /></div>
        <div className="payment-provider-disclosure"><LockKey /><div><strong>Kart bilgilerin ödeme sağlayıcısına girilir</strong><p>NovaStore yalnız sipariş, teslimat ve doğrulanmış toplam bilgilerini iletir. Bu sayfa kart numarası, son kullanma tarihi veya CVV toplamaz.</p></div></div>
        <label className="secure-consent"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /> <span>Sipariş özetini kontrol ettiğimi ve kart bilgilerimi güvenli ödeme sağlayıcısı ekranında gireceğimi onaylıyorum.</span></label>
        <div className="checkout-navigation"><button type="button" onClick={() => onStepChange("delivery")}><ArrowLeft /> Geri</button><button className="primary-button" type="button" disabled={!consent} onClick={() => onStepChange("review")}>Siparişi kontrol et <CaretRight /></button></div>
      </>}
      {step === "review" && <>
        <div className="checkout-panel__head"><div><Receipt /><span><strong>Siparişini Kontrol Et</strong><small>Ödeme sağlayıcısına geçmeden önce adres ve ürünleri doğrula.</small></span></div></div>
        {selectedAddress ? <div className="review-box"><span>Teslimat</span><strong>{selectedAddress.title}</strong><p>{selectedAddress.fullName} · {selectedAddress.addressLine}, {selectedAddress.district} / {selectedAddress.city}</p></div> : <div className="form-message is-error"><WarningCircle />Teslimat adresi seçilmedi.</div>}
        <div className="review-products">{items.map(({ product, quantity }) => <div key={product.id}><img src={getProductImage(product)} alt="" /><span><strong>{product.name}</strong><small>{quantity} adet</small></span><b>{money.format(product.price * quantity)}</b></div>)}</div>
        <div className="checkout-navigation"><button type="button" onClick={() => onStepChange("payment")}><ArrowLeft /> Geri</button><button className="primary-button" type="button" disabled={submitPhase === "submitting" || quoteState.phase !== "ready" || !selectedAddress || !consent} onClick={submitPayment}><ShieldCheck /> {submitPhase === "submitting" ? "Güvenli ödeme hazırlanıyor…" : "Güvenli ödeme ekranına geç"}</button></div>
      </>}
    </section><CheckoutSummary quote={quote} phase={quoteState.phase} error={quoteState.error} couponInput={couponInput} onCouponInput={setCouponInput} onApplyCoupon={applyCoupon} onClearCoupon={clearCoupon} couponBusy={couponBusy} /></div>
    {step === "review" && quoteState.phase === "ready" && <div className="mobile-checkout-bar"><span><small>Doğrulanmış toplam</small><strong>{money.format(quote.totals.total)}</strong></span><button type="button" disabled={submitPhase === "submitting" || !selectedAddress || !consent} onClick={submitPayment}><ShieldCheck /> Ödemeye geç</button></div>}
  </div></main>;
}

const paymentView = (result) => {
  if (result.nextAction === "WAIT_REFUND_REVIEW") return { tone: "warning", title: "İade incelemesi bekleniyor", action: "orders" };
  if (result.nextAction === "WAIT_RECONCILIATION" || result.reconciliationRequired === true) return { tone: "warning", title: "Ödeme mutabakatı bekleniyor", action: "orders" };
  if (result.providerFinalized === true && result.commerceFinalized === true && result.paymentStatus === "PAID") return { tone: "success", title: "Ödeme başarılı", action: "orders", finalized: true };
  if (result.providerFinalized === true && result.commerceFinalized === true && result.paymentStatus === "FAILED") return { tone: "danger", title: "Ödeme tamamlanamadı", action: "retry" };
  if (result.paymentStatus === "REFUNDED") return { tone: "info", title: "Ödeme iade edildi", action: "orders", finalized: true };
  return { tone: "info", title: "Ödeme onayı bekleniyor", action: "refresh" };
};

export function CustomerPaymentResultPage({ checkout, paymentRef, orderId, onFinalized }) {
  const resource = useAsyncResource((options) => checkout.getPaymentStatus({ paymentRef, orderId }, options), [checkout, paymentRef, orderId]);
  const consumedRef = useRef("");
  useEffect(() => {
    if (resource.phase !== "ready") return;
    const result = resource.data;
    const view = paymentView(result);
    const shouldConsume = view.finalized || (
      result.providerFinalized === true
      && result.paymentStatus === "PAID"
      && ["WAIT_REFUND_REVIEW", "WAIT_RECONCILIATION"].includes(result.nextAction)
    );
    const key = `${result.orderId}:${result.paymentRef}`;
    if (!shouldConsume || consumedRef.current === key) return;
    consumedRef.current = key;
    const purchasedItems = checkout.consumeFinalizedCheckout({
      paymentRef: result.paymentRef,
      orderId: result.orderId,
    });
    if (purchasedItems.length) onFinalized(purchasedItems);
  }, [checkout, onFinalized, resource.phase, resource.data]);

  if (resource.phase !== "ready") return <main id="main-content" className="page success-page"><div className="shell"><section className="success-card connected-payment-result"><InlineState phase={resource.phase} error={resource.error} onRetry={resource.reload} /></section></div></main>;
  const result = resource.data;
  const view = paymentView(result);
  return <main id="main-content" className="page success-page"><div className="shell"><section className={`success-card connected-payment-result is-${view.tone}`}><div className="success-icon">{view.tone === "success" ? <Check /> : view.tone === "danger" ? <WarningCircle /> : <Clock />}</div><span className="section-kicker">Ödeme sonucu</span><h1>{view.title}</h1><p>{result.message || "Ödeme durumu güvenli şekilde kontrol edildi."}</p><div className="success-meta"><div><small>Sipariş no</small><strong>{result.orderId}</strong></div><div><small>Ödeme referansı</small><strong>{result.paymentRef}</strong></div><div><small>Durum</small><strong>{paymentStatusLabel(result.paymentStatus)}</strong></div></div><div className="success-actions">{view.action === "retry" && <a className="primary-button" href="#/odeme/teslimat">Ödemeyi yeniden dene</a>}{view.action === "refresh" && <button className="primary-button" type="button" onClick={resource.reload}>Durumu yenile</button>}<a href="#/hesabim/siparisler">Siparişlerime git <CaretRight /></a></div></section></div></main>;
}

export function CustomerTrackingPage({ session, account, products = [], getProductImage }) {
  const resource = useAsyncResource((options) => account.listOrders(session, options), [account, session]);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [searched, setSearched] = useState(false);
  const productById = useMemo(() => new Map(products.map((product) => [Number(product.id), product])), [products]);
  const submit = (event) => {
    event.preventDefault();
    const digits = query.replace(/\D/g, "");
    setSelectedId(digits ? Number(digits) : null);
    setSearched(true);
  };
  const order = resource.phase === "ready" ? resource.data.find((item) => Number(item.id) === Number(selectedId)) : null;
  return <main id="main-content" className="page help-page"><div className="shell"><div className="help-hero compact"><Truck /><span className="section-kicker">Güvenli teslimat takibi</span><h1>Siparişini takip et</h1><p>Yalnız hesabına ait siparişler içinde arama yapılır; e-posta veya sipariş bilgisi dışarıya açılmaz.</p></div><form className="tracking-form connected-tracking-form" onSubmit={submit}><label>Sipariş numarası<input value={query} onChange={(event) => setQuery(event.target.value)} inputMode="numeric" placeholder="Sipariş numaran" required /></label><button className="primary-button" type="submit">Siparişi bul</button></form>{resource.phase !== "ready" ? <InlineState phase={resource.phase} error={resource.error} onRetry={resource.reload} /> : order ? <div className="tracking-result"><CustomerOrderCard order={order} productById={productById} getProductImage={getProductImage} />{(order.trackingNo || safeTrackingUrl(order.trackingUrl)) && <div className="tracking-secure-result"><Truck /><span><strong>{order.trackingNo ? `Takip no: ${order.trackingNo}` : "Taşıyıcı bağlantısı hazır"}</strong><small>{order.etaDate ? `Tahmini teslimat: ${formatDate(order.etaDate, false)}` : order.status}</small></span>{safeTrackingUrl(order.trackingUrl) && <a href={safeTrackingUrl(order.trackingUrl)} target="_blank" rel="noopener noreferrer">Kargoyu takip et <CaretRight /></a>}</div>}</div> : searched ? <div className="connected-empty"><Package /><h2>Sipariş bulunamadı</h2><p>Numarayı kontrol et; yalnız bu hesaba ait siparişler gösterilir.</p></div> : null}</div></main>;
}

export function CustomerSupportPage({ session, account, onNotice }) {
  const resource = useAsyncResource((options) => account.listSupportMessages(session, options), [account, session]);
  const [message, setMessage] = useState("");
  const [phase, setPhase] = useState("idle");
  const [error, setError] = useState("");
  const submit = async (event) => {
    event.preventDefault();
    const text = message.trim();
    if (!text) return;
    setPhase("submitting"); setError("");
    try { await account.sendSupportMessage(session, text); setMessage(""); resource.reload(); onNotice("Mesajın NovaStore destek ekibine iletildi."); }
    catch (requestError) { setError(errorMessage(requestError, "Mesaj gönderilemedi.")); }
    finally { setPhase("idle"); }
  };
  return <main id="main-content" className="page help-page"><div className="shell"><div className="help-hero compact"><EnvelopeSimple /><span className="section-kicker">Nova destek</span><h1>Destek ekibiyle görüş</h1><p>Mesajların yalnız doğrulanmış müşteri hesabın ve NovaStore destek ekibi arasında tutulur.</p></div><section className="support-panel"><div className="support-panel__head"><span><ChatCircleText /><strong>Destek mesajları</strong><small>{session.user.email}</small></span><button type="button" onClick={resource.reload}>Yenile</button></div>{resource.phase !== "ready" ? <InlineState phase={resource.phase} error={resource.error} onRetry={resource.reload} /> : <div className="support-thread" aria-live="polite">{resource.data.length ? resource.data.map((item) => <article key={item.id} className={item.isSystem ? "is-system" : item.sentByCustomer ? "is-sent" : "is-received"}><p>{item.isSystem ? item.message.replace("[AI DESTEK DEVRI]", "").trim() : item.message}</p><small>{formatDate(item.createdAt)}</small></article>) : <div className="connected-empty is-compact"><ChatCircleText /><h2>Henüz mesaj yok</h2><p>Sorunu aşağıdaki alandan destek ekibine iletebilirsin.</p></div>}</div>}{error && <div className="form-message is-error"><WarningCircle />{error}</div>}<form className="support-composer" onSubmit={submit}><label htmlFor="support-message">Mesajın</label><textarea id="support-message" value={message} onChange={(event) => setMessage(event.target.value)} rows="4" maxLength="2000" required placeholder="Nasıl yardımcı olabiliriz?" /><button className="primary-button" type="submit" disabled={phase === "submitting" || !message.trim()}>{phase === "submitting" ? "Gönderiliyor…" : "Mesajı gönder"}<PaperPlaneTilt /></button></form></section></div></main>;
}
