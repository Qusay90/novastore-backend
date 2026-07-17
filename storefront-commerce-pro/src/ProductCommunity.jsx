import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle,
  ImageSquare,
  Question,
  ShieldCheck,
  Star,
  User,
  VideoCamera,
} from "@phosphor-icons/react";

const dateFormatter = new Intl.DateTimeFormat("tr-TR", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

const formatDate = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Tarih bilgisi yok" : dateFormatter.format(date);
};

const isAuthenticatedSession = (session) => (
  session?.status === "authenticated" || session?.status === "unverified"
);

function Stars({ value, label }) {
  const rounded = Math.round(Number(value) || 0);
  return (
    <span className="community-stars" aria-label={label || `${Number(value || 0).toFixed(1)} / 5 puan`}>
      {Array.from({ length: 5 }, (_, index) => (
        <Star key={index} weight={index < rounded ? "fill" : "regular"} aria-hidden="true" />
      ))}
    </span>
  );
}

function ReviewComposer({ productId, permission, authenticated, community, onSubmitted }) {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [phase, setPhase] = useState("idle");
  const [message, setMessage] = useState("");

  if (!authenticated) {
    return (
      <div className="community-gate">
        <ShieldCheck />
        <div><strong>Satın alan müşteriler değerlendirir</strong><p>Yorum uygunluğunu sipariş geçmişinle güvenli biçimde doğrulamak için giriş yap.</p></div>
        <a className="secondary-button" href={`#/giris?return=${encodeURIComponent(`/urun-id/${productId}`)}`}>Giriş yap</a>
      </div>
    );
  }

  if (!permission?.canReview) {
    return (
      <div className="community-gate is-muted">
        <ShieldCheck />
        <div><strong>Doğrulanmış alışveriş koruması</strong><p>{permission?.message || "Değerlendirme uygunluğu şu anda doğrulanamıyor."}</p></div>
      </div>
    );
  }

  const submit = async (event) => {
    event.preventDefault();
    setPhase("saving");
    setMessage("");
    try {
      const result = await community.addReview(productId, { rating, comment });
      setComment("");
      setPhase("saved");
      setMessage(result?.mesaj || "Değerlendirmen yayınlandı.");
      onSubmitted();
    } catch (error) {
      setPhase("error");
      setMessage(error?.message || "Değerlendirme gönderilemedi.");
    }
  };

  return (
    <form className="community-composer" onSubmit={submit}>
      <div><span className="section-kicker">Doğrulanmış alışveriş</span><h3>Deneyimini paylaş</h3></div>
      <fieldset>
        <legend>Puanın</legend>
        <div className="community-star-picker" role="radiogroup" aria-label="Ürün puanı">
          {Array.from({ length: 5 }, (_, index) => {
            const value = index + 1;
            return <button key={value} type="button" role="radio" aria-checked={rating === value} aria-label={`${value} puan`} onClick={() => setRating(value)}><Star weight={value <= rating ? "fill" : "regular"} /></button>;
          })}
        </div>
      </fieldset>
      <label>Yorumun <textarea value={comment} maxLength="2000" rows="4" placeholder="Ürün deneyimini anlatabilirsin (isteğe bağlı)" onChange={(event) => setComment(event.target.value)} /><small>{comment.length}/2000</small></label>
      {message && <p className={`form-message is-${phase}`} role={phase === "error" ? "alert" : "status"}>{message}</p>}
      <button className="primary-button" type="submit" disabled={phase === "saving"}>{phase === "saving" ? "Gönderiliyor…" : "Değerlendirmeyi gönder"}</button>
      <small className="community-composer__note"><ShieldCheck /> Yalnız teslim edilmiş siparişler değerlendirme yapabilir. Bu form kart veya ödeme bilgisi istemez.</small>
    </form>
  );
}

function QuestionComposer({ productId, authenticated, community, onSubmitted }) {
  const [question, setQuestion] = useState("");
  const [phase, setPhase] = useState("idle");
  const [message, setMessage] = useState("");

  if (!authenticated) {
    return (
      <div className="community-gate">
        <Question />
        <div><strong>Ürün hakkında soru sor</strong><p>Sorunu mağazaya iletmek ve yanıt durumunu takip etmek için giriş yap.</p></div>
        <a className="secondary-button" href={`#/giris?return=${encodeURIComponent(`/urun-id/${productId}`)}`}>Giriş yap</a>
      </div>
    );
  }

  const submit = async (event) => {
    event.preventDefault();
    setPhase("saving");
    setMessage("");
    try {
      const result = await community.askQuestion(productId, question);
      setQuestion("");
      setPhase("saved");
      setMessage(result?.mesaj || "Sorun mağazaya iletildi.");
      onSubmitted();
    } catch (error) {
      setPhase("error");
      setMessage(error?.message || "Soru gönderilemedi.");
    }
  };

  return (
    <form className="community-composer" onSubmit={submit}>
      <div><span className="section-kicker">Ürün danışmanı</span><h3>Merak ettiğini sor</h3></div>
      <label>Sorun <textarea required minLength="5" maxLength="1000" rows="4" value={question} placeholder="Ölçü, uyumluluk veya ürün özelliği hakkında sorabilirsin" onChange={(event) => setQuestion(event.target.value)} /><small>{question.length}/1000</small></label>
      {message && <p className={`form-message is-${phase}`} role={phase === "error" ? "alert" : "status"}>{message}</p>}
      <button className="primary-button" type="submit" disabled={phase === "saving" || question.trim().length < 5}>{phase === "saving" ? "İletiliyor…" : "Soruyu mağazaya ilet"}</button>
    </form>
  );
}

function ReviewPanel({ data, productId, authenticated, community, onReload }) {
  const distribution = useMemo(() => Array.from({ length: 5 }, (_, index) => {
    const stars = 5 - index;
    const count = data.reviews.filter((review) => Math.round(review.rating) === stars).length;
    return { stars, count, percent: data.totalReviews > 0 ? Math.round((count / data.totalReviews) * 100) : 0 };
  }), [data]);

  return (
    <div id="community-panel-reviews" role="tabpanel" aria-labelledby="community-tab-reviews" className="community-panel">
      <div className="community-overview-grid">
        <article className="community-score-card">
          <span className="section-kicker">Müşteri puanı</span>
          <strong>{data.average.toFixed(1)}</strong>
          <Stars value={data.average} />
          <p>{data.totalReviews} doğrulanmış değerlendirme</p>
          <div className="community-score-bars">{distribution.map((row) => <div key={row.stars}><span>{row.stars} <Star weight="fill" /></span><i><b style={{ width: `${row.percent}%` }} /></i><small>{row.count}</small></div>)}</div>
        </article>
        <ReviewComposer productId={productId} permission={data.permission} authenticated={authenticated} community={community} onSubmitted={onReload} />
      </div>
      <div className="community-list-head"><div><span className="section-kicker">Gerçek deneyimler</span><h3>Müşteri değerlendirmeleri</h3></div><span>{data.reviews.length} yorum</span></div>
      {data.reviews.length > 0 ? <div className="review-list">{data.reviews.map((review) => (
        <article key={review.id} className="review-card">
          <header><span className="community-avatar"><User /></span><div><strong>{review.customerName}</strong><small><CheckCircle weight="fill" /> Doğrulanmış değerlendirme · <time dateTime={review.createdAt || undefined}>{formatDate(review.createdAt)}</time></small></div><Stars value={review.rating} label={`${review.rating} puan`} /></header>
          {review.comment ? <p>{review.comment}</p> : <p className="is-muted">Müşteri yalnız puan verdi.</p>}
          {review.media.length > 0 && <div className="review-media" aria-label="Yoruma eklenen medya">{review.media.map((media, index) => media.type === "video"
            ? <figure key={`${media.url}-${index}`}><video controls preload="metadata" src={media.url}>Tarayıcın videoyu oynatamıyor.</video><figcaption><VideoCamera /> Müşteri videosu</figcaption></figure>
            : <figure key={`${media.url}-${index}`}><img src={media.url} alt={`${review.customerName} tarafından eklenen ürün görseli ${index + 1}`} loading="lazy" /><figcaption><ImageSquare /> Müşteri görseli</figcaption></figure>)}</div>}
        </article>
      ))}</div> : <div className="community-empty"><Star /><h3>İlk değerlendirmeyi bekliyor</h3><p>Bu ürün için henüz yayınlanmış müşteri değerlendirmesi yok.</p></div>}
    </div>
  );
}

function QuestionPanel({ data, productId, authenticated, community, onReload }) {
  return (
    <div id="community-panel-questions" role="tabpanel" aria-labelledby="community-tab-questions" className="community-panel">
      <div className="community-overview-grid is-questions">
        <article className="community-question-intro"><Question /><span className="section-kicker">Soru & cevap</span><h3>Karar vermeden önce netleştir</h3><p>Yanıtlar mağaza ekibi tarafından verilir. Kişisel bilgi veya sipariş bilgisi paylaşma.</p><b>{data.questions.filter((item) => item.status === "answered").length} yanıtlanmış soru</b></article>
        <QuestionComposer productId={productId} authenticated={authenticated} community={community} onSubmitted={onReload} />
      </div>
      <div className="community-list-head"><div><span className="section-kicker">Ürün hakkında</span><h3>Müşterilerin merak ettikleri</h3></div><span>{data.questions.length} soru</span></div>
      {data.questions.length > 0 ? <div className="question-list">{data.questions.map((item) => (
        <article key={item.id} className="question-card">
          <div className="question-line"><span>S</span><div><strong>{item.question}</strong><small>{item.customerName} · <time dateTime={item.createdAt || undefined}>{formatDate(item.createdAt)}</time></small></div></div>
          {item.status === "answered" ? <div className="answer-line"><span>C</span><div><p>{item.answer}</p><small><CheckCircle weight="fill" /> NovaStore mağaza yanıtı · <time dateTime={item.answeredAt || undefined}>{formatDate(item.answeredAt)}</time></small></div></div> : <div className="question-pending"><Question /> Mağaza yanıtı bekleniyor</div>}
        </article>
      ))}</div> : <div className="community-empty"><Question /><h3>Henüz soru sorulmamış</h3><p>Ürün hakkında merak ettiğin ilk soruyu mağazaya iletebilirsin.</p></div>}
    </div>
  );
}

export function ProductCommunity({ productId, productName, session, community, sectionId = "reviews" }) {
  const [activeTab, setActiveTab] = useState("reviews");
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState({ phase: "loading", data: null, error: null });
  const authenticated = isAuthenticatedSession(session);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setState({ phase: "loading", data: null, error: null });
    community.load(productId, { signal: controller.signal }).then((data) => {
      if (active) setState({ phase: "ready", data, error: null });
    }).catch((error) => {
      if (active && error?.code !== "CUSTOMER_ABORTED") setState({ phase: "error", data: null, error });
    });
    return () => { active = false; controller.abort("product-community-change"); };
  }, [attempt, community, productId]);

  const reload = () => setAttempt((value) => value + 1);
  const switchTabFromKeyboard = (event, tab) => {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    const next = tab === "reviews" ? "questions" : "reviews";
    setActiveTab(next);
    document.getElementById(`community-tab-${next}`)?.focus();
  };

  return (
    <section className="product-community" id={sectionId} aria-labelledby="community-title">
      <div className="community-heading"><div><span className="section-kicker">NovaStore topluluğu</span><h2 id="community-title">{productName} yorumları ve soruları</h2><p>Gerçek API verisi, doğrulanmış müşteri uygunluğu ve mağaza yanıtları.</p></div></div>
      <div className="community-tabs" role="tablist" aria-label="Ürün değerlendirmeleri ve soruları">
        <button id="community-tab-reviews" type="button" role="tab" aria-selected={activeTab === "reviews"} aria-controls="community-panel-reviews" tabIndex={activeTab === "reviews" ? 0 : -1} className={activeTab === "reviews" ? "is-active" : ""} onClick={() => setActiveTab("reviews")} onKeyDown={(event) => switchTabFromKeyboard(event, "reviews")}><Star weight="fill" /> Değerlendirmeler {state.data ? <b>{state.data.totalReviews}</b> : null}</button>
        <button id="community-tab-questions" type="button" role="tab" aria-selected={activeTab === "questions"} aria-controls="community-panel-questions" tabIndex={activeTab === "questions" ? 0 : -1} className={activeTab === "questions" ? "is-active" : ""} onClick={() => setActiveTab("questions")} onKeyDown={(event) => switchTabFromKeyboard(event, "questions")}><Question /> Soru & cevap {state.data ? <b>{state.data.questions.length}</b> : null}</button>
      </div>
      {state.phase === "loading" && <div className="community-loading" role="status" aria-live="polite"><span className="integration-spinner" /> Değerlendirmeler güvenli biçimde yükleniyor…</div>}
      {state.phase === "error" && <div className="community-error" role="alert"><Question /><div><strong>Değerlendirme alanı yüklenemedi</strong><p>{state.error?.message || "Ürün topluluğu verisi şu anda alınamıyor."}</p></div><button type="button" className="secondary-button" onClick={reload}>Yeniden dene</button></div>}
      {state.phase === "ready" && <>
        {state.data.warnings.length > 0 && <div className="community-warning" role="status">{state.data.warnings.join(" ")} <button type="button" onClick={reload}>Yeniden dene</button></div>}
        {activeTab === "reviews"
          ? <ReviewPanel data={state.data} productId={productId} authenticated={authenticated} community={community} onReload={reload} />
          : <QuestionPanel data={state.data} productId={productId} authenticated={authenticated} community={community} onReload={reload} />}
      </>}
    </section>
  );
}

export const productCommunityViewTestUtils = Object.freeze({ formatDate, isAuthenticatedSession });
