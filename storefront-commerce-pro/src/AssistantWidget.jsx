import { useEffect, useRef, useState } from "react";
import {
  CaretRight,
  ChatCircleText,
  CheckCircle,
  Headphones,
  Heart,
  PaperPlaneTilt,
  ShoppingCart,
  Sparkle,
  User,
  WarningCircle,
  X,
} from "@phosphor-icons/react";

const money = new Intl.NumberFormat("tr-TR", {
  style: "currency",
  currency: "TRY",
  maximumFractionDigits: 2,
});

const HIDDEN_ROUTES = new Set(["checkout", "payment-result", "auth", "password", "order-success"]);

const isAuthenticated = (session) => (
  session?.status === "authenticated" || session?.status === "unverified"
);

function AssistantProductCard({ product, favorite, onFavorite, onAdd, getProductImage }) {
  const soldOut = Number(product.stock) <= 0;
  return <article className="assistant-product-card"><a href={`#/urun/${product.slug}`}><img src={getProductImage(product)} alt={product.name} /></a><div><span>{product.brand || "NovaStore"}</span><h4><a href={`#/urun/${product.slug}`}>{product.name}</a></h4><strong>{money.format(product.price)}</strong><div><button type="button" disabled={soldOut} onClick={() => onAdd(product.id)}><ShoppingCart />{soldOut ? "Tükendi" : "Sepete ekle"}</button><button className={favorite ? "is-active" : ""} type="button" aria-pressed={favorite} aria-label={favorite ? "Favorilerden çıkar" : "Favorilere ekle"} onClick={() => onFavorite(product.id)}><Heart weight={favorite ? "fill" : "regular"} /></button></div></div></article>;
}

function AssistantResponseExtras({ messageId, response, authenticated, favorites, onFavorite, onAdd, getProductImage, onConfirm, actionPhase }) {
  if (!response) return null;
  const pending = response.requiresConfirmation ? response.pendingAction : null;
  return <>
    {response.products.length > 0 && <div className="assistant-products">{response.products.map((product) => <AssistantProductCard key={product.id} product={product} favorite={favorites.has(product.id)} onFavorite={onFavorite} onAdd={onAdd} getProductImage={getProductImage} />)}</div>}
    {response.comparison && <div className="assistant-comparison"><strong>Doğrulanmış ürün karşılaştırması</strong><div role="table">{response.comparison.rows.map(({ product, bestFor }) => <a role="row" key={product.id} href={`#/urun/${product.slug}`}><span role="cell">{product.name}</span><b role="cell">{money.format(product.price)}</b><small role="cell">{bestFor || (product.stock > 0 ? "Stokta" : "Tükendi")}</small></a>)}</div></div>}
    {pending?.type === "live_support" && !authenticated ? <div className="assistant-confirm"><Headphones /><span><strong>Canlı destek için giriş gerekli</strong><small>Konuşma özetinin yalnız kendi hesabından aktarılması için giriş yap.</small></span><a href="#/giris?return=%2Filetisim">Giriş yap</a></div> : pending ? <div className="assistant-confirm"><CheckCircle /><span><strong>{pending.type === "live_support" ? "Konuşma özetini destek ekibine aktar" : pending.type === "add_to_cart" ? "Ürünü sepete ekle" : "Ürünü sepetten çıkar"}</strong><small>İşlem yalnız onayından sonra uygulanır.</small></span><button type="button" disabled={actionPhase === "submitting"} onClick={() => onConfirm(pending, messageId)}>{actionPhase === "submitting" ? "İşleniyor…" : "Onayla"}</button></div> : null}
  </>;
}

export function AssistantWidget({
  route,
  assistant,
  session,
  favorites,
  onFavorite,
  onAdd,
  onRemove,
  getProductImage,
  raised = false,
}) {
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState("idle");
  const [actionPhase, setActionPhase] = useState("idle");
  const [mode, setMode] = useState("friendly");
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const [messages, setMessages] = useState([{ id: 1, role: "assistant", text: "Merhaba, ben NovaBot. Canlı katalogdan ürün bulabilir, karşılaştırabilir ve gerektiğinde seni destek ekibine aktarabilirim.", response: null }]);
  const nextId = useRef(2);
  const inputRef = useRef(null);
  const fabRef = useRef(null);
  const threadRef = useRef(null);
  const authenticated = isAuthenticated(session);

  useEffect(() => {
    if (!open) return;
    window.requestAnimationFrame(() => inputRef.current?.focus());
    const closeOnEscape = (event) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      window.requestAnimationFrame(() => fabRef.current?.focus());
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  useEffect(() => {
    if (HIDDEN_ROUTES.has(route.type)) setOpen(false);
  }, [route.type]);

  useEffect(() => {
    if (!open || !threadRef.current) return;
    threadRef.current.scrollTo({ top: threadRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, open, phase]);

  if (HIDDEN_ROUTES.has(route.type)) return null;

  const appendMessage = (role, text, response = null) => {
    const entry = { id: nextId.current, role, text, response };
    nextId.current += 1;
    setMessages((current) => [...current, entry]);
  };

  const send = async (rawText) => {
    const text = String(rawText || "").trim();
    if (!text || phase === "submitting") return;
    const history = messages.map((item) => ({ role: item.role, message: item.text }));
    appendMessage("user", text);
    setInput("");
    setError("");
    setPhase("submitting");
    try {
      const response = await assistant.chat({ message: text, history, mode });
      setMode(response.mode || mode);
      appendMessage("assistant", response.reply, response);
    } catch (requestError) {
      setError(requestError?.message || "NovaBot şu anda yanıt veremiyor.");
    } finally {
      setPhase("idle");
    }
  };

  const confirm = async (pending, sourceMessageId) => {
    setActionPhase("submitting");
    setError("");
    try {
      let confirmationMessage = "Onaylanan işlem tamamlandı.";
      if (pending.type === "add_to_cart") {
        onAdd(pending.productId, pending.quantity);
        confirmationMessage = "Onayladığın ürün sepete eklendi.";
      } else if (pending.type === "remove_from_cart") {
        onRemove(pending.productId);
        confirmationMessage = "Onayladığın ürün sepetten çıkarıldı.";
      } else if (pending.type === "live_support") {
        const transcript = messages.slice(-8).map((item) => `${item.role === "user" ? "Müşteri" : "NovaBot"}: ${item.text}`).join("\n");
        const result = await assistant.escalate(`${pending.reason ? `Talep: ${pending.reason}\n` : ""}${transcript}`);
        confirmationMessage = result?.message || "Konuşma özeti destek ekibine iletildi.";
      }
      setMessages((current) => current.map((item) => item.id === sourceMessageId && item.response
        ? { ...item, response: { ...item.response, requiresConfirmation: false, pendingAction: null } }
        : item));
      appendMessage("assistant", confirmationMessage);
    } catch (requestError) {
      setError(requestError?.message || "Onaylanan işlem tamamlanamadı.");
    } finally {
      setActionPhase("idle");
    }
  };

  const submit = (event) => {
    event.preventDefault();
    send(input);
  };

  return <div className={`assistant-widget${open ? " is-open" : ""}${raised ? " has-comparison" : ""}`}>
    {open && <section className="assistant-window" role="dialog" aria-label="NovaBot alışveriş asistanı">
      <header><span><i><Sparkle weight="fill" /></i><span><strong>NovaBot</strong><small>{phase === "submitting" ? "Yanıt hazırlanıyor…" : "Canlı katalog asistanı"}</small></span></span><button type="button" aria-label="NovaBot penceresini kapat" onClick={() => { setOpen(false); window.requestAnimationFrame(() => fabRef.current?.focus()); }}><X /></button></header>
      <div className="assistant-mode"><span><CheckCircle weight="fill" /> {mode === "friendly" ? "Samimi mod" : mode}</span><a href="#/iletisim"><Headphones /> Destek ekibi</a></div>
      <div className="assistant-thread" ref={threadRef} aria-live="polite">
        {messages.map((message) => <article key={message.id} className={`assistant-message is-${message.role}`}><div className="assistant-message__icon">{message.role === "user" ? <User /> : <Sparkle weight="fill" />}</div><div className="assistant-message__body"><p>{message.text}</p><AssistantResponseExtras messageId={message.id} response={message.response} authenticated={authenticated} favorites={favorites} onFavorite={onFavorite} onAdd={onAdd} getProductImage={getProductImage} onConfirm={confirm} actionPhase={actionPhase} />{message.response?.suggestions?.length > 0 && <div className="assistant-suggestions">{message.response.suggestions.map((suggestion) => <button key={suggestion} type="button" disabled={phase === "submitting"} onClick={() => send(suggestion)}>{suggestion}</button>)}</div>}</div></article>)}
        {phase === "submitting" && <div className="assistant-typing" role="status"><span /><span /><span /><b>NovaBot düşünüyor</b></div>}
        {error && <div className="assistant-error" role="alert"><WarningCircle />{error}<button type="button" onClick={() => setError("")} aria-label="Hatayı kapat"><X /></button></div>}
      </div>
      <form className="assistant-composer" onSubmit={submit}><label className="sr-only" htmlFor="assistant-message">NovaBot’a mesaj yaz</label><input ref={inputRef} id="assistant-message" value={input} maxLength="2000" autoComplete="off" placeholder="Ürün, fiyat veya destek hakkında sor…" onChange={(event) => setInput(event.target.value)} /><button type="submit" disabled={phase === "submitting" || !input.trim()} aria-label="Mesajı gönder"><PaperPlaneTilt weight="fill" /></button></form>
      <footer>NovaBot hata yapabilir; fiyat ve stok canlı katalogdan doğrulanır.</footer>
    </section>}
    <button ref={fabRef} className="assistant-fab" type="button" aria-expanded={open} aria-label={open ? "NovaBot penceresini kapat" : "NovaBot alışveriş asistanını aç"} onClick={() => setOpen((value) => !value)}>{open ? <X /> : <><ChatCircleText weight="fill" /><span>NovaBot</span><CaretRight /></>}</button>
  </div>;
}

export const assistantWidgetTestUtils = Object.freeze({ HIDDEN_ROUTES, isAuthenticated });
