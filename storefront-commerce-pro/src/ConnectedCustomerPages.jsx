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
  Headphones,
  Key,
  LockKey,
  MapPin,
  Package,
  PaperPlaneTilt,
  PencilSimple,
  Plus,
  Question,
  Receipt,
  ShieldCheck,
  ShoppingBag,
  SignOut,
  Star,
  Storefront,
  Ticket,
  Trash,
  Truck,
  User,
  UserMinus,
  WarningCircle,
} from "./CustomerIcon.jsx";
import { NovaServiceIcon } from "./NovaServiceIcon.jsx";
import {
  createWebPushController,
  WEB_PUSH_STATE,
} from "../../web-notifications/notificationClient.js";
import turkeyLocations from "../../shared/turkiye-provinces-districts.v1.json";

const LOCAL_REVIEW_RUNTIME_ENABLED = __NOVASTORE_LOCAL_REVIEW_RUNTIME__;

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

const locationSearchKey = (value) => String(value || "")
  .trim()
  .toLocaleLowerCase("tr-TR")
  .replaceAll("ı", "i")
  .normalize("NFD")
  .replace(/\p{M}+/gu, "");
const PROVINCE_OPTIONS = Object.freeze(turkeyLocations.provinces.map((province) => province.name));
const DISTRICTS_BY_PROVINCE = new Map(turkeyLocations.provinces.map((province) => [province.name, Object.freeze(province.districts)]));
const EMPTY_LOCATION_OPTIONS = Object.freeze([]);

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

function LocalReviewAuthBoundary({ password = false }) {
  return <main id="main-content" className="page auth-page"><div className="shell auth-layout">
    <AuthHero kicker="Yerel inceleme" title={password ? "Parola işlemleri bu oturumda kapalı." : "Sentetik inceleme hesabını aç."} copy="Bu sunucu gerçek üyelik, kimlik doğrulaması veya e-posta gönderimi yapmaz." />
    <section className="auth-card" aria-labelledby="review-auth-title">
      <span className="section-kicker">Güvenli inceleme sınırı</span>
      <h2 id="review-auth-title">Gerçek hesap verisi kullanılmaz</h2>
      <p>Kısa süreli, yalnızca bu yerel çalışma zamanına ait sentetik hesabı güvenli giriş noktasından açabilirsin.</p>
      <div className="connected-review-boundary">
        <div className="form-message is-warning" role="status"><ShieldCheck />Gerçek parola, e-posta veya hesap verisi bu çalışma zamanına gönderilmez.</div>
        <a className="primary-button connected-submit" href="/__review/customer">İnceleme hesabını aç <CaretRight /></a>
      </div>
    </section>
  </div></main>;
}

export function CustomerAuthPage(props) {
  const {
    account,
    initialMode = "login",
    returnPath = "/hesabim",
    onAuthenticated,
  } = props;
  const [mode, setMode] = useState(initialMode === "register" ? "register" : "login");
  const [phase, setPhase] = useState("idle");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const localReviewOnly = LOCAL_REVIEW_RUNTIME_ENABLED ? Boolean(props.reviewOnly) : false;

  useEffect(() => setMode(initialMode === "register" ? "register" : "login"), [initialMode]);

  if (localReviewOnly) return <LocalReviewAuthBoundary />;

  const submit = async (event) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
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
        formElement.reset();
        setMode("login");
        setMessage("Hesabın oluşturuldu. Şimdi güvenle giriş yapabilirsin.");
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

export function CustomerPasswordPage(props) {
  const { account, mode, token = "" } = props;
  const reset = mode === "reset";
  const [phase, setPhase] = useState("idle");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const localReviewOnly = LOCAL_REVIEW_RUNTIME_ENABLED ? Boolean(props.reviewOnly) : false;

  if (localReviewOnly) return <LocalReviewAuthBoundary password />;

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
  [Question, "Sorulan Sorularım", "#/hesabim/sorularim", "questions"],
  [Star, "Değerlendirmelerim", "#/hesabim/degerlendirmelerim", "reviews"],
  [Storefront, "Takip Ettiğim Mağazalar", "#/hesabim/takip-ettigim-magazalar", "followed-stores"],
  [Ticket, "Kuponlarım", "#/hesabim/kuponlar", "coupons"],
  [Bell, "Bildirimlerim", "#/hesabim/bildirimler", "notifications"],
  [Headphones, "Destek Mesajlarım", "#/destek", "support"],
  [LockKey, "Güvenlik", "#/hesabim/guvenlik", "security"],
]);

function ConnectedAccountSidebar({ section, onLogout }) {
  return <aside className="account-sidebar connected-account-sidebar"><h2>Hesabım</h2>{ACCOUNT_ITEMS.map(([Icon, label, href, id]) => <a key={id} className={section === id ? "is-active" : ""} aria-current={section === id ? "page" : undefined} href={href}><Icon />{label}<CaretRight /></a>)}<button className="account-logout" type="button" onClick={onLogout}><SignOut /> Güvenli çıkış</button></aside>;
}

const activeOrder = (order) => !["Teslim Edildi", "İptal Edildi", "İade Edildi", "Ödeme Başarısız"].includes(order.status);

const RETURN_REASONS = Object.freeze([
  ["CHANGED_MIND", "Fikrimi değiştirdim"],
  ["DAMAGED", "Ürün hasarlı ulaştı"],
  ["WRONG_ITEM", "Yanlış ürün geldi"],
  ["NOT_AS_DESCRIBED", "Ürün açıklamayla uyuşmuyor"],
  ["OTHER", "Diğer"],
]);

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
  return <form className="profile-editor connected-form" onSubmit={submit}><div className="profile-editor__head"><span><User /><strong>Profil bilgileri</strong><small>Ödeme ve teslimat iletişiminde kullanılacak temel bilgiler.</small></span></div>{error && <div className="form-message is-error" role="alert"><WarningCircle />{error}</div>}<div className="profile-editor__fields"><label>Ad soyad<input name="fullName" defaultValue={user.fullName} minLength="2" required /></label><label>E-posta<input value={user.email} readOnly aria-describedby="email-note" /><small id="email-note">E-posta bu ekrandan değiştirilemez.</small></label><label>Telefon<input name="phone" defaultValue={user.phone || ""} inputMode="numeric" autoComplete="tel" minLength="11" maxLength="11" pattern="05[0-9]{9}" placeholder="05xxxxxxxxx" /><small>11 haneli Türkiye cep telefonu: 05xxxxxxxxx</small></label></div><button className="primary-button" type="submit" disabled={phase === "submitting"}>{phase === "submitting" ? "Kaydediliyor…" : "Bilgilerimi kaydet"}</button></form>;
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
  const [returnOpen, setReturnOpen] = useState(false);
  const [returnPhase, setReturnPhase] = useState("idle");
  const [returnError, setReturnError] = useState("");
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

  const createReturn = async (event, order) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setReturnPhase("submitting");
    setReturnError("");
    try {
      await account.createReturnRequest(order, {
        reasonCode: form.get("reasonCode"),
        note: form.get("note"),
      });
      setReturnOpen(false);
      onNotice("İade talebin alındı. Durumu sipariş detayından takip edebilirsin.");
      resource.reload();
    } catch (requestError) {
      setReturnError(errorMessage(requestError, "İade talebi oluşturulamadı."));
    } finally {
      setReturnPhase("idle");
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
      {returnError && <div className="form-message is-error" role="alert"><WarningCircle />{returnError}</div>}
      <div className="order-detail-products">{selected.items.length ? selected.items.map((item, index) => { const image = orderImage(item, productById, getProductImage); return <div key={`${item.id || item.name}-${index}`}>{image ? <img src={image} alt={item.name} /> : <span className="order-detail-placeholder"><Package /></span>}<span><strong>{item.name}</strong><small>{item.quantity} adet</small></span><b>{money.format(item.price * item.quantity)}</b></div>; }) : <div className="order-items-unavailable"><Package /><span><strong>Ürün özeti alınamadı</strong><small>Sipariş toplamı ve durumu korunuyor.</small></span></div>}</div>
      <div className="order-detail-grid"><div><MapPin /><span><strong>Teslimat adresi</strong><p>{selected.address || "Adres özeti bu sipariş kaydında bulunmuyor."}</p></span></div><div><CreditCard /><span><strong>Ödeme</strong><p>{selected.paymentStatus ? paymentStatusLabel(selected.paymentStatus) : selected.paymentMethod || "Ödeme durumu sipariş kaydında gösterilecek."}</p></span></div>{selected.trackingNo || trackingUrl ? <div><Truck /><span><strong>Kargo takibi</strong><p>{selected.trackingNo ? `Takip no: ${selected.trackingNo}` : "Takip bağlantısı hazır."}{selected.etaDate ? ` · Tahmini teslimat ${formatDate(selected.etaDate, false)}` : ""}</p>{trackingUrl && <a href={trackingUrl} target="_blank" rel="noopener noreferrer">Taşıyıcı sayfasını aç <CaretRight /></a>}</span></div> : null}</div>
      {selected.returnStatus && <section className="order-return-status" role="status" aria-live="polite"><Receipt /><span><strong>İade durumu: {selected.returnStatusLabel}</strong><small>Talep #{selected.returnId}{selected.returnDecisionNote ? ` · ${selected.returnDecisionNote}` : ""}</small>{selected.returnStatus === "APPROVED" && <small>Onay kaydedildi; para iadesi sağlayıcı işlemi tamamlandığında ayrıca güncellenecek.</small>}</span></section>}
      {selected.returnable && !returnOpen && <div className="order-return-zone"><span><strong>İade talebi</strong><small>İade uygunluğu ve süre sunucu tarafından doğrulanır. Talep açmak para iadesinin tamamlandığı anlamına gelmez.</small></span><button type="button" onClick={() => { setReturnError(""); setReturnOpen(true); }}>İade talebi oluştur</button></div>}
      {selected.returnable && returnOpen && <form className="order-return-form connected-form" onSubmit={(event) => createReturn(event, selected)}><div><strong>İade nedenini seç</strong><small>Talebin yalnız bu sipariş için oluşturulur.</small></div><label>Neden<select name="reasonCode" defaultValue="CHANGED_MIND" required>{RETURN_REASONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Açıklama <span>(isteğe bağlı)</span><textarea name="note" maxLength="1000" rows="4" placeholder="İncelemeye yardımcı olacak kısa bir açıklama ekleyebilirsin." /></label><div className="form-actions"><button type="button" onClick={() => { setReturnOpen(false); setReturnError(""); }} disabled={returnPhase === "submitting"}>Vazgeç</button><button className="primary-button" type="submit" disabled={returnPhase === "submitting"}>{returnPhase === "submitting" ? "Gönderiliyor…" : "Talebi gönder"}</button></div></form>}
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

function SearchableLocationSelect({ label, value, options, disabled = false, onChange, autoComplete, testId }) {
  const [query, setQuery] = useState(value || "");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const listId = `${testId}-options`;
  const filtered = useMemo(() => {
    const needle = locationSearchKey(query);
    return needle ? options.filter((option) => locationSearchKey(option).includes(needle)) : options;
  }, [options, query]);

  useEffect(() => setQuery(value || ""), [value]);
  useEffect(() => setActiveIndex(-1), [query, options]);

  const select = (option) => {
    setQuery(option);
    onChange(option);
    setOpen(false);
  };
  const onKeyDown = (event) => {
    if (disabled) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((index) => Math.min(Math.max(0, index + 1), Math.max(0, filtered.length - 1)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((index) => index < 0 ? Math.max(0, filtered.length - 1) : Math.max(0, index - 1));
    } else if (event.key === "Enter" && open && filtered[activeIndex]) {
      event.preventDefault();
      select(filtered[activeIndex]);
    } else if (event.key === "Escape") {
      setOpen(false);
      setQuery(value || "");
    }
  };

  return <div className="location-combobox"><label htmlFor={`${testId}-input`}>{label}</label><span onBlur={(event) => {
    if (event.currentTarget.contains(event.relatedTarget)) return;
    setOpen(false);
    setQuery(value || "");
  }}><input
    data-testid={testId}
    id={`${testId}-input`}
    value={query}
    disabled={disabled}
    autoComplete={autoComplete}
    role="combobox"
    aria-autocomplete="list"
    aria-expanded={open}
    aria-controls={listId}
    aria-activedescendant={open && filtered[activeIndex] ? `${listId}-${activeIndex}` : undefined}
    aria-describedby={disabled ? `${testId}-hint` : undefined}
    required
    onFocus={() => setOpen(true)}
    onClick={() => setOpen(true)}
    onKeyDown={onKeyDown}
    onChange={(event) => {
      setQuery(event.target.value);
      onChange("");
      setOpen(true);
    }}
  />{disabled && <small id={`${testId}-hint`}>Önce il seçmelisin.</small>}{open && !disabled && <ul id={listId} role="listbox" data-option-count={options.length}>
    {filtered.length ? filtered.map((option, index) => <li key={option} role="presentation"><button
      id={`${listId}-${index}`}
      type="button"
      role="option"
      aria-selected={option === value}
      className={index === activeIndex ? "is-active" : ""}
      onMouseDown={(event) => event.preventDefault()}
      onMouseEnter={() => setActiveIndex(index)}
      onClick={() => select(option)}
    >{option}</button></li>) : <li className="location-combobox__empty">Eşleşen seçenek bulunamadı.</li>}
  </ul>}</span></div>;
}

function AddressEditor({ initial = EMPTY_ADDRESS, onSubmit, onCancel, busy }) {
  const [phone, setPhone] = useState(initial.phone || "");
  const [phoneError, setPhoneError] = useState("");
  const initialCity = PROVINCE_OPTIONS.includes(initial.city) ? initial.city : "";
  const initialDistricts = DISTRICTS_BY_PROVINCE.get(initialCity) || EMPTY_LOCATION_OPTIONS;
  const [city, setCity] = useState(initialCity);
  const [district, setDistrict] = useState(initialDistricts.includes(initial.district) ? initial.district : "");
  const districtOptions = DISTRICTS_BY_PROVINCE.get(city) || EMPTY_LOCATION_OPTIONS;
  const submit = (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    onSubmit({
      title: form.get("title"),
      fullName: form.get("fullName"),
      phone,
      city,
      district,
      addressLine: form.get("addressLine"),
      isDefault: form.get("isDefault") === "on",
    });
  };
  return <form className="address-editor connected-form" onSubmit={submit}><div className="address-editor__grid"><label>Adres başlığı<input name="title" defaultValue={initial.title} maxLength="80" placeholder="Ev, İş…" required /></label><label>Alıcı adı<input name="fullName" defaultValue={initial.fullName} minLength="2" maxLength="160" autoComplete="name" required /></label><label>Telefon<input name="phone" value={phone} inputMode="numeric" autoComplete="tel" placeholder="05xxxxxxxxx" minLength="11" maxLength="11" pattern="05[0-9]{9}" aria-describedby="address-phone-hint" required onChange={(event) => {
    const next = event.target.value;
    if (!/^\d*$/.test(next)) { setPhoneError("Telefon yalnız rakamlardan oluşmalıdır."); return; }
    if (next.length > 11) { setPhoneError("Telefon 11 haneden uzun olamaz."); return; }
    setPhone(next);
    setPhoneError(next && !/^05\d{9}$/.test(next) ? "Telefon 05 ile başlayan 11 haneli olmalı." : "");
  }} /><small id="address-phone-hint" className={phoneError ? "is-error" : ""}>{phoneError || "11 haneli Türkiye cep telefonu: 05xxxxxxxxx"}</small></label><SearchableLocationSelect label="İl" value={city} options={PROVINCE_OPTIONS} autoComplete="address-level1" testId="province-select" onChange={(nextCity) => { setCity(nextCity); setDistrict(""); }} /><SearchableLocationSelect label="İlçe" value={district} options={districtOptions} disabled={!city} autoComplete="address-level2" testId="district-select" onChange={setDistrict} /><label className="is-wide">Açık adres<textarea name="addressLine" defaultValue={initial.addressLine} minLength="5" maxLength="500" rows="4" autoComplete="street-address" required /></label><label className="connected-check is-wide"><input name="isDefault" type="checkbox" defaultChecked={initial.isDefault} /> Bu adresi varsayılan yap</label></div><div className="form-actions"><button type="button" onClick={onCancel}>Vazgeç</button><button className="primary-button" type="submit" disabled={busy || Boolean(phoneError) || !city || !district}>{busy ? "Kaydediliyor…" : "Adresi kaydet"}</button></div></form>;
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

function AccountHistoryProductTarget({ item, productById, FallbackIcon }) {
  const available = productById.has(Number(item.productId));
  const media = item.productImage ? <img src={item.productImage} alt="" /> : <span><FallbackIcon /></span>;
  if (available) {
    return <a className="account-history-card__target" href={`#/urun-id/${item.productId}`} aria-label={`${item.productName} ürününe git`}>
      {media}<strong>{item.productName}</strong><CaretRight />
    </a>;
  }
  return <div className="account-history-card__target is-unavailable">
    {media}<strong>{item.productName}</strong><small>Artık satışta değil</small>
  </div>;
}

function QuestionsSection({ session, account, productById }) {
  const resource = useAsyncResource((options) => account.listQuestions(session, options), [account, session]);
  if (resource.phase !== "ready") return <InlineState phase={resource.phase} error={resource.error} onRetry={resource.reload} />;
  const questions = resource.data;
  return <>
    <div className="commerce-heading"><div><span className="section-kicker">Hesabım</span><h1>Sorulan Sorularım</h1><p>Ürünler hakkında sorduğun soruları ve mağaza yanıtlarını kendi hesabından takip et.</p></div></div>
    {questions.length ? <div className="account-history-list">{questions.map((question) => <article className="account-history-card" key={question.id}>
      <AccountHistoryProductTarget item={question} productById={productById} FallbackIcon={Question} />
      <div className="account-history-card__meta"><span className={`status-pill is-${question.status === "answered" ? "success" : "warning"}`}>{question.status === "answered" ? "Yanıtlandı" : "Yanıt bekliyor"}</span><time dateTime={question.createdAt || undefined}>{formatDate(question.createdAt)}</time></div>
      <div className="account-history-card__copy"><span>Senin sorun</span><p>{question.question}</p></div>
      {question.answer ? <div className="account-history-answer"><ChatCircleText /><div><span>Mağaza yanıtı</span><p>{question.answer}</p>{question.answeredAt && <time dateTime={question.answeredAt}>{formatDate(question.answeredAt)}</time>}</div></div> : <div className="account-history-pending"><Clock /> Mağaza yanıtladığında burada göreceksin.</div>}
    </article>)}</div> : <div className="connected-empty"><Question /><h2>Henüz soru sormadın</h2><p>Ürün detayındaki “Soru sor” alanından ilettiğin sorular burada görünür.</p><a className="primary-button" href="#/">Ürünleri keşfet</a></div>}
  </>;
}

const REVIEW_STATUS_LABELS = Object.freeze({
  PENDING: ["İncelemede", "warning"],
  PUBLISHED: ["Yayında", "success"],
  HIDDEN: ["Yayından kaldırıldı", "info"],
});

function ReviewsSection({ session, account, productById }) {
  const resource = useAsyncResource((options) => account.listReviews(session, options), [account, session]);
  if (resource.phase !== "ready") return <InlineState phase={resource.phase} error={resource.error} onRetry={resource.reload} />;
  const reviews = resource.data;
  return <>
    <div className="commerce-heading"><div><span className="section-kicker">Hesabım</span><h1>Değerlendirmelerim</h1><p>Yaptığın ürün değerlendirmelerini ve güncel yayın durumlarını görüntüle.</p></div></div>
    {reviews.length ? <div className="account-history-list">{reviews.map((review) => { const [statusLabel, statusTone] = REVIEW_STATUS_LABELS[review.status] || REVIEW_STATUS_LABELS.PENDING; return <article className="account-history-card" key={review.id}>
      <AccountHistoryProductTarget item={review} productById={productById} FallbackIcon={Star} />
      <div className="account-history-card__meta"><span className={`status-pill is-${statusTone}`}>{statusLabel}</span><time dateTime={review.createdAt || undefined}>{formatDate(review.createdAt)}</time></div>
      <div className="account-review-rating" role="img" aria-label={`5 üzerinden ${review.rating} puan`}>{Array.from({ length: 5 }, (_, index) => <Star key={index} weight={index < review.rating ? "fill" : "regular"} />)}<strong>{review.rating}.0</strong></div>
      <div className="account-history-card__copy"><span>Değerlendirmen</span><p>{review.comment || "Bu değerlendirmede yazılı yorum bulunmuyor."}</p></div>
    </article>; })}</div> : <div className="connected-empty"><Star /><h2>Henüz değerlendirmen yok</h2><p>Teslim edilen ürünler için yaptığın doğrulanmış değerlendirmeler burada gösterilir.</p><a className="primary-button" href="#/hesabim/siparisler">Siparişlerime git</a></div>}
  </>;
}

function FollowedStoresSection({ session, account, onNotice }) {
  const resource = useAsyncResource((options) => account.listFollowedStores(session, options), [account, session]);
  const [busySlug, setBusySlug] = useState("");
  const [error, setError] = useState("");
  if (resource.phase !== "ready") return <InlineState phase={resource.phase} error={resource.error} onRetry={resource.reload} />;
  const stores = resource.data;
  const unfollow = async (store) => {
    setBusySlug(store.slug); setError("");
    try { await account.unfollowStore(session, store.slug); onNotice(`${store.name} mağazası takipten çıkarıldı.`); resource.reload(); }
    catch (requestError) { setError(errorMessage(requestError, "Mağaza takipten çıkarılamadı.")); }
    finally { setBusySlug(""); }
  };
  return <>
    <div className="commerce-heading"><div><span className="section-kicker">Hesabım</span><h1>Takip Ettiğim Mağazalar</h1><p>Takip ettiğin ve müşterilere açık olan mağazalara güvenli biçimde ulaş.</p></div></div>
    {error && <div className="form-message is-error" role="alert"><WarningCircle />{error}</div>}
    {stores.length ? <div className="followed-store-grid">{stores.map((store) => <article key={store.slug}>
      <a className="followed-store-card__identity" href={`#/magaza/${store.slug}`}><span><Storefront /></span><div><small>Takip edilen mağaza</small><h2>{store.name}</h2><p>{store.followerCount.toLocaleString("tr-TR")} takipçi</p></div><CaretRight /></a>
      <div className="followed-store-card__actions"><span><CheckCircle /> Takip ediliyor</span><button type="button" disabled={Boolean(busySlug)} onClick={() => unfollow(store)}><UserMinus /> {busySlug === store.slug ? "Çıkarılıyor…" : "Takibi bırak"}</button></div>
    </article>)}</div> : <div className="connected-empty"><Storefront /><h2>Takip ettiğin mağaza yok</h2><p>Bir mağazayı takip ettiğinde güncel ve müşterilere açık mağazalar burada görünür.</p><a className="primary-button" href="#/">Mağazaları keşfet</a></div>}
  </>;
}

const notificationIcon = (type) => {
  if (/ORDER|SHIPMENT|TRACKING/u.test(type)) return Truck;
  if (/REVIEW|QUESTION|SUPPORT/u.test(type)) return ChatCircleText;
  if (type === "welcome") return CheckCircle;
  return Bell;
};

const customerPushCopy = Object.freeze({
  [WEB_PUSH_STATE.NOT_SUPPORTED]: ["Desteklenmiyor", "Bu tarayıcı Web Push bildirimlerini desteklemiyor."],
  [WEB_PUSH_STATE.NOT_REQUESTED]: ["İzin bekleniyor", "İzin yalnız “Bildirimleri Aç” düğmesine bastığında istenir."],
  [WEB_PUSH_STATE.ENABLED]: ["Açık", "Sipariş ve hesap güncellemeleri bu tarayıcıya güvenle gönderilebilir."],
  [WEB_PUSH_STATE.DENIED]: ["Engellendi", "Bildirim izni tarayıcı ayarlarında engellenmiş."],
  [WEB_PUSH_STATE.ERROR]: ["Hazır değil", "Web Push durumu doğrulanamadı veya sunucu yapılandırması bekleniyor."],
  [WEB_PUSH_STATE.UNSUBSCRIBED]: ["Kapalı", "Bu tarayıcıda Web Push kapalı."],
});

function CustomerWebPushSettings({ api }) {
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
  const copy = customerPushCopy[status.state] || customerPushCopy[WEB_PUSH_STATE.ERROR];
  const enabled = status.state === WEB_PUSH_STATE.ENABLED;
  const unavailable = [WEB_PUSH_STATE.NOT_SUPPORTED, WEB_PUSH_STATE.DENIED].includes(status.state);
  return <section className="customer-push-settings" aria-labelledby="customer-web-push-title"><Bell /><div><span>Tarayıcı bildirimleri</span><h2 id="customer-web-push-title">Web Push</h2><p>{busy ? "Bildirim durumu doğrulanıyor…" : copy[1]}</p>{status.activeDeviceCount > 0 && <small>{status.activeDeviceCount} etkin cihaz</small>}</div><div><b className={enabled ? "is-enabled" : ""} role="status">{busy ? "Kontrol ediliyor" : copy[0]}</b>{enabled ? <button type="button" onClick={() => mutate(controller.disable)} disabled={busy}>Bu cihazda kapat</button> : <button type="button" onClick={() => mutate(controller.enable)} disabled={busy || unavailable}>Bildirimleri Aç</button>}{status.state === WEB_PUSH_STATE.ERROR && <button className="is-quiet" type="button" onClick={refresh} disabled={busy}>Tekrar dene</button>}</div></section>;
}

function NotificationsSection({ session, account, onNotice }) {
  const resource = useAsyncResource((options) => account.listNotifications(session, options), [account, session]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (resource.phase !== "ready") return <InlineState phase={resource.phase} error={resource.error} onRetry={resource.reload} />;
  const notifications = resource.data;
  const markOne = async (item) => {
    setBusy(true); setError("");
    try {
      if (!item.isRead) {
        await account.markNotificationRead(item.id);
        resource.reload();
        window.dispatchEvent(new CustomEvent("novastore:notification-state-changed"));
      }
      if (item.target) window.location.hash = item.target.slice(1);
    }
    catch (requestError) { setError(errorMessage(requestError, "Bildirim güncellenemedi.")); }
    finally { setBusy(false); }
  };
  const markAll = async () => {
    setBusy(true); setError("");
    try { await account.markAllNotificationsRead(session); resource.reload(); window.dispatchEvent(new CustomEvent("novastore:notification-state-changed")); onNotice("Tüm bildirimler okundu olarak işaretlendi."); }
    catch (requestError) { setError(errorMessage(requestError, "Bildirimler güncellenemedi.")); }
    finally { setBusy(false); }
  };
  return <><div className="commerce-heading"><div><span className="section-kicker">Hesabım</span><h1>Bildirimlerim</h1><p>Sipariş ve hesap güncellemelerini tüm cihazlarında aynı okunma durumuyla izle.</p></div>{notifications.some((item) => !item.isRead) && <button className="secondary-action" type="button" onClick={markAll} disabled={busy}>Tümünü okundu yap</button>}</div>{error && <div className="form-message is-error" role="alert"><WarningCircle />{error}</div>}<CustomerWebPushSettings api={account.webPush} />{notifications.length ? <div className="notification-list connected-notifications">{notifications.map((item) => { const Icon = notificationIcon(item.type); return <button key={item.id} type="button" className={item.isRead ? "is-read" : "is-unread"} onClick={() => markOne(item)} disabled={busy} aria-label={`${item.title}, ${item.isRead ? "okundu" : "okunmadı"}`}><Icon /><span><strong>{item.title}</strong><small>{item.message}</small><small>{item.category} · {formatDate(item.createdAt)}</small></span>{!item.isRead && <i aria-label="Okunmadı" />}</button>; })}</div> : <div className="connected-empty"><Bell /><h2>Henüz bildirimin yok</h2><p>Sipariş ve hesap güncellemeleri burada gösterilecek.</p></div>}</>;
}

function SecuritySection(props) {
  const { account, onNotice } = props;
  const [phase, setPhase] = useState("idle");
  const [error, setError] = useState("");
  const localReviewOnly = LOCAL_REVIEW_RUNTIME_ENABLED ? Boolean(props.reviewOnly) : false;
  const submit = async (event) => {
    event.preventDefault();
    if (localReviewOnly) return;
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
  return <><div className="commerce-heading"><div><span className="section-kicker">Hesap güvenliği</span><h1>Şifremi değiştir</h1><p>{localReviewOnly ? "Yerel inceleme oturumu gerçek parola işlemi yapmaz." : "Yeni şifren en az 8 karakter, bir harf ve bir rakam içermelidir."}</p></div></div><form className="security-form connected-form" onSubmit={submit}><Key />{localReviewOnly && <div className="form-message is-warning" role="status"><ShieldCheck />Parola değiştirme, üretim kimliği gerektirdiği için bu yerel oturumda devre dışıdır.</div>}{error && <div className="form-message is-error"><WarningCircle />{error}</div>}<label>Mevcut şifre<input name="currentPassword" type="password" autoComplete="current-password" required disabled={localReviewOnly} /></label><label>Yeni şifre<input name="newPassword" type="password" autoComplete="new-password" minLength="8" required disabled={localReviewOnly} /></label><label>Yeni şifre tekrarı<input name="confirmation" type="password" autoComplete="new-password" minLength="8" required disabled={localReviewOnly} /></label><button className="primary-button" type="submit" disabled={localReviewOnly || phase === "submitting"}>{localReviewOnly ? "Yerel incelemede kullanılamaz" : phase === "submitting" ? "Güncelleniyor…" : "Şifremi güncelle"}</button></form></>;
}

export function CustomerAccountPage(props) {
  const {
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
  } = props;
  const productById = useMemo(() => new Map(products.map((product) => [Number(product.id), product])), [products]);
  const activeSection = section === "order-detail" ? "orders" : section;
  let content;
  if (section === "overview") content = <AccountOverview session={session} account={account} favoriteCount={favoriteCount} onSessionUpdated={onSessionUpdated} onNotice={onNotice} productById={productById} getProductImage={getProductImage} />;
  else if (section === "orders" || section === "order-detail") content = <OrdersSection session={session} account={account} orderId={orderId} productById={productById} getProductImage={getProductImage} onNotice={onNotice} />;
  else if (section === "addresses") content = <AddressesSection account={account} user={session.user} onNotice={onNotice} />;
  else if (section === "coupons") content = <CouponsSection account={account} onNotice={onNotice} />;
  else if (section === "questions") content = <QuestionsSection session={session} account={account} productById={productById} />;
  else if (section === "reviews") content = <ReviewsSection session={session} account={account} productById={productById} />;
  else if (section === "followed-stores") content = <FollowedStoresSection session={session} account={account} onNotice={onNotice} />;
  else if (section === "notifications") content = <NotificationsSection session={session} account={account} onNotice={onNotice} />;
  else if (section === "security") content = <SecuritySection account={account} onNotice={onNotice} {...(LOCAL_REVIEW_RUNTIME_ENABLED ? { reviewOnly: props.reviewOnly } : {})} />;
  else content = <div className="connected-empty"><WarningCircle /><h2>Hesap bölümü bulunamadı</h2><a className="primary-button" href="#/hesabim">Hesap özetine dön</a></div>;

  return <main id="main-content" className="page commerce-page"><div className="shell"><div className="account-layout"><ConnectedAccountSidebar section={activeSection} onLogout={onLogout} /><section className="account-content">{content}</section></div></div></main>;
}

function CheckoutStepper({ step }) {
  const steps = [["delivery", "Teslimat"], ["payment", "Ödeme"], ["review", "Onay"]];
  const current = steps.findIndex(([id]) => id === step);
  return <ol className="checkout-stepper" aria-label="Ödeme adımları">{steps.map(([id, label], index) => <li key={id} className={index <= current ? "is-active" : ""} aria-current={id === step ? "step" : undefined}><span>{index < current ? <Check /> : index + 1}</span><strong>{label}</strong></li>)}</ol>;
}

function CheckoutSummary({ quote, phase, error, couponInput, onCouponInput, onApplyCoupon, onClearCoupon, couponBusy }) {
  if (phase === "loading") return <aside className="order-summary checkout-summary"><div className="connected-inline-state" role="status" aria-live="polite"><span className="integration-spinner" /><strong>Fiyatlar doğrulanıyor</strong></div></aside>;
  if (phase === "error" || !quote) return <aside className="order-summary checkout-summary"><div className="connected-inline-state is-error" role="alert"><WarningCircle /><strong>{errorMessage(error, "Güncel fiyatlar alınamadı.")}</strong></div></aside>;
  const totals = quote.totals;
  const couponApplied = quote.coupon?.applied === true;
  return <aside className="order-summary checkout-summary"><h2>Sipariş Özeti</h2><dl><div><dt>Ara toplam</dt><dd>{money.format(totals.subtotal)}</dd></div>{totals.bundleDiscount > 0 && <div className="discount-row"><dt>Sepet avantajı</dt><dd>−{money.format(totals.bundleDiscount)}</dd></div>}{totals.couponDiscount > 0 && <div className="discount-row"><dt>Kupon indirimi</dt><dd>−{money.format(totals.couponDiscount)}</dd></div>}<div><dt>Kargo</dt><dd>{totals.shippingFee > 0 ? money.format(totals.shippingFee) : "Ücretsiz"}</dd></div><div className="order-total"><dt>Toplam</dt><dd>{money.format(totals.total)}</dd></div></dl><form className="coupon-form connected-coupon-form" onSubmit={onApplyCoupon}><label htmlFor="connected-coupon">İndirim kodu</label><div><input id="connected-coupon" value={couponInput} onChange={(event) => onCouponInput(event.target.value)} placeholder="Kupon kodunu gir" disabled={couponBusy} /><button type="submit" disabled={couponBusy || !couponInput.trim()}>{couponBusy ? "Kontrol…" : "Uygula"}</button></div>{quote.coupon?.code && <small className={couponApplied ? "is-success" : "is-error"}>{couponApplied ? `${quote.coupon.code} uygulandı.` : quote.coupon.reason || "Kupon uygulanamadı."}{couponApplied && <button type="button" onClick={onClearCoupon}>Kaldır</button>}</small>}</form><small className="summary-security"><ShieldCheck /> Tutarlar NovaStore fiyatlandırma servisiyle doğrulandı.</small></aside>;
}

function CheckoutAddressCards({ addresses, selectedId, onSelect }) {
  return <div className="address-grid connected-checkout-addresses">{addresses.map((address) => <label key={address.id} className={Number(selectedId) === Number(address.id) ? "is-selected" : ""}><input type="radio" name="checkoutAddress" checked={Number(selectedId) === Number(address.id)} onChange={() => onSelect(address.id)} /><strong>{address.title}{address.isDefault ? " · Varsayılan" : ""}</strong><span>{address.fullName}</span><p>{address.addressLine}<br />{address.district} / {address.city}<br />{address.phone}</p></label>)}</div>;
}

function CheckoutAgreementReview({ state, definitions, accepted, onAcceptedChange, onRetry }) {
  if (state.phase === "loading") {
    return <div className="agreement-preview-state" role="status" aria-live="polite"><span className="integration-spinner" /><span><strong>Siparişe özel sözleşmeler hazırlanıyor</strong><small>Adres, ürünler, satıcı dağılımı ve doğrulanmış toplam sunucuda eşleştiriliyor.</small></span></div>;
  }
  if (state.phase === "error") {
    return <div className="agreement-preview-state is-error" role="alert"><WarningCircle /><span><strong>Sipariş sözleşmeleri hazırlanamadı</strong><small>{errorMessage(state.error, "Güncel sözleşmeler doğrulanmadan ödeme başlatılmaz.")}</small><button type="button" onClick={onRetry}>Yeniden dene</button></span></div>;
  }
  if (state.phase !== "ready") {
    return definitions.length ? <div className="agreement-preview-pending" role="status">{definitions.map((agreement) => <p key={agreement.slug}><a href={`#${agreement.path}`} target="_blank" rel="noopener noreferrer">{agreement.title}</a><small>{agreement.version ? `Yayımlanan sürüm: ${agreement.version}` : "Şirket ve hukuk onaylı sürüm bekleniyor."}</small></p>)}</div> : <div className="form-message is-warning" role="status"><WarningCircle />Gerekli sözleşme sürümleri henüz yayımlanmadı.</div>;
  }
  return <div className="exact-agreement-list">
    <p className="agreement-snapshot-reference">Siparişe bağlı kayıt: <code>{state.data.snapshotSha256.slice(0, 12)}…</code></p>
    {state.data.documents.map((agreement) => <section className="exact-agreement" key={agreement.slug}>
      <details><summary>{agreement.title} · sürüm {agreement.version}</summary><div className="exact-agreement__text">{agreement.text}</div></details>
      <label className="secure-consent"><input type="checkbox" checked={accepted.has(agreement.slug)} onChange={(event) => onAcceptedChange(agreement.slug, event.target.checked)} /><span>Yukarıdaki siparişe özel <strong>{agreement.title}</strong> metnini inceledim ve onaylıyorum.<small>İçerik özeti: {agreement.contentSha256.slice(0, 12)}…</small></span></label>
    </section>)}
  </div>;
}

export function CustomerCheckoutPage(props) {
  const {
    step,
    session,
    account,
    checkout,
    items,
    getProductImage,
    onStepChange,
    onNotice,
  } = props;
  const addressesResource = useAsyncResource((options) => account.listAddresses(options), [account]);
  const capabilityResource = useAsyncResource((options) => checkout.getCapability(options), [checkout]);
  const [selectedAddressId, setSelectedAddressId] = useState(null);
  const [showAddressEditor, setShowAddressEditor] = useState(false);
  const [addressBusy, setAddressBusy] = useState(false);
  const [addressError, setAddressError] = useState("");
  const [quoteState, setQuoteState] = useState({ phase: "loading", data: null, error: null });
  const [couponInput, setCouponInput] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState(null);
  const [couponBusy, setCouponBusy] = useState(false);
  const couponRequestRef = useRef(false);
  const couponIntentKeyRef = useRef("");
  const skipCouponEffectRef = useRef(false);
  const [acceptedAgreements, setAcceptedAgreements] = useState(() => new Set());
  const [agreementPreviewState, setAgreementPreviewState] = useState({ phase: "idle", data: null, error: null });
  const [agreementPreviewRevision, setAgreementPreviewRevision] = useState(0);
  const [submitPhase, setSubmitPhase] = useState("idle");
  const [submitError, setSubmitError] = useState("");
  const localReviewOnly = LOCAL_REVIEW_RUNTIME_ENABLED ? Boolean(props.reviewOnly) : false;
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
    if (skipCouponEffectRef.current) {
      skipCouponEffectRef.current = false;
      return undefined;
    }
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

  const addresses = addressesResource.data || [];
  const selectedAddress = addresses.find((address) => Number(address.id) === Number(selectedAddressId)) || null;
  const quote = quoteState.data;
  const capability = capabilityResource.phase === "ready" ? capabilityResource.data : null;
  const capabilityAgreements = Array.isArray(capability?.agreements) ? capability.agreements : [];
  const agreementPreviewPrerequisitesReady = capability?.requirements?.businessIdentityReady === true
    && capability?.requirements?.legalDocumentsReady === true;
  const capabilityAgreementSignature = capabilityAgreements
    .map((agreement) => `${agreement.slug}:${agreement.version || "pending"}:${agreement.status}`)
    .sort()
    .join("|");
  const cartFingerprint = items
    .map(({ product, quantity }) => `${product.id}:${quantity}`)
    .sort()
    .join("|");
  useEffect(() => {
    const definitionsReady = capabilityAgreements.length > 0 && capabilityAgreements.every((agreement) => (
      agreement.status === "published" && agreement.version
    ));
    if (
      !agreementPreviewPrerequisitesReady
      || !definitionsReady
      || !selectedAddress
      || quoteState.phase !== "ready"
    ) {
      setAgreementPreviewState({ phase: "idle", data: null, error: null });
      setAcceptedAgreements(new Set());
      return undefined;
    }

    const controller = new AbortController();
    setAgreementPreviewState({ phase: "loading", data: null, error: null });
    setAcceptedAgreements(new Set());
    checkout.previewAgreements({
      session,
      address: selectedAddress,
      items,
      couponCode: appliedCoupon,
    }, { signal: controller.signal }).then((data) => {
      setQuoteState({ phase: "ready", data: data.quote, error: null });
      setAgreementPreviewState({ phase: "ready", data, error: null });
    }).catch((error) => {
      if (error?.code !== "CUSTOMER_ABORTED") {
        setAgreementPreviewState({ phase: "error", data: null, error });
      }
    });
    return () => controller.abort("agreement-preview-refresh");
  }, [
    agreementPreviewRevision,
    appliedCoupon,
    agreementPreviewPrerequisitesReady,
    capabilityAgreementSignature,
    cartFingerprint,
    checkout,
    items,
    quoteState.phase,
    selectedAddress,
    session,
  ]);

  if (!items.length) return <main id="main-content" className="page commerce-page"><div className="shell"><div className="large-empty"><ShoppingBag /><h1>Ödemeye devam etmek için sepetine ürün ekle</h1><p>Sepetin boş olduğu için ödeme işlemi başlatılmadı.</p><a className="primary-button" href="#/">Ürünleri keşfet</a></div></div></main>;
  if (hasStockIssues) return <main id="main-content" className="page commerce-page"><div className="shell"><div className="large-empty"><WarningCircle /><h1>Sepetindeki stok sorununu düzelt</h1><p>Stokta olmayan veya miktarı güncel stoğu aşan ürünler için ödeme başlatılmaz. Sepete dönüp miktarı azaltarak ya da ürünü kaldırarak devam edebilirsin.</p><a className="primary-button" href="#/sepet">Sepete dön</a></div></div></main>;

  const requiredAgreements = agreementPreviewState.phase === "ready"
    ? agreementPreviewState.data.documents
    : capabilityAgreements;
  const agreementsReady = requiredAgreements.length > 0 && requiredAgreements.every((agreement) => (
    agreementPreviewState.phase === "ready"
    && agreement.version
    && acceptedAgreements.has(agreement.slug)
  )) && /^[a-f0-9]{64}$/.test(agreementPreviewState.data?.snapshotSha256 || "");
  const paymentReady = capability?.ready === true && agreementsReady;

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
    if (couponRequestRef.current) return;
    const code = couponInput.trim().toLocaleUpperCase("tr-TR");
    if (!code) return;
    const cartFingerprint = items
      .map(({ product, quantity }) => `${product.id}:${quantity}`)
      .sort()
      .join("|");
    const intentKey = `${code}::${cartFingerprint}`;
    if (couponIntentKeyRef.current === intentKey) return;
    couponRequestRef.current = true;
    couponIntentKeyRef.current = intentKey;
    setCouponBusy(true);
    try {
      const next = await checkout.quote(items, code);
      setQuoteState({ phase: "ready", data: next, error: null });
      if (next.coupon?.applied) {
        if (appliedCoupon !== code) {
          skipCouponEffectRef.current = true;
          setAppliedCoupon(code);
        }
        setCouponInput(code);
        onNotice("Kupon güncel sepet toplamına uygulandı.");
      } else {
        if (appliedCoupon !== null) {
          skipCouponEffectRef.current = true;
          setAppliedCoupon(null);
        }
      }
    } catch (error) {
      if (couponIntentKeyRef.current === intentKey) couponIntentKeyRef.current = "";
      setQuoteState({ phase: "error", data: null, error });
    } finally { couponRequestRef.current = false; setCouponBusy(false); }
  };

  const clearCoupon = () => {
    couponIntentKeyRef.current = "";
    setAppliedCoupon(null);
    setCouponInput("");
  };

  const submitPayment = async () => {
    if (localReviewOnly) return;
    if (!selectedAddress) { setSubmitError("Teslimat adresi seçmelisin."); onStepChange("delivery"); return; }
    if (capabilityResource.phase !== "ready" || capability?.ready !== true) { setSubmitError(capability?.message || "Güvenli ödeme hizmeti aktivasyon sürecindedir."); onStepChange("payment"); return; }
    if (!agreementsReady) { setSubmitError("Güncel ön bilgilendirme ve mesafeli satış sözleşmesini onaylamalısın."); onStepChange("payment"); return; }
    if (quoteState.phase !== "ready" || !quote) { setSubmitError("Güncel sipariş toplamı doğrulanmadan ödeme başlatılamaz."); return; }
    setSubmitPhase("submitting"); setSubmitError("");
    try {
      const result = await checkout.initialize({
        session,
        address: selectedAddress,
        items,
        couponCode: appliedCoupon,
        agreementSnapshotSha256: agreementPreviewState.data.snapshotSha256,
        agreementAcceptances: requiredAgreements.map((agreement) => ({
          slug: agreement.slug,
          version: agreement.version,
          accepted: acceptedAgreements.has(agreement.slug),
        })),
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
        <div className="payment-method is-selected connected-payment-method"><CreditCard /><span><strong>Kredi / Banka Kartı</strong><small>{capability?.ready ? "Devam ettiğinde PayTR tarafından barındırılan güvenli ödeme ekranı açılır." : "Ödeme sağlayıcısı etkinleştirildiğinde kart işlemi güvenli ödeme ekranında tamamlanacaktır."}</small></span><ShieldCheck weight="fill" /></div>
        <div className="payment-provider-disclosure"><LockKey /><div><strong>Kart bilgilerin ödeme sağlayıcısına girilir</strong><p>NovaStore yalnız sipariş, teslimat ve doğrulanmış toplam bilgilerini iletir. Bu sayfa kart numarası, son kullanma tarihi veya CVV toplamaz.</p></div></div>
        {capabilityResource.phase === "loading" && <div className="payment-activation-panel" role="status" aria-live="polite"><span className="integration-spinner" /><div><strong>Güvenli ödeme durumu kontrol ediliyor</strong><p>PayTR aktivasyon ve sözleşme durumu sunucudan doğrulanıyor.</p></div></div>}
        {capabilityResource.phase === "error" && <div className="payment-activation-panel is-unavailable" role="alert"><WarningCircle /><div><strong>Güvenli ödeme durumu alınamadı</strong><p>Ödeme başlatılmaz. Bağlantını kontrol edip yeniden deneyebilirsin.</p><button type="button" onClick={capabilityResource.reload}>Yeniden dene</button></div></div>}
        {capability && <div className={`payment-activation-panel ${capability.ready ? "is-ready" : "is-unavailable"}`} role="status"><ShieldCheck /><div><strong>{capability.ready ? capability.testMode ? "PayTR test ödeme alanı hazır" : "PayTR güvenli ödeme alanı hazır" : "Güvenli ödeme hizmeti aktivasyon sürecindedir"}</strong><p>{capability.message}{capability.ready && capability.testMode ? " Bu test oturumu gerçek tahsilat oluşturmaz." : ""}</p></div></div>}
        <fieldset className="checkout-agreements"><legend>Ödeme öncesi sözleşmeler</legend><CheckoutAgreementReview state={agreementPreviewState} definitions={capabilityAgreements} accepted={acceptedAgreements} onRetry={() => setAgreementPreviewRevision((value) => value + 1)} onAcceptedChange={(slug, checked) => setAcceptedAgreements((current) => {
          const next = new Set(current);
          if (checked) next.add(slug); else next.delete(slug);
          return next;
        })} /></fieldset>
        <div className="checkout-navigation"><button type="button" onClick={() => onStepChange("delivery")}><ArrowLeft /> Geri</button><button className="primary-button" type="button" disabled={quoteState.phase !== "ready" || !selectedAddress} onClick={() => onStepChange("review")}>Siparişi kontrol et <CaretRight /></button></div>
      </>}
      {step === "review" && <>
        <div className="checkout-panel__head"><div><Receipt /><span><strong>Siparişini Kontrol Et</strong><small>Ödeme sağlayıcısına geçmeden önce adres ve ürünleri doğrula.</small></span></div></div>
        {selectedAddress ? <div className="review-box"><span>Teslimat</span><strong>{selectedAddress.title}</strong><p>{selectedAddress.fullName} · {selectedAddress.addressLine}, {selectedAddress.district} / {selectedAddress.city}</p></div> : <div className="form-message is-error"><WarningCircle />Teslimat adresi seçilmedi.</div>}
        <div className="review-products">{items.map(({ product, quantity }) => <div key={product.id}><img src={getProductImage(product)} alt="" /><span><strong>{product.name}</strong><small>{quantity} adet</small></span><b>{money.format(product.price * quantity)}</b></div>)}</div>
        <div className="review-provider-state"><ShieldCheck /><span><strong>{capability?.ready ? capability.testMode ? "PayTR test ödemesi" : "PayTR güvenli ödeme" : "Ödeme aktivasyonu bekleniyor"}</strong><small>{capability?.message || "Sağlayıcı durumu doğrulanmadan ödeme başlatılmaz."}{capability?.ready && capability.testMode ? " Gerçek tahsilat yapılmaz." : ""}</small></span></div>
        {localReviewOnly && <div className="form-message is-warning" role="status"><ShieldCheck />Yerel incelemede gerçek ödeme, sipariş oluşturma ve sağlayıcı yönlendirmesi yapılmaz.</div>}
        <div className="checkout-navigation"><button type="button" onClick={() => onStepChange("payment")}><ArrowLeft /> Geri</button><button className="primary-button" type="button" disabled={localReviewOnly || submitPhase === "submitting" || quoteState.phase !== "ready" || !selectedAddress || !paymentReady} onClick={submitPayment}><ShieldCheck /> {localReviewOnly ? "Yerel incelemede ödeme kapalı" : !capability?.ready ? "Ödeme aktivasyonu bekleniyor" : !agreementsReady ? "Sözleşme onayı gerekli" : submitPhase === "submitting" ? "Güvenli ödeme hazırlanıyor…" : "PayTR güvenli ödeme ekranına geç"}</button></div>
      </>}
    </section><CheckoutSummary quote={quote} phase={quoteState.phase} error={quoteState.error} couponInput={couponInput} onCouponInput={setCouponInput} onApplyCoupon={applyCoupon} onClearCoupon={clearCoupon} couponBusy={couponBusy} /></div>
    {step === "review" && quoteState.phase === "ready" && <div className="mobile-checkout-bar"><span><small>Doğrulanmış toplam</small><strong>{money.format(quote.totals.total)}</strong></span><button type="button" disabled={localReviewOnly || submitPhase === "submitting" || !selectedAddress || !paymentReady} onClick={submitPayment}><ShieldCheck /> {localReviewOnly ? "Ödeme kapalı" : capability?.ready ? "PayTR'a geç" : "Aktivasyon bekleniyor"}</button></div>}
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
  return <main id="main-content" className="page help-page"><div className="shell"><div className="help-hero compact"><NovaServiceIcon kind="delivery" /><span className="section-kicker">Güvenli teslimat takibi</span><h1>Siparişini takip et</h1><p>Yalnız hesabına ait siparişler içinde arama yapılır; e-posta veya sipariş bilgisi dışarıya açılmaz.</p></div><form className="tracking-form connected-tracking-form" onSubmit={submit}><label>Sipariş numarası<input value={query} onChange={(event) => setQuery(event.target.value)} inputMode="numeric" placeholder="Sipariş numaran" required /></label><button className="primary-button" type="submit">Siparişi bul</button></form>{resource.phase !== "ready" ? <InlineState phase={resource.phase} error={resource.error} onRetry={resource.reload} /> : order ? <div className="tracking-result"><CustomerOrderCard order={order} productById={productById} getProductImage={getProductImage} />{(order.trackingNo || safeTrackingUrl(order.trackingUrl)) && <div className="tracking-secure-result"><Truck /><span><strong>{order.trackingNo ? `Takip no: ${order.trackingNo}` : "Taşıyıcı bağlantısı hazır"}</strong><small>{order.etaDate ? `Tahmini teslimat: ${formatDate(order.etaDate, false)}` : order.status}</small></span>{safeTrackingUrl(order.trackingUrl) && <a href={safeTrackingUrl(order.trackingUrl)} target="_blank" rel="noopener noreferrer">Kargoyu takip et <CaretRight /></a>}</div>}</div> : searched ? <div className="connected-empty"><Package /><h2>Sipariş bulunamadı</h2><p>Numarayı kontrol et; yalnız bu hesaba ait siparişler gösterilir.</p></div> : null}</div></main>;
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
  return <main id="main-content" className="page help-page"><div className="shell"><div className="help-hero compact"><NovaServiceIcon kind="support" /><span className="section-kicker">Nova destek</span><h1>Destek ekibiyle görüş</h1><p>Mesajların yalnız doğrulanmış müşteri hesabın ve NovaStore destek ekibi arasında tutulur.</p></div><section className="support-panel"><div className="support-panel__head"><span><ChatCircleText /><strong>Destek mesajları</strong><small>{session.user.email}</small></span><button type="button" onClick={resource.reload}>Yenile</button></div>{resource.phase !== "ready" ? <InlineState phase={resource.phase} error={resource.error} onRetry={resource.reload} /> : <div className="support-thread" aria-live="polite">{resource.data.length ? resource.data.map((item) => <article key={item.id} className={item.isSystem ? "is-system" : item.sentByCustomer ? "is-sent" : "is-received"}><p>{item.isSystem ? item.message.replace("[AI DESTEK DEVRI]", "").trim() : item.message}</p><small>{formatDate(item.createdAt)}</small></article>) : <div className="connected-empty is-compact"><ChatCircleText /><h2>Henüz mesaj yok</h2><p>Sorunu aşağıdaki alandan destek ekibine iletebilirsin.</p></div>}</div>}{error && <div className="form-message is-error"><WarningCircle />{error}</div>}<form className="support-composer" onSubmit={submit}><label htmlFor="support-message">Mesajın</label><textarea id="support-message" value={message} onChange={(event) => setMessage(event.target.value)} rows="4" maxLength="2000" required placeholder="Nasıl yardımcı olabiliriz?" /><button className="primary-button" type="submit" disabled={phase === "submitting" || !message.trim()}>{phase === "submitting" ? "Gönderiliyor…" : "Mesajı gönder"}<PaperPlaneTilt /></button></form></section></div></main>;
}

export function CustomerLegalDocumentPage({ slug, legal }) {
  const resource = useAsyncResource((options) => legal.load(slug, options), [legal, slug]);
  if (resource.phase !== "ready") return <main id="main-content" className="page help-page"><div className="shell"><section className="legal-document-card"><InlineState phase={resource.phase} error={resource.error} onRetry={resource.reload} /></section></div></main>;
  const document = resource.data;
  const published = document.status === "published";
  return <main id="main-content" className="page help-page"><div className="shell"><article className={`legal-document-card ${published ? "is-published" : "is-pending"}`}>
    <span className="section-kicker">NovaStore yasal bilgilendirme</span>
    <h1>{document.title}</h1>
    {published ? <><p className="legal-document-version">Yürürlükteki sürüm: <strong>{document.version}</strong></p><div className="legal-document-copy">{document.text.split(/\n{2,}/).map((paragraph, index) => <p key={`${document.slug}-${index}`}>{paragraph}</p>)}</div></> : <div className="legal-document-pending" role="status"><ShieldCheck /><div><strong>Şirket ve hukuk onaylı metin bekleniyor</strong><p>Bu belgeye ait doğrulanmış içerik henüz yayımlanmadı. NovaStore burada süre, şirket bilgisi veya hukuki koşul uydurmaz.</p></div></div>}
    <nav aria-label="Yasal sayfa bağlantıları"><a href="#/iletisim">İletişim bilgileri</a><a href="#/islem-rehberi">İşlem rehberi</a><a href="#/gizlilik-politikasi">Gizlilik politikası</a></nav>
  </article></div></main>;
}

export function CustomerPublicContactPage({ businessIdentity }) {
  const identity = businessIdentity?.status === "configured" ? businessIdentity.identity : null;
  return <main id="main-content" className="page help-page"><div className="shell"><article className="legal-document-card contact-review-card">
    <span className="section-kicker">Kurumsal iletişim</span><h1>İletişim</h1>
    {identity ? <address><strong>{identity.legalCompanyName}</strong><span>Ticari unvan: {identity.tradeName}</span><span>{identity.registeredAddress}</span><span>VKN: {identity.taxNumber}{identity.taxOffice ? ` · Vergi dairesi: ${identity.taxOffice}` : ""} · MERSİS: {identity.mersisNumber}</span><a href={`mailto:${identity.kepAddress}`}>KEP: {identity.kepAddress}</a><a href={`tel:${identity.phone}`}>{identity.phone}</a><a href={`mailto:${identity.email}`}>{identity.email}</a></address> : <div className="legal-document-pending" role="status"><ShieldCheck /><div><strong>Gerçek şirket iletişim bilgileri bekleniyor</strong><p>Şirket kimliği, ticari unvan, VKN, MERSİS, KEP, adres, telefon ve e-posta sahibi tarafından doğrulanmadan bu sayfada yayımlanmaz.</p></div></div>}
    <p className="contact-review-support">Müşteri hesabınla ilgili destek için <a href="#/destek">güvenli destek kanalına</a> giriş yapabilirsin.</p>
  </article></div></main>;
}
